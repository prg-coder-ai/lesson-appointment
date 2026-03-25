package src.main.java.com.reservation.service;

import src.main.java.com.reservation.entity.CourseQueryParam;
import src.main.java.com.reservation.entity.Schedule;
import src.main.java.com.reservation.entity.Booking;
import src.main.java.com.reservation.exception.BusinessException;
import src.main.java.com.reservation.exception.ResourceNotFoundException;
import src.main.java.com.reservation.mapper.BookingMapper;
import src.main.java.com.reservation.mapper.CourseMapper;
import src.main.java.com.reservation.utils.JwtUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.text.ParseException;
import java.util.*;
import java.text.SimpleDateFormat;

/**
 * BookingService服务，对应设计2.2.1 所有接口的业务逻辑，主要负责学生预约课程相关的业务逻辑
 */
@Service
public class BookingService {

    @Autowired
    private BookingMapper bookingMapper;
    @Autowired
    private CourseMapper courseMapper ;
    @Autowired
    private JwtUtil jwtUtil;

    private static final SimpleDateFormat COURSE_DATE_FORMAT = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
    // 学生预约课程（对应设计2.2.1 学生预约课程接口）

    @Transactional
    public void BookingCourse(Schedule schedual) {
            // 校验订单ID是否已存在（对应业务异常校验）
        // 生成唯一bookingId（对应通用校验规则-ID类参数）
        Booking booking = new Booking();
        booking.setBookingId(UUID.randomUUID().toString());
        //获取当前用户ID（对应通用校验规则-用户身份校验） 
        String userId = jwtUtil.getCurrentUserId();
        booking.setStudentId(userId);
        //huoqu课程ID（对应通用校验规则-课程ID校验）
        booking.setScheduleId(schedual.getCourseId());
        // 插入数据库
        bookingMapper.insertBooking(booking);
    }
    //删除预约课程（对应设计2.2.1 学生取消预约接口）
    @Transactional
    public void cancelBooking(String bookingId) {
        // 校验订单ID是否存在（对应资源未找到异常校验）
        if (bookingMapper.selectBookingById(bookingId) == null) {
            throw new ResourceNotFoundException("该订单ID不存在");
        }
        // 删除预约记录
        bookingMapper.deleteBookingById(bookingId);
    }
        /**
     * 学生查询课程列表，对应设计2.2.3 接口：/api/v1/course/student/list
     */
    public List<Map<String, Object>> getCourseList(CourseQueryParam queryParam) {
        // 校验时间参数（若有），对应通用校验规则-时间参数
        if (queryParam.getStartTime() != null && queryParam.getEndTime() != null) {
            Date start =  queryParam.getStartTime();
            Date end =  queryParam.getEndTime();
            if (start.after(end)) {
                throw new BusinessException("开始时间不能晚于结束时间");
            }
        }
        // 调用mapper查询课程列表，关联课程、教师、排期信息（对应设计2.2.3 功能说明）

        return courseMapper.selectCourseListByStudent(queryParam);
    }

 
}