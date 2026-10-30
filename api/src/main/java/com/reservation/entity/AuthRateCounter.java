package com.reservation.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 登录风控·频率窗口计数（对应表 {@code auth_rate_counter}，2026-10-22 P0 新增）。
 *
 * <p><b>为什么必须有这张表</b>：全仓此前没有任何限流实现（{@code grep "RateLimit|throttle|429"} 零命中），
 * {@code /auth/login}、{@code /auth/wechat-login}、{@code /auth/wechat-register} 三个免登录端点
 * 没有任何次数上限，撞库与批量注册的成本为零。
 *
 * <p><b>窗口语义</b>：{@code window_start} 是「按 window 分钟数向下取整」后的窗口起点，
 * 与 {@code dim}+{@code dim_key} 一起构成唯一键。写入走
 * {@code INSERT ... ON DUPLICATE KEY UPDATE cnt = cnt + 1}，读只读一行主键命中，
 * 不做 {@code count(*)} 扫窗口——后者在登录高峰会退化成全表扫描热点。
 *
 * <p><b>为什么必须登记 IGNORE_TABLES</b>：本表无 {@code tenant_id} 列（登录前的行为不属于任何租户），
 * 且访问发生在 {@code TenantContext} 为空的免登录端点上，不排除会被拼出 {@code tenant_id = ?} 撞
 * Unknown column（与 sys_industry / promo 三表同一原因）。
 *
 * <p><b>dim_key 不明文存账号</b>：账号维度走 {@code CryptoUtil.searchIndex} 的 HMAC，
 * 与 {@code PromoService.checkRegisterAbuse} 的手机号闸同一口径；IP 维度存明文（本身就是网络地址）。
 */
@Data
@TableName("auth_rate_counter")
public class AuthRateCounter implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 维度：ip / account / device / openid / global（见 LoginGuardService.DIM_*）。 */
    private String dim;

    /** 维度值：IP 明文；账号/设备/openid 为 HMAC 摘要，避免把身份明文堆在风控表里。 */
    private String dimKey;

    /** 窗口起点（按窗口大小对齐）。 */
    private LocalDateTime windowStart;

    /** 本窗口内累计次数。 */
    private Integer cnt;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
