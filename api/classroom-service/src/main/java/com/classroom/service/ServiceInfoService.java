package com.classroom.service;

import com.classroom.common.ServiceInfo;
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
 * 服务运行信息提供者（与 message-service 同模式）。
 */
@Service
public class ServiceInfoService {

    public static final String SERVICE_ID = "classroom-service";
    public static final String FALLBACK_APP_NAME = "classroom-service";
    public static final String DESCRIPTION = "在线教学微服务 · 课堂接入/签到/教学环节/录制/对账";

    private static final String UNKNOWN = "未知";
    private static final String STATUS_UP = "UP";
    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final Map<String, String> HOST_IP_CACHE = new ConcurrentHashMap<>();

    private final BuildProperties buildProperties;
    private final Environment environment;

    public ServiceInfoService(ObjectProvider<BuildProperties> buildPropertiesProvider, Environment environment) {
        this.buildProperties = buildPropertiesProvider.getIfAvailable();
        this.environment = environment;
    }

    public ServiceInfo current() { return current(null); }

    public ServiceInfo current(HttpServletRequest request) {
        ServiceInfo info = new ServiceInfo();
        info.setService(SERVICE_ID);
        info.setStatus(STATUS_UP);
        info.setDescription(DESCRIPTION);

        String appName = FALLBACK_APP_NAME;
        String version = UNKNOWN;
        String buildTime = UNKNOWN;

        if (buildProperties != null) {
            String artifact = buildProperties.getArtifact();
            if (artifact != null && !artifact.isBlank()) appName = artifact;
            else if (buildProperties.getName() != null && !buildProperties.getName().isBlank()) appName = buildProperties.getName();
            if (buildProperties.getVersion() != null) version = buildProperties.getVersion();
            if (buildProperties.getTime() != null)
                buildTime = LocalDateTime.ofInstant(buildProperties.getTime(), ZoneId.systemDefault()).format(FMT);
        }
        info.setAppName(appName);
        info.setVersion(version);
        info.setBuildTime(buildTime);
        info.setServerTime(LocalDateTime.now().format(FMT));
        info.setHostAddress(resolveHostAddress());
        info.setPort(resolvePort());
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
        String host = StringUtils.hasText(forwardedHost) ? forwardedHost : request.getHeader("Host");
        c.setRequestHost(host);
        c.setRequestHostIp(resolveHostIp(host));
        c.setRemoteAddress(request.getRemoteAddr());
        c.setRemotePort(request.getRemotePort());
        c.setForwardedFor(forwardedFor);
        boolean hasForward = StringUtils.hasText(forwardedFor) || StringUtils.hasText(realIp)
                || StringUtils.hasText(forwardedProto) || StringUtils.hasText(forwardedHost);
        String clientIp = firstIp(realIp, forwardedFor);
        if (clientIp == null && !hasForward) clientIp = request.getRemoteAddr();
        c.setClientIp(clientIp);
        c.setViaProxy(hasForward);
        return c;
    }

    private static String firstIp(String... candidates) {
        for (String v : candidates) {
            if (!StringUtils.hasText(v)) continue;
            String first = v.split(",")[0].trim().replaceFirst("^::ffff:", "");
            if (!first.isEmpty()) return first;
        }
        return null;
    }

    private static String resolveHostIp(String host) {
        if (!StringUtils.hasText(host)) return null;
        String h = host.trim();
        if (h.startsWith("[")) { int end = h.indexOf(']'); if (end > 0) h = h.substring(1, end); }
        else { int colon = h.lastIndexOf(':'); if (colon > 0) h = h.substring(0, colon); }
        if (h.isEmpty()) return null;
        return HOST_IP_CACHE.computeIfAbsent(h, key -> {
            try { return InetAddress.getByName(key).getHostAddress(); } catch (Exception e) { return ""; }
        });
    }

    private String resolveListenAddress() {
        String addr = environment.getProperty("local.server.address");
        if (!StringUtils.hasText(addr)) addr = environment.getProperty("server.address");
        return StringUtils.hasText(addr) ? addr : "0.0.0.0";
    }

    private static String resolveHostAddress() {
        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            while (interfaces.hasMoreElements()) {
                NetworkInterface ni = interfaces.nextElement();
                if (!ni.isUp() || ni.isLoopback() || ni.isVirtual()) continue;
                Enumeration<InetAddress> addrs = ni.getInetAddresses();
                while (addrs.hasMoreElements()) {
                    InetAddress addr = addrs.nextElement();
                    if (addr instanceof Inet4Address && !addr.isLoopbackAddress()) return addr.getHostAddress();
                }
            }
            return InetAddress.getLocalHost().getHostAddress();
        } catch (Exception e) { return UNKNOWN; }
    }

    private Integer resolvePort() {
        String port = environment.getProperty("local.server.port");
        if (port == null || port.isBlank()) port = environment.getProperty("server.port");
        if (port == null || port.isBlank()) return null;
        try { return Integer.valueOf(port.trim()); } catch (NumberFormatException e) { return null; }
    }

    private static String utcOffset(TimeZone tz) {
        int totalMin = tz.getOffset(System.currentTimeMillis()) / 60000;
        String sign = totalMin >= 0 ? "+" : "-";
        int abs = Math.abs(totalMin);
        return String.format("UTC%s%02d:%02d", sign, abs / 60, abs % 60);
    }

    private static String formatUptime(long totalSec) {
        long d = totalSec / 86400;
        long h = (totalSec % 86400) / 3600;
        long m = (totalSec % 3600) / 60;
        long s = totalSec % 60;
        return d + " 天 " + h + " 小时 " + m + " 分 " + s + " 秒";
    }
}