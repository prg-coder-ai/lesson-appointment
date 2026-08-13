package com.reservation.exception;

import com.reservation.common.Result;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.validation.BindingResult;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.sql.SQLIntegrityConstraintViolationException;

/**
 * 全局异常处理，对应设计2.4 异常处理机制
 */
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

    // 服务器异常（500），对应设计2.4 服务器异常
    // 注意：该 handler 必须放在最后，否则会覆盖前面更具体的异常 handler
    @ExceptionHandler(Exception.class)
    public Result<Void> handleException(Exception e) {
        // 记录异常日志（对应设计2.3 安全设计-日志记录）
        e.printStackTrace();
        return Result.fail(500, "服务器繁忙，请稍后再试");  // 500-服务器异常（对应设计2.1）
    }
}
