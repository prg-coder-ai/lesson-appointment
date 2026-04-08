package com.reservation.mapper;

import com.reservation.entity.CourseTemplate;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param; 
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

 
import java.util.Optional; 
import java.util.Map;
import java.util.List;

/**
 * CourseTemplateMapper接口，对应course_template表CRUD操作，匹配CourseService中的方法
 */
@Mapper
public interface CourseTemplateMapper {
/**
     * 插入课程模板（管理员操作）
     * @param template 课程模板实体
     * @return 影响行数
     */
     
    /**
     * 对应Mapper XML中的插入语句示例：
     * <insert id="insertTemplate" parameterType="com.reservation.entity.CourseTemplate">
     *   INSERT INTO course_template (template_id, language_type, difficulty_level, template_name, description, create_time, update_time)
     *   VALUES (#{templateId}, #{languageType}, #{difficultyLevel}, #{templateName}, #{description}, NOW(), NOW())
     * </insert>
     */
     @org.apache.ibatis.annotations.Insert( "INSERT INTO course_template (template_id, language_type, difficulty_level, class_duration,class_form,class_fee, description, create_time, update_time)     VALUES (#{templateId}, #{languageType}, #{difficultyLevel},#{classDuration},#{classForm},#{classFee}, #{description}, NOW(), NOW())")
    int insertTemplate(CourseTemplate template);

    /**
     * 根据语言类型和难度等级查询模板（校验唯一性）
     * @param languageType 语言类型
     * @param difficultyLevel 难度等级
     * @return 课程模板信息
     */
    // INSERT_YOUR_CODE
    @org.apache.ibatis.annotations.Select("SELECT * FROM course_template WHERE language_type = #{languageType} AND difficulty_level = #{difficultyLevel}")
    CourseTemplate selectTemplatesByLangAndLevel(@Param("languageType") String languageType, @Param("difficultyLevel") String difficultyLevel);

 /**
     * 查询课程模板列表（可按语言类型筛选）
     * @param languageType 语言类型（可为null，查询所有）
     * @return 课程模板列表
     */
     
     @org.apache.ibatis.annotations.Select("SELECT * FROM course_template WHERE  language_type = #{languageType}")
    List<CourseTemplate> selectTemplatesByLanguage(@Param("languageType") String languageType);

    @org.apache.ibatis.annotations.Select("SELECT * FROM course_template")
    List<CourseTemplate> selectAllTemplates();

    /**
     * 根据模板ID查询模板
     * @param templateId 模板ID
     * @return 课程模板信息
     */
    // INSERT_YOUR_CODE
    @org.apache.ibatis.annotations.Select("SELECT * FROM course_template WHERE template_id = #{templateId}")
    CourseTemplate selectTemplateById(@Param("templateId") String templateId);

   // INSERT_YOUR_CODE
   @org.apache.ibatis.annotations.Update("UPDATE course_template SET language_type = #{courseTemplate.languageType}, difficulty_level = #{courseTemplate.difficultyLevel}, class_duration = #{courseTemplate.classDuration}, class_form = #{courseTemplate.classForm}, class_fee = #{courseTemplate.classFee},description = #{courseTemplate.description}, update_time = NOW() WHERE template_id = #{courseTemplate.templateId}")
   int updateTemplate(@Param("courseTemplate") CourseTemplate courseTemplate);

   @org.apache.ibatis.annotations.Update("UPDATE course_template SET status = #{action} WHERE template_id = #{templateId}") 
   int updateTemplateStatus(@Param("templateId") String templateId,@Param("action") String action);
    
}
