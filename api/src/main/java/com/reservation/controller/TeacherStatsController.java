package com.reservation.controller;

import com.reservation.common.BookingStatus;
import com.reservation.common.Result;
import com.reservation.mapper.TeacherStatsMapper;
import com.reservation.utils.PermissionCheck;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 教师端「个人中心」概览统计。
 *
 * <p>接口：{@code GET /api/v1/teacher/stats/summary}
 *
 * <p>返回当前登录教师本人名下的四项指标：
 * <ul>
 *   <li>{@code courseCount} —— 我的课程数量</li>
 *   <li>{@code scheduleCount} —— 我的排期数量</li>
 *   <li>{@code bookedStudentCount} —— 预订过我排期的学生人数（按学生去重，不含候补/已取消/被拒/删除）</li>
 *   <li>{@code monthCompletedCount} —— 本月已完成的课次数</li>
 * </ul>
 *
 * <p>教师 ID 一律取自 Token（{@code PermissionCheck#getUserIdFromToken}），不接受前端传参，
 * 避免教师查看他人数据。管理员令牌也能访问，但统计对象仍是其本账号（通常为空），
 * 该端点服务于教师端页面，不做「管理员代查教师」的扩展。
 *
 * <p>「本月」按调用方时区计算（前端传 {@code userTimeZone}，如 Asia/Shanghai），
 * 再换算成 UTC 时间窗去查 appointment 表（该校时间列已 UTC 化）。
 */
@RestController
@RequestMapping("/api/v1/teacher/stats")
public class TeacherStatsController {

    @Autowired
    private TeacherStatsMapper teacherStatsMapper;

    @Autowired
    private PermissionCheck permissionCheck;

    @GetMapping("/summary")
    public Result<Map<String, Object>> summary(
            @RequestParam(value = "userTimeZone", required = false) String userTimeZone,
            @RequestHeader("Authorization") String token) {
        // 路径层已声明 TEACHER_OR_ADMIN，此处为方法级兜底（与全仓既有做法一致）
        permissionCheck.checkTeacherOrAdmin(token);
        String teacherId = permissionCheck.getUserIdFromToken(token);
        if (teacherId == null || teacherId.trim().isEmpty()) {
            return Result.fail(401, "登录信息缺失，请重新登录");
        }

        ZoneId zone = resolveZone(userTimeZone);
        LocalDate monthStart = LocalDate.now(zone).withDayOfMonth(1);
        LocalDate nextMonthStart = monthStart.plusMonths(1);
        LocalDateTime fromUtc = monthStart.atStartOfDay(zone).withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime();
        LocalDateTime toUtc = nextMonthStart.atStartOfDay(zone).withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime();

        List<String> excludedStatuses = new ArrayList<>(BookingStatus.NON_OCCUPYING);
        excludedStatuses.add(BookingStatus.DELETE);

        Map<String, Object> data = new HashMap<>();
        data.put("courseCount", teacherStatsMapper.countCoursesByTeacher(teacherId));
        data.put("scheduleCount", teacherStatsMapper.countSchedulesByTeacher(teacherId));
        data.put("bookedStudentCount", teacherStatsMapper.countBookedStudentsByTeacher(teacherId, excludedStatuses));
        data.put("monthCompletedCount", teacherStatsMapper.countCompletedLessonsByTeacher(teacherId, fromUtc, toUtc));
        data.put("month", monthStart.getYear() + "-" + String.format("%02d", monthStart.getMonthValue()));
        return Result.success(data, "查询成功");
    }

    /** 时区解析：非法或为空时退回服务器默认时区，不能让统计因前端传错时区而整体失败 */
    private ZoneId resolveZone(String userTimeZone) {
        if (userTimeZone == null || userTimeZone.trim().isEmpty()) {
            return ZoneId.systemDefault();
        }
        try {
            return ZoneId.of(userTimeZone.trim());
        } catch (Exception e) {
            return ZoneId.systemDefault();
        }
    }
}
