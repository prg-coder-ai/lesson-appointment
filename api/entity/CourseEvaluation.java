package com.language.reservation.entity;

import lombok.Data;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Size;

/**
 * 课程签到实体类，对应设计2.4 课程执行-签到功能
 */
@Data
public class CourseCheckIn {
    private String checkInId;  // 唯一标识（UUID）
    @NotBlank(message = "订单ID不能为空")
    private String orderId;    // 关联预约订单
    @NotBlank(message = "排期ID不能为空")
    private String scheduleId; // 关联课程排期
    @NotBlank(message = "学生ID不能为空")
    private String studentId;  // 关联学生
    @NotBlank(message = "教师ID不能为空")
    private String teacherId;  // 关联教师
    @NotBlank(message = "签到状态不能为空")
    private String checkInStatus; // 枚举值：checked（已签到）/unchecked（未签到）
    private String checkInTime;   // 签到时间，格式YYYY-MM-DD HH:mm:ss
}

/**
 * 课程评价实体类，对应设计2.4 后续流程-课程评价功能
 */
@Data
public class CourseEvaluation {
    private String evaluationId;  // 唯一标识（UUID）
    @NotBlank(message = "订单ID不能为空")
    private String orderId;       // 关联预约订单（课程结束后可评价）
    @NotBlank(message = "学生ID不能为空")
    private String studentId;    // 关联评价学生
    @NotBlank(message = "教师ID不能为空")
    private String teacherId;    // 关联被评价教师
    @NotNull(message = "评价分数不能为空")
    private Integer score;       // 评价分数（1-5分，对应设计2.4 评价规则）
    @NotBlank(message = "评价内容不能为空")
    @Size(min = 10, max = 500, message = "评价内容需10-500字")
    private String content;      // 评价内容
    private String createTime;   // 评价时间，格式YYYY-MM-DD HH:mm:ss
}

/**
 * 课程反馈实体类，对应设计2.4 后续流程-课程反馈功能
 */
@Data
public class CourseFeedback {
    private String feedbackId;   // 唯一标识（UUID）
    @NotBlank(message = "订单ID不能为空")
    private String orderId;      // 关联预约订单
    @NotBlank(message = "提交人ID不能为空")
    private String submitterId;  // 提交人ID（学生/教师）
    @NotBlank(message = "提交人角色不能为空")
    private String submitterRole; // 提交人角色（student/teacher）
    @NotBlank(message = "反馈类型不能为空")
    private String feedbackType; // 枚举值：content（内容反馈）/service（服务反馈）/other（其他反馈）
    @NotBlank(message = "反馈内容不能为空")
    @Size(min = 10, max = 500, message = "反馈内容需10-500字")
    private String content;      // 反馈内容
    private String createTime;   // 反馈时间，格式YYYY-MM-DD HH:mm:ss
    private String handleStatus; // 处理状态：pending（待处理）/handled（已处理）
    private String handleContent; // 处理内容（管理员填写）
    private String handleTime;   // 处理时间
}
