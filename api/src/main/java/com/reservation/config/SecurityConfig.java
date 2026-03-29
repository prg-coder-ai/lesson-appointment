package  com.reservation.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configuration.WebSecurityConfigurerAdapter;

/**
 * SecurityConfig类，负责Spring Security安全配置
 * 用于设置URL访问权限、安全过滤链等
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig extends WebSecurityConfigurerAdapter {

    @Override
    protected void configure(HttpSecurity http) throws Exception {
        http
            .authorizeRequests()
                .antMatchers("/", "/index", "/index.html").permitAll() // 允许匿名访问首页
                // ... 其它授权规则
                .anyRequest().authenticated()
            .and()
            .csrf().disable(); // 根据实际情况（如需要支持POST跨域），可关闭CSRF
        // 其它安全配置...
    }
}

 