package com.reservation.service; 

//import com.baomidou.mybatisplus.extension.service.IService;
import org.springframework.transaction.annotation.Transactional;
import com.reservation.entity.Appointment;

import java.util.List;

import org.springframework.stereotype.Service;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
//import com.reservation.entity.Appointment;
import com.reservation.mapper.AppointmentMapper;
//import java.time.LocalDateTime;

@Service
public class AppointmentService extends ServiceImpl<AppointmentMapper, Appointment> {

    // 批量插入Appointment对象到数据库
    @Transactional(rollbackFor = Exception.class)
    public void insertAppointmentList(List<Appointment> appointmentList) {
        if (appointmentList == null || appointmentList.isEmpty()) {
            return;
        }
        this.saveBatch(appointmentList);
    }
    // ==================== 自定义查询方法 ====================
    /**
     * 根据 bookingId 查询所有预约记录
     */
    public List<Appointment> getByBookingId(String bookingId) {
        return lambdaQuery()
                .eq(Appointment::getBookingId, bookingId)
                .orderByAsc(Appointment::getAppointmentDatetime)
                .list();
           
    }

    /**
     * 根据状态查询
     */
    public List<Appointment> getByStatus(String status) {
        return lambdaQuery()
                .eq(Appointment::getStatus, status)
                .list();
    }

    /**
     * 查询某个时间段内的预约
     */
    public List<Appointment> getBetweenTime(java.sql.Timestamp startTime, java.sql.Timestamp endTime,    
                String sortField,
                String sortOrder) { 
        // 将 startTime、endTime 格式化为 "yyyy-MM-dd HH:mm:ss"
        java.time.format.DateTimeFormatter formatter = java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
        String formattedStart = startTime.toLocalDateTime().format(formatter);
        String formattedEnd = endTime.toLocalDateTime().format(formatter);
        // 支持动态排序：将排序参数带入lambdaQuery
        // sortField和sortOrder是参数（假定sortField为数据库字段名字符串，sortOrder为"asc"/"desc"）
        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Appointment> queryWrapper = 
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Appointment>()
                    .between(Appointment::getAppointmentDatetime, formattedStart, formattedEnd);
           

        // 按需求将字段字符串动态映射到对应的属性，再做排序
        // 可以只支持常用字段，避免SQL注入   // 其它可扩展字段排序逻辑...
        // 检查多个字段排序，修正写法，保证 queryWrapper 为 LambdaQueryWrapper，可链式多字段排序
        // 1. 支持 appointmentDatetime、bookingId、status 三个字段，多字段传入时，sortField 可为逗号分隔字符串
        // 2. 每种排序用 orderBy(true, ...) 方式链式追加
        if (sortField != null && !sortField.isEmpty()) {
            String[] fields = sortField.split(",");
            for (String field : fields) {
                field = field.trim();
                if ("appointmentDatetime".equals(field)) {
                    queryWrapper = "asc".equalsIgnoreCase(sortOrder)
                            ? queryWrapper.orderByAsc(Appointment::getAppointmentDatetime)
                            : queryWrapper.orderByDesc(Appointment::getAppointmentDatetime);
                } else if ("bookingId".equals(field) || "bookId".equals(field)) { // bookId 校正为 bookingId
                    queryWrapper = "asc".equalsIgnoreCase(sortOrder)
                            ? queryWrapper.orderByAsc(Appointment::getBookingId)
                            : queryWrapper.orderByDesc(Appointment::getBookingId);
                } else if ("status".equals(field)) {
                    queryWrapper = "asc".equalsIgnoreCase(sortOrder)
                            ? queryWrapper.orderByAsc(Appointment::getStatus)
                            : queryWrapper.orderByDesc(Appointment::getStatus);
                }
                // 其它字段可以继续扩展
            }
        }
        return this.list(queryWrapper);
   
    }

     public int  getCountBetweenTime(java.sql.Timestamp startTime, java.sql.Timestamp endTime) {

       Long result =  lambdaQuery()
                .between(Appointment::getAppointmentDatetime,     startTime, endTime)
                .count();
         return result == null ? 0 : result.intValue();
    }
 
