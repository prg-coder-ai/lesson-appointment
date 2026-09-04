package com.reservation.entity;

import lombok.Data;
import jakarta.validation.constraints.NotBlank;
//import jakarta.validation.constraints.NotNull;
//import jakarta.validation.constraints.Size;
import  java.util.Date;
import java.io.Serializable;
/**
 * 课程签到实体类，对应设计2.4 课程执行-签到功能
 */
@Data
public class CourseCheckIn implements Serializable { 
    private static final long serialVersionUID = 1L;
    /** 租户ID（0=平台/历史单租户数据）— SaaS多租户 */
    private Long tenantId;
    private String checkInId;  // 唯一标识（UUID）
    @NotBlank(message = "订单ID不能为空")
    private String booking_id;    // 关联预约订单
    @NotBlank(message = "排期ID不能为空")
    private String scheduleId; // 关联课程排期
//    @NotBlank(message = "排期ID不能为空       ")
   // private String scheduleId; // 关联课程排期
    @NotBlank(message = "学生ID不能为空")
    private String studentId;  // 关联学生
    @NotBlank(message = "教师ID不能为空")
    private String teacherId;  // 关联教师
    @NotBlank(message = "签到状态不能为空")
    private String checkInStatus; // 枚举值：1 checked（已签到）/0 unchecked（未签到）
    private Date checkInTime;   // 签到时间，格式YYYY-MM-DD HH:mm:ss
}
//根据实体定义，编写mysql数据表的创建语句
//create table if not exists course_check_in (
//    check_in_id varchar(36) not null primary key,
//    booking_id varchar(36) not null,
//    schedule_id varchar(36),
//    student_id varchar(36) not null,
//    teacher_id varchar(36) not null,
//    check_in_status varchar(10) not null,
//    check_in_time datetime not null
//);
//