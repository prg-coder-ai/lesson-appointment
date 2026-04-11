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
@Mapper
public interface CourseMapper {

   /**
     * 插入教师课程
     * @param course 课程实体
     * @return 影响行数
     */   
    @org.apache.ibatis.annotations.Insert("INSERT INTO course(course_id, template_id, teacher_id, course_name, description, status, create_time, update_time) " +
        "VALUES(#{courseId}, #{templateId}, #{teacherId}, #{courseName}, #{description}, #{status}, #{createTime}, #{updateTime})")
    int insertCourse(Course course); 
    /**
     * 条件查询课程列表
     * @param params 查询条件，可包含teacherId、templateId、status等
     * @return 课程列表
     * "<script>",
        "SELECT * FROM course",
        ",<where>",
        "  <if test='params.teacherId != null and params.teacherId != \"\"'>",
        "    AND teacher_id = #{params.teacherId}",
        "  </if>",
        "  <if test='params.templateId != null and params.templateId != \"\"'>",
        "    AND template_id = #{params.templateId}",
        "  </if>",
        "  <if test='params.status != null and params.status != \"\"'>",
        "    AND status = #{params.status}",
        "  </if>",
        "</where>",
        "</script>"
     */
    // INSERT_YOUR_CODE
        @org.apache.ibatis.annotations.Select({
        "SELECT * FROM course"
    })
    List<Course> selectCourseList(@Param("params") Map<String, Object> params); 

    
     @org.apache.ibatis.annotations.Update("UPDATE course SET status = #{status} WHERE course_id = #{courseId}")
     int updateCourseStatus(@Param("courseId") String courseId, @Param("status") String status); 

    @org.apache.ibatis.annotations.Update("UPDATE course SET templateId = #{course.templateId}, courseName = #{course.courseName}, content = #{course.content}, feature = #{course.feature}, teacherId = #{course.teacherId}, update_time = NOW() WHERE courseId = #{course.courseId}")
   int updateCourse(@Param("course") Course course);
    /**
     * 根据课程ID查询课程
     * @param courseId 课程ID
     * @return 课程信息
     */
    @Select("SELECT * from course WHERE course_id = #{courseId}")
    Course selectCourseById(@Param("courseId") String courseId);

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
