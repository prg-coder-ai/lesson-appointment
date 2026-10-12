package com.reservation.common;

import org.springframework.core.MethodParameter;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;

/**
 * 29-b（方案 A，2026-10-10 用户拍板）：按 Result.code 映射 HTTP 状态的统一响应出口。
 *
 * 映射规则（方案 A，勿"补全"）：
 *   - 只映射 400 / 404 / 409 / 500 四个码；
 *   - 401 / 403 保持 HTTP 200：业务层 code=401/403 大量存在且并非鉴权问题
 *     （如 MessageBizException(403,"仅管理员可操作消息分类")），两端拦截器把
 *     HTTP 401 当 token 过期自动刷新重试、把 HTTP 403 当鉴权失败；全量映射会
 *     复现"刚登录成功却被弹回登录页"的历史 bug（见 miniprogram/core/request.js 注释）。
 *   - 200 / 1001 同样保持 HTTP 200：200 是成功；1001 是微信登录专用业务码。
 *
 * 真正的鉴权 401/403 由 SecurityConfig / JwtAuthenticationFilter 在过滤器层直接写出，
 * 不经过本出口，行为不变。
 *
 * 生效范围：所有返回 Result 的 @RestController 方法与 @ExceptionHandler 返回值
 * （两者都走 RequestResponseBodyMethodProcessor，均会经过 ResponseBodyAdvice）。
 * 返回 ResponseEntity / SseEmitter 的方法不经过本类，不受影响。
 *
 * 守卫：tools/check-result-contract-guard.mjs 第⑤条强制校验本文件的映射表——
 * 四个 case 缺一即红，出现 case 401 / case 403 也红。
 */
@RestControllerAdvice
public class ResultHttpStatusAdvice implements ResponseBodyAdvice<Object> {

    @Override
    public boolean supports(MethodParameter returnType, Class<? extends HttpMessageConverter<?>> converterType) {
        return Result.class.isAssignableFrom(returnType.getParameterType());
    }

    @Override
    public Object beforeBodyWrite(Object body, MethodParameter returnType, MediaType selectedContentType,
            Class<? extends HttpMessageConverter<?>> selectedConverterType,
            ServerHttpRequest request, ServerHttpResponse response) {
        // message-service 的兜底 handler 在"响应已提交"时会返回 null；防御式判断
        if (!(body instanceof Result)) {
            return body;
        }
        int code = ((Result<?>) body).getCode();
        switch (code) {
            case 400:
            case 404:
            case 409:
            case 500:
                response.setStatusCode(HttpStatus.valueOf(code));
                break;
            default:
                // 200 / 401 / 403 / 1001 保持 HTTP 200（方案 A 的刻意保留）
                break;
        }
        return body;
    }
}
