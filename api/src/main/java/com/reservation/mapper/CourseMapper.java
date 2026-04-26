/*CourseMapper.java*/
package com.reservation.mapper;

import com.reservation.entity.Course;
import com.reservation.entity.CourseQueryParam;
import com.reservation.entity.CourseTemplate;
 
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

 
import java.util.Optional;
import java.util.List;
import java.util.Map;

/**
 * CourseMapper接口，对应course表CRUD操作，匹配CourseService中的方法
 */
/*
原因分析:
你在 CourseMapper.xml 文件的第一行开头前有多余的空格或其它字符（见 file_context_3），导致 MyBatis 解析 XML 配置时报如下错误：
org.apache.ibatis.builder.BuilderException: Error creating document instance.  Cause: org.xml.sax.SAXParseException; lineNumber: 1; columnNumber: 7; The processing instruction target matching "[xX][mM][lL]" is not allowed.

这通常是因为 XML 声明（<?xml version=...?>）前有内容。XML 声明必须是文件的第一行、首字符，前面不能有任何内容（包括空格或换行）。

【解决办法】
请将 src/main/java/com/reservation/mapper/CourseMapper.xml 文件首行的
" <?xml version="1.0" encoding="UTF-8" ?>"
前的空格删掉，使 <?xml ...?> 出现在文件的第一行的第一个字符处。

修正后应该是：
<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper ...>
...
*/

@Mapper
public interface CourseMapper {

   /**
     * 插入教师课程
     * @param course 课程实体
     * @return 影响行数
     */   
    @org.apache.ibatis.annotations.Insert("INSERT INTO course(course_id, template_id, teacher_id, course_name, content, feature,status ) " +
        "VALUES(#{courseId}, #{templateId}, #{teacherId}, #{courseName}, #{content}, #{feature},#{status} )")
    int insertCourse(Course course); 
    /**
     * 条件查询课程列表
     * @param params 查询条件，可包含teacherId、templateId、status等
     * @return 课程列表
     * */ 
        // 按照params条件动态查询课程列表，实际SQL建议在XML用<where><if>动态语句实现，Java注解不便支持Map参数动态SQL
        // 推荐切换到XML配置（见CourseMapper.xml） 
 /*

  /**
   * 复合条件检索课程列表，支持按课程名、难度等级、语言类型、老师等筛选。
   * 注意：languageType 和 difficultyLevel 均为 template 表字段，需要关联 template 表进行条件查询。
   * 推荐在 CourseMapper.xml 中实现如下示例 SQL：
   *
   * <select id="selectCourseList" parameterType="map" resultType="com.reservation.entity.Course">
   *   SELECT c.*
   *   FROM course c
   *   LEFT JOIN template t ON c.template_id = t.template_id
   *   <where>
   *     <if test="params.courseName != null and params.courseName != ''">
   *       AND c.course_name LIKE CONCAT('%', #{params.courseName}, '%')
   *     </if>
   *     <if test="params.languageType != null and params.languageType != ''">
   *       AND t.language_type = #{params.languageType}
   *     </if>
   *     <if test="params.difficultyLevel != null and params.difficultyLevel != ''">
   *       AND t.difficulty_level = #{params.difficultyLevel}
   *     </if>
   *     <if test="params.teacherId != null and params.teacherId != ''">
   *       AND c.teacher_id = #{params.teacherId}
   *     </if>
   *     <if test="params.status != null and params.status != ''">
   *       AND c.status = #{params.status}
   *     </if>
   *   </where>
   * </select>
   *
   * 说明：请确保 CourseMapper.xml 中的 SQL 片段如上，实现 course 与 template 的关联及动态条件拼接。
   */
  
