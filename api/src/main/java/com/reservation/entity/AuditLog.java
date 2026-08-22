package com.reservation.entity;

import lombok.Data;
import java.io.Serializable;
import java.util.Date;

/**
 * 审计日志实体，记录用户业务操作
 */
@Data
public class AuditLog implements Serializable {
    private static final long serialVersionUID = 1L;
    private Long id;
    private String logId;
    private String userId;
    private String userName;
    private String userRole;
    private String action;
    private String resourceType;
    private String resourceId;
    private String resourceName;
    private String method;
    private String requestUrl;
    private String httpMethod;
    private String ip;
    private String userAgent;
    private String requestParams;
    private String resultStatus;
    private String errorMsg;
    private Integer costMs;
    private Date createdAt;
}
