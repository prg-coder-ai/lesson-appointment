package com.ih.api

import org.springframework.boot.SpringApplication
import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication
import com.ih.api.auth.JwtFilter
import com.ih.api.controller.UploadConfig
import org.mybatis.spring.annotation.MapperScan
import org.springframework.boot.autoconfigure.EnableAutoConfiguration
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.boot.web.servlet.FilterRegistrationBean
import org.springframework.boot.web.servlet.ServletComponentScan
import org.springframework.context.annotation.Bean
import java.util.*
import org.springframework.context.annotation.ComponentScan
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;

@SpringBootApplication
@ServletComponentScan
@EnableAutoConfiguration
class DrchanApplication

fun main(args: Array<String>) {
    // runApplication<DrchanApplication>(*args)
     System.setProperty("spring.devtools.restart.enabled", "true");
     SpringApplication.run(DrchanApplication::class.java, *args)
}
