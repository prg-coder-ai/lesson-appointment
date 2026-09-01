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
     * 排除路径：与 SecurityConfig 的 permitAll 白名单保持一致
     * （页面、登录、注册、公开接口、静态资源），这些请求没有登录态，不应走租户校验
     */
    private static final String[] EXCLUDE_PATTERNS = {
            "/", "/index", "/index.html",
            "/admin.html", "/platform_admin.html", "/student.html", "/teacher.html",
            "/teacherInfo.html", "/teacherPublishedProfile.html",
            "/logBrowser.html", "/auditLog.html",
            "/booking", "/booking.html",
            "/teacher/published/latest-public",
            "/teacher/published/public-get",
            "/schedule/getAvailableSchedule",
            "/login", "/auth/login", "/auth/refreshToken", "/auth/logout",
            "/user/register",
            "/user/account/exist",
            "/interfaces",
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