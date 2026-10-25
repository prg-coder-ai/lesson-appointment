// 课程模板实体（对应设计2.2.2 课程模板相关接口）
package com.reservation.entity;


import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import jakarta.validation.constraints.Size;
import java.io.Serializable;
//import jakarta.validation.constraints.NotNull;
//import java.math.BigDecimal;
//import java.util.Date;

// 教师课程实体（对应设计2.2.2 教师课程相关接口）
@Data
public class Course implements Serializable {
      private static final long serialVersionUID = 1L;
    /** 租户ID（0=平台/历史单租户数据）— SaaS多租户 */
    private Long tenantId;
    @TableId(type = IdType.ASSIGN_ID)
    private String courseId;

    @NotBlank(message = "模板ID不能为空")
    private String templateId;

    /**
     * 教学语言。<b>创建课程时由服务端从课程模板导入</b>（{@code CourseService#addCourse}），
     * 不接受前端传值来决定"这门课教什么语言"——模板唯一键就是 (tenant, language, level)，
     * 让前端另填一个语言只会出现"模板是英语、课程教日语"这种自相矛盾的数据。
     *
     * <p>因此本字段不加 @NotBlank：它由服务端填，前端不填时不应触发参数校验 400。
     */
    private String languageType;

    /**
     * 课时长度（分钟）。同样由服务端从模板导入，默认 60。
     *
     * <p>用 Integer 而非 int：前端不传时应为 null（不参与校验），不能凭空变成 0。
     * 排期侧可单独覆盖，见 {@code CourseSchedule#classDuration}。
     */
    private Integer classDuration;

    @NotBlank(message = "课程名称不能为空")
    @Size(min = 2, max = 50, message = "课程名称长度需2-50字")
    private String courseName;

    @NotBlank(message = "教学内容不能为空")
    @Size(min = 0, max = 1000, message = "教学内容长度需0-1000字")
    private String content;

    @NotBlank(message = "课程特色不能为空")    
    @Size(min = 0, max = 1000, message = "课程特色长度需0-1000字")
    private String feature;
    
    @NotBlank(message = "教师ID不能为空")
    private String teacherId;

     @NotBlank(message = "课程状态默认为pending")   
     private String status = "pending"; 

     private String createTime; 
}
