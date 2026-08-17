package com.reservation.service; 

//import com.baomidou.mybatisplus.extension.service.IService;
import org.springframework.transaction.annotation.Transactional;
import com.reservation.entity.Appointment;
import com.reservation.entity.Booking;
import com.reservation.dto.BookingQueryParaDTO;
import com.reservation.mapper.BookingMapper;

import com.reservation.common.*;
import com.reservation.query.*;
 import com.baomidou.mybatisplus.extension.plugins.pagination.Page;

 import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
 import com.baomidou.mybatisplus.core.toolkit.Wrappers;
  
import java.util.List;

import jakarta.annotation.Resource;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.reservation.mapper.AppointmentMapper;
//import java.time.LocalDateTime;

@Slf4j
@Service
public class AppointmentService extends ServiceImpl<AppointmentMapper, Appointment> {

    @Resource
    private BookingMapper bookingMapper;

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
    public List<Appointment> getBetweenTime(String userId, String role,
                java.sql.Timestamp startTime, java.sql.Timestamp endTime,    
                String sortField, String sortOrder) { 
        // 先判断 userId 和 role 是否均不为空
        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Appointment> queryWrapper;

        List<String> bookingIdList = null;
        if (userId != null && !userId.isEmpty() && role != null && !role.isEmpty()) {
            // 按角色，从 booking 表查出对应 bookingId
            if ("teacher".equalsIgnoreCase(role) || "student".equalsIgnoreCase(role)) {
                BookingQueryParaDTO queryPara = new BookingQueryParaDTO();
                queryPara.setUserRole(role.toLowerCase());
                queryPara.setUserId(userId);
                bookingIdList = bookingMapper.selectList(queryPara).stream()
                        .map(Booking::getBookingId)
                        .toList();
            }
            // bookingIdList 不为空则查这些bookingId，否则查空
            if (bookingIdList != null && !bookingIdList.isEmpty()) {
                queryWrapper = new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Appointment>()
                        .in(Appointment::getBookingId, bookingIdList)
                        .between(Appointment::getAppointmentDatetime, startTime, endTime);
            } else {
                // 没有相关预约，直接查空
                queryWrapper = new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Appointment>() 
                        .between(Appointment::getAppointmentDatetime, startTime, endTime);
            }
        } else {
            // userId/role任一为空，则只按时间过滤
            queryWrapper = new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Appointment>()
                    .between(Appointment::getAppointmentDatetime, startTime, endTime);
        }

        // 按需排序
        if (sortField != null && !sortField.isEmpty()) {
            String[] fields = sortField.split(",");
            for (String field : fields) {
                field = field.trim();
                if ("appointmentDatetime".equalsIgnoreCase(field)) {
                    queryWrapper = "asc".equalsIgnoreCase(sortOrder)
                            ? queryWrapper.orderByAsc(Appointment::getAppointmentDatetime)
                            : queryWrapper.orderByDesc(Appointment::getAppointmentDatetime);
                } else if ("bookingId".equalsIgnoreCase(field) || "bookId".equalsIgnoreCase(field)) {
                    queryWrapper = "asc".equalsIgnoreCase(sortOrder)
                            ? queryWrapper.orderByAsc(Appointment::getBookingId)
                            : queryWrapper.orderByDesc(Appointment::getBookingId);
                } else if ("status".equalsIgnoreCase(field)) {
                    queryWrapper = "asc".equalsIgnoreCase(sortOrder)
                            ? queryWrapper.orderByAsc(Appointment::getStatus)
                            : queryWrapper.orderByDesc(Appointment::getStatus);
                }
                // 可扩展其它字段
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
    //

    public PageResult<Appointment> getBetweenTimeByPage(String userId, String role,
                java.sql.Timestamp startTime, java.sql.Timestamp endTime,    
                                int pageNum,int pageSize,
                String status) { 
        // 先判断 userId 和 role 是否均不为空
        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Appointment> queryWrapper;

        List<String> bookingIdList = null;
        if (userId != null && !userId.isEmpty() && role != null && !role.isEmpty()) {
            // 按角色，从 booking 表查出对应 bookingId
            if ("teacher".equalsIgnoreCase(role) || "student".equalsIgnoreCase(role)) {
                BookingQueryParaDTO queryPara = new BookingQueryParaDTO();
                queryPara.setUserRole(role.toLowerCase());
                queryPara.setUserId(userId);
                bookingIdList = bookingMapper.selectList(queryPara).stream()
                        .map(Booking::getBookingId)
                        .toList();
            }
            // bookingIdList 不为空则查这些bookingId，否则查空
            if (bookingIdList != null && !bookingIdList.isEmpty()) {
                queryWrapper = new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Appointment>()
                        .in(Appointment::getBookingId, bookingIdList)
                        .between(Appointment::getAppointmentDatetime, startTime, endTime)
                        .eq(status != null && !status.isEmpty(), Appointment::getStatus, status) 
                        .orderByDesc(Appointment::getAppointmentDatetime)                                     
                        .last("LIMIT " + ((pageNum - 1) * pageSize) + "," + pageSize);
    
                   
            } else {
                // 没有相关预约，直接查空
                queryWrapper = new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Appointment>() 
                        .between(Appointment::getAppointmentDatetime, startTime, endTime)
                        .eq(status != null && !status.isEmpty(), Appointment::getStatus, status)             
                        .orderByDesc(Appointment::getAppointmentDatetime)                                     
                        .last("LIMIT " + ((pageNum - 1) * pageSize) + "," + pageSize);
    
            }
        } else {
            // userId/role任一为空，则只按时间过滤
            queryWrapper = new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Appointment>()
                    .between(Appointment::getAppointmentDatetime, startTime, endTime)                                                      
                     .eq(status != null && !status.isEmpty(), Appointment::getStatus, status)             
                     .orderByDesc(Appointment::getAppointmentDatetime)
                    .last("LIMIT " + ((pageNum - 1) * pageSize) + "," + pageSize);
        } 

        Page<Appointment> page = new Page<>(pageNum, pageSize);
        page.setRecords(list(queryWrapper));

        Integer total = getCountBetweenTimeByPage(
             userId, role,
             startTime, endTime,   
             status);
        page.setTotal(total);
        PageResult<Appointment> result = PageResult.of(page);
        return result ;
    }

     public int  getCountBetweenTimeByPage(
                String userId, String role,
                java.sql.Timestamp startTime, java.sql.Timestamp endTime,                   
                String status)  {
                    
        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Appointment> queryWrapper;
        List<String> bookingIdList = null;
        if (userId != null && !userId.isEmpty() && role != null && !role.isEmpty()) {
            // 按角色，从 booking 表查出对应 bookingId
            if ("teacher".equalsIgnoreCase(role) || "student".equalsIgnoreCase(role)) {
                BookingQueryParaDTO queryPara = new BookingQueryParaDTO();
                queryPara.setUserRole(role.toLowerCase());
                queryPara.setUserId(userId);
                bookingIdList = bookingMapper.selectList(queryPara).stream()
                        .map(Booking::getBookingId)
                        .toList();
            }
            // bookingIdList 不为空则查这些bookingId，否则查空
             
            if (bookingIdList != null && !bookingIdList.isEmpty()) {
                queryWrapper = new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Appointment>()
                        .in(Appointment::getBookingId, bookingIdList)
                        .between(Appointment::getAppointmentDatetime, startTime, endTime)
                        .eq(status != null && !status.isEmpty(), Appointment::getStatus, status) ;
                         
            } else {
                // 没有相关预约，直接查空
                queryWrapper = new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Appointment>() 
                        .between(Appointment::getAppointmentDatetime, startTime, endTime)
                        .eq(status != null && !status.isEmpty(), Appointment::getStatus, status)  ;         
             
            }
        } else {
            // userId/role任一为空，则只按时间过滤
            queryWrapper = new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Appointment>()
                    .between(Appointment::getAppointmentDatetime, startTime, endTime)
                    .eq(status != null && !status.isEmpty(), Appointment::getStatus, status) ;            
                                                          
               } 
          Long result = baseMapper.selectCount(queryWrapper);
 
         return result == null ? 0 : result.intValue();
    }


    
    public PageResult<Appointment> listByPage( int pageNum,int pageSize, 
                String status) {  
 //查询预约列表,分页查询    ,根据userId,role,状态查询
        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Appointment> queryWrapper; 
       
            queryWrapper = new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Appointment>()
                    .eq(status != null && !status.isEmpty(), Appointment::getStatus, status)
                    .orderByDesc(Appointment::getAppointmentDatetime)
                    .last("LIMIT " + ((pageNum - 1) * pageSize) + "," + pageSize);
        
        Page<Appointment> page = new Page<>(pageNum, pageSize);
        page.setRecords(list(queryWrapper));

        Integer total = getCountByPage( 
             status);
        page.setTotal(total);
        PageResult<Appointment> result = PageResult.of(page);
        return result ;
    }

     public int  getCountByPage(      
                String status)  {
                    
        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Appointment> queryWrapper; 
            // userId/role任一为空，则只按时间过滤
            queryWrapper = new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Appointment>() 
                    .eq(status != null && !status.isEmpty(), Appointment::getStatus, status) ;    
          Long result = baseMapper.selectCount(queryWrapper);
 
         return result == null ? 0 : result.intValue();
    }
    // 
     @Transactional
    public boolean updateStatusByBookingId(String bookingId,String status){

    // 调用 AppointmentMapper 的 updateStatusByBookingId 方法
    int updated = baseMapper.updateStatusByBookingId(bookingId, status);
    return updated > 0;
    }

      @Transactional
    public boolean updateStatusById(Integer id,String status){ 
    int updated = baseMapper.updateStatusById(id, status);
    return updated > 0;
    }

public boolean removeById(Integer appId){
        log.info("删除预约时间开始, appointmentId={}", appId);
        int deleted = baseMapper.deleteById(appId);
        log.info("删除预约时间结束, appointmentId={}, 影响行数={}", appId, deleted);
        return deleted > 0;
    }

    public boolean removeByBookingId(String bookingId){
        log.info("按预约ID批量删除预约时间开始, bookingId={}", bookingId);
        int deleted = baseMapper.deleteByBookingId(bookingId);
        log.info("按预约ID批量删除预约时间结束, bookingId={}, 影响行数={}", bookingId, deleted);
        return deleted > 0;
    } 
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