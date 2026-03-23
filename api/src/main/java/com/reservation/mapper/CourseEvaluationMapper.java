package com.reservation.mapper;

import com.reservation.entity.CourseEvaluation;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * CourseEvaluationMapper接口，对应course_evaluation表CRUD操作，匹配EvaluationService中的方法
 */
@Mapper
public interface CourseEvaluationMapper {

    /**
     * 插入课程评价（学生完成课程后提交评价）
     * @param evaluation 课程评价实体
     * @return 影响行数
     */
    int insertEvaluation(CourseEvaluation evaluation);

    /**
     * 根据订单ID查询评价（校验该订单是否已提交评价）
     * @param orderId 订单ID
     * @return 课程评价信息（无评价则返回null）
     */
    CourseEvaluation selectEvaluationByOrderId(@Param("orderId") String orderId);

    /**
     * 根据教师ID查询评价列表（教师查看自身所有评价）
     * @param teacherId 教师ID
     * @return 课程评价列表
     */
    List<CourseEvaluation> selectEvaluationByTeacherId(@Param("teacherId") String teacherId);

    /**
     * 根据课程ID查询评价列表（学生查看课程的所有评价）
     * @param courseId 课程ID
     * @return 课程评价列表
     */
    List<CourseEvaluation> selectEvaluationByCourseId(@Param("courseId") String courseId);
}
