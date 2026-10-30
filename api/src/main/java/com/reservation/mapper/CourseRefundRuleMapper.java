package com.reservation.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.reservation.entity.CourseRefundRule;
import org.apache.ibatis.annotations.Mapper;

/**
 * 课程退改规则 Mapper。
 *
 * <p>表中有 tenant_id，常规增删改查交给租户插件自动隔离，无需手写 SQL。
 * 无租户上下文的入口（如定时任务）若需读取，请另行按平台表方式处理。
 */
@Mapper
public interface CourseRefundRuleMapper extends BaseMapper<CourseRefundRule> {
}
