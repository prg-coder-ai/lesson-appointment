package com.reservation.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("sys_eclassroom_instance")
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
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}