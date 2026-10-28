package com.classroom.common;

import lombok.Data;

/** 统一返回结果封装（与主系统 Result 兼容：code/message/data） */
@Data
public class Result<T> {
    private int code;
    private String message;
    private T data;

    public static <T> Result<T> success() {
        Result<T> r = new Result<>();
        r.setCode(200);
        r.setMessage("操作成功");
        return r;
    }
    public static <T> Result<T> success(T data, String message) {
        Result<T> r = new Result<>();
        r.setCode(200);
        r.setMessage(message);
        r.setData(data);
        return r;
    }
    public static <T> Result<T> ok(T data) { return success(data, "操作成功"); }

    /**
     * 允许下发的 code 集合。
     *
     * <p>除 HTTP 语义码外，还要收 {@link ErrorCodes} 里那批 5 位业务码
     * （40301 被移出 / 40302 非本课教师 / 40401 课堂不存在 / 40901 状态冲突…）——
     * 需求 8.5 就是按 5 位业务码定义的契约。<b>修复前的坑</b>：白名单只有 HTTP 码，
     * 而 {@code GlobalExceptionHandler} 直接拿业务码调 {@code Result.fail}，
     * 于是 fail() 在异常处理器内部抛 IllegalStateException（日志里是
     * "Failure in @ExceptionHandler"），最终一律变成 500 —— 所有业务错误都被吞成
     * "服务器繁忙"，前端拿不到 40301/40401 这类可判定语义。
     *
     * <p>新增业务码时请同步 {@link ErrorCodes}，两边不要各写各的。
     */
    private static final java.util.Set<Integer> ALLOWED_CODES =
            java.util.Collections.unmodifiableSet(new java.util.HashSet<>(java.util.Arrays.asList(
                    // HTTP 语义码
                    200, 400, 401, 403, 404, 405, 409, 500, 1001,
                    // 5 位业务码（需求 8.5 / ErrorCodes）
                    ErrorCodes.MEMBER_KICKED,        // 40301
                    ErrorCodes.NOT_TEACHER,          // 40302
                    ErrorCodes.CLASSROOM_NOT_FOUND,  // 40401
                    ErrorCodes.MEMBER_NOT_IN_CLASSROOM, // 40402
                    ErrorCodes.MATERIAL_NOT_FOUND,   // 40403
                    ErrorCodes.SUBMISSION_NOT_FOUND, // 40404
                    ErrorCodes.CLASSROOM_STATUS_CONFLICT, // 40901
                    ErrorCodes.CLASSROOM_NOT_READY,      // 40902
                    ErrorCodes.CLASSROOM_ALREADY_CLOSED, // 40903
                    ErrorCodes.ATTENDANCE_ALREADY_SIGNED, // 40904
                    ErrorCodes.RECORDING_NOT_READY,       // 40905
                    ErrorCodes.EVENT_DUPLICATE,           // 40906
                    ErrorCodes.EVENT_STALE_VERSION,       // 40907
                    ErrorCodes.CALLBACK_FAILED,      // 50001
                    ErrorCodes.OSS_UPLOAD_FAILED,    // 50002
                    ErrorCodes.REDIS_UNAVAILABLE    // 50003
            )));

    public static boolean isAllowedCode(int code) {
        return ALLOWED_CODES.contains(code);
    }

    public static <T> Result<T> fail(Integer code, String message) {
        if (code == null) {
            throw new IllegalStateException(
                    "Result.fail 的 code 不能为 null：失败必须给出可判定的错误码。");
        }
        if (!ALLOWED_CODES.contains(code)) {
            throw new IllegalStateException(
                    "Result.fail 的 code 非法：" + code + "，允许值=" + new java.util.TreeSet<>(ALLOWED_CODES));
        }
        Result<T> r = new Result<>();
        r.setCode(code);
        r.setMessage(message);
        return r;
    }
    public static <T> Result<T> unauthorized(String msg) {
        Result<T> r = new Result<>();
        r.setCode(401);
        r.setMessage(msg);
        return r;
    }
    public boolean isOk() { return code == 200; }
}