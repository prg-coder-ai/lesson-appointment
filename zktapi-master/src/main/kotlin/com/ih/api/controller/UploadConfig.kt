package com.ih.api.controller

//import org.springframework.beans.factory.annotation.Qualifier
//import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.web.servlet.MultipartConfigFactory
import javax.servlet.MultipartConfigElement
import org.springframework.context.annotation.Bean
//import org.springframework.context.annotation.Configuration
//import org.springframework.context.annotation.PropertySource
import org.springframework.stereotype.Component
//import org.springframework.web.servlet.config.annotation.WebMvcConfigurerAdapter

@Component
@ConfigurationProperties(prefix = "upload")
/*@PropertySource("classpath:/upload.properties")*/
class UploadConfig {
    /**
     * 在配置文件中配置的文件绝对路径
     */
    lateinit var location: String;
    /*
    * 浏览路径
    * */
    lateinit var browserPath: String


    @Bean
    fun multipartConfigElement(): MultipartConfigElement {
        val factory = MultipartConfigFactory()
        //文件最大KB,MB
        factory.setMaxFileSize("2MB")
        //设置总上传数据总大小
        factory.setMaxRequestSize("10MB")
        return factory.createMultipartConfig()
    }


}