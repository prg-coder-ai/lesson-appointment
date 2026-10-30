package com.reservation.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 路径2「指定租户注册用户」入参（{@code POST /promo/register-user}）。
 *
 * <p>客户端调用：
 * <pre>
 * { "referralCode":"Kx7mP9qR", "tenantCode":"Ab3dEf7h",
 *   "account":"student01", "password":"...", "name":"李四",
 *   "phone":"138xxxx", "role":"student", "source":"share" }
 * </pre>
 *
 * <p>{@code tenantCode} 必须与推广码绑定的目标租户一致，否则后端拒绝（防篡改刷业绩）。
 * {@code role} 限 student / teacher —— 管理员不能靠邀请码产生。
 */
@Data
public class PromoRegisterUserDTO {

    @NotBlank(message = "推广码不能为空")
    private String referralCode;

    @NotBlank(message = "租户编码不能为空")
    private String tenantCode;

    @NotBlank(message = "账号不能为空")
    private String account;

    @NotBlank(message = "密码不能为空")
    private String password;

    /** 姓名（可省略）。 */
    private String name;

    /** 联系电话（可省略；传了才参与同手机号限频）。 */
    private String phone;

    /** 角色：student / teacher；缺省 student。 */
    private String role;

    /** 来源标记：share / landing / qrcode / direct。 */
    private String source;
}
