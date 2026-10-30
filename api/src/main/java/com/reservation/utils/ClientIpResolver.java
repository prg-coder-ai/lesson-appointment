package com.reservation.utils;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.util.List;
import java.util.function.Predicate;

/**
 * 客户端真实 IP 解析（全仓唯一入口，2026-10-22 P0）。
 *
 * <p><b>为什么需要它</b>：改造前仓里有**两套互相矛盾的实现**——
 * {@code PromoController#clientIp} / {@code LegalDocController} / {@code AuditAspect} /
 * {@code WeChatPcController} 各自手写一遍 {@code X-Forwarded-For → X-Real-IP → remoteAddr}，
 * 而 {@code UserService#currentRequestIp} 只读 {@code getRemoteAddr()}。
 * 两者在反向代理下的结果可以完全不同（一个记真实 IP，一个记 127.0.0.1），
 * 于是"同一个用户的 IP"在不同表里对不上，任何按 IP 的风控都建立在沙上。
 *
 * <p><b>更严重的是取法错了</b>：那四处都是取 {@code X-Forwarded-For} 的**首段**。
 * XFF 是"客户端 → 各级代理"依次**追加**的，首段恰好是**客户端自己写的那一段**：
 * <pre>
 *   curl -H "X-Forwarded-For: 1.2.3.4" https://your.domain/api/v1/auth/login
 * </pre>
 * 服务端取首段就得到 {@code 1.2.3.4}，攻击者每个请求换一个假头，IP 维度的限流 100% 失效，
 * 而日志看上去"IP 分布很健康"。
 *
 * <p><b>本类的取法</b>：
 * <ol>
 *   <li>请求不是来自可信代理（直连）→ <b>完全不看 XFF</b>，返回 {@code remoteAddr}。
 *       客户端自己说了不算。</li>
 *   <li>来自可信代理 → 从 XFF <b>最右侧往左</b>找第一个"非可信"地址并返回。
 *       最右侧才是代理亲手写入的那一跳，左侧全是可能被伪造的历史。</li>
 *   <li>整条链都可信 → 返回 {@code remoteAddr}。</li>
 * </ol>
 *
 * <p>注意：{@code server.forward-headers-strategy=framework} 已在 application.properties 开启，
 * 容器/框架层也可能改写 {@code getRemoteAddr()}。两者并不冲突：本类只负责"在拿到 remoteAddr 之后
 * 怎么读 XFF"，而该配置负责"让 scheme/host/port 也感知代理"。配置开启后若 {@code remoteAddr}
 * 已被框架改写为真实客户端 IP，则它通常**不再属于可信段**，于是直接返回它——结果依然正确。
 */
public final class ClientIpResolver {

    /** 默认可信代理：本机回环。生产部署 nginx 与本服务同机时，remoteAddr 就是 127.0.0.1。 */
    private static final List<String> DEFAULT_TRUSTED = List.of(
            "127.0.0.1", "0:0:0:0:0:0:0:1", "::1");

    private ClientIpResolver() {
    }

    /** 从当前请求上下文取 IP；无上下文（定时任务 / 异步线程）返回 null。 */
    public static String resolveCurrent() {
        try {
            RequestAttributes attrs = RequestContextHolder.getRequestAttributes();
            if (!(attrs instanceof ServletRequestAttributes sra)) {
                return null;
            }
            return resolve(sra.getRequest());
        } catch (Exception e) {
            return null;
        }
    }

    /** 从请求取真实 IP，使用默认可信代理列表。 */
    public static String resolve(HttpServletRequest request) {
        if (request == null) {
            return null;
        }
        return resolve(request.getRemoteAddr(),
                request.getHeader("X-Forwarded-For"),
                request.getHeader("X-Real-IP"),
                ClientIpResolver::isDefaultTrusted);
    }

