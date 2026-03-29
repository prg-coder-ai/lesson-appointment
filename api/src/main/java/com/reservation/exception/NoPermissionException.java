package com.reservation.exception;
/**
 * 业务异常类（如权限不足、操作不合法等业务逻辑错误时抛出）
 * 继承RuntimeException，无需手动捕获，由全局异常处理器处理
 */
public class NoPermissionException extends RuntimeException {

    // 无参构造
    public NoPermissionException() {
        super();
    }

    // 带错误消息的构造（核心使用）
    public NoPermissionException(String message) {
        super(message);
    }

    // 带消息+异常原因的构造（便于排查根因）
    public NoPermissionException(String message, Throwable cause) {
        super(message, cause);
    }
}    