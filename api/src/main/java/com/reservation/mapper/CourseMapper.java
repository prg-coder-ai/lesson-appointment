/*CourseMapper.java*/
package src.main.java.com.reservation.mapper;

import src.main.java.com.reservation.entity.Course;
import src.main.java.com.reservation.entity.CourseTemplate;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * CourseMapper接口，对应course表CRUD操作，匹配CourseService中的方法
 */
@Mapper
public interface CourseMapper {

    /**
     * 根据课程ID查询课程
     * @param courseId 课程ID
     * @return 课程信息
     */
    Course selectCourseById(@Param("courseId") String courseId);

    /**
     * 根据课程ID查询关联的教师ID（用于排期归属校验）
     * @param courseId 课程ID
     * @return 教师ID
     */
    String selectTeacherIdByCourseId(@Param("courseId") String courseId);

    /**
     * 插入教师课程
     * @param course 课程实体
     * @return 影响行数
     */
    int insertCourse(Course course);
}
