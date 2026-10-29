package com.classroom.metrics;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tags;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Supplier;

/**
 * 课堂业务指标收口处。
 *
 * <p><b>为什么不用 micrometer-registry-prometheus</b>：本仓库要能离线构建，而该依赖不在
 * 离线仓库里；引入会让 {@code mvn -o compile} 直接红。actuator 已自带
 * {@code MeterRegistry}（Boot 兜底注册 SimpleMeterRegistry），业务埋点全部走它，
 * 文本暴露由 {@link PrometheusTextWriter} 手工渲染——Prometheus 文本协议本身只有十几行，
 * 不值得为它引一个 registry 实现。
 *
 * <p><b>命名约定</b>：统一 {@code classroom_} 前缀 + 单位后缀（{@code _total} 表单调递增计数，
 * {@code _seconds} 表时间）。这是 Prometheus 的惯例，改名字会让既有看板与告警表达式失效，
 * 因此这里的常量是**对外契约**，不要在调用点随手拼字符串。
 */
@Slf4j
@Component
public class BizMetrics {

    /** 信令计数，tag type=hand/mute-all/cam-state/chat/... */
    public static final String SIGNAL = "classroom_signal_total";
    /** WS 建连计数，tag channel=signal/whiteboard/heartbeat */
    public static final String WS_CONNECT = "classroom_ws_connect_total";
    /** 回流投递结果，tag result=ok/permanent_fail/retry/failed */
    public static final String CALLBACK = "classroom_callback_total";
    /** 上传字节数（按用途分桶，避免把作业和录制混成一个数） */
    public static final String UPLOAD_BYTES = "classroom_upload_bytes_total";
    /** 被拒的白板改动（未授权学生试图画）——这是协作授权的有效性证据 */
    public static final String WB_DENIED = "classroom_whiteboard_denied_total";

    private final MeterRegistry registry;

    /** 在线人数：由 OnlineStateManager 定时回写，Gauge 读取零开销 */
    private final AtomicLong onlineUsers = new AtomicLong();
    /** 进行中的课堂数：由调度器/生命周期回写 */
    private final AtomicLong liveClassrooms = new AtomicLong();

    public BizMetrics(ObjectProvider<MeterRegistry> registryProvider) {
        this.registry = registryProvider.getIfAvailable();
        if (this.registry == null) {
            log.warn("MeterRegistry 不可用，业务指标将静默丢弃（不影响业务）");
            return;
        }
        // Gauge 绑定在 AtomicLong 上：每次 scrape 读当前值，不需要每次业务动作都写指标
        Gauge.builder("classroom_online_users", onlineUsers, AtomicLong::doubleValue)
                .description("当前在课堂内的在线人数（含 IDLE）")
                .register(registry);
        Gauge.builder("classroom_live_classrooms", liveClassrooms, AtomicLong::doubleValue)
                .description("当前状态为 LIVE 的课堂数")
                .register(registry);
    }

    /** 计数 +1（带一个标签值） */
    public void inc(String name, String tagKey, String tagValue) {
        if (registry == null) return;
        try {
            Counter.builder(name).tags(Tags.of(tagKey, safe(tagValue))).register(registry).increment();
        } catch (Exception e) {
            // 指标永远不能影响主流程：注册失败（重名/标签不一致）只记一次 warn
            log.debug("指标打点失败: name={}, tag={}={}", name, tagKey, tagValue, e);
        }
    }

    /** 计数 +n（用于字节数这类累加量） */
    public void add(String name, String tagKey, String tagValue, long n) {
        if (registry == null || n <= 0) return;
        try {
            Counter.builder(name).tags(Tags.of(tagKey, safe(tagValue))).register(registry).increment(n);
        } catch (Exception e) {
            log.debug("指标累加失败: name={}, n={}", name, n, e);
        }
    }

    public void signal(String type) {
        inc(SIGNAL, "type", type == null ? "unknown" : type);
    }

    public void wsConnect(String channel) {
        inc(WS_CONNECT, "channel", channel);
    }

    public void callback(String result) {
        inc(CALLBACK, "result", result);
    }

    public void upload(String purpose, long bytes) {
        add(UPLOAD_BYTES, "purpose", purpose, bytes);
    }

    public void whiteboardDenied() {
        inc(WB_DENIED, "reason", "no_grant");
    }

    /** 在线人数回写（由 OnlineStateManager 变更时调用，或由调度器周期刷新） */
    public void setOnlineUsers(long n) {
        onlineUsers.set(Math.max(0, n));
    }

    /** 进行中课堂数回写 */
    public void setLiveClassrooms(long n) {
        liveClassrooms.set(Math.max(0, n));
    }

    /** 供诊断端点读取（拿不到 registry 时返回 null，端点据此降级） */
    public MeterRegistry registry() {
        return registry;
    }

    /**
     * 标签值兜底。
     *
     * <p>空串标签在 Prometheus 里是合法的，但更容易是 bug 的症状（忘了传 type），
     * 统一落成 {@code unknown} 才能在看板上被看见。
     */
    private String safe(String v) {
        return (v == null || v.isBlank()) ? "unknown" : v;
    }

    /** 便捷包装：只在需要时才求值（避免为了打点反查一次 DB） */
    public void gaugeFrom(String name, String desc, Supplier<Number> supplier) {
        if (registry == null) return;
        try {
            Gauge.builder(name, supplier).description(desc).register(registry);
        } catch (Exception e) {
            log.debug("Gauge 注册失败: {}", name, e);
        }
    }
}
