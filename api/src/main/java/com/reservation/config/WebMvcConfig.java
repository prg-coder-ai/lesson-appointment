package com.reservation.config; 

import com.reservation.interceptor.TenantInterceptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
//MVC拦截器注册配置
@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    @Autowired
    private TenantInterceptor tenantInterceptor;

    /**
     * 排除路径：免登录入口的**第四处同步点**（另三处：SecurityConfig 的 permitAll、
     * JwtAuthenticationFilter.WHITELIST_PATHS、check-authz-declarative 的 PERMIT_ALL）。
     * 页面、登录、注册、公开接口、静态资源没有登录态，不应走租户校验；
     * 漏配的症状是请求穿过 Security 与 JwtFilter 后，被 TenantInterceptor
     * 以「无 Authorization 头」为由 401 —— 公开端点整体失效，且只在运行时才暴露
     * （2026-10-13 实测：wechat-register 与 promo 四个公开端点两次踩中，
     *  已由 check-authz-declarative 守卫新增「第四同步点」校验兜底）。
     */
    private static final String[] EXCLUDE_PATTERNS = {
            "/", "/index", "/index.html",
            "/admin.html", "/platform_admin.html", "/student.html", "/teacher.html",
            "/teacherInfo.html", "/teacherPublishedProfile.html",
            "/logBrowser.html", "/auditLog.html",
            "/booking", "/booking.html",
            "/api/v1/booking",
            "/teacher/published/latest-public",
            "/api/v1/teacher/published/latest-public",
            "/teacher/published/public-get",
            "/api/v1/teacher/published/public-get",
            "/teacher/published/public-list",
            "/api/v1/teacher/published/public-list",
            "/schedule/getAvailableSchedule",
            "/api/v1/schedule/getAvailableSchedule",
            "/login", "/auth/login", "/api/v1/auth/login", "/auth/refreshToken", "/api/v1/auth/refreshToken", "/auth/logout", "/api/v1/auth/logout",
            "/user/register", "/api/v1/user/register",
            "/user/account/exist", "/api/v1/user/account/exist",
            "/api/v1/auth/wechat-login", "/auth/wechat-login",
            // 微信直接注册（场景 C）：与 wechat-login 同为免登录入口，两种路径形态都要放
            "/api/v1/auth/wechat-register", "/auth/wechat-register",
            // 推广公开端点（免登录，不带 token）：推广码校验/点击计数、两条注册路径、
            // 路径2 租户编码校验。防刷在 PromoService.checkRegisterAbuse 内，不依赖登录态。
            "/api/v1/promo/referral/validate", "/promo/referral/validate",
            "/api/v1/promo/register-tenant", "/promo/register-tenant",
            "/api/v1/promo/register-user", "/promo/register-user",
            "/api/v1/tenant/validate-code", "/tenant/validate-code",
            "/term/map", "/api/v1/term/map",
            "/interfaces", "/api/v1/interfaces",
            "/tenant/name", "/api/v1/tenant/name",
            // 服务运行信息（无登录态/无租户上下文，须跳过租户校验）
            "/system/info", "/api/v1/system/info", "/apiInfo", "/api/v1/apiInfo",
            "/js/**", "/css/**", "/images/**", "/favicon.ico",
            "/error"
    };

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        // 说明：控制器实际映射在根路径下（/tenant、/monitor、/course 等），
        // 此前只注册 /api/** 会导致租户上下文与会话续期完全不生效，
        // 现改为全路径注册，仅放行无需登录的公开路径
        registry.addInterceptor(tenantInterceptor)
                .addPathPatterns("/**")
                .excludePathPatterns(EXCLUDE_PATTERNS);
    }
}