package com.reservation.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 等保 P1-1：注册密码强度策略。
 *
 * <p>根据 {@code app.security.strict-mode} 分级（application.properties 里配置）：
 * <ul>
 *   <li>strict-mode=false（默认 / dev / 测试）：仅非空 + 长度下限（≥ 6 位），
 *       测试账号可用 {@code 123456} / {@code admin123} 这种简单密码快速跑通。</li>
 *   <li>strict-mode=true（cloud / prod）：强制 8-64 位，且必须包含大写字母、
 *       小写字母、数字、特殊字符（至少各一位），符合等保二级"密码复杂度"要求。</li>
 * </ul>
 *
 * <p>实现方式：不依赖 Bean Validation（那样不能按 profile 条件性开启），
 * 而是作为 Service / Controller 层显式调用的硬校验组件 —— 既能在所有注册入口
 *（PromoRegisterTenantDTO / PromoRegisterUserDTO / 微信注册 / 自助注册）兜底，
 * 又不会让登录旧账号被强校验挡住（登录走 BCrypt，不改明文）。
 */
@Component
public class PasswordPolicy {

    /** 严格档密码正则：8-64 位，且同时包含大小写字母、数字、特殊字符（至少各一位）。 */
    private static final java.util.regex.Pattern STRONG = java.util.regex.Pattern.compile(
            "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&.\\-_=+#])[A-Za-z\\d@$!%*?&.\\-_=+#]{8,64}$"
    );

    /** 宽松档密码正则：≥ 6 位，非空即可。 */
    private static final java.util.regex.Pattern RELAXED = java.util.regex.Pattern.compile(
            "^.{6,}$"
    );

    @Value("${app.security.strict-mode:false}")
    private boolean strictMode;

    /**
     * 校验密码强度。
     *
     * @return null 表示通过；非 null 为错误提示（可直接返回给前端）
     */
    public String validate(String password) {
        if (password == null || password.isBlank()) {
            return "密码不能为空";
        }
        if (strictMode) {
            if (!STRONG.matcher(password).matches()) {
                return "密码强度不足，需 8-64 位并同时包含：大写字母、小写字母、数字、特殊字符";
            }
        } else {
            if (!RELAXED.matcher(password).matches()) {
                return "密码长度至少 6 位";
            }
        }
        return null;
    }

    public boolean isStrictMode() {
        return strictMode;
    }
}
