package com.messagecenter.common;

import lombok.Data;

/** 统一返回结果封装（与主系统 Result 兼容：code/message/data） */
@Data
public class Result<T> {
    // 契约铁律（2026-10-09 修订）：必须是 primitive int，不能是 Integer。
    // 与主系统 Result 同规——原因见 api 侧 Result.code 的注释（null + non_null 会让code 字段消失）。
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
     * 允许的 code 白名单，与主系统 Result 同规。
     * 200=成功；400/401/403/404/409/500 取 HTTP 语义；1001 为微信登录业务码。
     */
    private static final java.util.Set<Integer> ALLOWED_CODES =
            java.util.Collections.unmodifiableSet(new java.util.HashSet<>(java.util.Arrays.asList(
                    200, 400, 401, 403, 404, 409, 500, 1001)));

    /** 判断某个 code 是否在白名单内。 */
    public static boolean isAllowedCode(int code) {
        return ALLOWED_CODES.contains(code);
    }

    public static <T> Result<T> fail(Integer code, String message) {
        // 入参保持 Integer 而非 int：让 fail(null) 仍能编译，在此处被断言拦下并给出成因；
        // 若改成 int，编译错误只指向参数本身，批量清理历史调用点时更难定位真实问题。
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
