// 课程模板实体（对应设计2.2.2 课程模板相关接口）
package com.language.reservation.entity;

import lombok.Data;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Size;
import java.math.BigDecimal;

@Data
public class CourseTemplate {
    private String templateId;  // 唯一标识
    @NotBlank(message = "语言类型不能为空")
    private String languageType;  // 枚举值（对应教师注册languageType）
    @NotBlank(message = "难度等级不能为空")
    private String difficultyLevel;  // 枚举值：入门/进阶/中级/高级
    @NotNull(message = "课时费不能为空")
    private BigDecimal classFee;  // ≥0，保留2位小数（对应通用校验规则）
    @NotNull(message = "课程时长不能为空")
    private Integer classDuration;  // ≥15，15的倍数（对应通用校验规则）
    @NotBlank(message = "课程形式不能为空")
    private String classForm;  // 枚举值：一对一/小班课/大班课
    @NotBlank(message = "课程描述不能为空")
    @Size(min = 10, max = 500, message = "课程描述长度需10-500字")
    private String description;
}

// 教师课程实体（对应设计2.2.2 教师课程相关接口）
@Data
public class Course {
    private String courseId;
    @NotBlank(message = "模板ID不能为空")
    private String templateId;
    @NotBlank(message = "课程名称不能为空")
    @Size(min = 2, max = 50, message = "课程名称长度需2-50字")
    private String courseName;
    @NotBlank(message = "教学内容不能为空")
    @Size(min = 10, max = 1000, message = "教学内容长度需10-1000字")
    private String content;
    @NotBlank(message = "课程特色不能为空")
    @Size(min = 10, max = 1000, message = "课程特色长度需10-1000字")
    private String feature;
    @NotBlank(message = "教师ID不能为空")
    private String teacherId;
}

// 课程排期实体（对应设计2.2.2 排期相关接口）
@Data
public class Schedule {
    private String scheduleId;
    @NotBlank(message = "课程ID不能为空")
    private String courseId;
    @NotBlank(message = "开始时间不能为空")
    private String startTime;  // 格式YYYY-MM-DD HH:mm:ss（对应通用校验规则-时间）
    @NotBlank(message = "结束时间不能为空")
    private String endTime;
    @NotNull(message = "重复标识不能为空")
    private Boolean isRepeat;
    private Integer repeatWeek;  // 1-7，isRepeat=true时必填（对应通用校验规则）
    private String status;  // 枚举值：available/unavailable
}