package com.messagecenter.service;

import com.messagecenter.common.ServiceInfo;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.info.BuildProperties;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.lang.management.ManagementFactory;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Enumeration;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 服务运行信息提供者。
 *
 * <p>缺省页（DefaultPageController）与查询接口（ApiInfoController#getApiInfo）
 * 共用本类的输出，保证页面展示与接口返回完全一致，不会出现两处逻辑漂移。</p>
 *
 * <p>程序名/版本/构建时间取自构建期生成的 {@code META-INF/build-info.properties}
 * （spring-boot-maven-plugin 的 build-info 目标）；缺失时降级为"未知"，不影响启动。</p>
 */
@Service
public class ServiceInfoService {

    /** 服务标识（用于接口返回与前端区分后端） */
    public static final String SERVICE_ID = "message-service";

    /** build-info 缺失时的兜底程序名 */
    public static final String FALLBACK_APP_NAME = "message-service";

    /** 服务说明 */
    public static final String DESCRIPTION = "消息中心微服务 · 纯后台程序（无管理页面）";

    private static final String UNKNOWN = "未知";
    private static final String STATUS_UP = "UP";
    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    /** Host 头 → 解析 IP 的缓存（含失败，值为空串）。DNS 查询有网络开销，避免每次请求都查。 */
    private static final Map<String, String> HOST_IP_CACHE = new ConcurrentHashMap<>();

    private final BuildProperties buildProperties;
    private final Environment environment;

    /**
     * 用 ObjectProvider 注入：未生成 build-info（如 IDE 直接启动）时为 null，避免启动失败。
     */
    public ServiceInfoService(ObjectProvider<BuildProperties> buildPropertiesProvider, Environment environment) {
        this.buildProperties = buildPropertiesProvider.getIfAvailable();
        this.environment = environment;
    }

    /**
     * 组装当前服务运行信息（无 HTTP 请求上下文时使用）。
     *
     * <p>此时 connection 只含服务侧监听地址，请求侧/转发侧为 null。</p>
     */
    public ServiceInfo current() {
        return current(null);
    }

    /**
     * 组装当前服务运行信息（每次调用实时取值）。
     *
     * @param request 当前 HTTP 请求，用于取「实际连接地址」；可为 null
     */
    public ServiceInfo current(HttpServletRequest request) {
        ServiceInfo info = new ServiceInfo();
        info.setService(SERVICE_ID);
        info.setStatus(STATUS_UP);
        info.setDescription(DESCRIPTION);

        String appName = FALLBACK_APP_NAME;
        String version = UNKNOWN;
        String buildTime = UNKNOWN;

        if (buildProperties != null) {
            // artifact 比 name 更贴近"程序名称"（即 artifactId）
            String artifact = buildProperties.getArtifact();
            if (artifact != null && !artifact.isBlank()) {
                appName = artifact;
            } else if (buildProperties.getName() != null && !buildProperties.getName().isBlank()) {
                appName = buildProperties.getName();
            }
            if (buildProperties.getVersion() != null) {
                version = buildProperties.getVersion();
            }
            if (buildProperties.getTime() != null) {
                buildTime = LocalDateTime.ofInstant(buildProperties.getTime(), ZoneId.systemDefault()).format(FMT);
            }
        }
        info.setAppName(appName);
        info.setVersion(version);
        info.setBuildTime(buildTime);

        LocalDateTime now = LocalDateTime.now();
        info.setServerTime(now.format(FMT));

        // 服务所在主机地址与监听端口（用于前端展示"连的是哪台机器的哪个端口"）
        info.setHostAddress(resolveHostAddress());
        info.setPort(resolvePort());

        // 实际连接信息：请求侧（浏览器访问域名+解析IP）/ 转发侧（对端地址+真实客户端）/ 服务侧（监听地址:端口）
        info.setConnection(buildConnection(request, info.getPort()));

        TimeZone tz = TimeZone.getDefault();
        ServiceInfo.TimezoneInfo tzInfo = new ServiceInfo.TimezoneInfo();
        tzInfo.setId(tz.getID());
        tzInfo.setDisplayName(tz.getDisplayName(Locale.SIMPLIFIED_CHINESE));
        tzInfo.setUtcOffset(utcOffset(tz));
        tzInfo.setDescription(tz.getID() + "（" + tz.getDisplayName(Locale.SIMPLIFIED_CHINESE) + "，" + utcOffset(tz) + "）");
        info.setTimezone(tzInfo);

        long uptimeMillis = ManagementFactory.getRuntimeMXBean().getUptime();
        info.setUptimeMillis(uptimeMillis);
        info.setUptime(formatUptime(uptimeMillis / 1000));
        info.setStartTime(LocalDateTime.ofInstant(
                Instant.ofEpochMilli(ManagementFactory.getRuntimeMXBean().getStartTime()),
                ZoneId.systemDefault()).format(FMT));

        return info;
    }

