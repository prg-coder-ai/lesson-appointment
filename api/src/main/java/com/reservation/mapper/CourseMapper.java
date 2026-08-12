/*CourseMapper.java*/
package com.reservation.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.reservation.entity.Course;
import com.reservation.dto.CourseQueryParam;
import com.reservation.query.*;
//import com.reservation.entity.CourseTemplate;
 
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
//import org.apache.ibatis.annotations.Update;

 
//import java.util.Optional;
import java.util.List;
//import java.util.Map;

/**
 * CourseMapper接口，对应course表CRUD操作，匹配CourseService中的方法
 */ 

@Mapper
public interface CourseMapper extends BaseMapper<Course> {

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
     List<Course> selectCourseList(  CourseQueryParam params); 

    /*按照分页机制获取满足条件的指定页的数据*/
    List<Course> selectCourseListByPage(  CourseQueryPage params); 
       /*按照 获取满足条件的指定页的数据的总数*/
    int selectCourseListCount(  CourseQueryPage params);

     @org.apache.ibatis.annotations.Update("UPDATE course SET status = #{status} , update_time = NOW() WHERE course_id = #{courseId}")
     int updateCourseStatus(@Param("courseId") String courseId, @Param("status") String status); 

    @org.apache.ibatis.annotations.Update("UPDATE course SET template_id = #{course.templateId}, course_name = #{course.courseName}, content = #{course.content}, feature = #{course.feature}, teacher_id = #{course.teacherId}, update_time = NOW() WHERE course_id = #{course.courseId}")
   int updateCourse(@Param("course") Course course);
   
        @org.apache.ibatis.annotations.Update("UPDATE course SET status = #{status}, update_time = NOW() WHERE template_id = #{templateId}")
     int  updateCourseStatusByLastId(@Param("templateId") String templateId,@Param("status") String status);
    /**
     * 根据课程ID查询课程
     * @param courseId 课程ID
     * @return 课程信息
     */
    @Select("SELECT * from course WHERE course_id = #{courseId}")
    Course getCourseById(@Param("courseId") String courseId);

    // INSERT_YOUR_CODE
    // deleteById 已移除：使用 MyBatis-Plus BaseMapper 内置的 deleteById 方法


    /**
     * 根据模板ID删除课程
     * @param templateId 课程模板ID
     * @return 影响行数
     */
    @org.apache.ibatis.annotations.Delete("DELETE FROM course WHERE template_id = #{templateId}")
    int deleteByTemplateId(@Param("templateId") String templateId);


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
// INSERT_YOUR_CODE
    /**
     * 统计截至指定时间点、指定状态（如已发布"active"）的课程数量（含指定时间）
     * @param dateTime 创建时间上限（包含，通常为Timestamp）
     * @param status 状态（如"active"）
     * @return 数量
     */
    @Select("SELECT COUNT(*) FROM course WHERE status = #{status} AND create_time <= #{dateTime}")
    int countPublishedCourseAtDate(@Param("dateTime") java.sql.Timestamp dateTime, @Param("status") String status);
}
