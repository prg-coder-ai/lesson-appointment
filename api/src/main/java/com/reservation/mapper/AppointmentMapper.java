package com.reservation.mapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.reservation.entity.Appointment;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface AppointmentMapper extends BaseMapper<Appointment> {
    // 自带CRUD，无需手写方法

    /**
     * 根据bookingId批量更新appointment表的status字段
     * @param bookingId 预约id
     * @param status    要更新到的状态
     * @return 更新的记录数
     */
    
    int updateStatusByBookingId(@org.apache.ibatis.annotations.Param("bookingId") String bookingId, 
                                @org.apache.ibatis.annotations.Param("status") String status); 
     
    int deleteByBookingId(@org.apache.ibatis.annotations.Param("bookingId") String bookingId); 
    /**
     * 根据bookingId删除预约时间
     * @param bookingId 预约id
     * @return 删除的记录数
     */
}