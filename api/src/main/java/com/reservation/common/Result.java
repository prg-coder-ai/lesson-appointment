package com.reservation.common;

import com.reservation.entity.CourseSchedule;
import lombok.Data;

import java.util.List;
import java.util.Map;

/**
 * 统一返回结果封装，对应设计2.1中“返回格式：code、message、data”
 */
@Data
public class Result<T> {
    // 状态码（对应设计2.1 状态码规范）
    private Integer code;
    // 提示信息
    private String message;
    // 返回数据（可选）
    private T data;

    // 成功返回（无数据）
    public static <T> Result<T> success(Map<String, List<CourseSchedule>> resultMap) {
        Result<T> result = new Result<>();
        result.setCode(200);  // 200-成功（对应设计2.1）
        result.setMessage("操作成功");
        return result;
    }

    // 成功返回（有数据）
    public static <T> Result<T> success(T data, String message) {
        Result<T> result = new Result<>();
        result.setCode(200);
        result.setMessage(message);
        result.setData(data);
        return result;
    }

    // 失败返回（对应设计2.4 异常处理）
    public static <T> Result<T> fail(Integer code, String message) {
        Result<T> result = new Result<>();
        result.setCode(code);  // 400/401/403/404/500（对应设计2.1）
        result.setMessage(message);
        return result;
    }
}