package com.messagecenter.exception;

import com.messagecenter.common.Result;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.ConstraintViolationException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;
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

    // 异步响应已不可用（Spring 6.1 专为该场景引入）：SSE/长连接被浏览器刷新、切页、
    // 断网、被代理掐断后，容器向该连接写数据必然失败。这属于对端行为，不是服务端故障，
    // 且此时响应已 committed，写不回错误 JSON —— 必须静默，否则每次刷新页面都刷一条 ERROR。
    @ExceptionHandler(AsyncRequestNotUsableException.class)
    public void asyncNotUsable(AsyncRequestNotUsableException e) {
        if (log.isDebugEnabled()) {
            log.debug("异步响应已不可用（客户端已断开），已忽略：{}", e.getMessage());
        }
    }

    @ExceptionHandler(Exception.class)
    public Result<Void> other(Exception e, HttpServletResponse response) {
        // 响应已提交时不能再写 JSON：硬写会二次抛 HttpMessageNotWritableException，
        // 把一条普通日志污染成两条堆栈。SSE 的收尾阶段（text/event-stream 已 preset）
        // 正是这种情况 —— 放弃写响应体，降级为 debug 日志。
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
