package com.reservation.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 学生课时余额。
 *
 * <p>与 {@link StudentLessonFlow}（流水）成对使用：余额是流水的结果缓存，
 * 流水才是唯一事实。对账恒等式为 {@code SUM(flow.change_lessons) == balance.used_lessons}
 * （按 {@code tenant_id + student_id} 聚合），不等即为异常。
 *
 * <p><b>允许负余额</b>：历史学生没有课时包记录（total=0），首次扣减即为 -1，
 * 语义是「欠课时」。运营补录 {@code total_lessons} 后自动平账，
 * 不需要改历史流水——这正是把余额与流水分开存的价值。
 */
@Data
@TableName("student_lesson_balance")
public class StudentLessonBalance implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 租户ID */
    private Long tenantId;

    /** 学生用户ID */
    private String studentId;

    /** 累计购买课时（运营补录/充值） */
    private BigDecimal totalLessons;

    /** 累计消耗课时 */
    private BigDecimal usedLessons;

    /** 剩余课时 = total - used，允许负数表示欠课时 */
    private BigDecimal remainingLessons;

    /** 乐观锁版本号 */
    private Integer version;

    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
