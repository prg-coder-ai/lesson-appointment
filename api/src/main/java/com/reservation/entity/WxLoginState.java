package com.reservation.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 微信 PC 扫码登录/绑定的一次性 state（对应表 {@code wx_login_state}，P2 新增）。
 *
 * <p><b>生命周期只有 5 分钟</b>：{@code /auth/wechat/qr} 生成 → 二维码展示 →
 * 用户手机扫码 → 微信回调 {@code pc-callback} 置 confirmed/failed →
 * 前端轮询 {@code qr/status} 取走结果（login 场景连 token 一并取走）并<b>删除该行</b>；
 * 过期行在轮询/回调时按 {@code expire_at} 判脏并清理。表不做批量保留，天然防重放。
 *
 * <p><b>为什么必须登记 IGNORE_TABLES</b>：本表无 {@code tenant_id} 列（扫码是平台级
 * 公开动作，与租户无关），若走租户插件会被拼出 {@code tenant_id = ?} 直接撞
 * Unknown column（与 sys_industry / promo 三表同一原因）。
 *
 * <p><b>安全姿态</b>（详见《微信登录与绑定实现路径方案》第 6 节）：
 * state 由本服务生成（UUID 不可猜）、一次性、5 分钟过期；bind 场景的 userId
 * 由服务端从令牌解析后随 state 落库，不信客户端参数；openid/unionid 属凭证级
 * 不回流前端（与 wechat-status 同范式）。
 */
@Data
@TableName("wx_login_state")
public class WxLoginState implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 一次性 state（UUID 无横线），二维码 URL 携带，微信回调原样带回。uk_state 全局唯一。 */
    private String state;

    /** 用途：login=扫码登录 / bind=已登录账号绑微信。 */
    private String purpose;

    /** bind 场景的发起用户 user.user_id（服务端从令牌解析）；login 场景为 null。 */
    private String userId;

    /** 发起请求 IP（审计用，不做相等性强制——代理/NAT 下同一用户出口 IP 可能变化）。 */
    private String ip;

    /** pending=待扫码 / confirmed=已确认 / failed=已失败（errorMsg 带原因）。 */
    private String status;

    /** confirmed 且 login 场景的会话 JSON（userId/token/refreshToken/role/tenantCode），一次性消费。 */
    private String tokenJson;

    /** failed 原因（原样透给前端展示，如「该微信已绑定其他账号」）。 */
    private String errorMsg;

    /** 过期时间（生成时刻 + 5 分钟）。 */
    private LocalDateTime expireAt;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
