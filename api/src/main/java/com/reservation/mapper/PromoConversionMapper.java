package com.reservation.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.reservation.entity.PromoConversion;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

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

    /**
     * 某租户的路径2 转化全量（加入漏斗统计用，新→旧）。
     *
     * <p>路径2 的 {@code invitee_tenant_id} 即被加入的租户，与推广码的
     * {@code target_tenant_id} 一致（registerUser 里同源写入）。
     */
    @Select("SELECT * FROM promo_conversion WHERE path_type = 2 AND invitee_tenant_id = #{tenantId} "
            + "ORDER BY registered_at DESC, id DESC")
    List<PromoConversion> listByInviteeTenantPath(@Param("tenantId") Long tenantId);

    /** 全平台最近转化（平台统计「最近转化」表用）。 */
    @Select("SELECT * FROM promo_conversion ORDER BY registered_at DESC, id DESC LIMIT #{limit}")
    List<PromoConversion> listRecent(@Param("limit") int limit);

    /** 按路径统计转化总数（平台统计：路径1=新租户、路径2=加入用户）。 */
    @Select("SELECT COUNT(*) FROM promo_conversion WHERE path_type = #{pathType}")
    int countByPathType(@Param("pathType") int pathType);
}
