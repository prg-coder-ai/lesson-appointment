package com.reservation.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 用户会话实体，对应表 sys_user_session
 * 单机部署下的在线统计数据源：登录写入、登出标记、请求续期、定时清理过期会话
 */
@Data
@TableName("sys_user_session")
public class UserSession {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String sessionId;

    /** 租户ID（0=平台管理员） */
    private Long tenantId;

    private String userId;

    /** 角色：student/teacher/admin/platform_admin */
    private String userRole;

    private String ip;

    private String userAgent;

    private LocalDateTime loginTime;

    private LocalDateTime lastActive;

    /** 1在线 2已登出 3已过期 */
    private Integer status;
}
