  package  com.reservation.config;


import org.springframework.context.annotation.Configuration;
import org.springframework.http.CacheControl;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.concurrent.TimeUnit;

  @Configuration
     public class WebConfig implements WebMvcConfigurer {
       @Override
        public void addResourceHandlers(ResourceHandlerRegistry registry) {
         registry.addResourceHandler("/css/**")
              .addResourceLocations("classpath:/static/css/")
              .setCacheControl(CacheControl.maxAge(1, TimeUnit.HOURS))
              .resourceChain(true);
        }
     }