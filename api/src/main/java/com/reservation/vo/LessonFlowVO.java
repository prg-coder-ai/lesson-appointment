package com.reservation.vo;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 课时流水行（"我的课时"页面的明细表）。
 *
 * <p>{@code source} 保留英文原值（classroom/leave/manual/grant），中文文案在前端
 * {@code shared/domain/lessonLedger.js} 统一映射——与消息中心、课次状态的既有做法一致：
 * 展示映射只有一处权威源。
 */
@Data
public class LessonFlowVO {

    private Long id;

    /** 变动课时：负数=消耗、正数=充值/退回 */
    private BigDecimal changeLessons;

    /** 变动后余量（对账用） */
    private BigDecimal remainingAfter;

    /** 来源：classroom 课堂扣减 / leave 请假退回 / manual 人工调整 / grant 充值 */
    private String source;

    /** 原因（课堂扣减是固定文案，人工调整是运营填写） */
    private String reason;

    /** 课次序号（排期展开后的第几次课，1 起） */
    private Integer classIndex;

    /** 课程名称（经 booking → course_schedule 反查；预删或跨库缺失时为 null） */
    private String courseName;

    /** 发生时间 */
    private LocalDateTime createTime;
}
