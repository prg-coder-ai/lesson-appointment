package com.language.reservation.entity;

import lombok.Data;
import javax.validation.constraints.Email;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Pattern;
import javax.validation.constraints.Size;

/**
 * 用户实体类，对应设计2.2.1 所有接口的请求参数
 */
@Data
public class User {
    private String userId;  // 系统生成唯一标识（UUID），对应通用校验规则-ID类参数

    // 手机号校验（对应通用校验规则-手机号）
    @NotBlank(message = "手机号不能为空")
  //  @Pattern(regexp = "^1[3456789]\\d{9}$", message = "手机号格式错误")
    private String phone;

    // 邮箱校验（对应通用校验规则-邮箱）
    @NotBlank(message = "邮箱不能为空")
    @Email(message = "邮箱格式错误")
    private String email;

    // 密码校验（对应通用校验规则-密码）
    @NotBlank(message = "密码不能为空")
    @Size(min = 8, max = 20, message = "密码长度需8-20位")
    @Pattern(regexp = "^(?=.*[a-zA-Z])(?=.*\\d).{8,20}$", message = "密码需包含字母和数字")
    private String password;

    // 角色（student/teacher/admin），对应设计2.2.1 登录接口返回角色信息,1 student：学生，2teacher：教师，3admin：管理员）'
    private String role;

    // 学生专属参数（对应设计2.2.1 学生注册接口）
    private String learnGoal;
    private String languageLevel;  // 枚举值：入门/进阶/中级/高级/精通

    // 教师专属参数（对应设计2.2.1 教师注册接口）
    private String name;
    private String qualification;  // Base64编码的资质图片
    private String languageType;  // 枚举值：英语/日语/韩语/法语/德语/西班牙语

    // 账号状态（active/inactive/frozen），对应设计2.2.1 教师注册审核、设计2.2.5 用户管理
    private String status;
}