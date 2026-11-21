package com.classroom.recording;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * 教师端本地录制（默认实现）。
 *
 * <p>它不是「占位」：教师端的 MediaRecorder 真的在录，录完真的分片上传到对象存储，
 * 落库后学生可通过签名 URL 回放。局限也说清楚——只录教师本地上行（摄像头 + 麦克风），
 * 学生画面不在内，这由技术路线决定，不是没做完。
 *
 * <p>服务端在这里的职责只有两个：<b>授权</b>（谁能开录、录哪个课堂）与<b>登记</b>（何时开始/结束）。
 */
@Slf4j
@Component
public class ClientRecordingBackend implements RecordingBackend {

    public static final String MODE = "CLIENT";

    @Override
    public String mode() {
        return MODE;
    }

    @Override
    public boolean available() {
        return true;
    }

    @Override
    public String start(String scheduleId, Long recordingId, String operatorId) {
        String id = "client-" + recordingId;
        log.info("本地录制开始: scheduleId={}, recordingId={}, operator={}", scheduleId, recordingId, operatorId);
        return id;
    }

    @Override
    public void stop(String scheduleId, Long recordingId, String ossKey) {
        log.info("本地录制停止: scheduleId={}, recordingId={}, ossKey={}", scheduleId, recordingId, ossKey);
    }
}
