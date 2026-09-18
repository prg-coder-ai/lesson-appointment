package com.reservation.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 课程上课通知规则的「时间点」明细行（一条一档）。
 *
 * <p>对应表 {@code course_notify_rule_point}，挂在 {@link CourseNotifyRule} 之下。
 *
 * <p><b>时间只有一个口径</b>：{@code offsetMinutes} 是「课前偏移分钟数」，
 * 应发时刻 = {@code appointment.appointment_datetime - offsetMinutes}。
 * 「提前 N 天」「课前 K 分钟」在库里都是分钟，天/小时只是录入粒度
 * （存在 {@code inputUnit} 里仅供界面回显，不参与任何计算），避免两套单位换算打架。
 *
 * <p><b>档位顺序由 {@code seq} 表达</b>（1..N，越大离上课越近），要求
 * {@code offsetMinutes} 随 seq <b>严格递减</b>。这条约束不能省：
 * 若「提前 1 天」的档位排在「课前 120 分钟」之后，语义就反转了。
 * 校验在服务端做（见 NotifyRuleService）。
 *
 * <p><b>停用某一档用 {@code enabled = 0}，不删行</b>——保持 seq 无洞，
 * 流水表按 {@code (appointment_id, seq)} 回溯才稳定。
 *
 * <p>注意：本表<b>没有 tenant_id 列</b>（隔离靠 {@code ruleId} 关联的主表，
 * 主表已被租户插件过滤），故已在 MyBatisPlusConfig.IGNORE_TABLES 中登记，
 * 否则插件会拼出 {@code tenant_id = ?} 直接报 Unknown column。
 */
@Data
@TableName("course_notify_rule_point")
public class CourseNotifyRulePoint implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 所属规则头 course_notify_rule.id */
    private Long ruleId;

    /** 档位序号 1..N，越大离上课越近；要求 offsetMinutes 随本值严格递减 */
    private Integer seq;

    /** 档位码：PRE_FIRST / PRE_AGAIN / PRE_SOON / FINAL_CALL（见 NotifyStage） */
    private String stage;

    /** 课前偏移分钟（>0） */
    private Integer offsetMinutes;

    /** 录入粒度 day / hour / minute（仅界面回显，不参与计算） */
    private String inputUnit;

    /** 接收人：STUDENT / TEACHER / BOTH（见 NotifyAudience） */
    private String audience;

    /** 该档是否启用（停用用本列，保持 seq 无洞） */
    private Integer enabled;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