    /**
     * 组装三层连接信息。
     *
     * <ol>
     *   <li><b>请求侧</b>：{@code scheme} + {@code requestHost}（Host 头，浏览器实际访问的域名:端口）
     *       + {@code requestHostIp}（服务端代做的 DNS 解析结果，即浏览器真正连过去的 IP）；</li>
     *   <li><b>转发侧</b>：{@code remoteAddress:remotePort}（与本服务握手的对端，经同机 Nginx 时为 127.0.0.1）
     *       + {@code clientIp} / {@code forwardedFor}（反代写入的真实客户端）；</li>
     *   <li><b>服务侧</b>：{@code listenAddress:listenPort}（本进程实际监听，0.0.0.0 表示监听全部网卡）。</li>
     * </ol>
     */
    private ServiceInfo.ConnectionInfo buildConnection(HttpServletRequest request, Integer port) {
        ServiceInfo.ConnectionInfo c = new ServiceInfo.ConnectionInfo();
        c.setListenAddress(resolveListenAddress());
        c.setListenPort(port);

        if (request == null) {
            c.setViaProxy(false);
            c.setSummary("本服务监听 " + c.getListenAddress() + ":" + c.getListenPort() + "（无请求上下文）");
            return c;
        }

        String forwardedFor = request.getHeader("X-Forwarded-For");
        String realIp = request.getHeader("X-Real-IP");
        String forwardedProto = request.getHeader("X-Forwarded-Proto");
        String forwardedHost = request.getHeader("X-Forwarded-Host");

        c.setScheme(StringUtils.hasText(forwardedProto) ? forwardedProto : request.getScheme());
        // X-Forwarded-Host 优先（多层反代时 Host 头可能被改写），其次原始 Host 头
        String host = StringUtils.hasText(forwardedHost) ? forwardedHost : request.getHeader("Host");
        c.setRequestHost(host);
        c.setRequestHostIp(resolveHostIp(host));
        c.setRemoteAddress(request.getRemoteAddr());
        c.setRemotePort(request.getRemotePort());
        c.setForwardedFor(forwardedFor);
        boolean hasForwardHeaders = StringUtils.hasText(forwardedFor) || StringUtils.hasText(realIp)
                || StringUtils.hasText(forwardedProto) || StringUtils.hasText(forwardedHost);
        // 直连场景（无 XFF/X-Real-IP）下，与本服务握手的对端就是客户端本身
        String clientIp = firstIp(realIp, forwardedFor);
        if (clientIp == null && !hasForwardHeaders) {
            clientIp = request.getRemoteAddr();
        }
        c.setClientIp(clientIp);
        c.setViaProxy(hasForwardHeaders);

        StringBuilder sb = new StringBuilder();
        sb.append("客户端(").append(c.getClientIp() != null ? c.getClientIp() : UNKNOWN).append(')');
        sb.append(" → ").append(c.getScheme()).append("://").append(c.getRequestHost() != null ? c.getRequestHost() : UNKNOWN);
        if (StringUtils.hasText(c.getRequestHostIp()) && !c.getRequestHostIp().equals(c.getRequestHost())) {
            sb.append('(').append(c.getRequestHostIp()).append(')');
        }
        sb.append(" → ").append(Boolean.TRUE.equals(c.getViaProxy()) ? "反代" : "直连").append('(')
          .append(c.getRemoteAddress()).append(':').append(c.getRemotePort()).append(')');
        sb.append(" → 本服务(").append(c.getListenAddress()).append(':').append(c.getListenPort()).append(')');
        c.setSummary(sb.toString());
        return c;
    }

