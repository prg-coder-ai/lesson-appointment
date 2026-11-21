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
        /**
         * 预约侧状态。未知时留空——不要猜：猜错会让对账本身变成新的差异源。
         * 注意这里必须是 private：包级字段 Jackson 看不到，序列化时会被静默丢掉。
         */
        private String bookingStatus;
        private String diff;
    }
}