package  com.reservation.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configuration.WebSecurityConfigurerAdapter;

/**
 * SecurityConfig类，负责Spring Security安全配置
 * 用于设置URL访问权限、安全过滤链等 /endpoint-list
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig extends WebSecurityConfigurerAdapter {

    @Override
    protected void configure(HttpSecurity http) throws Exception {
        http
            .authorizeRequests() 
            .antMatchers("/", "index", "index.html","interfaces","api/v1").permitAll() // 允许匿名访问首页
                // ... 其它授权规则
            .anyRequest().authenticated()
            .and()
            .csrf().disable(); // 根据实际情况（如需要支持POST跨域），可关闭CSRF
        // 其它安全配置...
    }
}

 
/*
原因分析：

1. 若采用 Thymeleaf 模板（即 index.html 位于 resources/templates 下），
   Spring Boot 规定只能通过 Controller 返回逻辑视图名“index”来转发并渲染页面；
   不能直接通过 http://localhost:8081/index.html 访问该页面，否则会 404。正确做法是访问 http://localhost:8081/ 或 /index，让 Controller 处理返回 "index" 逻辑视图。

2. 当前 SecurityConfig 已将“/”、“/index”、“/index.html”路径设置为 permitAll，理论上不受 Spring Security 限制。
   但如果 Controller 未映射某个具体路由，Spring Boot 静态资源也没有对应的 index.html 文件（如 static/index.html），
   则直接访问 /index.html（尤其是项目只把模板放在 templates）依然会 404。

3. 访问 http://127.0.0.1:8081/（根路径）时报 404，常见原因：
   - 没有 Controller 映射“/”或“”；
   - 模板文件名或路径不对；
   - 启动端口、静态路径、模板路径误配等；
   - 热部署未生效或项目未编译。

排查建议：

- 确认 IndexController 存在 @RequestMapping({"", "/"}) 或 @GetMapping("/")，且返回值为 "index"；
- 确认 templates 目录下有 index.html；
- 如需支持 /index.html 直链访问，则应将 index.html 拷贝至 resources/static/ 或 resources/public/ 下；
- SecurityConfig 已允许这些路径访问，无需变更。

参考链接：
https://docs.spring.io/spring-boot/docs/current/reference/html/web.html#web.servlet.spring-mvc.static-content
*/