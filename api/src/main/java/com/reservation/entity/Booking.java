// 预约订单实体（对应设计2.2.3 预约、支付相关接口）
package com.reservation.entity;

import lombok.Data;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.util.Date;
import java.io.Serializable;
@Data
public class Booking   implements Serializable{
    private static final long serialVersionUID = 1L;
    private String id;  // 系统生成唯一标识（UUID），对应通用校验规则-ID类参数
    @NotBlank(message = "排期ID不能为空")
    private String scheduleId;  // 关联排期，对应设计2.2.3 预约接口请求参数
    @NotBlank(message = "学生ID不能为空")
    private String studentId;  // 关联学生，对应权限校验   
        @NotBlank(message = "教师ID不能为空")
    private String teacherId;  // 关联教师，对应权限校验   
    @NotBlank(message = "订单状态不能为空")
    private String status;  //'预约状态（1 booked：已预约/bookProved/cancelling/canceled：已取消/3 completed：已完成/overtime：已过时）',
    private Date createTime;  // 订单创建时间
    private Date update_time;  // 更新时间' 
}
