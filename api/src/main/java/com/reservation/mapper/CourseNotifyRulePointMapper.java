package com.reservation.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.reservation.entity.CourseNotifyRulePoint;
import org.apache.ibatis.annotations.Mapper;

/**
 * 课程上课通知时间点（明细行）。
 *
 * <p><b>本表没有 tenant_id 列</b>，且已在 MyBatisPlusConfig.IGNORE_TABLES 中登记排除。
 * 这是必须的：租户插件对未排除的表会无条件追加 {@code tenant_id = ?}，
 * 而本表无该列，SQL 会直接报 Unknown column（项目里 {@code sys_industry} 踩过同一个坑）。
 *
 * <p>隔离依赖调用方先经 {@link CourseNotifyRuleMapper}（有租户隔离）拿到 ruleId，
 * 再用它过滤本表——不要接受外部直接传入的 ruleId。
 */
@Mapper
public interface CourseNotifyRulePointMapper extends BaseMapper<CourseNotifyRulePoint> {
    // 自带 CRUD，无需手写方法
}
