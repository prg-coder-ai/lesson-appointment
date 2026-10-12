package com.messagecenter.common;

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
 * 与 com.reservation.common.ResultHttpStatusAdvice 同一份规则，两个后端服务口径一致。
 *
 *   - 只映射 400 / 404 / 409 / 500 四个码；
 *   - 401 / 403 保持 HTTP 200：本服务 MessageBizException(403,"仅管理员可操作消息分类")
 *     这类业务码并非鉴权问题，映射成 HTTP 403 会触发两端拦截器的"鉴权失败"分支；
 *   - 200 / 1001 同样保持 HTTP 200。
 *
 * SSE 相关说明：SseEmitter 返回值不经过 ResponseBodyAdvice；GlobalExceptionHandler
 * 在"响应已提交"时返回 null，本出口对非 Result 一律原样放行。
 *
 * 守卫：tools/check-result-contract-guard.mjs 第⑤条强制校验本文件的映射表。
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
        // GlobalExceptionHandler 兜底在响应已提交时返回 null，防御式判断
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
