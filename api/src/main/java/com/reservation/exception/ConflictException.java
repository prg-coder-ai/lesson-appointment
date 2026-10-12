package com.reservation.exception;

/**
 * 状态冲突异常（409）。
 *
 * <p>用于「请求与资源当前状态矛盾」的场景，与 {@link BusinessException}（400 参数/规则错误）区分：
 * 典型如「课程已开始，无法取消预订」「课次进行中，无法请假」——
 * 请求本身合法，但资源的时间态已经不允许该操作。
 *
 * <p>映射口径与 {@code GlobalExceptionHandler} / {@code common.ErrorCodes} 保持一致：
 * Conflict → 409（29-b 方案 A 下业务 409 保持 HTTP 200，仅 body.code=409，
 * 由 {@code ResultHttpStatusAdvice} 映射 HTTP 状态）。
 */
public class ConflictException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public ConflictException() {
        super();
    }

    public ConflictException(String message) {
        super(message);
    }

    public ConflictException(String message, Throwable cause) {
        super(message, cause);
    }
}
