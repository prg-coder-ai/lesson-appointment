package src.main.java.com.reservation.mapper;

import src.main.java.com.reservation.entity.CourseFeedback;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * CourseFeedbackMapper接口，对应course_feedback表CRUD操作，匹配FeedbackService中的方法
 */
@Mapper
public interface CourseFeedbackMapper {

    /**
     * 插入课程反馈（学生/教师提交反馈）
     * @param feedback 课程反馈实体
     * @return 影响行数
     */
    int insertFeedback(CourseFeedback feedback);

    /**
     * 根据反馈ID查询反馈（用于反馈详情查看、回复）
     * @param feedbackId 反馈唯一标识
     * @return 课程反馈信息
     */
    CourseFeedback selectFeedbackById(@Param("feedbackId") String feedbackId);

    /**
     * 根据反馈人ID查询反馈列表（用户查看自身提交的反馈）
     * @param userId 反馈人ID（学生/教师）
     * @return 课程反馈列表
     */
    List<CourseFeedback> selectFeedbackByUserId(@Param("userId") String userId);

    /**
     * 根据课程ID查询反馈列表（教师查看对应课程的反馈）
     * @param courseId 课程ID
     * @return 课程反馈列表
     */
    List<CourseFeedback> selectFeedbackByCourseId(@Param("courseId") String courseId);

    /**
     * 根据反馈状态查询反馈列表（管理员处理反馈）
     * @param feedbackStatus 反馈状态（pending：待处理，processed：已处理，rejected：已驳回）
     * @return 课程反馈列表
     */
    List<CourseFeedback> selectFeedbackByStatus(@Param("feedbackStatus") String feedbackStatus);

    /**
     * 更新反馈状态及回复内容（管理员处理反馈时调用）
     * @param feedback 反馈实体（含feedbackId、feedbackStatus、replyContent）
     * @return 影响行数
     */
    int updateFeedbackStatusAndReply(CourseFeedback feedback);

    int updateFeedbackHandleContent(@Param("feedbackId") String feedbackId, @Param("handleContent") String handleContent);
//
    void updateFeedback(CourseFeedback feedback);

    List<CourseFeedback> selectFeedbackListByStatus(String handleStatus);
}
