package com.language.reservation.entity;

import lombok.Data;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Size;
 

/**
 * 课程评价实体类，对应设计2.4 后续流程-课程评价功能
 */
@Data
public class CourseEvaluation {
    private String evaluationId;  // 唯一标识（UUID）
    @NotBlank(message = "课程ID不能为空")
    private String course_id;       // 关联预约订单（课程结束后可评价）
    @NotBlank(message = "学生ID不能为空")
    private String studentId;    // 关联评价学生
    @NotBlank(message = "教师ID不能为空")
     private String teacherId;    // 关联被评价教师
    @NotNull(message = "评价分数不能为空")
    private Integer rating;       // 评价分数（1-5分，对应设计2.4 评价规则）
    @NotBlank(message = "评价内容不能为空")
    @Size(min = 10, max = 500, message = "评价内容需10-500字")
    private String comment;      // 评价内容
    private String createTime;   // 评价时间，格式YYYY-MM-DD HH:mm:ss
}
