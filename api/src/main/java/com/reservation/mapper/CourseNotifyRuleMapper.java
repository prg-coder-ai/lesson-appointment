package com.reservation.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.reservation.entity.CourseNotifyRule;
import org.apache.ibatis.annotations.Mapper;

/**
 * 课程上课通知规则（规则头）。
 *
 * <p>本表有 {@code tenant_id} 列，走全局租户插件自动隔离，无需手写租户条件。
 * 明细表 {@code course_notify_rule_point} 无该列，已在 MyBatisPlusConfig.IGNORE_TABLES 中排除，
 * 隔离靠 {@code ruleId} 关联到本表的结果间接保证——因此<b>取明细前必须先经本表拿到 ruleId</b>。
 */
@Mapper
public interface CourseNotifyRuleMapper extends BaseMapper<CourseNotifyRule> {
    // 自带 CRUD，无需手写方法
}
