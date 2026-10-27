package com.classroom.exception;

import com.classroom.common.Result;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.ConstraintViolationException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ClassroomBizException.class)
    public Result<Void> biz(ClassroomBizException e) {
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
        return Result.fail(400, "数据已存在(重复)，请更换后重试");
    }

    @ExceptionHandler(NoHandlerFoundException.class)
    public Result<Void> notFound(NoHandlerFoundException e) {
        return Result.fail(404, "接口不存在");
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public Result<Void> noResource(NoResourceFoundException e) {
        if (log.isDebugEnabled()) {
            log.debug("静态资源不存在（已忽略）：{}", e.getMessage());
        }
        return Result.fail(404, "资源不存在");
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public Result<Void> methodNotSupported(HttpRequestMethodNotSupportedException e) {
        String supported = e.getSupportedMethods() != null ? String.join(", ", e.getSupportedMethods()) : "无";
        String msg = "HTTP 方法 " + e.getMethod() + " 不支持，支持：" + supported;
        log.warn("请求方法不支持：{}", msg);
        return Result.fail(405, msg);
    }

    @ExceptionHandler(Exception.class)
    public Result<Void> other(Exception e, HttpServletResponse response) {
        if (response.isCommitted()) {
            if (log.isDebugEnabled()) {
                log.debug("响应已提交，跳过错误响应体：{}", e.toString());
            }
            return null;
        }
        log.error("未捕获异常", e);
        return Result.fail(500, "服务器繁忙：" + (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()));
    }
}