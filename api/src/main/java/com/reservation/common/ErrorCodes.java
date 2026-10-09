package com.reservation.common;

import com.reservation.exception.BusinessException;
import com.reservation.exception.NoPermissionException;
import com.reservation.exception.ResourceNotFoundException;
import com.reservation.exception.UnLoginException;
import com.reservation.exception.UserNotFoundException;

/**
 * 把业务异常映射为 {@link Result} 的错误码。
 *
 * <p><b>为什么需要它</b>：Controller 里大量catch (RuntimeException e) 之后直接
 * {@code Result.fail(0, e.getMessage())} 或 {@code Result.fail(null, ...)}。
 * 0 与 null 都不是可判定的错误码：叠加 spring.jackson 的
 * {@code default-property-inclusion=non_null} 后，{@code code=null} 会让整个 code
 * 字段从JSON 里消失；而客户端 {@code unwrapResult()} 只判 {@code res.code === 200}。
 *
 * <p><b>口径与GlobalExceptionHandler 对齐</b>：本类必须与
 * {@code GlobalExceptionHandler} 的各 {@code @ExceptionHandler} 映射保持一致
 * （Business→400、NoPermission→403、UserNotFound/ResourceNotFound→404、
 * UnLogin→401、其余→500）。两边若不一致，同一个异常在"被Controller 捕获"
 * 与"逃到 handler"两条路径下会返回不同 code —— 这正是契约分叉。
 *
 * <p><b>为何不让异常逃到 GlobalExceptionHandler</b>：那是更彻底的方案（Controller
 * 不再捕获），但会改变现有行为（部分接口现在返回 code=null 却仍然HTTP 200，
 * 前端可能已按"取 message 兜底"适配）。本类只做**就地映射**，不改变控制流，
 * 属最小改动；后续如需收敛可再移除 Controller 的 try/catch。
 */
public final class ErrorCodes {

    private ErrorCodes() {
    }

    /**
     * 按异常类型返回 {@link Result} 错误码。
     *
     * @param e 捕获到的异常，允许为 null（视为未知 → 500）
     * @return 200/400/401/403/404/500 之一；不会返回 null 或 0
     */
    public static int from(Throwable e) {
        if (e == null) {
            return 500;
        }
        // 注意顺序：无业务语义的异常都继承 RuntimeException，
        // 必须先判具体的子类，否则会全部落到 500。
        if (e instanceof UnLoginException) {
            return 401;
        }
        if (e instanceof NoPermissionException) {
            return 403;
        }
        if (e instanceof UserNotFoundException || e instanceof ResourceNotFoundException) {
            return 404;
        }
        if (e instanceof BusinessException || e instanceof IllegalArgumentException) {
            return 400;
        }
        return 500;
    }

    /** 便捷方法：直接构造失败响应（文案取异常自带 message）。 */
    public static <T> Result<T> fail(Throwable e) {
        return fail(e, e == null ? "服务器繁忙，请稍后再试" : e.getMessage());
    }

    /**
     * 便捷方法：构造失败响应但**保留调用方自定义文案**。
     *
     * <p>用于那些文案已做过行业词转换（{@code TermMsg.t("{schedule}失败: ")}）的调用点——
     * 直接用 {@link #fail(Throwable)} 会丢掉转换，导致「排期/课程」等词退回通用说法。
     */
    public static <T> Result<T> fail(Throwable e, String message) {
        return Result.fail(from(e), message);
    }
}
