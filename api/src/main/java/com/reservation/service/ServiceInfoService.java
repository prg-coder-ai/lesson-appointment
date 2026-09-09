package com.reservation.service;

import com.reservation.common.ServiceInfo;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.info.BuildProperties;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;

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
import java.util.TimeZone;

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
    public static final String SERVICE_ID = "booking_api";

    /** build-info 缺失时的兜底程序名 */
    public static final String FALLBACK_APP_NAME = "booking_api";

    /** 服务说明 */
    public static final String DESCRIPTION = "预约系统后台 API 服务 · 纯后台程序（无管理页面）";

    private static final String UNKNOWN = "未知";
    private static final String STATUS_UP = "UP";
    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final BuildProperties buildProperties;
    private final Environment environment;

    /**
     * 用 ObjectProvider 注入：未生成 build-info（如 IDE 直接启动）时为 null，避免启动失败。
     */
    public ServiceInfoService(ObjectProvider<BuildProperties> buildPropertiesProvider, Environment environment) {
        this.buildProperties = buildPropertiesProvider.getIfAvailable();
        this.environment = environment;
    }

    /** 组装当前服务运行信息（每次调用实时取值） */
    public ServiceInfo current() {
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
