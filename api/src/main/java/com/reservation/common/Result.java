package com.reservation.common;
import lombok.Data;
/* 
import com.reservation.entity.CourseSchedule; 
import java.util.List;
import java.util.Map;*/

/**
 * 统一返回结果封装，对应设计2.1中“返回格式：code、message、data”
 */
@Data
public class Result<T> {
    // 状态码（对应设计2.1 状态码规范）
    // 状态码（对应设计2.1 状态码规范）
    //
    // 契约铁律（2026-10-09 修订）：必须是 primitive int，不能是 Integer。
    // 历史用 Integer 时出现过 Result.fail(null, ...)，叠加 spring.jackson 的
    // default-property-inclusion=non_null，序列化后整个 code 字段会从 JSON 里消失，
    // 响应只剩 {"message":"..."}；客户端 unwrapResult() 判 res.code === 200 才返回 data，
    // 于是 err.code 变成 undefined，按 code 聚合的日志/监控全部失效。
    // 改成 int 后 fail(null) 在编译期就不可能通过（null 不能赋给 int），
    // 再由 check-result-contract 守卫做第二道防线。
    private int code;
    // 提示信息
    private String message;
    // 返回数据（可选）
    private T data;

    // 成功返回（无数据）
    public static <T> Result<T> success() {
        Result<T> result = new Result<>();
        result.setCode(200);  // 200-成功（对应设计2.1）
        result.setMessage("操作成功");
        return result;
    }

    // 成功返回（有数据）
    // T 是泛型类型参数，即返回数据 data 的类型，可以是任意类型（如 Map、List、对象等），调用时由编译器自动推断。
    public static <T> Result<T> success(T data, String message) {
        Result<T> result = new Result<>();
        result.setCode(200);
        result.setMessage(message);
        result.setData(data);
        return result;
    }

    /**
     * 允许的 code 白名单。200=成功；其余为失败码，取 HTTP 语义以便统一映射 HTTP 状态。
     * 1001 为微信登录专用业务码（登录已屏蔽，保留以免改动历史分支）。
     */
    private static final java.util.Set<Integer> ALLOWED_CODES =
            java.util.Collections.unmodifiableSet(new java.util.HashSet<>(java.util.Arrays.asList(
                    200, 400, 401, 403, 404, 409, 500, 1001)));

    /** 判断某个 code 是否在白名单内（供守卫与断言复用）。 */
    public static boolean isAllowedCode(int code) {
        return ALLOWED_CODES.contains(code);
    }

    // 失败返回（对应设计2.4 异常处理）
    public static <T> Result<T> fail(Integer code, String message) {
        // 入参刻意保持 Integer 而非 int：这样 fail(null) 仍能编译，
        // 在此被断言拦下并抛出带成因的异常；改成 int 会让编译错误只指向参数，
        // 批量清理历史调用点时更难定位真实问题。
        if (code == null) {
            throw new IllegalStateException(
                    "Result.fail 的 code 不能为 null：失败必须给出可判定的错误码。历史缺陷见 Result.code 字段注释。");
        }
        if (!ALLOWED_CODES.contains(code)) {
            throw new IllegalStateException(
                    "Result.fail 的 code 非法：" + code + "，允许值=" + new java.util.TreeSet<>(ALLOWED_CODES)
                            + "。0 与 null 都是历史遗留（0 既非成功码也非标准错误码）。");
        }
        Result<T> result = new Result<>();
        result.setCode(code);  // 400/401/403/404/409/500/1001（对应设计2.1）
        result.setMessage(message);
        return result;
    }

     public static <T> Result<T> unauthorized(String msg) {
        Result<T> r = new Result<>();
        r.setCode(401);
        r.setMessage(msg);
        return r;
    }

    // 成功返回（有数据，默认消息）
    public static <T> Result<T> ok(T data) {
        return success(data, "操作成功");
    }
}