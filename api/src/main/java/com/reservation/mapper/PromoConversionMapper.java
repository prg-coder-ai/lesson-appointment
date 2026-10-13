package com.reservation.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.reservation.entity.PromoConversion;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/**
 * 推广转化记录。
 *
 * <p><b>本表已登记进 {@code MyBatisPlusConfig.IGNORE_TABLES}</b>：表结构无 {@code tenant_id} 列，
 * 若不排除，租户插件会拼出 {@code tenant_id = ?} → {@code Unknown column} 全线报错。
 */
@Mapper
public interface PromoConversionMapper extends BaseMapper<PromoConversion> {

    /** 按被邀请者查归因记录（uk_conversion_invitee 唯一，最多一行）。 */
    @Select("SELECT * FROM promo_conversion WHERE invitee_user_id = #{inviteeUserId}")
    PromoConversion getByInviteeUserId(@Param("inviteeUserId") String inviteeUserId);

    /**
     * 审批通过：registered → approved。只推进不退流（已 paid 的不回退）。
     * 返回 0 表示没有可推进的行（幂等）。
     */
    @Update("UPDATE promo_conversion SET stage = 'approved' "
            + "WHERE invitee_user_id = #{inviteeUserId} AND stage = 'registered'")
    int markApproved(@Param("inviteeUserId") String inviteeUserId);

    /**
     * 缴费成功：把该租户名下尚未 paid 的转化一律置 paid 并记 paid_at。
     * 一个租户可能有多条转化（多个被邀请者），全部推进。
     */
    @Update("UPDATE promo_conversion SET stage = 'paid', paid_at = NOW() "
            + "WHERE invitee_tenant_id = #{tenantId} AND stage <> 'paid'")
    int markPaidByTenant(@Param("tenantId") Long tenantId);

    /**
     * 防刷：统计某 IP 在最近一段时间内的注册转化数（路径1/2 都算）。
     * registered_at 为空的行不计（理论上注册即写，为空说明是异常数据）。
     */
    @Select("SELECT COUNT(*) FROM promo_conversion WHERE register_ip = #{ip} "
            + "AND registered_at IS NOT NULL AND registered_at >= #{since}")
    int countByIpSince(@Param("ip") String ip, @Param("since") java.time.LocalDateTime since);

    /** 防刷：统计某手机号 HMAC 在最近一段时间内的注册转化数。 */
    @Select("SELECT COUNT(*) FROM promo_conversion WHERE register_phone_hmac = #{hmac} "
            + "AND registered_at IS NOT NULL AND registered_at >= #{since}")
    int countByPhoneHmacSince(@Param("hmac") String hmac, @Param("since") java.time.LocalDateTime since);
}
