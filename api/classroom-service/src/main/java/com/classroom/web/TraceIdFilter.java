package com.classroom.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * 把 traceId 绑到每个 HTTP 请求上：入站沿用（有则复用）、出站回写响应头。
 *
 * <p><b>为什么排在最前面</b>：traceId 必须比鉴权、限流、业务逻辑都早建立，
 * 否则「401 未登录」「403 不属于本课堂」「429 限流」这些最需要排查的拒绝日志
 * 全都没有 traceId，恰恰是这类问题最难靠时间戳对齐。这里用
 * {@link Ordered#HIGHEST_PRECEDENCE} 确保早于一切业务过滤器。
 *
 * <p><b>为什么响应头要回写</b>：前端报障时能直接抄下这个 id，
 * 后端据此一条 grep 定位整条链路，不必再让用户描述"大概几点、点了哪个按钮"。
 * 回写的是**规范化后**的值，不是原始入参——避免把攻击载荷原样回显。
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class TraceIdFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String traceId = TraceContext.normalize(request.getHeader(TraceContext.HEADER));
        MDC.put(TraceContext.MDC_KEY, traceId);
        // 响应头要在业务代码可能 commit 之前设置，否则会被忽略
        response.setHeader(TraceContext.HEADER, traceId);
        try {
            chain.doFilter(request, response);
        } finally {
            // 必须清理：Tomcat 线程是复用的，残留会把下一个请求的日志错绑到本次链路
            MDC.remove(TraceContext.MDC_KEY);
        }
    }

    @Override
    protected boolean shouldNotFilterAsyncDispatch() {
        // 异步 dispatch 时也带上 traceId（SSE / DeferredResult 场景）
        return false;
    }
}
