package com.reservation.entity;

import lombok.Data;

//import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import com.reservation.common.AtLeastOneNotBlank;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import java.io.Serializable;
/**
 * 用户实体类，对应设计2.2.1 所有接口的请求参数
 */
@Data
@TableName("user")
// 校验 phone 和 email 至少一个不为空
@AtLeastOneNotBlank(firstField = "phone", secondField = "email")
public class User implements Serializable{
   private static final long serialVersionUID = 1L;

    /** 租户ID（0=平台管理员/历史单租户数据）— SaaS多租户，对应sys_tenant.id */
    private Long tenantId;

    /**
     * 租户编码（仅注册入参使用，非数据库字段）
     * 自助注册接口在白名单内拿不到租户上下文，需前端携带租户编码来归属租户；
     * 平台管理员添加用户时同样用它指定目标租户。
     * 已登录的租户内添加用户场景走 TenantContext，不依赖本字段。
     */
    @TableField(exist = false)
    private String tenantCode;

    /** 系统生成唯一标识（UUID），主键 */
    @TableId(type = IdType.ASSIGN_UUID)
    private String userId;

    @NotBlank(message = "账号不能为空")
    private String account;
//检验条件：手机和邮箱不能都为空，至少有一个不为空，作为账号

    // 手机号校验（对应通用校验规则-手机号）
  //  @NotBlank(message = "手机号不能为空")
  //  @Pattern(regexp = "^1[3456789]\\d{9}$", message = "手机号格式错误")
    private String phone;

    // 邮箱校验（对应通用校验规则-邮箱）
   // @NotBlank(message = "邮箱不能为空")
   // @Email(message = "邮箱格式错误")
    private String email;

    // 密码校验（对应通用校验规则-密码）
    //@NotBlank(message = "密码不能为空")
   // @Size(min = 1, max = 20, message = "密码长度需8-20位")
   // @Pattern(regexp = "^(?=.*[a-zA-Z])(?=.*\\d).{8,20}$", message = "密码需包含字母和数字")
    private String password;

    // 角色（student/teacher/admin），对应设计2.2.1 登录接口返回角色信息,1 student：学生，2teacher：教师，3admin：管理员）'
    private String role;

    // 学生专属参数（对应设计2.2.1 学生注册接口）
    private String learnGoal;
    private String languageLevel;  // 枚举值：入门/进阶/中级/高级/精通

  // private String username;//账号--邮箱或电话
    // 教师专属参数（对应设计2.2.1 教师注册接口）
    private String name;
    private String qualification;  // Base64编码的资质图片
    private String languageType;  // 枚举值：英语/日语/韩语/法语/德语/西班牙语

    // 账号状态（padding/active/inactive/frozen），对应设计2.2.1 教师注册审核、设计2.2.5 用户管理
    private String status;

    /** 最近活跃时间（在线统计辅助字段） */
    private java.time.LocalDateTime lastActiveTime;

    /** 创建时间（运营统计：当月新增用户） */
    private java.time.LocalDateTime createTime;

    private java.time.LocalDateTime updateTime;
}