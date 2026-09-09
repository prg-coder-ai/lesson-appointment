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

    /**
     * 本次请求的实际连接信息（三层地址）。
     *
     * <p>只有带 HTTP 请求上下文时才有值（接口与缺省页均传入 request）；
     * 无上下文调用（如内部定时/启动自检）时仅含服务侧监听地址。</p>
     */
    private ConnectionInfo connection;

    /** 时区信息 */
    private TimezoneInfo timezone;

    /** 运行状态：固定 UP（能返回本响应即代表服务存活） */
    private String status;

    /** 服务简要说明（用于前端展示） */
    private String description;

    /**
     * 实际连接信息：区分「请求侧 / 转发侧 / 服务侧」三层，避免把「调用地址」误当成「实际连上的地址」。
     */
    @Data
    public static class ConnectionInfo {

        /** 客户端请求的协议：优先 X-Forwarded-Proto（反代场景），其次 request.getScheme() */
        private String scheme;

        /** 请求 Host 头原始值（浏览器实际访问的 域名:端口），如 www.xxx.com 或 152.136.254.127:8081 */
        private String requestHost;

        /**
         * 把 requestHost 的域名部分做 DNS 解析得到的 IP —— 即浏览器真正连过去的那个 IP。
         * 本身是 IP 时返回原值；解析失败为 null。由服务端代解析（浏览器 JS 无法做 DNS 查询）。
         */
        private String requestHostIp;

        /** 与本服务建立 TCP 连接的对端地址：直连时是客户端，经 Nginx 同机反代时是 127.0.0.1 */
        private String remoteAddress;

        /** 对端端口（反代为 Nginx 的随机源端口） */
        private Integer remotePort;

        /** X-Forwarded-For 原始值，多级代理时逗号分隔 */
        private String forwardedFor;

        /** 真实客户端 IP：X-Real-IP 优先，其次 X-Forwarded-For 首段 */
        private String clientIp;

        /** 本服务实际监听地址（local.server.address / server.address），0.0.0.0 表示监听全部网卡 */
        private String listenAddress;

        /** 本服务实际监听端口（local.server.port 优先，server.port=0 随机端口也能取到真实值） */
        private Integer listenPort;

        /** 是否经由反向代理：存在 X-Forwarded-* 或 X-Real-IP 即为 true */
        private Boolean viaProxy;

        /** 一整串链路摘要，如 客户端(1.2.3.4) → https://www.x.com → nginx(127.0.0.1:52120) → 本服务(0.0.0.0:8081) */
        private String summary;
    }

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
