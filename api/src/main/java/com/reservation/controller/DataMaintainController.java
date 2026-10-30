package com.reservation.controller;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.reservation.common.CascadeRules;
import com.reservation.common.Result;
import com.reservation.entity.Appointment;
import com.reservation.entity.User;
import com.reservation.entity.Booking;
import com.reservation.entity.Course;
import com.reservation.entity.CourseSchedule;
import com.reservation.mapper.CourseMapper;
import com.reservation.mapper.AppointmentMapper;
import com.reservation.mapper.BookingMapper;
import com.reservation.mapper.CourseScheduleMapper;
import com.reservation.mapper.CourseTemplateMapper;
import com.reservation.mapper.UserMapper;
import com.reservation.service.ReferentialCascadeService;
import com.reservation.utils.PermissionCheck;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
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
    private UserMapper userMapper;
    @Autowired
    private ReferentialCascadeService cascadeService;
    @Autowired
    private PermissionCheck permissionCheck;

    @PostMapping("/purge/template")
    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public Result<Integer> purgeTemplate(@RequestHeader("Authorization") String token) {
        // 方法级兜底（2026-10-10 P1-4）：对齐 AuthzRules 声明 PLATFORM_OR_TENANT_ADMIN。
        // 本类注释所述"租户边界由入口权限兜底"即指此处——物理删除必须双闸（声明式 + 方法级）。
        permissionCheck.checkAdmin(token);
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
    public Result<Integer> purgeCourse(@RequestHeader("Authorization") String token) {
        permissionCheck.checkAdmin(token);
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
    public Result<Integer> purgeSchedule(@RequestHeader("Authorization") String token) {
        permissionCheck.checkAdmin(token);
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
    public Result<Integer> purgeBooking(@RequestHeader("Authorization") String token) {
        permissionCheck.checkAdmin(token);
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
    public Result<Integer> purgeAppointment(@RequestHeader("Authorization") String token) {
        permissionCheck.checkAdmin(token);
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

    /**
     * 清理「已软删」的用户：把 status='delete' 的账号<b>物理删除</b>。
     *
     * <p>与其余 purge 端点同一套双闸写法（AuthzRules 声明 + 方法级 {@code checkAdmin}）。
     *
     * <p><b>为什么用户只用 'delete'，不纳入 'frozen'</b>：user.status 的 frozen 语义是
     * "管理员禁用"（可随时改回 active，{@code applyRoleAdmission} 计数也不看 status，
     * 改回来就是完整的管理员）。把它一起 purge 等于把"临时禁用"悄悄变成"永久消失"。
     * 只有数据维护页「删除」写下的 delete 才是"用户点过删除、等待清理"。
     *
     * <p><b>为什么必须先显式展开下游</b>：见 {@link CascadeRules#SCENARIO_USER_DELETE} 的说明——
     * 数据库外键只保证课程/预订被 CASCADE 连带删掉，appointment 断在这一层。
     */
    @PostMapping("/purge/user")
    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public Result<Integer> purgeUser(@RequestHeader("Authorization") String token) {
        permissionCheck.checkAdmin(token);
        List<User> dead = userMapper.selectList(
                new QueryWrapper<User>().in("status", USER_PURGEABLE));
        if (dead != null && !dead.isEmpty()) {
            for (User u : dead) {
                String uid = u.getUserId();
                if (uid != null && !uid.trim().isEmpty()) {
                    cascadeDeleteUserChains(uid);
                }
            }
        }
        int rows = userMapper.delete(new QueryWrapper<User>().in("status", USER_PURGEABLE));
        return Result.success(rows, "成功清理 " + rows + " 行");
    }

    /**
     * 展开某账号的全部下游链：教师角色走「课程 → 排期 → 预订 → 课次」，学生角色走「预订 → 课次」。
     * 由调用方（而非数据库）完成，是因为 appointment 对 booking 没有外键，CASCADE 到不了课次。
     */
    private void cascadeDeleteUserChains(String userId) {
        List<Course> courses = courseMapper.selectList(
                new QueryWrapper<Course>().eq("teacher_id", userId));
        if (courses != null) {
            for (Course c : courses) {
                if (c.getCourseId() != null) {
                    cascadeService.run(CascadeRules.SCENARIO_COURSE_DELETE, c.getCourseId());
                }
            }
        }
        List<Booking> bookings = bookingMapper.selectList(
                new QueryWrapper<Booking>().eq("student_id", userId));
        if (bookings != null) {
            for (Booking b : bookings) {
                if (b.getBookingId() != null) {
                    cascadeService.run(CascadeRules.SCENARIO_BOOKING_DELETE, b.getBookingId());
                }
            }
        }
    }

    /**
     * 批量统计「删除某批用户会牵连多少业务数据」，供数据维护页在删除确认框里展示影响面。
     *
     * <p>返回 {@code { userId: { courses, bookings, appointments } }}：
     * courses=作为教师名下的课程数、bookings=作为学生的预订数、
     * appointments=这些预订下的课次数（appointment 经 booking 两跳统计，见上面链路说明）。
     *
     * <p>只读端点，不做任何写操作；租户条件由租户插件自动追加。
     */
    @GetMapping("/user/relation-counts")
    public Result<Map<String, Map<String, Long>>> userRelationCounts(
            @RequestParam("userIds") String userIds,
            @RequestHeader("Authorization") String token) {
        permissionCheck.checkAdmin(token);

        List<String> ids = Arrays.stream(String.valueOf(userIds).split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .distinct()
                .limit(200)
                .collect(Collectors.toList());

        Map<String, Map<String, Long>> stat = new java.util.HashMap<>();
        for (String id : ids) {
            Map<String, Long> one = new java.util.HashMap<>();
            one.put("courses", 0L);
            one.put("bookings", 0L);
            one.put("appointments", 0L);
            stat.put(id, one);
        }
        if (ids.isEmpty()) {
            return Result.success(stat, "查询成功");
        }

        // ① 教师：名下课程数
        List<Map<String, Object>> courseRows = courseMapper.selectMaps(
                new QueryWrapper<Course>().select("teacher_id", "COUNT(*) AS cnt")
                        .in("teacher_id", ids).groupBy("teacher_id"));
        if (courseRows != null) {
            for (Map<String, Object> row : courseRows) {
                mergeCount(stat, row.get("teacher_id"), row.get("cnt"), "courses");
            }
        }

        // ② 学生：预订数
        List<Map<String, Object>> bookingRows = bookingMapper.selectMaps(
                new QueryWrapper<Booking>().select("student_id", "COUNT(*) AS cnt")
                        .in("student_id", ids).groupBy("student_id"));
        if (bookingRows != null) {
            for (Map<String, Object> row : bookingRows) {
                mergeCount(stat, row.get("student_id"), row.get("cnt"), "bookings");
            }
        }

        // ③ 课次数：appointment 无 user_id 列，先取这批用户的 booking_id，再按 booking_id 归并回用户
        List<Booking> myBookings = bookingMapper.selectList(
                new QueryWrapper<Booking>().select("booking_id", "student_id").in("student_id", ids));
        Map<String, String> bookingToUser = new java.util.HashMap<>();
        List<String> bookingIds = new java.util.ArrayList<>();
        if (myBookings != null) {
            for (Booking b : myBookings) {
                if (b.getBookingId() == null) {
                    continue;
                }
                bookingIds.add(b.getBookingId());
                bookingToUser.put(b.getBookingId(), b.getStudentId());
            }
        }
        if (!bookingIds.isEmpty()) {
            List<Map<String, Object>> apptRows = appointmentMapper.selectMaps(
                    new QueryWrapper<Appointment>().select("booking_id", "COUNT(*) AS cnt")
                            .in("booking_id", bookingIds).groupBy("booking_id"));
            if (apptRows != null) {
                for (Map<String, Object> row : apptRows) {
                    Object cnt = row.get("cnt");
                    Map<String, Long> one = stat.get(bookingToUser.get(String.valueOf(row.get("booking_id"))));
                    if (one != null && cnt instanceof Number) {
                        one.put("appointments", one.get("appointments") + ((Number) cnt).longValue());
                    }
                }
            }
        }
        return Result.success(stat, "查询成功");
    }

    /** 把分组计数结果写回统计表：用户不在本次名单内或计数为空时静默跳过 */
    private static void mergeCount(Map<String, Map<String, Long>> stat, Object keyObj, Object cntObj, String field) {
        if (keyObj == null || !(cntObj instanceof Number)) {
            return;
        }
        Map<String, Long> one = stat.get(String.valueOf(keyObj));
        if (one != null) {
            one.put(field, ((Number) cntObj).longValue());
        }
    }

    /** 视为「已软删、可被物理清理」的状态集合 */
    private static final List<String> SOFT_DELETED = Arrays.asList("frozen", "delete");

    /**
     * 用户表的可清理状态：只认 delete。
     * frozen=管理员禁用（可逆的运维动作），不在此集合内——见 {@code purgeUser} 的说明。
     */
    private static final List<String> USER_PURGEABLE = Arrays.asList("delete");
}
