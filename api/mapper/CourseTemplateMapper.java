package com.language.reservation.mapper;

import com.language.reservation.entity.CourseTemplate;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * CourseTemplateMapper接口，对应course_template表CRUD操作，匹配CourseService中的方法
 */
@Mapper
public interface CourseTemplateMapper {

    /**
     * 根据语言类型和难度等级查询模板（校验唯一性）
     * @param languageType 语言类型
     * @param difficultyLevel 难度等级
     * @return 课程模板信息
     */
    CourseTemplate selectTemplateByLangAndLevel(@Param("languageType") String languageType, @Param("difficultyLevel") String difficultyLevel);

    /**
     * 根据模板ID查询模板
     * @param templateId 模板ID
     * @return 课程模板信息
     */
    CourseTemplate selectTemplateById(@Param("templateId") String templateId);

    /**
     * 查询课程模板列表（可按语言类型筛选）
     * @param languageType 语言类型（可为null，查询所有）
     * @return 课程模板列表
     */
    List<CourseTemplate> getTemplateList(@Param("languageType") String languageType);

    /**
     * 插入课程模板（管理员操作）
     * @param template 课程模板实体
     * @return 影响行数
     */
    int insertTemplate(CourseTemplate template);
}
