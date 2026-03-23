package src.main.java.com.reservation.entity;

import lombok.Data;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Size; 
 import java.util.Date;
/**
 * 课程反馈实体类，对应设计2.4 后续流程-课程反馈功能
 */
@Data
public class CourseFeedback {
    private String feedbackId;   // 唯一标识（UUID）
    @NotBlank(message = "订单ID不能为空")
    private String course_id;      // 关联预约订单
    @NotBlank(message = "提交人ID不能为空")
    private String user_id;  // 提交人ID（学生/教师）
    @NotBlank(message = "提交人角色不能为空")
   // private String submitterRole; // 提交人角色（student/teacher） ---设计2.4 课程反馈功能要求学生和教师都可提交反馈
   // @NotBlank(message = "反馈类型不能为空")
   // private String feedbackType; // 枚举值：content（内容反馈）/service（服务反馈）/other（其他反馈）
    @NotBlank(message = "反馈内容不能为空")
    @Size(min = 10, max = 500, message = "反馈内容需10-500字")
    private String content;      // 反馈内容

    private Date createTime;   // 反馈时间，格式YYYY-MM-DD HH:mm:ss

    private String handleId;     // 处理人ID（管理员）

    private String handleStatus; // 处理状态：0 pending（待处理）/1 handled（已处理）

    private String handleContent; // 处理内容（管理员填写）

    private Date handleTime;   // 处理时间
}
