package com.reservation.query;// query/CourseQuery.java

import com.reservation.common.PageQuery;
import lombok.Data;

/**分页查询入参（Query）
继承通用分页基类，扩展课程专属筛选条件 */
@Data
public class CourseQueryPage extends PageQuery {
    private Long tenantId;  // 租户ID（精准筛选，SaaS多租户；null=不限）
    private String courseName;    // 课程名称（模糊搜索）
    private String languageType;  // 语言类型（精准筛选）
    private String difficultyLevel;//语言难度 （精准筛选）
    private String status;       // 状态（启用/禁用）
    private String teacherId;       // 授课教师ID
   
}
/**
 * 
 *  private String courseName;//
     private String languageType;  // 可选，语言类型枚举值
    //@NotBlank(message = "课程形式不能为空")
   // private String classForm;  // 枚举值：一对一/小班课/大班课（对应设计2.2.3 专属校验规则）
    //@NotBlank(message = "教师类型不能为空")
    private String teacherId;  // （对应设计2.2.3 专属校验规则）
    private String status;//
     private String difficultyLevel;//
    private Date startTime;  // 可选，筛选开始时间
    private Date endTime;  // 可选，筛选结束时间
 */