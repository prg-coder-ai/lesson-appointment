package com.classroom.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * eclassroom 实例表（跨 schema 只读实体）。
 *
 * <p>表位于主系统 schema {@code lesson_appointment}，classroom-service 通过全限定表名只读查询，
 * 用于获取课堂实例的状态信息（配合 TenantEclassroom 判断课堂是否可用）。
 *
 * <p><b>只读</b>：classroom-service 不应对此表做任何写操作。
 */
@Data
@TableName("lesson_appointment.sys_eclassroom_instance")
public class EclassroomInstance {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String instanceCode;
    private String instanceName;
    private String apiHost;
    private Integer apiPort;
    private String apiBasePath;
    private String wsHost;
    private Integer wsPort;
    private String wsBasePath;
    /** 实例状态：1=正常 0=停用 2=维护中 */
    private Integer status;
    private String region;
    private Integer maxCapacity;
    private Integer currentLoad;
    private String remark;
    private String creatorAccount;
    /** 软删除：0正常 1已删除 */
    private Integer deleted;
    private java.time.LocalDateTime createTime;
    private java.time.LocalDateTime updateTime;
}