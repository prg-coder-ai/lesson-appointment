// 预约订单实体（对应设计2.2.3 预约、支付相关接口）
package com.reservation.entity;

import lombok.Data;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.util.Date;
import java.io.Serializable;   

// 课程查询筛选参数（对应设计2.2.3 课程列表查询接口）
@Data
public class CourseQueryParam implements Serializable {
    private String languageType;  // 可选，语言类型枚举值
    @NotBlank(message = "课程形式不能为空")
    private String classForm;  // 枚举值：一对一/小班课/大班课（对应设计2.2.3 专属校验规则）
    @NotBlank(message = "教师类型不能为空")
    private String teacherType;  // 枚举值：外教/中教（对应设计2.2.3 专属校验规则）
    private Date startTime;  // 可选，筛选开始时间
    private Date endTime;  // 可选，筛选结束时间
}