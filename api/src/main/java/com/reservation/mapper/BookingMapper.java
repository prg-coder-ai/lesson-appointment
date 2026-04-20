
// 生成 BookingMapper 接口
package com.reservation.mapper;

import com.reservation.entity.Booking;
import com.reservation.entity.BookingQueryParaDTO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface BookingMapper {
    // 插入一条新预约
    int insert(Booking booking);

    // 更新预约信息
    int update(Booking booking);

    // 根据ID变更状态
    int updateStatus(@Param("id") String id, @Param("status") String status);

    // 根据ID查询
    Booking selectById(@Param("id") String id);

    // 条件批量查询
    List<Booking> selectList(BookingQueryParaDTO dto);

    // 删除预约
    int delete(@Param("id") String id);

    // 以下可根据实际需要扩展
} 