package com.messagecenter.common;

import lombok.Data;

/**
 * 服务运行信息（缺省页与 /api/v1/system/info 共用同一份数据）。
 *
 * <p>字段与 DefaultPageController 缺省页展示项一一对应：
 * 程序名称、版本、构建时间、服务器时间、时区、已运行时长；
 * 另补充结构化字段（uptimeMillis、startTime、timezone.id 等）便于程序化消费（健康检查/监控看板）。</p>
 */
@Data
public class ServiceInfo {

    /** 服务标识，如 message-service */
    private String service;

    /** 程序名称（取 build-info 的 artifact，缺失时用兜底名） */
    private String appName;

    /** 版本，缺失为"未知" */
    private String version;

    /** 构建时间（yyyy-MM-dd HH:mm:ss），缺失为"未知" */
    private String buildTime;

    /** 服务器当前时间（yyyy-MM-dd HH:mm:ss） */
    private String serverTime;

    /** JVM 启动时间（yyyy-MM-dd HH:mm:ss） */
    private String startTime;

    /** 已运行时长文本，如 "1 天 2 小时 3 分 4 秒" */
    private String uptime;

    /** 已运行时长（毫秒），便于监控计算 */
    private Long uptimeMillis;

    /**
     * 服务所在主机的 IP 地址（取首个非回环 IPv4，如 172.16.0.9）。
     * 取自进程所在机器，与"前端从哪个域名访问"无关。
     */
    private String hostAddress;

    /** 服务监听端口，如 8090 */
    private Integer port;

    /** 时区信息 */
    private TimezoneInfo timezone;

    /** 运行状态：固定 UP（能返回本响应即代表服务存活） */
    private String status;

    /** 服务简要说明（用于前端展示） */
    private String description;

    @Data
    public static class TimezoneInfo {
        /** 时区 ID，如 Asia/Shanghai */
        private String id;
        /** 时区显示名（中文），如 中国标准时间 */
        private String displayName;
        /** UTC 偏移，如 UTC+08:00 */
        private String utcOffset;
        /** 组合展示文本，如 Asia/Shanghai（中国标准时间，UTC+08:00） */
        private String description;
    }
}
