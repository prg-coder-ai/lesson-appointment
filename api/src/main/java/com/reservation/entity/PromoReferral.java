package com.reservation.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 推广码（对应表 {@code promo_referral}）。
 *
 * <p>两种路径：
 * <ul>
 *   <li>{@code pathType=1} 自助建租户：{@code targetTenantId} 为 NULL，任何人用这个码都能开新租户</li>
 *   <li>{@code pathType=2} 指定租户拉新：{@code targetTenantId} 必填，注册时后端会校验它与请求里的
 *       {@code tenantCode} 解析结果一致 —— 防止把码改到别的租户上刷业绩</li>
 * </ul>
 *
 * <p><b>{@code uk_promoter_scope}</b>（同推广者 + 同路径 + 同目标租户唯一）是为了消除归因歧义：
 * 若一个推广者有多个码，后端拿到 {@code inviter}（只有 userId）时无法确定用哪个码记业绩。
 * MySQL 唯一键里 NULL 互不相等，所以路径1（target_tenant_id 为 NULL）每个推广者仍只应有一个码。
 */
@Data
@TableName("promo_referral")
public class PromoReferral implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

    private String referralCode;

    private String promoterUserId;

    private Long promoterTenantId;

    private Long targetTenantId;

    private Integer pathType;

    private String status;

    private LocalDateTime expireTime;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
