package com.reservation.entity; 

import com.baomidou.mybatisplus.annotation.IdType;
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
     
    private LocalDateTime expireTime;
    /** 退租/停用时间 */
    private LocalDateTime offlineTime;
    private String remark;
    /** 软删除标记：0正常 1已删除（保留可恢复） */
     private Integer deleted;

    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}