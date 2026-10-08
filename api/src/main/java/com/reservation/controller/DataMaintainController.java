package com.reservation.controller;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.reservation.common.CascadeRules;
import com.reservation.common.Result;
import com.reservation.entity.Appointment;
import com.reservation.entity.Booking;
import com.reservation.entity.Course;
import com.reservation.entity.CourseSchedule;
import com.reservation.mapper.CourseMapper;
import com.reservation.mapper.AppointmentMapper;
import com.reservation.mapper.BookingMapper;
import com.reservation.mapper.CourseScheduleMapper;
import com.reservation.mapper.CourseTemplateMapper;
import com.reservation.service.ReferentialCascadeService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 数据维护页「清理已删」批量物理删除接口。
 *
 * <p>业务背景：其他页面的删除多为软删（把 status 置为 frozen / delete），本 Controller 提供
 * 按类型「清理」被软删除记录的能力，物理删除 status IN ('frozen','delete') 的记录。
 *
 * <p><b>本类是悬空引用的高发入口，第 4 批已改为按依赖顺序显式级联</b>（报告根因 C）。
 * 原实现按「模板→课程→排期→预定→预约」分别独立清理，问题有三：
 * <ol>
 *   <li><b>彼此不知情</b>：清 booking 时不知道自己的课次还在，于是每清一条预订
 *       就制造一批悬空课次；而 appointment 那一步只清 status∈(frozen,delete) 的课次，
 *       仍处于 active 的课次被完全漏过——实测库里 149 行课次有 109 行 booking_id 悬空。</li>
 *   <li><b>顺序无保障</b>：五个端点可被任意顺序调用。清 course_schedule 时
 *       数据库的 ON DELETE CASCADE 会连带删掉该排期的 booking（连同它们的课次一起变孤儿），
 *       而这一步对调用方完全不可见。</li>
 *   <li><b>无法预估</b>：清理是"点一下就执行"，用户看不到会波及多少条有效数据。</li>
 * </ol>
 * 现在的做法：每一步都先按依赖顺序<b>显式</b>处理下游，再删自己——
 * appointment 排最前（它依赖 booking），booking 次之，course_schedule 再次，course 最后。
 * 这与 {@code CascadeRules} 登记的规则表一致，跨层取键由本类显式完成。
 *
 * <p>租户隔离：course / course_template / course_schedule / booking / appointment 均为租户表，
 * 租户插件（TenantLineInnerInterceptor）会自动在 DELETE 语句上追加 tenant_id 条件。
 * 而 {@link ReferentialCascadeService} 内部刻意忽略租户插件（见 CascadeMapper 注释：
 * 级联漏删不报错、只会静默留下悬空），因此租户边界由<b>入口权限</b>兜底。
 */
@RestController
@RequestMapping("/api/v1/data-maintain")
public class DataMaintainController {

    @Autowired
    private CourseMapper courseMapper;
    @Autowired
    private CourseScheduleMapper courseScheduleMapper;
    @Autowired
    private BookingMapper bookingMapper;
    @Autowired
    private AppointmentMapper appointmentMapper;
    @Autowired
    private CourseTemplateMapper courseTemplateMapper;
    @Autowired
    private ReferentialCascadeService cascadeService;

    @PostMapping("/purge/template")
    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public Result<Integer> purgeTemplate() {
        // 模板无软删状态列（course_template.status 为 active/inactive/frozen，
        // 但本端点语义是"清理已删"，模板侧的软删统一经其课程体现）。
        // 仍先展开课程链，避免删模板时课程被 CASCADE 带走而其排期/课次留成孤儿。
        List<Course> courses = courseMapper.selectList(null);
        if (courses != null && !courses.isEmpty()) {
            for (Course c : courses) {
                if (c.getCourseId() != null) {
                    cascadeService.run(CascadeRules.SCENARIO_COURSE_DELETE, c.getCourseId());
                }
            }
        }
        int rows = courseTemplateMapper.purgeDeleted();
        return Result.success(rows, "成功清理 " + rows + " 行");
    }

