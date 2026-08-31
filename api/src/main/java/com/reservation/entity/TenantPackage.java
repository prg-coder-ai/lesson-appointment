package com.reservation.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 租户套餐额度实体，对应表 sys_tenant_package
 * 每个租户一条记录，管理各资源限额与当前数量
 */
@Data
@TableName("sys_tenant_package")
public class TenantPackage {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long tenantId;              // 租户ID（唯一，对应sys_tenant.id）

    // 课程额度
    private Integer courseLimit;        // 课程数量限额（0=不限）
    private Integer courseCurrent;      // 课程当前数量

    // 排期额度
    private Integer scheduleLimit;      // 排期数量限额（0=不限）
    private Integer scheduleCurrent;    // 排期当前数量

    // 注册用户额度
    private Integer userTotalLimit;     // 注册用户总数限额（0=不限）
    private Integer userCurrent;        // 注册用户当前数量

    // 教师额度
    private Integer teacherLimit;       // 教师数量限额（0=不限）
    private Integer teacherCurrent;     // 教师当前数量

    // 学生额度
    private Integer studentLimit;       // 学生数量限额（0=不限）
    private Integer studentCurrent;     // 学生当前数量

    // 教师信息发布额度
    private Integer teacherPublishLimit;     // 教师信息发布数量限额（0=不限）
    private Integer teacherPublishCurrent;   // 教师信息发布当前数量

    private LocalDateTime createTime;   // 创建时间
    private LocalDateTime updateTime;   // 修改时间
}
