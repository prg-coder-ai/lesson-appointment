package com.reservation.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.reservation.entity.PromoReferral;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * 推广码表。
 *
 * <p><b>本表已登记进 {@code MyBatisPlusConfig.IGNORE_TABLES}</b>：表结构无 {@code tenant_id} 列，
 * 若不排除，租户插件会拼出 {@code tenant_id = ?} → {@code Unknown column} 全线报错。
 */
@Mapper
public interface PromoReferralMapper extends BaseMapper<PromoReferral> {

    /** 按推广码精确查询（大小写不敏感由 utf8mb4_general_ci 保证）。 */
    @Select("SELECT * FROM promo_referral WHERE referral_code = #{code}")
    PromoReferral getByCode(@Param("code") String code);

    /** 某推广者的全部码（含 disabled），早建的在前。 */
    @Select("SELECT * FROM promo_referral WHERE promoter_user_id = #{promoterUserId} ORDER BY create_time ASC, id ASC")
    List<PromoReferral> listByPromoter(@Param("promoterUserId") String promoterUserId);

    /**
     * 归因用「默认码」定位（只有 {@code inviter} 没有 {@code ref} 时）：
     * 优先路径1默认码（path_type=1 且 target_tenant_id IS NULL），仍多则取最早创建的一条。
     *
     * <p>MySQL 唯一键里 NULL 互不相等，所以路径1每个推广者本就只有一个码；
     * 这里的 ORDER BY 是双保险，避免将来放开"一推广者多码"时归因歧义。
     */
    @Select("SELECT * FROM promo_referral WHERE promoter_user_id = #{promoterUserId} AND status = 'active' "
            + "ORDER BY (path_type = 1 AND target_tenant_id IS NULL) DESC, create_time ASC, id ASC LIMIT 1")
    PromoReferral getDefaultByPromoter(@Param("promoterUserId") String promoterUserId);

    /**
     * 某租户被指定的全部租户码（路径2，target_tenant_id=?），早建的在前。
     *
     * <p>租户推广统计用：{@code GET /promo/achievement/tenant} 的码清单。
     * 本表无 tenant_id 列且已排除租户插件，可按 target_tenant_id 任意查。
     */
    @Select("SELECT * FROM promo_referral WHERE path_type = 2 AND target_tenant_id = #{targetTenantId} "
            + "ORDER BY create_time ASC, id ASC")
    List<PromoReferral> listByTargetTenant(@Param("targetTenantId") Long targetTenantId);
}
