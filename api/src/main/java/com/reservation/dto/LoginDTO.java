package com.reservation.dto;


import jakarta.validation.constraints.NotBlank;
import lombok.Data;
@Data
public class LoginDTO {
    private String account;
    private String password;
    private String tenantCode;  // 租户编码（SaaS多租户登录用，平台管理员传"platform"）

    private String userId;  // 系统生成唯一标识（UUID），对应通用校验规则-ID类参数
 
    private String phone; 
    private String email; 
      private String role;
 
    private String name; 
    private String languageType;  // 枚举值：英语/日语/韩语/法语/德语/西班牙语
 
    private String status;
}