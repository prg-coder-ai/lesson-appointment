package com.reservation.entity; 

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;
//对应数据库表sys_tenant，租户实体类
@Data
@TableName("sys_tenant")
public class Tenant {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String tenantCode;
    private String orgName;
    private String contact;
    private String phone;
    /** 状态：1正常 2停用 3已退租 4-删除标记 */
    private Integer status;
    /** 关联套餐ID（sys_tenant_package.id，0=未指定套餐即不限额） */
    private Long packageId;//套餐模板--对应的标准套餐
    /** 所属行业ID，关联 sys_industry.id；NULL=未指定行业 */
    private Long industryId;
     
    private LocalDateTime expireTime;
    /** 退租/停用时间 */
    private LocalDateTime offlineTime;
    private String remark;
    /** 推广者 user_id（该租户由谁带来的）。 */
    private String referredBy;
    /** 试用状态：trial / expired / converted。 */
    private String trialStatus;
    /** 试用到期时间。 */
    private LocalDateTime trialExpireTime;
    /** 创建者账号：与 tenantCode 互查用（忘记租户编码时可用账号反查）。 */
    private String creatorAccount;
    /** 软删除标记：0正常 1已删除（保留可恢复） */
     private Integer deleted;

    /**
     * 课堂开通状态 —— **非表字段**，只在平台端租户列表里带出来（2026-11-20）。
     *
     * <p>取值：null=从未绑定（未开通），1=已启用，0=已禁用（保留绑定，临时关闭）。
     * <p>来源是 {@code sys_tenant_eclassroom}（tenant_id 唯一键），由
     * {@code EclassroomService#batchClassroomEnabled} 批量填充；
     * 用 exist=false 而不是另建 VO，是为了不动 /tenant/page 既有响应结构。
     */
    @TableField(exist = false)
    private Integer classroomEnabled;

    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}