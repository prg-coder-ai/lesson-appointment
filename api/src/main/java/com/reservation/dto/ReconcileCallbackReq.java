package com.reservation.dto;

import lombok.Data;
import java.time.LocalDateTime;
import java.util.List;

/**
 * classroom-service 日终对账报告回调请求体。
 * 每日固定时间 classroom-service 将当天课堂运行情况汇总后，
 * 通过 HMAC 签名 POST 到 /api/v1/classrooms/reconcile。
 */
@Data
public class ReconcileCallbackReq {
    /** 对账日期（YYYY-MM-DD） */
    private String reconcileDate;
    /** 租户 ID */
    private Long tenantId;
    /** 对账报告生成时间 */
    private LocalDateTime generatedAt;
    /** 课堂对账明细列表 */
    private List<ReconcileItem> items;
    /** 汇总：计划课堂数 */
    private Integer totalScheduled;
    /** 汇总：实际完成课堂数 */
    private Integer totalCompleted;
    /** 汇总：取消课堂数 */
    private Integer totalCancelled;

    @Data
    public static class ReconcileItem {
        private String scheduleId;
        private String classroomId;
        /** 课堂状态：completed / cancelled / abnormal */
        private String status;
        private LocalDateTime startTime;
        private LocalDateTime endTime;
        /** 应到人数 */
        private Integer expectedCount;
        /** 实到人数 */
        private Integer actualCount;
        /** 课时消耗总额（分钟） */
        private Integer totalDurationMinutes;
        /** 对账结果：match / mismatch */
        private String result;
        /** 差异说明（result=mismatch 时填写） */
        private String discrepancy;
    }
}