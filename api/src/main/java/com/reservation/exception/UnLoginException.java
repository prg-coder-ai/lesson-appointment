package com.reservation.exception;
 
public class UnLoginException extends RuntimeException {

    // 无参构造
    public UnLoginException() {
        super();
    }

    // 带错误消息的构造（核心使用）
    public UnLoginException(String message) {
        super(message);
    }

    // 带消息+异常原因的构造（便于排查根因）
    public UnLoginException(String message, Throwable cause) {
        super(message, cause);
    }
}