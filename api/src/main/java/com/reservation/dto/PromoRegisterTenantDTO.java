package com.reservation.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 路径1「自助建租户 + 首管理员」入参（{@code POST /promo/register-tenant}）。
 *
 * <p>客户端调用（web login.html 的"免费体验注册"表单）：
 * <pre>
 * { "referralCode":"Kx7mP9qR", "orgName":"XX工作室", "industryId":1,
 *   "account":"admin1", "password":"...", "name":"张三", "phone":"138xxxx",
 *   "source":"share", "wxCode":"081abc..." }
 * </pre>
 *
 * <p>{@code wxCode} 可选：勾选"允许微信登录"时传 {@code wx.login()} 的临时 code，
 * 后端换 openid 后绑到新管理员账号（bind_source=manual，账号有密码可解绑）。
 * {@code source} 可选：share/landing/qrcode/direct，用于转化明细的来源列。
 */
@Data
public class PromoRegisterTenantDTO {

    @NotBlank(message = "推广码不能为空")
    private String referralCode;

    @NotBlank(message = "机构名称不能为空")
    private String orgName;

    /** 行业 ID（sys_industry.id），可省略。 */
    private Long industryId;

    @NotBlank(message = "管理员账号不能为空")
    private String account;

    @NotBlank(message = "密码不能为空")
    private String password;

    /** 管理员姓名（可省略）。 */
    private String name;

    /** 联系电话（可省略；传了才参与同手机号限频）。 */
    private String phone;

    /** 来源标记：share / landing / qrcode / direct。 */
    private String source;

    /** 可选：wx.login() 临时 code，换取 openid 绑定到新管理员。 */
    private String wxCode;
}