    /** 从请求取真实 IP，可注入可信代理判定（多级代理 / 云 LB 场景）。 */
    public static String resolve(HttpServletRequest request, Predicate<String> trustedProxy) {
        if (request == null) {
            return null;
        }
        return resolve(request.getRemoteAddr(),
                request.getHeader("X-Forwarded-For"),
                request.getHeader("X-Real-IP"),
                trustedProxy);
    }

    /**
     * 纯函数版本（无 Servlet 依赖，便于单测与离线推演）。
     *
     * @param remoteAddr  {@code request.getRemoteAddr()}，连接对端地址
     * @param xffHeader   {@code X-Forwarded-For} 原始值，可含多跳、逗号分隔
     * @param realIpHeader {@code X-Real-IP}（部分代理只写这个）
     * @param trusted     判定某地址是否为可信代理
     * @return 真实客户端 IP；无法判定时回落 {@code remoteAddr}
     */
    public static String resolve(String remoteAddr, String xffHeader, String realIpHeader,
                                 Predicate<String> trusted) {
        String remote = normalize(remoteAddr);
        if (trusted == null) {
            trusted = ClientIpResolver::isDefaultTrusted;
        }
        // ① 直连：XFF 由客户端自填，不可信
        if (remote == null || !trusted.test(remote)) {
            return remote;
        }
        // ② 可信代理：从右往左取第一个不可信地址
        if (xffHeader != null && !xffHeader.isBlank()) {
            String[] hops = xffHeader.split(",");
            for (int i = hops.length - 1; i >= 0; i--) {
                String ip = normalize(hops[i]);
                if (ip == null || ip.isEmpty()) {
                    continue;
                }
                if (!trusted.test(ip)) {
                    return ip;
                }
            }
        }
        // ③ XFF 全为空或全可信时，退到 X-Real-IP（仅一个值，由代理覆盖写入，不会再追加）
        String realIp = normalize(realIpHeader);
        if (realIp != null && !realIp.isEmpty() && !trusted.test(realIp)) {
            return realIp;
        }
        return remote;
    }

    /** 默认可信代理判定：回环 + 私有网段（10/8、172.16/12、192.168/16、fc00::/7）。 */
    public static boolean isDefaultTrusted(String ip) {
        if (ip == null || ip.isEmpty()) {
            return false;
        }
        return DEFAULT_TRUSTED.contains(ip)
                || ip.startsWith("10.")
                || ip.startsWith("192.168.")
                || is172Private(ip)
                || ip.startsWith("fc")
                || ip.startsWith("fd");
    }

    private static boolean is172Private(String ip) {
        if (!ip.startsWith("172.")) {
            return false;
        }
        int dot = ip.indexOf('.', 4);
        if (dot < 0) {
            return false;
        }
        try {
            int second = Integer.parseInt(ip.substring(4, dot));
            return second >= 16 && second <= 31;
        } catch (NumberFormatException e) {
            return false;
        }
    }

    /**
     * 归一化：去空白、去端口、统一小写，并把 IPv4-mapped IPv6（::ffff:1.2.3.4）还原成 IPv4。
     *
     * <p>去端口是必须的：Tomcat 的 {@code getRemoteAddr()} 不带端口，但某些代理会把
     * {@code 1.2.3.4:5678} 写进 XFF，不剥掉就会让"同一个 IP"变成无数个不同键，限流直接失效。
     */
    static String normalize(String raw) {
        if (raw == null) {
            return null;
        }
        String s = raw.trim();
        if (s.isEmpty()) {
            return null;
        }
        // [::1]:1234 或 [::1]
        if (s.startsWith("[")) {
            int close = s.indexOf(']');
            s = close > 0 ? s.substring(1, close) : s.substring(1);
        } else {
            // 1.2.3.4:5678 —— 仅当只有一个冒号时才当 IPv4:port（IPv6 本身含多个冒号）
            int firstColon = s.indexOf(':');
            if (firstColon > 0 && firstColon == s.lastIndexOf(':')) {
                s = s.substring(0, firstColon);
            }
        }
        s = s.toLowerCase();
        if (s.startsWith("::ffff:")) {
            s = s.substring(7);
        }
        return s;
    }
}
