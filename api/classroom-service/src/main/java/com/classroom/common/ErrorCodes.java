package com.classroom.common;

/**
 * 错误码规范（对应需求 8.5）。
 * 命名规则：HTTP语义码 + 业务序号（5位），便于前端按区间分流处理。
 */
public final class ErrorCodes {
    private ErrorCodes() {}

    public static final int CLASSROOM_NOT_FOUND = 40401;
    public static final int CLASSROOM_STATUS_CONFLICT = 40901;
    public static final int CLASSROOM_NOT_READY = 40902;
    public static final int CLASSROOM_ALREADY_CLOSED = 40903;
    public static final int MEMBER_NOT_IN_CLASSROOM = 40402;
    public static final int MEMBER_KICKED = 40301;
    public static final int NOT_TEACHER = 40302;
    public static final int ATTENDANCE_ALREADY_SIGNED = 40904;
    public static final int MATERIAL_NOT_FOUND = 40403;
    public static final int SUBMISSION_NOT_FOUND = 40404;
    public static final int RECORDING_NOT_READY = 40905;
    public static final int EVENT_DUPLICATE = 40906;
    public static final int EVENT_STALE_VERSION = 40907;
    public static final int CALLBACK_FAILED = 50001;
    public static final int OSS_UPLOAD_FAILED = 50002;
    public static final int REDIS_UNAVAILABLE = 50003;
    /** 用户维度限流命中（包4B）：前端据此提示「操作太频繁」，不要当成鉴权失败 */
    public static final int RATE_LIMITED = 42901;
}