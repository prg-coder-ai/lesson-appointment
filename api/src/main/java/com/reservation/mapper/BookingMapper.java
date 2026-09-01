
// 生成 BookingMapper 接口
package com.reservation.mapper;

import com.reservation.common.*; //PageResult ,PageQuery
import com.reservation.entity.Booking;
import com.reservation.dto.BookingQueryParaDTO;
import com.reservation.query.BookingQueryPage;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
 
import java.util.List;

@Mapper
public interface BookingMapper extends BaseMapper<Booking>{
    // 插入一条新预约
    //int insert(Booking booking);

    // 更新预约信息
   // int update(Booking booking);

    // 根据ID变更状态
    int updateStatus(@Param("bookingId") String bookingId, @Param("status") String status);

    // 根据ID查询：与mybatis重复，此处无需定义

    // 条件批量查询（入参为DTO而非Wrapper，必须独立命名，否则会覆盖 BaseMapper.selectList）
    List<Booking> selectByCondition(BookingQueryParaDTO dto);

    List <Booking> selectListPage(BookingQueryPage dto);
    int            selectCountByCondition(BookingQueryPage dto);

    // 删除预约
  //  int delete(@Param("bookingId") String bookingId);
    
    //int deleteByScheduleIde(@Param("scheduleId") String scheduleId);
    // INSERT_YOUR_CODE
    /**
     * 统计截至指定时间（含当时）所有预约（Booking）的数量，可指定状态。
     * @param dateTime 截止时间（精确到秒，包含当天该时刻）
     * @param status 预定状态（如"booked"/"active"/"cancelled"等；可据业务自定义）
     * @return 截至该时间的指定状态预约数量
     */
    int countBookingAtDate(@Param("dateTimeFrom") java.sql.Timestamp dateTimeFrom, @Param("dateTimeTo") java.sql.Timestamp dateTimeTo,@Param("status") String status);

    int deleteByScheduleId(@Param("scheduleId") String scheduleId); 
    
    int countBookingByScheduleId(@Param("scheduleId") String scheduleId);
    
    // 以下可根据实际需要扩展
} 