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

    private static final java.util.Set<Integer> ALLOWED_CODES =
            java.util.Collections.unmodifiableSet(new java.util.HashSet<>(java.util.Arrays.asList(
                    200, 400, 401, 403, 404, 405, 409, 500, 1001)));

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