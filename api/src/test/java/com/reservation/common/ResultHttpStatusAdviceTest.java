package com.reservation.common;

import org.junit.jupiter.api.Test;
import org.springframework.http.server.ServletServerHttpResponse;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;

/**
 * 29-b 方案 A（2026-10-10 用户拍板）：Result.code → HTTP 状态映射出口的单测。
 *
 * 契约口径（勿改，守卫⑤与小程序 request.js 依赖此口径）：
 *   - 400/404/409/500 → 同值 HTTP 状态；
 *   - 401/403 保持 HTTP 200（业务层 401/403 并非鉴权问题，映射会触发两端刷新/踢登录）；
 *   - 200/1001 保持 HTTP 200；
 *   - 非 Result body 原样放行（message-service 兜底会返回 null，SSE 不经过本出口）。
 */
class ResultHttpStatusAdviceTest {

    private final ResultHttpStatusAdvice advice = new ResultHttpStatusAdvice();

    private int statusOf(Result<?> body) {
        MockHttpServletResponse raw = new MockHttpServletResponse();
        advice.beforeBodyWrite(body, null, null, null, null, new ServletServerHttpResponse(raw));
        return raw.getStatus();
    }

    @Test
    void mappedCodesProduceRealHttpStatus() {
        assertEquals(400, statusOf(Result.fail(400, "x")));
        assertEquals(404, statusOf(Result.fail(404, "x")));
        assertEquals(409, statusOf(Result.fail(409, "x")));
        assertEquals(500, statusOf(Result.fail(500, "x")));
    }

    @Test
    void business401And403StayHttp200() {
        assertEquals(200, statusOf(Result.fail(401, "未登录")),
                "业务 401 映射成 HTTP 401 会触发前端刷新重试/小程序踢登录（方案 A 禁止）");
        assertEquals(200, statusOf(Result.fail(403, "权限不足")),
                "业务 403 映射成 HTTP 403 会触发前端鉴权失败分支（方案 A 禁止）");
    }

    @Test
    void successAndWechatCodeStayHttp200() {
        assertEquals(200, statusOf(Result.success()));
        assertEquals(200, statusOf(Result.fail(1001, "微信登录专用业务码")));
    }

    @Test
    void nonResultBodyPassesThrough() {
        MockHttpServletResponse raw = new MockHttpServletResponse();
        Object rawBody = new Object();
        assertSame(rawBody, advice.beforeBodyWrite(rawBody, null, null, null, null, new ServletServerHttpResponse(raw)));
        assertEquals(200, raw.getStatus());
        // message-service 兜底在"响应已提交"时返回 null，不得 NPE
        assertNull(advice.beforeBodyWrite(null, null, null, null, null, new ServletServerHttpResponse(raw)));
    }
}
