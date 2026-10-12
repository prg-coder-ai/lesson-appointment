package com.reservation.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 微信直接注册入参（场景 C）：小程序 {@code wx.login()} 的临时 code + 目标租户编码。
 *
 * <p>客户端调用：{ "code": "081abc...", "tenantCode": "Kx7mP9qR", "role": "student" }
 *
 * <p>{@code role} 可省略，缺省 student；只能取 student / teacher —— 管理员不能靠扫码产生，
 * 否则任何人拿一个推广码就能给自己造一个租户管理员。
 */
@Data
public class WeChatRegisterDTO {

    @NotBlank(message = "微信 code 不能为空")
    private String code;

    /** 目标租户编码（8 字符），来自扫码/分享链接的 tcode 参数。 */
    @NotBlank(message = "租户编码不能为空")
    private String tenantCode;

    /** 角色：student / teacher；缺省 student。 */
    private String role;
}
