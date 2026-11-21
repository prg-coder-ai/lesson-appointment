package com.classroom.exception;

/** 业务异常（由全局处理器转 Result） */
public class ClassroomBizException extends RuntimeException {
    private final int code;
    public ClassroomBizException(String message) { this(400, message); }
    public ClassroomBizException(int code, String message) { super(message); this.code = code; }
    public int getCode() { return code; }
}