  /* 
   Long result = lambdaQuery()
            .ge(Appointment::getAppointmentDatetime, startTs.toLocalDateTime())
            .le(Appointment::getAppointmentDatetime, endTs.toLocalDateTime())
            .in(Appointment::getStatus, statuses)
            .count();
    return result == null ? 0 : result.intValue();
  
   public boolean saveBatch(List<Appointment> lists){ 
    boolean allSuccess = true;
    for (Appointment appointment : lists) {
        boolean success = this.add(appointment);
        if (!success) {
            allSuccess = false;
        }
    }
    return allSuccess;
    }*/
     @Transactional
    public boolean updateStatusByBookingId(String bookingId,String status){

    // 调用 AppointmentMapper 的 updateStatusByBookingId 方法
    int updated = baseMapper.updateStatusByBookingId(bookingId, status);
    return updated > 0;
    }

      @Transactional
    public boolean updateStatusById(String id,String status){ 
    int updated = baseMapper.updateStatusById(id, status);
    return updated > 0;
    }

    public boolean removeByBookingId(String bookingId){
        System.out.println("removeByBookingId: " + bookingId);
        int deleted = baseMapper.deleteByBookingId(bookingId);
        return deleted > 0;
    }

// INSERT_YOUR_CODE

/** 可计算下月、预约量 、下周？
 * 查询指定时间段内指定状态下的预约数量 而不是按创建时间统计。
 * @param startTime 开始时间（java.sql.Timestamp 或 java.time.LocalDateTime 皆可）
 * @param endTime 结束时间
 * @param statuses 状态列表，如 Arrays.asList("approved", "completed")
 * @return 满足条件的预约数量
 */
// 这个方法属于业务逻辑范畴，应该定义在Service层（即这里），而不是Mapper。
// Mapper 通常只定义 SQL 级别的操作（如自定义SQL、复杂join等），而用lambdaQuery/链式查询器的操作是 MyBatis-Plus 通用的，无需重复写Mapper方法。
// 
// 若需更复杂的SQL或跨表统计，再考虑写在 Mapper。当前写在 Service 合理。 
/** 
 * 统计指定时间段及状态下的预约数量，返回long类型，避免类型转换报错
 * @param startTime 开始时间
 * @param endTime 结束时间
 * @param statuses 状态列表
 * @return 满足条件的预约数量（long类型）
 */
/*public int countLongByTimeAndStatuses(Object startTime, Object endTime,  java.util.List<String> statuses) {
    // 使用 lambdaQuery 构建查询，返回long
    Long result= lambdaQuery()
            .ge(Appointment::getAppointmentDatetime, startTime.toLocalDateTime())
            .le(Appointment::getAppointmentDatetime, endTime.toLocalDateTime())
            .in(Appointment::getStatus, statuses)
            .count();

          return    result == null ? 0 : result.intValue();
}
*/


/**
 * 统计指定时间段以及状态下的预约数量（int）
 * 用于Controller直接调用，参数可以为 LocalDateTime 或 Timestamp，内部统一为 Timestamp 以便数据库查询。
 *
 * @param startTime 开始时间（java.time.LocalDateTime 或 java.sql.Timestamp）
 * @param endTime 结束时间
 * @param statuses 状态列表
 * @return 数量（int类型），适合 Controller 层调用
 */
public int countByTimeAndStatuses(Object startTime, Object endTime, java.util.List<String> statuses) {
    java.sql.Timestamp startTs, endTs;
    if (startTime instanceof java.sql.Timestamp) {
        startTs = (java.sql.Timestamp) startTime;
    } else if (startTime instanceof java.time.LocalDateTime) {
        startTs = java.sql.Timestamp.valueOf((java.time.LocalDateTime) startTime);
    } else {
        throw new IllegalArgumentException("startTime类型不支持: " + startTime.getClass());
    }
    if (endTime instanceof java.sql.Timestamp) {
        endTs = (java.sql.Timestamp) endTime;
    } else if (endTime instanceof java.time.LocalDateTime) {
        endTs = java.sql.Timestamp.valueOf((java.time.LocalDateTime) endTime);
    } else {
        throw new IllegalArgumentException("endTime类型不支持: " + endTime.getClass());
    }

    Long result = lambdaQuery()
            .ge(Appointment::getAppointmentDatetime, startTs.toLocalDateTime())
            .le(Appointment::getAppointmentDatetime, endTs.toLocalDateTime())
            .in(Appointment::getStatus, statuses)
            .count();
    return result == null ? 0 : result.intValue();
}

}