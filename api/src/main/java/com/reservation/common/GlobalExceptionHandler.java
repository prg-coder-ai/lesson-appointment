package com.reservation.exception;

import com.language.reservation.common.Result;
import org.springframework.validation.BindingResult;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * 全局异常处理，对应设计2.4 异常处理机制
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    // 参数校验异常（400），对应设计2.4 参数异常
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public Result<Void> handleValidationException(MethodArgumentNotValidException e) {
        BindingResult bindingResult = e.getBindingResult();
        FieldError fieldError = bindingResult.getFieldError();
        String message = fieldError != null ? fieldError.getDefaultMessage() : "参数错误";
        return Result.fail(400, message);  // 400-参数错误（对应设计2.1）
    }

    // 未登录/Token失效（401），对应设计2.4 权限异常
    @ExceptionHandler(UnLoginException.class)
    public Result<Void> handleUnLoginException(UnLoginException e) {
        return Result.fail(401, e.getMessage());  // 401-未登录/Token失效（对应设计2.1）
    }

    // 权限不足（403），对应设计2.4 权限异常
    @ExceptionHandler(NoPermissionException.class)
    public Result<Void> handleNoPermissionException(NoPermissionException e) {
        return Result.fail(403, e.getMessage());  // 403-权限不足（对应设计2.1）
    }

    // 资源不存在（404），对应设计2.4 资源异常
    @ExceptionHandler(ResourceNotFoundException.class)
    public Result<Void> handleResourceNotFoundException(ResourceNotFoundException e) {
        return Result.fail(404, e.getMessage());  // 404-资源不存在（对应设计2.1）
    }

    // 业务异常（400），对应设计2.4 业务异常
    @ExceptionHandler(BusinessException.class)
    public Result<Void> handleBusinessException(BusinessException e) {
        return Result.fail(400, e.getMessage());  // 400-业务异常（对应设计2.1）
    }

    // 服务器异常（500），对应设计2.4 服务器异常
    @ExceptionHandler(Exception.class)
    public Result<Void> handleException(Exception e) {
        // 记录异常日志（对应设计2.3 安全设计-日志记录）
        e.printStackTrace();
        return Result.fail(500, "服务器繁忙，请稍后再试");  // 500-服务器异常（对应设计2.1）
    }
}