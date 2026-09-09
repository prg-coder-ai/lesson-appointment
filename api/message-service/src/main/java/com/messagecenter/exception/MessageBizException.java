package com.messagecenter.exception;

/** 业务异常（由全局处理器转 Result） */
public class MessageBizException extends RuntimeException {
    private final int code;
    public MessageBizException(String message) { this(400, message); }
    public MessageBizException(int code, String message) { super(message); this.code = code; }
    public int getCode() { return code; }
}
