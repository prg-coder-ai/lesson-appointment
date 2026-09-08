package com.reservation.exception;

/**
 * 业务异常：用户不存在
 */
public class UserNotFoundException extends RuntimeException {
    public UserNotFoundException() {
        super("用户不存在");
    }

    public UserNotFoundException(String message) {
        super(message);
    }
}