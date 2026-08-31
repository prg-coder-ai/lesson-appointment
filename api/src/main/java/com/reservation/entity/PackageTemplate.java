package com.reservation.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 套餐模板实体，对应表 sys_package_template
 *
 * 套餐模板是「规格定义」，只描述各资源的限额（0=不限），不包含任何租户信息。
 * 租户通过 sys_tenant.package_id 选用某个模板，
 * 其自身的套餐数据记录在 sys_tenant_package（一租户一条）。
 */
@Data
@TableName("sys_package_template")
public class PackageTemplate {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 套餐模板名称 */
    private String templateName;

    /** 套餐模板编码 */
    private String templateCode;

    /** 课程数量限额（0=不限） */
    private Integer courseLimit;

    /** 排期数量限额（0=不限） */
    private Integer scheduleLimit;

    /** 注册用户总数限额（0=不限） */
    private Integer userTotalLimit;

    /** 教师数量限额（0=不限） */
    private Integer teacherLimit;

    /** 学生数量限额（0=不限） */
    private Integer studentLimit;

    /** 教师信息发布限额（0=不限） */
    private Integer teacherPublishLimit;

    /** 状态：1启用 2停用 */
    private Integer status;

    private String remark;

    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
