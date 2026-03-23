// 课程模板实体（对应设计2.2.2 课程模板相关接口）
package src.main.java.com.reservation.entity;


import lombok.Data;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Size;
import java.math.BigDecimal;
import java.util.Date;
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
