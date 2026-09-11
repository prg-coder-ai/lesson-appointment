package com.reservation.exception;

import com.reservation.common.Result;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.ExpiredJwtException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.validation.BindingResult;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.sql.SQLIntegrityConstraintViolationException;

/**
 * 全局异常处理，对应设计2.4 异常处理机制
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    // 递归获取异常根因（MySQL驱动的唯一键冲突常被Spring/MyBatis包了好几层）
    private Throwable getRootCause(Throwable t) {
        Throwable cause = t;
        while (cause != null && cause.getCause() != null && cause.getCause() != cause) {
            cause = cause.getCause();
        }
        return cause;
    }

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

    // JWT Token 解析异常（401）：过期、签名错误、格式非法等
    @ExceptionHandler({JwtException.class, ExpiredJwtException.class})
    public Result<Void> handleJwtException(Exception e) {
        String msg = "Token已失效，请重新登录";
        if (e instanceof ExpiredJwtException) {
            msg = "Token已过期，请重新登录";
        } else if (e.getMessage() != null && !e.getMessage().isEmpty()) {
            msg = "Token解析失败，请重新登录";
        }
        return Result.fail(401, msg);
    }

    // 权限不足（403），对应设计2.4 权限异常
    @ExceptionHandler(NoPermissionException.class)
    public Result<Void> handleNoPermissionException(NoPermissionException e) {
        return Result.fail(403, e.getMessage());  // 403-权限不足（对应设计2.1）
    }

    // 业务异常（400），对应设计2.4 业务异常
    @ExceptionHandler(BusinessException.class)
    public Result<Void> handleBusinessException(BusinessException e) {
        return Result.fail(400, e.getMessage());  // 400-业务异常（对应设计2.1）
    }

    // 数据库唯一键冲突（400）：对应 Duplicate entry 'xxx' for key 'yyy'
    // 典型场景：注册时 account / phone / email 重复，userMapper.insert 抛此异常
    @ExceptionHandler({
        DuplicateKeyException.class,
        SQLIntegrityConstraintViolationException.class
    })
    public Result<Void> handleDuplicateKeyException(Exception e) {
        Throwable root = getRootCause(e);
        String msg = root != null ? root.getMessage() : (e.getMessage() != null ? e.getMessage() : "");
        String lower = msg.toLowerCase();

        if (lower.contains("uk_account")) {
            return Result.fail(400, "该账号已注册，请更换账号或直接登录");
        }
        if (lower.contains("uk_phone") || lower.contains("for key 'uk_phone'") || msg.contains("phone")) {
            return Result.fail(400, "该手机号已注册，请更换手机号或直接登录");
        }
        if (lower.contains("uk_email") || lower.contains("for key 'uk_email'") || msg.contains("email")) {
            return Result.fail(400, "该邮箱已注册，请更换邮箱或直接登录");
        }
        // 兜底：如果有重复入口字样，或者通用唯一键冲突
        if (lower.contains("duplicate entry")) {
            return Result.fail(400, "数据已存在，请更换后重试");
        }
        return Result.fail(400, "数据库完整性约束冲突：" + msg);
    }

    // 静态资源不存在（404）。典型场景：浏览器打开任意页面都会自动请求 /favicon.ico、/robots.txt。
    // api 已改造为纯后台、static 资源整体删除，这类请求属于浏览器默认行为而非系统故障：
    // 不应打 ERROR 堆栈污染日志，也不应伪装成 500「服务器繁忙」。此处静默降级为 404。
    // 注：/favicon.ico 已由 DefaultPageController 直接返回 204，这里只是兜底（如 /robots.txt、旧静态页残留路径）。
    @ExceptionHandler(NoResourceFoundException.class)
    public Result<Void> handleNoResourceFound(NoResourceFoundException e) {
        if (log.isDebugEnabled()) {
            log.debug("静态资源不存在（已忽略）：{}", e.getMessage());
        }
        return Result.fail(404, "资源不存在");
    }

    // 缺少必填请求参数（400）。
    // 典型场景：公开分享链接被截断或手工改写（少了 ?teacherId=xxx）。前端页面会先自行校验，
    // 但从微信/QQ 抓取链接、或第三方直接调接口时不该看到 500「服务器繁忙，请稍后再试」——
    // 那会让用户以为是系统坏了，而实际上只是链接不完整。
    @ExceptionHandler(MissingServletRequestParameterException.class)
    public Result<Void> handleMissingParameter(MissingServletRequestParameterException e) {
        if (log.isDebugEnabled()) {
            log.debug("缺少必填参数：{}", e.getParameterName());
        }
        return Result.fail(400, "缺少必填参数：" + e.getParameterName());
    }

    // 服务器异常（500），对应设计2.4 服务器异常
    // 注意：该 handler 必须放在最后，否则会覆盖前面更具体的异常 handler
    @ExceptionHandler(Exception.class)
    public Result<Void> handleException(Exception e) {
        // 记录异常日志（对应设计2.3 安全设计-日志记录）
        log.error("未处理异常", e);
        return Result.fail(500, "服务器繁忙，请稍后再试");  // 500-服务器异常（对应设计2.1）
    }
}
