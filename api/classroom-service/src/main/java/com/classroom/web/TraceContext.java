package com.classroom.web;

import org.slf4j.MDC;

import java.util.UUID;
import java.util.regex.Pattern;

/**
 * 链路追踪上下文：把 traceId 放进 MDC，日志 pattern 里 {@code %X{traceId}} 即可带出来。
 *
 * <p><b>为什么需要它</b>：此前一次课堂故障排查要在几万行日志里用时间戳手工对齐
 * 「进课堂 REST → WS 握手 → 发信令 → 回调预约侧 → 异步重试」这条跨线程跨服务的链路，
 * 而这几段分别落在不同线程（http-nio / ws / callback- / cb-retry-），日志之间没有任何
 * 关联字段。加了 traceId 后同一次请求的所有三段日志可以一条 grep 拉全。
 *
 * <p><b>为什么入站 traceId 要校验格式</b>：直接回显外部传入的头是典型的日志注入面。
 * 攻击者塞 {@code "abc\n2026-01-01 INFO 登录成功 user=admin"} 就能在日志里伪造任意行，
 * 事后审计与告警都会被污染。因此只接受 {@code [A-Za-z0-9._-]{8,64}}，其余一律重新生成。
 */
public final class TraceContext {

    /** MDC 键名，与 logback pattern 里的 %X{traceId} 必须逐字一致 */
    public static final String MDC_KEY = "traceId";

    /** 跨服务透传的头名（预约侧同名字段可直接串联） */
    public static final String HEADER = "X-Trace-Id";

    /**
     * 允许的入站格式。
     *
     * <p>上限 64 是因为多数网关（Nginx/APM）的 traceId 上限为 64；下限 8 是随手能猜到的
     * 短串没有区分度，且短串更容易撞车，撞车就会把两条无关链路粘在一起。
     */
    private static final Pattern LEGAL = Pattern.compile("^[A-Za-z0-9._-]{8,64}$");

    private TraceContext() {
    }

    /** 生成新 traceId（无外部调用方时用） */
    public static String newTraceId() {
        return UUID.randomUUID().toString().replace("-", "");
    }

    /**
     * 规范化入站 traceId：合法则沿用（保留上游链路），否则生成新的。
     *
     * @param inbound 请求头 / 查询参数里带的值，可为 null
     */
    public static String normalize(String inbound) {
        if (inbound == null) {
            return newTraceId();
        }
        String v = inbound.trim();
        return LEGAL.matcher(v).matches() ? v : newTraceId();
    }

    /** 当前线程的 traceId，没有则返回 null（不要顺手在这里 new，否则日志里会出现"假 trace"） */
    public static String current() {
        return MDC.get(MDC_KEY);
    }

    /** 当前线程 traceId，缺失时兜底为 {@code "-"}，专供外部调用头使用（不能发空值给对方） */
    public static String currentOrNew() {
        String v = MDC.get(MDC_KEY);
        return v == null ? newTraceId() : v;
    }

    /**
     * 在指定 traceId 下执行一段逻辑，结束后恢复原值。
     *
     * <p>用于跨线程场景：异步线程池、WebSocket 消息回调、调度任务。必须用 try/finally，
     * 否则线程被复用时会带着上一个请求的 traceId 继续写日志（比没有 traceId 更糟——
     * 它会把两个请求的日志错绑在一起，误导排查方向）。
     */
    public static void runWith(String traceId, Runnable body) {
        String prev = MDC.get(MDC_KEY);
        try {
            if (traceId != null) {
                MDC.put(MDC_KEY, traceId);
            }
            body.run();
        } finally {
            if (prev == null) {
                MDC.remove(MDC_KEY);
            } else {
                MDC.put(MDC_KEY, prev);
            }
        }
    }
}
