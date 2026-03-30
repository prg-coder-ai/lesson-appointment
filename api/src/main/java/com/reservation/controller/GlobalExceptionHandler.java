package com.reservation.controller;

import com.reservation.exception.UserNotFoundException;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.HashMap;
import java.util.Map;

/**
 * 全局异常处理器：统一处理业务异常
 */
@RestControllerAdvice // 全局捕获所有@RestController/Controller的异常
public class GlobalExceptionHandler {

    /**
     * 捕获用户不存在异常
     */
    @ExceptionHandler(UserNotFoundException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST) // 返回400状态码
    public Map<String, Object> handleUserNotFound(UserNotFoundException e) {
        Map<String, Object> result = new HashMap<>();
        result.put("code", 400);
        result.put("message", e.getMessage());
        result.put("data", null);
        return result;
    }

    /**
     * 兜底捕获其他异常（避免NPE等未捕获异常）
     */
    @ExceptionHandler(Exception.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public Map<String, Object> handleOtherException(Exception e) {
        Map<String, Object> result = new HashMap<>();
        result.put("code", 500);
        result.put("message", "服务器内部错误");
        result.put("data", null);
        // 开发环境可打印堆栈，生产环境关闭
        e.printStackTrace();
        return result;
    }
}