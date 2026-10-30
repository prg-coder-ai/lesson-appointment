package com.reservation.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 登录风控·人机挑战票据（对应表 {@code auth_challenge}，2026-10-22 P0 建表，P1 启用）。
 *
 * <p><b>四条不可省的约束</b>（少一条这道闸就是装饰）：
 * <ol>
 *   <li><b>题目由服务端出、坐标只存服务端</b>：{@code target_x} 绝不能出现在响应里，
 *       前端拿到坐标等于不用拖滑块。</li>
 *   <li><b>绑定主体</b>：{@code subject} 是出题时的身份（Web 传账号 HMAC，小程序传 openid），
 *       校验时必须相等——否则 A 解出来的题能给 B 用。</li>
 *   <li><b>一次性消费</b>：校验通过后条件更新 {@code used=0 → 1}，用影响行数判定，
 *       与 {@code TenantQuotaService.tryAcquire} 同一手法。不消费等于给了反复试错的 oracle
 *       （缺口横坐标只有几百个取值，采样几轮就穷举出来了）。</li>
 *   <li><b>失败上限</b>：同一票据连续失败达 5 次立即作废，否则仍然是 oracle。</li>
 * </ol>
 *
 * <p><b>为什么必须登记 IGNORE_TABLES</b>：无 {@code tenant_id} 列，且出题/校验都发生在免登录端点上。
 */
@Data
@TableName("auth_challenge")
public class AuthChallenge implements Serializable {

    private static final long serialVersionUID = 1L;

    /** challengeId（UUID 去横线）。刻意用 INPUT 而非 AUTO：id 由服务端生成，天然不可猜。 */
    @TableId(type = IdType.INPUT)
    private String id;

    /** 绑定主体：Web 用账号 HMAC，小程序用 openid。校验时不一致即拒绝。 */
    private String subject;

    /** 场景：login / register / bind。 */
    private String scene;

    /** 缺口横坐标 —— 只存服务端，绝不下发前端。 */
    private Integer targetX;

    /** 缺口纵坐标。 */
    private Integer targetY;

    /** 是否已消费：0=未用 1=已用（一次性）。 */
    private Integer used;

    /** 失败次数，达上限即作废。 */
    private Integer failCount;

    /** 过期时间（出题 + 2 分钟）。 */
    private LocalDateTime expireAt;

    private LocalDateTime createTime;
}
