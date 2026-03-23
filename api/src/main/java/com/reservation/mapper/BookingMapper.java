package src.main.java.com.reservation.mapper;

import src.main.java.com.reservation.entity.Booking;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * BookingMapper接口，对应booking表CRUD操作，匹配BookingService中的方法
 * 注意：booking表设计为存储学生预约课程的记录，包含booking_id、user_id、course_id等字段，具体字段设计可根据实际需求调整
 * 该接口主要负责学生预约课程相关的数据库操作，如插入预约记录、查询预约记录等，严格按照设计2.2.1 学生预约课程模块的业务逻辑进行实现，确保数据一致性和完整性 
 * 后续可根据需求添加其他方法，如查询学生的预约列表、查询课程的预约列表等
 * 
 */
@Mapper
public interface BookingMapper {
    //根据BookingService中的方法设计，定义对应的数据库操作方法，确保与BookingService中的业务逻辑相匹配

    /**
     * 插入预约记录（学生预约课程时调用）
     * @param booking 预约实体，包含userId、courseId等信息
     * @return 影响行数
     */    int insertBooking(Booking booking);

     //查询
    Booking selectBookingById(String id);
    //删除
    int deleteBookingById(String bookingId);
}
