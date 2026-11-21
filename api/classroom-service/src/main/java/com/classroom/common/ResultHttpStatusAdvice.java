package com.classroom.common;

import org.springframework.core.MethodParameter;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;

/**
 * 按 Result.code 映射 HTTP 状态的统一响应出口。
 * 与 message-service 同一份规则：只映射 400/404/409/500；401/403/1001 保持 HTTP 200。
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
                break;
        }
        return body;
    }
}