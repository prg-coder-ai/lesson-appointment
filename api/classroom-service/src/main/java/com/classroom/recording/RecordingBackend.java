package com.classroom.recording;

/**
 * 录制后端 SPI。
 *
 * <p>课堂录制有两条本质不同的技术路线，不能用一套代码糊过去：
 * <ul>
 *   <li>{@link #CLOUD} —— 媒体服务器侧合流录制（LiveKit Egress / 声网云录制 / TRTC 云端录制）。
 *       效果好（每人一路画面 + 混流），但要厂商侧开通、要计费、要回调地址；</li>
 *   <li>{@link #CLIENT} —— 教师端浏览器本地录制（MediaRecorder 录本地上行流），录完整包上传。
 *       零成本、私有化可用，代价是只录到教师自己的画面与声音（学生的画面录不进来）。</li>
 * </ul>
 *
 * <p>本期默认 {@code CLIENT}：它在任何部署形态下都真实可用，而 {@code CLOUD}
 * 需要具体厂商的 REST 凭证与回调验签，未配置时 {@link #available()} 返回 false，
 * 由 {@link RecordingBackendRegistry} 明确降级并留日志——<b>不写假实现</b>。
 */
public interface RecordingBackend {

    /** CLOUD / CLIENT / NONE */
    String mode();

    boolean available();

    /** 不可用原因（available=false 时给出人话） */
    default String unavailableReason() {
        return null;
    }

    /**
     * 开始录制。
     *
     * @return 后端侧任务标识（CLIENT 返回本地标识；CLOUD 返回厂商任务 id）
     */
    String start(String scheduleId, Long recordingId, String operatorId);

    /**
     * 停止录制。
     *
     * @param ossKey 已落对象的 key（CLIENT 模式由客户端上传后回传；CLOUD 模式可为 null，
     *               由厂商录制完成后回调携带）
     */
    void stop(String scheduleId, Long recordingId, String ossKey);
}
