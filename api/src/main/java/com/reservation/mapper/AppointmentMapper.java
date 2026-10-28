package com.reservation.mapper;
import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.reservation.entity.Appointment;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

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

    int updateStatusById(@org.apache.ibatis.annotations.Param("id") Integer id,
                                @org.apache.ibatis.annotations.Param("status") String status);

    // ==================== 课堂结算专用（2026-10-28 S3） ====================
    // 全部 @InterceptorIgnore：课堂回调线程没有 TenantContext，租户插件会兜底拼
    // tenant_id = -1，导致「查询 0 行 / 更新 0 行」而**不报错**——最难查的一类静默失败。
    // 租户由调用方显式校验（课堂侧的 tenant_id 与排期 tenant_id 已比对过）。

    /** 按 (booking_id, class_index) 定位课次（课次级结算锚点） */
    @InterceptorIgnore(tenantLine = "true")
    @Select("SELECT * FROM appointment WHERE booking_id = #{bookingId} AND class_index = #{classIndex} LIMIT 1")
    Appointment selectByBookingAndClassIndex(@org.apache.ibatis.annotations.Param("bookingId") String bookingId,
                                             @org.apache.ibatis.annotations.Param("classIndex") Integer classIndex);

    /** 取该预订的首个课次（classIndex 缺省时的兼容路径） */
    @InterceptorIgnore(tenantLine = "true")
    @Select("SELECT * FROM appointment WHERE booking_id = #{bookingId} ORDER BY class_index LIMIT 1")
    Appointment selectFirstByBooking(@org.apache.ibatis.annotations.Param("bookingId") String bookingId);

    /** 无条件改状态（调用方已完成终态校验） */
    @InterceptorIgnore(tenantLine = "true")
    @Update("UPDATE appointment SET status = #{status} WHERE id = #{id}")
    int updateStatusByIdIgnoreTenant(@org.apache.ibatis.annotations.Param("id") Integer id,
                                     @org.apache.ibatis.annotations.Param("status") String status);

    /**
     * CAS 改状态：仅当当前状态等于 {@code fromStatus} 才更新。
     * 用 CAS 而不是「先读后写」：课堂回调与兜底任务可能同时到达，
     * 先读后写会让两个线程都以为自己是第一个改的人，后改的静默覆盖先改的。
     *
     * @return 1=改成功；0=状态已被别人改过（按幂等处理即可）
     */
    @InterceptorIgnore(tenantLine = "true")
    @Update("UPDATE appointment SET status = #{toStatus} WHERE id = #{id} AND status = #{fromStatus}")
    int casStatusIgnoreTenant(@org.apache.ibatis.annotations.Param("id") Integer id,
                              @org.apache.ibatis.annotations.Param("fromStatus") String fromStatus,
                              @org.apache.ibatis.annotations.Param("toStatus") String toStatus);

   /* int getCountBetweenTimeByPage(
            String userId, String role,
             java.sql.Timestamp startTime, java.sql.Timestamp endTime,   
            String status);
            */
    /**
     * 根据bookingId删除预约时间
     * @param bookingId 预约id
     * @return 删除的记录数
     */
}