package src.main.java.com.reservation.mapper;
import src.main.java.com.reservation.entity.CourseCheckIn;
import src.main.java.com.reservation.entity.CourseEvaluation;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
/**
 * CourseCheckInMapper，对应course_check_in表CRUD操作，匹配CheckInService中的方法,目前仅包含签到相关方法，后续可根据需求添加其他方法
 */
@Mapper
public interface   CourseCheckInMapper {
    /**
     * 插入签到记录（学生签到时调用）
     * @param checkIn 签到实体
     * @return 影响行数
     */
    int insertCheckIn(CourseCheckIn checkIn);
  

    /**
     * 根据订单ID查询签到记录（校验该订单是否已签到）
     * @param bookingId 预定id
     * @return 签到信息（无签到则返回null）
     */
    CourseCheckIn selectCheckInByOrderId(@Param("orderId") String bookingId);
//多人的情况，获取当前课程的checkin信息
    List<CourseCheckIn> selectByScheduleId(String scheduleId);

}
