package com.classroom.rtc;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * RTC provider 注册表与选型器。
 *
 * <p>选型规则只有一条：<b>配置指定的 provider 可用就用它，否则回落 native-mesh</b>。
 * 这里的「可用」是静态判断（配置齐全 + 依赖就位），不做健康探测——
 * 厂商侧真挂了不是服务端能提前知道的，强行探测只会把课堂启动拖慢。
 *
 * <p>降级<b>必须留痕</b>：启动日志一行 WARN + {@code GET /api/v1/rtc/providers} 可查。
 * 生产上「配了 livekit 却一直跑 mesh」这种事故，靠静默降级是查不出来的。
 */
@Slf4j
@Component
public class RtcProviderRegistry {

    private final Map<String, RtcProvider> byName = new LinkedHashMap<>();
    private final RtcProperties props;
    private final RtcProvider fallback;

    private volatile RtcProvider active;

    public RtcProviderRegistry(List<RtcProvider> providers, RtcProperties props) {
        this.props = props;
        RtcProvider mesh = null;
        for (RtcProvider p : providers) {
            byName.put(p.name(), p);
            if (NativeMeshRtcProvider.NAME.equals(p.name())) mesh = p;
        }
        if (mesh == null) {
            // native-mesh 是保底实现，缺了它等于没有媒体层，属于装配错误
            throw new IllegalStateException("缺失 native-mesh RTC provider，媒体层无法降级");
        }
        this.fallback = mesh;
    }

    @PostConstruct
    public void init() {
        resolveAndLog();
    }

    public RtcProvider active() {
        RtcProvider a = active;
        if (a == null) {
            synchronized (this) {
                if (active == null) resolveAndLog();
                a = active;
            }
        }
        return a;
    }

    public String activeName() {
        return active().name();
    }

    private synchronized void resolveAndLog() {
        String want = props.getProvider();
        RtcProvider wanted = want == null ? null : byName.get(want.trim());
        if (wanted != null && wanted.available()) {
            active = wanted;
            log.info("RTC provider 选型: {} (topology={})", wanted.name(), wanted.topology());
            return;
        }
        active = fallback;
        if (wanted == null) {
            log.info("RTC provider 未配置或未知（{}），使用默认 {} (topology=MESH)",
                    want, fallback.name());
        } else {
            log.warn("RTC provider {} 不可用（{}），已降级为 {} (topology=MESH)。"
                            + "课堂可用但为 P2P 全互联，人数上限 {}、无云端录制。",
                    wanted.name(),
                    wanted.unavailableReason() == null ? "配置不完整" : wanted.unavailableReason(),
                    fallback.name(),
                    props.getMesh().getMaxPeers());
        }
    }

    public String ensureRoom(String scheduleId) {
        try {
            return active().ensureRoom(scheduleId);
        } catch (Exception e) {
            log.error("建房失败，降级 native-mesh: scheduleId={}", scheduleId, e);
            return fallback.ensureRoom(scheduleId);
        }
    }

    public void destroyRoom(String scheduleId) {
        try {
            active().destroyRoom(scheduleId);
        } catch (Exception e) {
            // 下课链路不能被厂商接口的异常阻断
            log.warn("销毁房间失败（忽略）: scheduleId={}, provider={}", scheduleId, active().name(), e);
        }
    }

    public RtcJoinInfo join(RtcJoinContext ctx) {
        RtcProvider p = active();
        try {
            return p.join(ctx);
        } catch (Exception e) {
            log.error("provider {} 签发进房配置失败，本次降级 native-mesh: scheduleId={}",
                    p.name(), ctx.scheduleId(), e);
            return fallback.join(ctx);
        }
    }

    /** 运维诊断：列出全部 provider 的可用性与当前生效项 */
    public List<Map<String, Object>> describe() {
        List<Map<String, Object>> list = new ArrayList<>();
        String current = active().name();
        for (RtcProvider p : byName.values()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("name", p.name());
            m.put("topology", p.topology().name());
            m.put("available", p.available());
            m.put("reason", p.available() ? null : p.unavailableReason());
            m.put("active", p.name().equals(current));
            list.add(m);
        }
        return list;
    }
}
