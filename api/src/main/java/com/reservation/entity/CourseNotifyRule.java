package com.reservation.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 课程上课通知规则（规则头）。
 *
 * <p>对应表 {@code course_notify_rule}，由租户管理员的「系统配置 → 通知规则」维护。
 * 一条规则头 = 一套时间点配置，具体时间点在 {@link CourseNotifyRulePoint} 里一行一档。
 *
 * <p>作用域与 {@link CourseRefundRule} 完全同构：
 * <ul>
 *   <li>{@code courseId} 为空串 → 本租户的<b>默认规则</b>（每个租户最多一条）</li>
 *   <li>{@code courseId} 非空 → 该门课程的<b>专属覆盖</b>规则</li>
 * </ul>
 *
 * <p><b>叠加语义是「整组覆盖」而非逐点合并</b>：命中课程规则就整组用它，
 * 不会拿租户默认去补齐课程规则里缺的档位。否则「数学课只配了 3 个点」会变成语义歧义
 * （是只要这 3 个，还是补齐默认缺的第 4 个？）。配置省事交给界面——
 * 新建课程规则时前端会把租户默认的档位预填进表单。
 *
 * <p>求值顺序：课程规则 → 租户默认规则 → {@link com.reservation.service.NotifyRuleService} 内置兜底档位。
 */
@Data
@TableName("course_notify_rule")
public class CourseNotifyRule implements Serializable {

    private static final long serialVersionUID = 1L;

    /** 租户ID（0=平台/历史单租户数据）— SaaS多租户，由租户插件与 MetaObjectHandler 维护 */
    private Long tenantId;

    @TableId(type = IdType.AUTO)
    private Long id;

    /**
     * 课程ID；<b>空串表示本租户的默认规则</b>（不是 NULL —— MySQL 唯一索引下 NULL 不去重，
     * 用空串才能保证「一租户一条默认规则」被 {@code uk_notify_rule_tenant_course} 兜住）。
     */
    private String courseId;

    /** 规则名（仅界面显示） */
    private String name;

    /** 整组是否启用：0 停用后本行视为未配置，回落到上一级 */
    private Integer enabled;

    private String remark;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
