package com.classroom.common;

import lombok.Data;

/**
 * 服务运行信息（缺省页与 /api/v1/system/info 共用同一份数据）。
 */
@Data
public class ServiceInfo {

    private String service;
    private String appName;
    private String version;
    private String buildTime;
    private String serverTime;
    private String startTime;
    private String uptime;
    private Long uptimeMillis;
    private String hostAddress;
    private Integer port;
    private ConnectionInfo connection;
    private TimezoneInfo timezone;
    private String status;
    private String description;

    @Data
    public static class ConnectionInfo {
        private String scheme;
        private String requestHost;
        private String requestHostIp;
        private String remoteAddress;
        private Integer remotePort;
        private String forwardedFor;
        private String clientIp;
        private String listenAddress;
        private Integer listenPort;
        private Boolean viaProxy;
        private String summary;
    }

    @Data
    public static class TimezoneInfo {
        private String id;
        private String displayName;
        private String utcOffset;
        private String description;
    }
}