package  com.reservation.config;
 
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;
/*
分析本项目中CORS的相关设置为什么没有生效？

1. CORS配置引入了 src.main.java.com.reservation.config.CorsConfig，但从本Controller代码来看，@CrossOrigin注解并未显式声明到类或方法上；
2. Spring CORS配置通常有两种方式生效：
   - 一是在每个Controller或方法上使用@CrossOrigin注解；
   - 二是在WebMvcConfigurer实现类（如CorsConfig）里手动配置跨域规则。如果是手动配置，需要确保CorsConfig被正确注册为Spring Bean，并且映射路径等参数配置得当；
3. 需要注意包名和@ComponentScan路径问题：代码首行的 package src.main.java.com.reservation.controller; 显示了多余的“src.main.java.”前缀，这并不是标准的包名格式，可能导致Spring无法扫描到相关的Config、Controller、Service等Bean。
4. 如果CorsConfig没有被Spring Boot扫描、实例化并注册，CORS配置不会生效；
5. 还要保证项目启动时加载了对应的配置类，而不是因为包路径、扫描路径导致未注入；
6. 另外，不应该在包名里包含“src.main.java.”前缀。应使用标准的包命名，如包名为“com.reservation.controller”。

结论：  
本项目CORS设置不生效，常见原因是：
- CorsConfig配置类没有被Spring扫描到（包名错误或未加@Configuration/@Component等注解）。
- 包命名错误导致Bean未注册。
- Controller未加@CrossOrigin注解、或CorsConfig全局配置路径未涵盖全部API。
建议修正包名，并确认CORS Config类被自动扫描且配置路径无误。
*/
 
@Configuration 
public class CorsConfig {

    @Bean
    public CorsFilter corsFilter() {
        CorsConfiguration config = new CorsConfiguration();
        
        // 允许所有来源（本地开发用这个）Spring Boot 2.4+ 注解中 `origins` 支持通配符 `*`, Pattern生产环境不要用*，配合credentials需指定具体域名）
        config.addAllowedOriginPattern("http://localhost:8080");    
         // 允许携带Cookie
        config.setAllowCredentials(true);  

        // 允许所有请求头
        config.addAllowedHeader("*");        
        // 允许所有请求方法（GET,POST,PUT,DELETE,OPTIONS）
        config.addAllowedMethod("*");        
        config.addExposedHeader("*");

          // 允许暴露的响应头（如自定义的Token、用户信息等，前端需获取时配置）
        config.addExposedHeader("Authorization");
        config.addExposedHeader("X-User-Id");
        
        // 预检请求有效期
        config.setMaxAge(3600L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
         // 对所有接口生效
        source.registerCorsConfiguration("/**", config);
        return new CorsFilter(source);
    }
}