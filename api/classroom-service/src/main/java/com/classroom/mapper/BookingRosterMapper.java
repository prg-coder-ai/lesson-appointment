package com.classroom.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * 跨 schema 只读：预约系统的 booking 表，用于课堂访问守卫按「有效预约」判定学生。
 *
 * <p>背景：课堂名单是在排期推送 created 事件时按**当时的** booking 快照预建的，
 * 之后新下的预约不会回补名单。{@code ClassroomAccessGuard} 原本对「不在名单」的学生
 * 一律 40301，于是「课堂先建 → 学生后预约 → 永远进不去」。这里提供一个只读的
 * 事实来源，让守卫在名单缺失时按主库的真实预约放行（enter 会顺带补建名单行）。
 *
 * <p>状态口径与主系统 {@code BookingStatus.NON_OCCUPYING} 逐字一致：
 * waiting / cancelled / canceled / rej-booking / frozen 不占席位，其余（含 booked、
 * bookProved、canceling、cancelling、rej-cancelling）都视为占位中的有效预约。
 *
 * <p>注意 {@code @InterceptorIgnore(tenantLine="true")}：主库的 booking 有 tenant_id，
 * 租户条件由调用方显式传入，不能依赖本服务的多租户插件（它按 classroom 库的表工作）。
 */
@Mapper
@InterceptorIgnore(tenantLine = "true")
public interface BookingRosterMapper {

    /** 带租户约束的判定（正常登录用户走这条）。 */
    @Select("SELECT COUNT(1) FROM lesson_appointment.booking "
            + "WHERE schedule_id = #{scheduleId} "
            + "  AND student_id = #{userId} "
            + "  AND tenant_id = #{tenantId} "
            + "  AND status NOT IN ('waiting','cancelled','canceled','rej-booking','frozen')")
    int countActiveBookingInTenant(@Param("scheduleId") String scheduleId,
                                   @Param("userId") String userId,
                                   @Param("tenantId") Long tenantId);

    /**
     * 不带租户约束的兜底判定。
     * 仅用于 token 里 tenantId 缺失/为平台态（0、-1）时；此时课堂侧原有的
     * 「classroom.tenant_id vs currentTenantId」比对同样跳过，保持既有语义。
     */
    @Select("SELECT COUNT(1) FROM lesson_appointment.booking "
            + "WHERE schedule_id = #{scheduleId} "
            + "  AND student_id = #{userId} "
            + "  AND status NOT IN ('waiting','cancelled','canceled','rej-booking','frozen')")
    int countActiveBookingAnyTenant(@Param("scheduleId") String scheduleId,
                                    @Param("userId") String userId);
}
