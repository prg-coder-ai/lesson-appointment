// 预约时间实体（对应设计2.2.3 预约、支付相关接口 ，保存预约对应的所有时间列表）
package com.reservation.entity;

import lombok.Data;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import net.sf.jsqlparser.expression.DateTimeLiteralExpression;

import java.math.BigDecimal;

import java.io.Serializable;
import java.time.LocalDateTime;
 
//从book——id获取schedule_id、course_id、tearcher_id、student_id
//用于查询
@Data
public class AppointmentDTO   implements Serializable{
    private static final long serialVersionUID = 1L;
    private String id;//顺序自增  系统生成唯一标识（UUID），对应通用校验规则-ID类参数
    private String BookingId;  // 对应的预约Id
    @NotBlank(message = "排期ID不能为空")
    private String scheduleId;  // 关联排期，对应设计2.2.3 预约接口请求参数

    @NotBlank(message = "排期ID对应的课次")
    private Integer lessenIndex;  // 关联排期对应的课次 0~N-1，-1默认

    @NotBlank(message = "学生ID不能为空")//
    private String studentId;  // 关联学生  
    
    private String timeZone;  //预约时间的所在时区 
    private LocalDateTime appointmemnt_datetime;  //当前有效 预约时间，默认时间长度
    private LocalDateTime last_datetime;  //原始的 预约时间，默认时间长度 ，用于修改的情况
     @NotBlank(message = "课程ID不能为空")
    private String courseId;  // 关联课程， 
     @NotBlank(message = "老师ID不能为空")
    private String teacherId;  // 关联教师   

    @NotBlank(message = "订单状态不能为空")
    private String status;  //'预约状态（1 booked：已预约/bookProved/cancelling/canceled：已取消/3 completed：已完成/overtime：已过时/delete：待删除）',
    private LocalDateTime createTime;  // 订单创建时间
    private LocalDateTime update_time;  // 更新时间'
}
  