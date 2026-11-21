package com.classroom.recording;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 录制后端选型器（与 {@code RtcProviderRegistry} 同构）。
 *
 * <p>规则：配置的 mode 有可用实现就用它，否则回落 client。
 * <b>没有 CLOUD 实现时不许假装有</b>——{@link #describe()} 会把「谁在生效、谁没有实现」摊开，
 * 让「本来要云录制、结果一直本地录」这种事在诊断接口上就能看出来。
 */
@Slf4j
@Component
public class RecordingBackendRegistry {

    private final Map<String, RecordingBackend> byMode = new LinkedHashMap<>();
    private final RecordingProperties props;
    private final RecordingBackend fallback;
    private volatile RecordingBackend active;

    public RecordingBackendRegistry(List<RecordingBackend> backends, RecordingProperties props) {
        this.props = props;
        RecordingBackend client = null;
        for (RecordingBackend b : backends) {
            byMode.put(b.mode(), b);
            if (ClientRecordingBackend.MODE.equals(b.mode())) client = b;
        }
        if (client == null) {
            throw new IllegalStateException("缺失 CLIENT 录制实现，录制功能无法降级");
        }
        this.fallback = client;
    }

    @PostConstruct
    public void init() {
        resolveAndLog();
    }

    public RecordingBackend active() {
        RecordingBackend a = active;
        if (a == null) {
            synchronized (this) {
                if (active == null) resolveAndLog();
                a = active;
            }
        }
        return a;
    }

    public String activeMode() {
        return active().mode();
    }

    private synchronized void resolveAndLog() {
        String want = props.getMode() == null ? "" : props.getMode().trim().toUpperCase();
        RecordingBackend wanted = byMode.get(want);
        if (wanted != null && wanted.available()) {
            active = wanted;
            log.info("录制后端选型: {}", wanted.mode());
            return;
        }
        active = fallback;
        if ("CLOUD".equals(want)) {
            log.warn("录制后端 CLOUD 未实现或不可用（{}），已降级为 CLIENT：只录教师本地上行，"
                            + "学生画面不会进入录制文件。",
                    wanted == null ? "本仓库未内置厂商云录制实现" : wanted.unavailableReason());
        } else {
            log.info("录制后端: CLIENT（教师端本地录制后上传）");
        }
    }

    public Map<String, Object> describe() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("configured", props.getMode());
        m.put("active", activeMode());
        m.put("degraded", !activeMode().equalsIgnoreCase(String.valueOf(props.getMode())));
        m.put("implemented", byMode.keySet());
        m.put("retentionDays", props.getRetentionDays());
        m.put("maxUploadBytes", props.getMaxUploadBytes());
        return m;
    }
}
