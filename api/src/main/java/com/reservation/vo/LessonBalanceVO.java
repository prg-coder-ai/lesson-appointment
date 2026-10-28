package com.reservation.vo;

import lombok.Data;

import java.math.BigDecimal;

/**
 * 学生课时账户视图（"我的课时"页面的顶部卡片）。
 *
 * <p><b>为什么要有 {@code hasAccount}</b>：{@code student_lesson_balance} 只在首次扣减
 * 或运营充值时才建行。查不到记录 ≠ 出错，而是「还没上过课／还没买课时包」，
 * 前端必须能把这两种情况区分开——否则会把「0 课时」误当成「课时用完了」去吓用户。
 *
 * <p><b>允许负值</b>：{@code remainingLessons < 0} 表示欠课时（历史学生没有课时包，
 * 首次扣减即为 -1）。这是 2026-10-28 拍板的 A 方案，前端要显示成「欠 X 课时」而不是
 * 报错或显示 0。
 */
@Data
public class LessonBalanceVO {

    /** 学生用户ID */
    private String studentId;

    /** 累计课时（运营充值/补录） */
    private BigDecimal totalLessons;

    /** 累计已消耗 */
    private BigDecimal usedLessons;

    /** 剩余课时（可为负 = 欠课时） */
    private BigDecimal remainingLessons;

    /** 是否存在账本记录；false 时上面三个值都是 0，仅代表"还没有账本" */
    private Boolean hasAccount;

    /** 是否欠课时（remainingLessons < 0） */
    private Boolean owed;

    /** 给前端直接展示的一句话（避免前后端各写一套判断） */
    private String tip;
}
