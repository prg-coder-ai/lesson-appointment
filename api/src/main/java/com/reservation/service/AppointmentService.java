package com.reservation.service; 

import com.baomidou.mybatisplus.extension.service.IService;
import org.springframework.transaction.annotation.Transactional;
import com.reservation.entity.Appointment;

import java.util.List;

import org.springframework.stereotype.Service;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.reservation.entity.Appointment;
import com.reservation.mapper.AppointmentMapper;
import java.time.LocalDateTime;

@Service
public class AppointmentService extends ServiceImpl<AppointmentMapper, Appointment> {
    // ==================== 自定义查询方法 ====================
    /**
     * 根据 bookingId 查询所有预约记录
     */
    public List<Appointment> getByBookingId(String bookingId) {
        return lambdaQuery()
                .eq(Appointment::getBookingId, bookingId)
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
    public List<Appointment> getBetweenTime(String startTime, String endTime) {
        return lambdaQuery()
                .between(Appointment::getAppointmentDatetime,
                        LocalDateTime.parse(startTime),
                        LocalDateTime.parse(endTime))
                .list();
    }


  /*  public boolean saveBatch(List<Appointment> lists){ 
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
}