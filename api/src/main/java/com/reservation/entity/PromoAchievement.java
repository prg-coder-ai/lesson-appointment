package com.reservation.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 推广者业绩汇总（对应表 {@code promo_achievement}）。
 *
 * <p>点击数 {@code totalClicks} 与转化数分开放：点击只在这里 +1，不落
 * {@code promo_conversion} 明细（决策：点击记录取"只计数"方案）。
 */
@Data
@TableName("promo_achievement")
public class PromoAchievement implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

    private String promoterUserId;

    private Long promoterTenantId;

    private Integer totalClicks;

    private Integer totalRegistered;

    private Integer totalApproved;

    private Integer totalPaid;

    private Integer totalTenantsCreated;

    private Integer totalWxRegistered;

    private BigDecimal totalRewardAmount;

    private LocalDateTime lastConversionAt;

    private LocalDateTime updateTime;
}
