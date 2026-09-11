
// 生成 BookingMapper 接口
package com.reservation.mapper;

import com.reservation.common.*; //PageResult ,PageQuery
import com.reservation.entity.Booking;
import com.reservation.dto.BookingQueryParaDTO;
import com.reservation.query.BookingQueryPage;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
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

    /**
     * 统计某排期下「占用席位」的预订数量。
     *
     * @param scheduleId       排期ID
     * @param excludedStatuses 视为「不占席位」的状态集合（见 {@link com.reservation.common.BookingStatus#NON_OCCUPYING}）；
     *                         为 null 时不排除任何状态
     * @param excludeBookingId 需要排除的预订ID（改订/递补时排除自身）；可为 null
     * @return 占用席位的预订数
     */
    int countBookingByScheduleId(@Param("scheduleId") String scheduleId,
                                 @Param("excludedStatuses") List<String> excludedStatuses,
                                 @Param("excludeBookingId") String excludeBookingId);

    /**
     * 以「锁定读」取出某排期下占用席位的 booking_id 列表（排除 excludeBookingId 自身）。
     *
     * <p>为什么不用 COUNT(*) + FOR UPDATE：聚合与锁定子句的组合在部分 MySQL 版本上不被允许；
     * 先锁行、再在内存里数，语义一致且通用。
     * 为什么必须是锁定读：普通 SELECT 走事务快照（REPEATABLE READ 下在事务首次普通读时定格），
     * 并发时后到的事务会读到旧快照里的“还有空位”，从而双双通过名额校验 → 超额。
     */
    List<String> selectOccupyingBookingIdsForUpdate(@Param("scheduleId") String scheduleId,
                                                    @Param("excludedStatuses") List<String> excludedStatuses,
                                                    @Param("excludeBookingId") String excludeBookingId);

    /**
     * 查询某排期的候补队列，按申请时间升序（先来先得）。
     * create_time 只精确到秒，故以 booking_id 作为稳定次序的次级排序键。
     */
    List<Booking> selectWaitlistByScheduleId(@Param("scheduleId") String scheduleId);

    /**
     * 带前置状态校验的状态更新（CAS）：仅当当前状态等于 fromStatus 时才更新。
     * 用于并发递补——影响行数为 0 即代表已被他人抢先处理。
     *
     * @return 影响行数（1=更新成功，0=当前状态不匹配或记录不存在）
     */
    int updateStatusIfCurrent(@Param("bookingId") String bookingId,
                              @Param("fromStatus") String fromStatus,
                              @Param("toStatus") String toStatus);

    /**
     * 查询某学生在某排期下最近的一条预订记录（用于复用已有记录、避免重复占位）。
     */
    Booking selectLatestByScheduleAndStudent(@Param("scheduleId") String scheduleId,
                                             @Param("studentId") String studentId);

    /** 某学生已约课(去重)的教师 userId 列表（用于消息中心「我的教师」） */
    @InterceptorIgnore(tenantLine = "true")
    @Select("SELECT DISTINCT teacher_id FROM booking WHERE student_id = #{studentId} AND tenant_id = #{tenantId}")
    List<String> selectTeacherIdsByStudent(@Param("studentId") String studentId, @Param("tenantId") Long tenantId);

    /** 某教师已约课(去重)的学生 userId 列表（用于消息中心「我的学生」） */
    @InterceptorIgnore(tenantLine = "true")
    @Select("SELECT DISTINCT student_id FROM booking WHERE teacher_id = #{teacherId} AND tenant_id = #{tenantId}")
    List<String> selectStudentIdsByTeacher(@Param("teacherId") String teacherId, @Param("tenantId") Long tenantId);

    /** 按 booking_id 查询（忽略租户隔离，供消息自动发送跨租户解析发送对象） */
    @InterceptorIgnore(tenantLine = "true")
    @Select("SELECT * FROM booking WHERE booking_id = #{id}")
    Booking selectByIdIgnoreTenant(@Param("id") String id);

    // 以下可根据实际需要扩展
} 