package com.classroom.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 日终对账报告（出向，教学服务 → 预约系统）。
 * 对应需求 F7-05。
 */
@Data
public class ReconcileReportReq {
    private String batchId;
    private LocalDateTime reportTime;
    private String scope;
    private List<ReconcileItem> items;

    @Data
    public static class ReconcileItem {
        private String scheduleId;
        private String classroomStatus;
        String bookingStatus;
        private String diff;
    }
}