    /**
     * 根据多条件查询课程列表（支持：课程名、语言、难度、教师、状态等）
     *  service调用示例（参数必须为Map类型，并用"params"包裹键）:
     // 这句话的意思是：在调用该service服务（比如在Service层使用Mapper方法）时，传递给接口的参数必须是Map类型（即参数应为Map<String, Object>），
     // 并且在MyBatis配置中，该Map需要通过@Param("params")这种方式包裹参数名为"params"，以便SQL动态条件中都用params.xx来判断各个查询条件。
     // 这样可以在Mapper的XML文件中灵活地用 params.courseName、params.teacherId 等语法动态拼接查询条件。
     * 
     * Map<String, Object> searchParams = new HashMap<>();
     * searchParams.put("courseName", "Python基础");
     * searchParams.put("languageType", "python");
     * searchParams.put("difficultyLevel", "入门");
     * searchParams.put("teacherId", "T002");
     * searchParams.put("status", "active");
     * 
     * List<Course> list = courseMapper.selectCourseList(searchParams);
     * 
     * // 任何字段都可省略（不作为条件时可不传或传空串/"null"），如只查所有active课程：
     * Map<String, Object> params = Map.of("status", "active");
     * courseMapper.selectCourseList(params);
     * 
     * 调用时参数Map必须非null，但内部字段可随意增减。
     */
    // INSERT_YOUR_CODE
    /**
     * 报错原因分析：
     * 
     * 问题描述：
     * org.mybatis.spring.MyBatisSystemException: 
     * nested exception is org.apache.ibatis.builder.BuilderException: 
     * Error evaluating expression 'params.courseName != null and params.courseName != '''. 
     * Cause: org.apache.ibatis.ognl.OgnlException: source is null for getProperty(null, "courseName")
     *
     * 原因分析：
     *  1. MyBatis XML（如<select id="selectCourseList" ...>）中使用 OGNL 表达式 params.xxx != null ... 动态拼接 where 条件。
     *  2. Service/Controller 层在调用 selectCourseList 时，传递给 Mapper 的参数 Map 如果为 null，或者 Map 不用 "params" 作为 key 包裹，
     *     则 XML 中引用 params.courseName 时 params 本身为 null，会导致 OGNL 取属性报 source is null 错误。
     *  3. 此外，如果调用时直接传 null 或不用 @Param("params")，也会导致同样的问题。
     *
     *  典型修复：
     *    - Service 层/Controller 层确保传递的参数为非空 Map（new HashMap<>()），哪怕没有任何字段。
     *    - Mapper 方法参数需加 @Param("params")，如 selectCourseList(@Param("params") Map<String, Object> params)
     *    - XML 判断语句内层必须用 params.xxx，外层 test 里要加 params != null 防护（<if test="params != null and params.xxx != null ...">），保障不 NPE。
     *    - Web 层 API 实现时，如果查询参数为 null，自动置为 new HashMap<>()，杜绝传 null。
     *
     *  参考解决方案：
     *    - 保证 selectCourseList 从 Controller/Service/Mapper/Mapper.xml 到 SQL，参数完整闭环、Map 结构始终非 null。
     *    - <if test="params != null and params.xxx != null and params.xxx != ''"> ... </if> 
     */
    List<Course> selectCourseList(  CourseQueryParam params); 
    
    
     @org.apache.ibatis.annotations.Update("UPDATE course SET status = #{status} , update_time = NOW() WHERE course_id = #{courseId}")
     int updateCourseStatus(@Param("courseId") String courseId, @Param("status") String status); 

    @org.apache.ibatis.annotations.Update("UPDATE course SET template_id = #{course.templateId}, course_name = #{course.courseName}, content = #{course.content}, feature = #{course.feature}, teacher_id = #{course.teacherId}, update_time = NOW() WHERE course_id = #{course.courseId}")
   int updateCourse(@Param("course") Course course);
   
    /**
     * 根据课程ID查询课程
     * @param courseId 课程ID
     * @return 课程信息
     */
    @Select("SELECT * from course WHERE course_id = #{courseId}")
    Course getCourseById(@Param("courseId") String courseId);

    /**
     * 根据课程ID查询关联的教师ID（用于排期归属校验）
     * @param courseId 课程ID
     * @return 教师ID
     */
    
    @org.apache.ibatis.annotations.Select("SELECT teacher_id FROM course WHERE course_id = #{courseId}")
    String selectTeacherIdByCourseId(@Param("courseId") String courseId);

  /**
   * 根据条件查询课程---预约、收藏等。用在booking

    List<Map<String, Object>> selectCourseListByStudent(CourseQueryParam queryParam);
    */
}
