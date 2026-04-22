// 课程模板实体（对应设计2.2.2 课程模板相关接口）
package com.reservation.entity;


import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.util.Date;
import java.io.Serializable;
// 教师课程实体（对应设计2.2.2 教师课程相关接口）
@Data
public class Course implements Serializable {
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

     @NotBlank(message = "课程状态默认为pending")   
    private String status = "pending"; 
}
