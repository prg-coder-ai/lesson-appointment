// 课程模板实体（对应设计2.2.2 课程模板相关接口）
package com.reservation.entity;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.io.Serializable;
@Data
public class CourseTemplate implements Serializable{
    private String templateId;  // 唯一标识
    @NotBlank(message = "语言类型不能为空")
    private String languageType;  // 枚举值（对应教师注册languageType）
    @NotBlank(message = "难度等级不能为空")
    private String difficultyLevel;  // 枚举值：1入门/2进阶/3中级/4高级
    @NotNull(message = "课时费不能为空")
    private BigDecimal classFee;  // ≥0，保留2位小数（对应通用校验规则）
    @NotNull(message = "课程时长不能为空")
    private Integer classDuration;  // ≥15，15的倍数（对应通用校验规则）
    @NotBlank(message = "课程形式不能为空")
    private String classForm;  // 枚举值：一对一/小班课/大班课
    @NotBlank(message = "课程描述不能为空")
    @Size(min = 10, max = 500, message = "课程描述长度需10-500字")
    private String description;

    @NotBlank(message = "课程模板状态不能空")
    private String status;//pending/active/inactive/frozen
}
 