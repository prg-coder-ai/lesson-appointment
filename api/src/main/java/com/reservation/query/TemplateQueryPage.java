package com.reservation.query;// query/CourseQuery.java

import com.reservation.common.PageQuery;
import lombok.Data;

/**分页查询入参（Query）
继承通用分页基类，扩展课程专属筛选条件 */
@Data
public class TemplateQueryPage extends PageQuery {
    private String name;    // 描述（模糊搜索）
    private String languageType;  // 语言类型（精准筛选）
    private String difficultyLevel;//语言难度 （精准筛选）
    private String status;       // 状态（启用/禁用）     
} 