package com.classroom.dto;

import lombok.Data;

/**
 * 教师手动补签请求（F2-04）。前端以 JSON body 传入，与 {@code manualAdjust(scheduleId, {userId, reason})} 对齐。
 */
@Data
public class ManualAdjustReq {
    private String userId;
    private String reason;
}
