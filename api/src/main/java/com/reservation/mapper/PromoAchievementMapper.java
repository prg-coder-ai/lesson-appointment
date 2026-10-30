package com.reservation.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.reservation.entity.PromoAchievement;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.math.BigDecimal;
import java.util.List;

/**
 * 推广者业绩汇总。
 *
 * <p><b>本表已登记进 {@code MyBatisPlusConfig.IGNORE_TABLES}</b>：表结构无 {@code tenant_id} 列，
 * 若不排除，租户插件会拼出 {@code tenant_id = ?} → {@code Unknown column} 全线报错。
 *
 * <p>所有计数都走 {@code INSERT ... ON DUPLICATE KEY UPDATE}（uk_promoter 唯一）：
 * 推广者第一次被点击/转化时自动建行，之后原地 +1。**不做先查后插** —— 并发下会双插。
 */
@Mapper
public interface PromoAchievementMapper extends BaseMapper<PromoAchievement> {

    /** 点击计数（决策：只计数、不落 conversion 明细）。注意不动 last_conversion_at —— 点击不是转化。 */
    @Update("INSERT INTO promo_achievement (promoter_user_id, promoter_tenant_id, total_clicks) "
            + "VALUES (#{promoterUserId}, #{promoterTenantId}, 1) "
            + "ON DUPLICATE KEY UPDATE total_clicks = total_clicks + 1")
    int upsertClick(@Param("promoterUserId") String promoterUserId,
                    @Param("promoterTenantId") Long promoterTenantId);

    /**
     * 注册转化计数：total_registered +1，按 pathType 决定 total_tenants_created，
     * 按 wxDirect 决定 total_wx_registered；同时刷新 last_conversion_at。
     */
    @Update("INSERT INTO promo_achievement "
            + "(promoter_user_id, promoter_tenant_id, total_registered, total_tenants_created, total_wx_registered, last_conversion_at) "
            + "VALUES (#{promoterUserId}, #{promoterTenantId}, 1, #{tenantsCreated}, #{wxRegistered}, NOW()) "
            + "ON DUPLICATE KEY UPDATE "
            + "total_registered = total_registered + 1, "
            + "total_tenants_created = total_tenants_created + #{tenantsCreated}, "
            + "total_wx_registered = total_wx_registered + #{wxRegistered}, "
            + "last_conversion_at = NOW()")
    int bumpRegistered(@Param("promoterUserId") String promoterUserId,
                       @Param("promoterTenantId") Long promoterTenantId,
                       @Param("tenantsCreated") int tenantsCreated,
                       @Param("wxRegistered") int wxRegistered);

    /** 审批通过计数（行已存在才会被调；不存在说明数据异常，返回 0 由调用方记日志）。 */
    @Update("UPDATE promo_achievement SET total_approved = total_approved + 1, last_conversion_at = NOW() "
            + "WHERE promoter_user_id = #{promoterUserId}")
    int bumpApproved(@Param("promoterUserId") String promoterUserId);

    /** 缴费成功计数：total_paid +1、累计奖励 += reward、刷新 last_conversion_at。 */
    @Update("UPDATE promo_achievement SET total_paid = total_paid + 1, "
            + "total_reward_amount = total_reward_amount + #{reward}, last_conversion_at = NOW() "
            + "WHERE promoter_user_id = #{promoterUserId}")
    int bumpPaid(@Param("promoterUserId") String promoterUserId, @Param("reward") BigDecimal reward);

    @Select("SELECT * FROM promo_achievement WHERE promoter_user_id = #{promoterUserId}")
    PromoAchievement selectByPromoter(@Param("promoterUserId") String promoterUserId);

    /**
     * 全平台业绩合计（单行；空表时 SUM 为 NULL，已用 COALESCE 兜底成 0）。
     *
     * <p>平台统计卡用；列名走 snake_case 别名，与实体驼峰经
     * map-underscore-to-camel-case 对应（本模块其余查询同理）。
     */
    @Select("SELECT COALESCE(SUM(total_clicks),0) AS total_clicks, "
            + "COALESCE(SUM(total_registered),0) AS total_registered, "
            + "COALESCE(SUM(total_approved),0) AS total_approved, "
            + "COALESCE(SUM(total_paid),0) AS total_paid, "
            + "COALESCE(SUM(total_tenants_created),0) AS total_tenants_created, "
            + "COALESCE(SUM(total_wx_registered),0) AS total_wx_registered, "
            + "COALESCE(SUM(total_reward_amount),0) AS total_reward_amount "
            + "FROM promo_achievement")
    PromoAchievement sumTotals();

    /** 推广者排行榜 Top N（按注册人数降序，同数按 userId 升序保证确定性）。 */
    @Select("SELECT * FROM promo_achievement ORDER BY total_registered DESC, promoter_user_id ASC LIMIT #{limit}")
    List<PromoAchievement> listTopByRegistered(@Param("limit") int limit);

    /**
     * 按 promo_conversion 重算某推广者的三个计数（2026-10-24，平台数据维护删除转化记录后调用）。
     *
     * <p><b>为什么必须重算</b>：achievement 是<b>增量累加</b>的（{@link #bumpRegistered} /
     * {@link #bumpApproved} / {@link #bumpPaid} 都是 +1），删掉一条转化记录不会自动扣减，
     * 不重算就会留下"转化记录没了、业绩数字还挂在上面"的虚高。
     *
     * <p><b>只回填有可靠来源的四项</b>：total_registered / total_approved / total_paid /
     * last_conversion_at。其余四项（total_clicks 来自推广码点击、total_tenants_created 与
     * total_wx_registered 在注册时一次性累加、total_reward_amount 来自付费单）在转化表里
     * 没有可用来源，<b>刻意不动</b>——宁可少算也不错算。
     *
     * <p>stage 是状态推进而非流水：一条转化只会停在 registered / approved / paid 之一，
     * 所以"累计注册"取三者之和，"累计通过"取 approved + paid。
     */
    @Update("UPDATE promo_achievement SET "
            + "total_registered = (SELECT COUNT(*) FROM promo_conversion c "
            + "  WHERE c.promoter_user_id = #{promoterUserId} AND c.stage IN ('registered','approved','paid')), "
            + "total_approved = (SELECT COUNT(*) FROM promo_conversion c "
            + "  WHERE c.promoter_user_id = #{promoterUserId} AND c.stage IN ('approved','paid')), "
            + "total_paid = (SELECT COUNT(*) FROM promo_conversion c "
            + "  WHERE c.promoter_user_id = #{promoterUserId} AND c.stage = 'paid'), "
            + "last_conversion_at = (SELECT MAX(c.registered_at) FROM promo_conversion c "
            + "  WHERE c.promoter_user_id = #{promoterUserId}) "
            + "WHERE promoter_user_id = #{promoterUserId}")
    int recalcFromConversion(@Param("promoterUserId") String promoterUserId);
}
