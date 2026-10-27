package com.classroom.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * 媒体抽象层（RTC/SFU 切换）。
 * M1 阶段为 stub，后续对接第三方 RTC SDK。
 */
@Slf4j
@Service
public class MediaService {

    public String createRoom(String scheduleId) {
        log.info("媒体房间创建(stub): scheduleId={}", scheduleId);
        return "room-" + scheduleId;
    }

    public void destroyRoom(String scheduleId) {
        log.info("媒体房间销毁(stub): scheduleId={}", scheduleId);
    }

    public String generateJoinToken(String scheduleId, String userId, String role) {
        return "media-token-" + scheduleId + "-" + userId;
    }
}