package com.reservation.dto;

import lombok.Data;

/**
 * 微信 auth.code2Session 接口返回（仅取我们需要的字段）。
 * 成功：errcode=0 且 openid 非空；失败：errcode≠0 且 errmsg 描述原因。
 *
 * 说明：openid 是微信体系下该小程序内用户的全局唯一标识，客户端永不接触真实微信号；
 * unionid 仅在该微信开放平台账号下绑定了多个小程序/公众号时才返回，可忽略。
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
