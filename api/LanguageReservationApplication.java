package com.language.reservation;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

/**
 * 语言教学预约系统后端API启动类，项目唯一入口
 * 核心关联现有文件，确保所有组件加载生效，标注如下：
 */
@SpringBootApplication  // 关联点1：自动扫描当前包（com.language.reservation）及其子包下所有组件
                       // 涵盖所有controller、service、utils、exception、common等包下的注解类（@RestController、@Service、@Component等）
@MapperScan("com.language.reservation.mapper")  // 关联点2：扫描MyBatis映射接口（UserMapper、CourseMapper等）
                                               // 对应1.2 application.yml中mybatis.type-aliases-package配置，确保mapper接口被Spring管理
public class LanguageReservationApplication {

    public static void main(String[] args) {
        // 启动Spring Boot项目，加载所有配置和组件（关联所有基础配置、业务模块）
        SpringApplication.run(LanguageReservationApplication.class, args);
    }

    /**
     * 注入BCryptPasswordEncoder对象，用于密码加密
     * 关联点3：对应UserService中注入的BCryptPasswordEncoder，实现密码加密逻辑（设计2.3 安全设计-密码加密）
     * 若不注入，UserService中@Autowired注入会报错，无法完成用户注册、登录的密码校验
     */
    @Bean
    public BCryptPasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}