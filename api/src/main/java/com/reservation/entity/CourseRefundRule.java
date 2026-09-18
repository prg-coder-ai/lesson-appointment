package com.reservation.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 课程退改规则（免责 / 部分退费 / 不退费的时间点）。
 *
 * <p>对应表 {@code course_refund_rule}，由租户管理员的「系统配置 → 退改规则」维护。
 *
 * <p>作用域：
 * <ul>
 *   <li>{@code courseId} 为空串 → 本租户的<b>默认规则</b>（每个租户最多一条）</li>
 *   <li>{@code courseId} 非空 → 该门课程的<b>专属覆盖</b>规则</li>
 * </ul>
 * 求值顺序：课程规则 → 租户默认规则 → {@link com.reservation.service.RefundRuleService} 内兜底默认值。
 *
 * <p>时间点一律以<b>分钟</b>落库，避免小时/分钟两套口径打架；
 * {@code freeUnit} / {@code partialUnit} 只记录管理员在界面上选的录入粒度，供回显，不参与计算。
 */
@Data
@TableName("course_refund_rule")
public class CourseRefundRule implements Serializable {

    private static final long serialVersionUID = 1L;

    /** 租户ID（0=平台/历史单租户数据）— SaaS多租户，由租户插件与 MetaObjectHandler 维护 */
    private Long tenantId;

    @TableId(type = IdType.AUTO)
    private Long id;

    /**
     * 课程ID；<b>空串表示本租户的默认规则</b>（不是 NULL —— MySQL 唯一索引下 NULL 不去重，
     * 用空串才能保证「一租户一条默认规则」被唯一键兜住）。
     */
    private String courseId;

    /** 是否启用：1启用 0停用（停用后本行视为未配置，回落到上一级） */
    private Integer enabled;

    /** 免责线（分钟）：提前量 ≥ 该值 → 免责（全额退） */
    private Integer freeBeforeMinutes;

    /** 免责线录入粒度：hour / minute（仅界面回显） */
    private String freeUnit;

    /** 部分退费线（分钟）：提前量 ≥ 该值且不足免责线 → 按比例退费；不足该值 → 不退费 */
    private Integer partialBeforeMinutes;

    /** 部分退费线录入粒度：hour / minute（仅界面回显） */
    private String partialUnit;

    /** 部分退费比例（%）：0-100 */
    private Integer partialRefundPercent;

    private String remark;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
