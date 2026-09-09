package com.messagecenter.exception;

import com.messagecenter.common.Result;
import jakarta.validation.ConstraintViolationException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(MessageBizException.class)
    public Result<Void> biz(MessageBizException e) {
        return Result.fail(e.getCode(), e.getMessage());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public Result<Void> valid(MethodArgumentNotValidException e) {
        FieldError fe = e.getBindingResult().getFieldError();
        String msg = fe != null ? fe.getDefaultMessage() : "参数校验失败";
        return Result.fail(400, msg);
    }

    @ExceptionHandler({ConstraintViolationException.class, MissingServletRequestParameterException.class})
    public Result<Void> param(Exception e) {
        return Result.fail(400, "参数错误：" + e.getMessage());
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public Result<Void> unreadable(HttpMessageNotReadableException e) {
        return Result.fail(400, "请求体格式错误");
    }

    @ExceptionHandler(DuplicateKeyException.class)
    public Result<Void> dup(DuplicateKeyException e) {
        return Result.fail(400, "数据已存在(编码重复)，请更换后重试");
    }

    @ExceptionHandler(NoHandlerFoundException.class)
    public Result<Void> notFound(NoHandlerFoundException e) {
        return Result.fail(404, "接口不存在");
    }

    // 静态资源不存在（404）：典型是浏览器自动请求 /favicon.ico、/robots.txt。
    // 本服务是纯后台、无任何静态资源，这类请求属浏览器默认行为而非故障，
    // 不应打 ERROR 堆栈污染日志，也不应伪装成 500。此处静默降级为 404。
    @ExceptionHandler(NoResourceFoundException.class)
    public Result<Void> noResource(NoResourceFoundException e) {
        if (log.isDebugEnabled()) {
            log.debug("静态资源不存在（已忽略）：{}", e.getMessage());
        }
        return Result.fail(404, "资源不存在");
    }

    @ExceptionHandler(Exception.class)
    public Result<Void> other(Exception e) {
        log.error("未捕获异常", e);
        return Result.fail(500, "服务器繁忙：" + (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()));
    }
}
