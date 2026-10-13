package com.reservation.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 推广转化记录（对应表 {@code promo_conversion}）。
 *
 * <p><b>只记录「注册」及之后</b>：点击不落本表，只在 {@code promo_achievement.total_clicks} 上计数
 * （决策：点击记录取"只计数"方案）。这样 {@code inviteeUserId} 恒为非空，
 * {@code uk_conversion_invitee} 的「一个被邀请者只归因一次」才真正生效 ——
 * 若该列可空，MySQL 唯一键允许多个 NULL，去重会失效、点击阶段会灌入大量重复行。
 */
@Data
@TableName("promo_conversion")
public class PromoConversion implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

    private String referralCode;

    private String promoterUserId;

    /** 被邀请者 user_id，非空（注册成功后写入）。 */
    private String inviteeUserId;

    private Long inviteeTenantId;

    private Integer pathType;

    /** 路径1：新建的租户编码。 */
    private String tenantCode;

    /** registered / approved / paid / expired。 */
    private String stage;

    /** share / landing / qrcode / we / direct。 */
    private String source;

    /** 注册来源 IP（防刷：单 IP 每时限频，见 PromoService 防刷三闸）。 */
    private String registerIp;

    /** 注册手机号 HMAC 索引（防刷：同手机号限频）。不明文存储。 */
    private String registerPhoneHmac;

    private LocalDateTime registeredAt;

    private LocalDateTime paidAt;

    private String rewardStatus;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
