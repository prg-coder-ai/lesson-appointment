package  src.main.java.com.reservation.utils;
 
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

@Configuration
public class CorsConfig {

    @Bean
    public CorsFilter corsFilter() {
        CorsConfiguration config = new CorsConfiguration();
        
        // 允许所有来源（本地开发用这个） Pattern生产环境不要用*，配合credentials需指定具体域名）
        config.addAllowedOrigin("http://localhost:8080");    
         // 允许携带Cookie
        config.setAllowCredentials(true);  

        // 允许所有请求头
        config.addAllowedHeader("*");        
        // 允许所有请求方法（GET,POST,PUT,DELETE,OPTIONS）
        config.addAllowedMethod("*");        
       
        // 预检请求有效期
        config.setMaxAge(3600L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
         // 对所有接口生效
        source.registerCorsConfiguration("/**", config);
        return new CorsFilter(source);
    }
}