    /** 取 X-Real-IP，其次 X-Forwarded-For 首段（多级时为最左侧原始客户端） */
    private static String firstIp(String... candidates) {
        for (String v : candidates) {
            if (!StringUtils.hasText(v)) {
                continue;
            }
            // 去掉 IPv4-mapped IPv6 前缀（如 ::ffff:127.0.0.1 -> 127.0.0.1），展示更直观
            String first = v.split(",")[0].trim().replaceFirst("^::ffff:", "");
            if (!first.isEmpty()) {
                return first;
            }
        }
        return null;
    }

    /**
     * 把 Host 头的域名解析成 IP：浏览器 JS 无法做 DNS 查询，由服务端代解析后回传。
     * 本身是 IP 时直接返回；解析失败返回 null。结果带缓存（含失败）。
     */
    private static String resolveHostIp(String host) {
        if (!StringUtils.hasText(host)) {
            return null;
        }
        String h = host.trim();
        // 去掉端口：IPv6 用中括号包裹，先处理 [::1]:8080 形式
        if (h.startsWith("[")) {
            int end = h.indexOf(']');
            if (end > 0) {
                h = h.substring(1, end);
            }
        } else {
            int colon = h.lastIndexOf(':');
            if (colon > 0) {
                h = h.substring(0, colon);
            }
        }
        if (h.isEmpty()) {
            return null;
        }
        return HOST_IP_CACHE.computeIfAbsent(h, key -> {
            try {
                InetAddress addr = InetAddress.getByName(key);
                return addr.getHostAddress();
            } catch (Exception e) {
                return "";
            }
        });
    }

    /**
     * 本服务实际监听地址：local.server.address（容器实际绑定）优先，其次 server.address；
     * 都没有时按 Tomcat 默认行为记为 0.0.0.0（监听全部网卡）。
     */
    private String resolveListenAddress() {
        String addr = environment.getProperty("local.server.address");
        if (!StringUtils.hasText(addr)) {
            addr = environment.getProperty("server.address");
        }
        return StringUtils.hasText(addr) ? addr : "0.0.0.0";
    }

    /**
     * 取服务所在主机的 IP：优先首个「已启用、非回环、非虚拟」的 IPv4 地址；
     * 取不到时兜底 InetAddress.getLocalHost()，仍失败返回"未知"。
     */
    private static String resolveHostAddress() {
        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            while (interfaces.hasMoreElements()) {
                NetworkInterface ni = interfaces.nextElement();
                if (!ni.isUp() || ni.isLoopback() || ni.isVirtual()) {
                    continue;
                }
                Enumeration<InetAddress> addrs = ni.getInetAddresses();
                while (addrs.hasMoreElements()) {
                    InetAddress addr = addrs.nextElement();
                    if (addr instanceof Inet4Address && !addr.isLoopbackAddress()) {
                        return addr.getHostAddress();
                    }
                }
            }
            return InetAddress.getLocalHost().getHostAddress();
        } catch (Exception e) {
            return UNKNOWN;
        }
    }

    /**
     * 服务监听端口：优先 local.server.port（Servlet 容器实际绑定的端口，
     * server.port=0 随机端口时也能拿到真实值），其次配置里的 server.port。
     */
    private Integer resolvePort() {
        String port = environment.getProperty("local.server.port");
        if (port == null || port.isBlank()) {
            port = environment.getProperty("server.port");
        }
        if (port == null || port.isBlank()) {
            return null;
        }
        try {
            return Integer.valueOf(port.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** 时区 UTC 偏移量，如 UTC+08:00 */
    private static String utcOffset(TimeZone tz) {
        int totalMin = tz.getOffset(System.currentTimeMillis()) / 60000;
        String sign = totalMin >= 0 ? "+" : "-";
        int abs = Math.abs(totalMin);
        return String.format("UTC%s%02d:%02d", sign, abs / 60, abs % 60);
    }

    /** 毫秒时长格式化，如 1 天 2 小时 3 分 4 秒 */
    private static String formatUptime(long totalSec) {
        long d = totalSec / 86400;
        long h = (totalSec % 86400) / 3600;
        long m = (totalSec % 3600) / 60;
        long s = totalSec % 60;
        return d + " 天 " + h + " 小时 " + m + " 分 " + s + " 秒";
    }
}