    @PostMapping("/purge/course")
    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public Result<Integer> purgeCourse() {
        // 先按课程逐条展开（排期 → 预订 → 课次），再删课程行。
        // 只删课程行而不管排期，排期会被数据库 CASCADE 连带删，其课次则变悬空。
        List<Course> frozen = courseMapper.selectList(
                new QueryWrapper<Course>().in("status", SOFT_DELETED));
        if (frozen != null) {
            for (Course c : frozen) {
                if (c.getCourseId() != null) {
                    cascadeService.run(CascadeRules.SCENARIO_COURSE_DELETE, c.getCourseId());
                }
            }
        }
        int rows = courseMapper.delete(
                new QueryWrapper<Course>().in("status", SOFT_DELETED));
        return Result.success(rows, "成功清理 " + rows + " 行");
    }

    @PostMapping("/purge/schedule")
    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public Result<Integer> purgeSchedule() {
        // 先把待清排期下的预订→课次清干净，再删排期行。
        List<CourseSchedule> frozen = courseScheduleMapper.selectList(
                new QueryWrapper<CourseSchedule>().in("status", SOFT_DELETED));
        if (frozen != null && !frozen.isEmpty()) {
            List<String> scheduleIds = frozen.stream()
                    .map(CourseSchedule::getScheduleId)
                    .filter(s -> s != null && !s.trim().isEmpty())
                    .collect(Collectors.toList());
            for (String scheduleId : scheduleIds) {
                List<Booking> bookings = bookingMapper.selectList(
                        new QueryWrapper<Booking>().eq("schedule_id", scheduleId));
                if (bookings != null && !bookings.isEmpty()) {
                    List<String> bookingIds = bookings.stream()
                            .map(Booking::getBookingId)
                            .filter(b -> b != null && !b.trim().isEmpty())
                            .collect(Collectors.toList());
                    // 课次先删：booking 一旦先没，就再也定位不到它的课次。
                    // 该排期下的课次可能处于任意状态（不只是 frozen），
                    // 因此按 booking_id 逐条走 BOOKING_DELETE 场景（它内部就是删课次）。
                    cascadeService.run(CascadeRules.SCENARIO_BOOKING_DELETE, bookingIds);
                }
            }
        }
        int rows = courseScheduleMapper.delete(
                new QueryWrapper<CourseSchedule>().in("status", SOFT_DELETED));
        return Result.success(rows, "成功清理 " + rows + " 行");
    }

    @PostMapping("/purge/booking")
    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public Result<Integer> purgeBooking() {
        // 先删这些预订下的<b>全部</b>课次（不只是 frozen 的），
        // 再删预订行。原实现只清 frozen 的课次，于是 active 课次被留成悬空行——
        // 这正是 109 行悬空课次的直接来源。
        List<Booking> frozen = bookingMapper.selectList(
                new QueryWrapper<Booking>().in("status", SOFT_DELETED));
        if (frozen != null && !frozen.isEmpty()) {
            List<String> bookingIds = frozen.stream()
                    .map(Booking::getBookingId)
                    .filter(b -> b != null && !b.trim().isEmpty())
                    .collect(Collectors.toList());
            // 该预订的课次可能处于任意状态（不只是 frozen），
            // 因此按 booking_id 删<b>全部</b>课次，避免留下 active 的悬空课次。
            cascadeService.run(CascadeRules.SCENARIO_BOOKING_DELETE, bookingIds);
        }
        int rows = bookingMapper.delete(
                new QueryWrapper<Booking>().in("status", SOFT_DELETED));
        return Result.success(rows, "成功清理 " + rows + " 行");
    }

    @PostMapping("/purge/appointment")
    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public Result<Integer> purgeAppointment() {
        // 课次删除前先清其通知发送流水：uk_dispatch_once 幂等键含 appointment_id，
        // 留着流水会让该课次此后的通知永远发不出去（每次插入都撞唯一键）。
        List<Appointment> frozen = appointmentMapper.selectList(
                new QueryWrapper<Appointment>().in("status", SOFT_DELETED));
        if (frozen != null && !frozen.isEmpty()) {
            List<String> apptIds = frozen.stream()
                    .map(a -> String.valueOf(a.getId()))
                    .filter(s -> !s.trim().isEmpty())
                    .collect(Collectors.toList());
            cascadeService.run(CascadeRules.SCENARIO_APPOINTMENT_DELETE, apptIds);
        }
        int rows = appointmentMapper.delete(
                new QueryWrapper<Appointment>().in("status", SOFT_DELETED));
        return Result.success(rows, "成功清理 " + rows + " 行");
    }

    /** 视为「已软删、可被物理清理」的状态集合 */
    private static final List<String> SOFT_DELETED = Arrays.asList("frozen", "delete");
}
