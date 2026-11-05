package com.reservation.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 微信直接注册（{@code bind_source=auto_register}）账号首次设置登录密码。
 *
 * <p>这类账号由扫码注册产生：{@code account=openid}、密码是随机 UUID 密文，用户无从得知，
 * 因此走不了需要原密码的 {@code /auth/password/change}。设置成功后服务端把绑定来源
 * 降级为 {@code manual}，之后 {@code /auth/unbind-wechat} 才会放行 —— 解绑后用户仍可凭
 * 「上方显示的账号 + 新密码 + 租户编码」密码登录，不会变成僵尸数据。
 *
 * <p>无需传 userId：控制器从当前会话令牌解析，越权改他人密码的路径不存在。
 */
@Data
public class WeChatSetPasswordDTO {

    @NotBlank(message = "新密码不能为空")
    private String password;
}
