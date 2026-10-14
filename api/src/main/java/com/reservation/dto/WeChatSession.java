package com.reservation.dto;

import lombok.Data;

/**
 * 微信 auth.code2Session 接口返回（仅取我们需要的字段）。
 * 成功：errcode=0 且 openid 非空；失败：errcode≠0 且 errmsg 描述原因。
 *
 * 说明：openid 是微信体系下该应用内用户的唯一标识（按小程序/网站应用/公众号分裂），
 * 客户端永不接触真实微信号；unionid 是跨端统一身份（P1 起落库
 * {@code wx_userid.wx_unionid}，匹配优先级高于 openid）——仅在应用绑定了同一
 * 微信开放平台账号时才下发，缺失时按 openid 回退匹配。
 */
@Data
public class WeChatSession {
    /** 用户唯一标识（小程序内） */
    private String openid;
    /** 会话密钥（仅服务端换 token 用，不可下发前端） */
    private String sessionKey;
    /** 用户在开放平台的唯一标识（多应用绑定时才有） */
    private String unionid;
    /** 错误码，0=成功 */
    private Long errcode;
    /** 错误信息 */
    private String errmsg;
}
