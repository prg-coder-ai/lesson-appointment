package com.classroom.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.classroom.entity.Attendance;
import com.classroom.mapper.AttendanceMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 签到与出勤核算。
 * 状态机：ABSENT → PRESENT/LATE → LEFT → REJOINED
 */
@Slf4j
@Service
public class AttendanceService {

    private final AttendanceMapper attendanceMapper;

    @Value("${classroom.late-grace-minutes:5}")
    private int lateGraceMinutes;

    public AttendanceService(AttendanceMapper attendanceMapper) {
        this.attendanceMapper = attendanceMapper;
    }

    public void checkIn(String scheduleId, String userId, LocalDateTime classStartTime) {
        Attendance existing = getOne(scheduleId, userId);
        LocalDateTime now = LocalDateTime.now();

        if (existing == null) {
            Attendance a = new Attendance();
            a.setScheduleId(scheduleId);
            a.setUserId(userId);
            boolean late = now.isAfter(classStartTime.plusMinutes(lateGraceMinutes));
            a.setAttendanceStatus(late ? "LATE" : "PRESENT");
            a.setCheckInAt(now);
            a.setEffectiveMinutes(0);
            a.setLate(late);
            a.setManualAdjust(false);
            attendanceMapper.insert(a);
            log.info("签到: scheduleId={}, userId={}, late={}", scheduleId, userId, late);
        } else if ("LEFT".equals(existing.getAttendanceStatus())) {
            existing.setAttendanceStatus("REJOINED");
            attendanceMapper.updateById(existing);
            log.info("重连签到: scheduleId={}, userId={}", scheduleId, userId);
        }
    }

    public void checkOut(String scheduleId, String userId) {
        Attendance a = getOne(scheduleId, userId);
        if (a == null) return;
        a.setCheckOutAt(LocalDateTime.now());
        if (a.getCheckInAt() != null) {
            int minutes = (int) Duration.between(a.getCheckInAt(), a.getCheckOutAt()).toMinutes();
            a.setEffectiveMinutes(Math.max(minutes, a.getEffectiveMinutes()));
        }
        a.setAttendanceStatus("LEFT");
        attendanceMapper.updateById(a);
        log.info("签退: scheduleId={}, userId={}, effectiveMinutes={}", scheduleId, userId, a.getEffectiveMinutes());
    }

    public void manualAdjust(String scheduleId, String userId, String reason) {
        Attendance a = getOne(scheduleId, userId);
        if (a == null) {
            a = new Attendance();
            a.setScheduleId(scheduleId);
            a.setUserId(userId);
            a.setAttendanceStatus("PRESENT");
            a.setEffectiveMinutes(0);
            a.setLate(false);
            a.setManualAdjust(true);
            a.setAdjustReason(reason);
            attendanceMapper.insert(a);
        } else {
            a.setManualAdjust(true);
            a.setAdjustReason(reason);
            a.setAttendanceStatus("PRESENT");
            attendanceMapper.updateById(a);
        }
    }

    public Attendance getOne(String scheduleId, String userId) {
        LambdaQueryWrapper<Attendance> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Attendance::getScheduleId, scheduleId)
               .eq(Attendance::getUserId, userId);
        return attendanceMapper.selectOne(wrapper);
    }

    public List<Attendance> listBySchedule(String scheduleId) {
        LambdaQueryWrapper<Attendance> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Attendance::getScheduleId, scheduleId);
        return attendanceMapper.selectList(wrapper);
    }
}