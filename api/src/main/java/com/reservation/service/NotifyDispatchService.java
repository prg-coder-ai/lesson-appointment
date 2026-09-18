package com.reservation.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.reservation.common.BookingStatus;
import com.reservation.common.NotifyAudience;
import com.reservation.common.NotifyStage;
import com.reservation.common.RoleConst;
import com.reservation.entity.Appointment;
import com.reservation.entity.Booking;
import com.reservation.entity.Course;
import com.reservation.entity.CourseNotifyRulePoint;
import com.reservation.entity.CourseSchedule;
import com.reservation.entity.NotificationDispatchLog;
import com.reservation.exception.BusinessException;
import com.reservation.mapper.AppointmentMapper;
import com.reservation.mapper.BookingMapper;
import com.reservation.mapper.CourseMapper;
import com.reservation.mapper.CourseScheduleMapper;
import com.reservation.mapper.NotificationDispatchLogMapper;
import com.reservation.utils.TermMsg;
import com.reservation.vo.NotifyPlanVO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 上课通知的发送判定与投递。
 *
 * <p>把「什么时候该发、发给谁、发过没有」这三件事从 {@link NotifyRuleService}（只管规则）里分出来，
 * 形成一条单向链路：
 *
 * <pre>
 *   候选课次扫描 → 取生效档位 → 判定应发窗口 → 抢流水行（幂等） → 推送 → 回写结果
 * </pre>
 *
 * <h3>四条业务策略（都是刻意的取舍，改之前先想清楚代价）</h3>
 * <ol>
 *   <li><b>只看未来窗口，过期不补</b>：{@code now ∈ [应发时刻, 应发时刻 + 容差)} 才发。
 *       学生今天约明天的课时，前两档（提前 3 天 / 提前 1 天）早已过期，一条预告都不会补发——
 *       这是期望行为，否则「提前 3 天」的提醒会在下单瞬间糊到脸上。</li>
 *   <li><b>已过上课时间绝不补发</b>：服务宕机 3 小时后再启动，不会给已经上完的课发「即将开始」。
 *       （现有前端逻辑在这里是有 bug 的：{@code diffMs <= 1h} 含负数，
 *       一周前的课被打开页面也会推「课程即将开始」。）</li>
 *   <li><b>一个订单只对「最近一个未完成课次」发</b>：一个订单可能有 5 节课，
 *       若每节都发 4 档就是 20 条消息。上完第一节（状态转 completed）后自动轮到下一节。</li>
 *   <li><b>先抢流水行再推送</b>：{@code notification_dispatch_log} 的唯一键
 *       {@code (appointment_id, seq, receiver_user_id, dedup_key)} 就是发送权。
 *       插入成功才推送，而不是「先查有没有、没有再插」——定时任务每分钟扫一次，
 *       查后插之间天然有并发窗口，只有 DB 唯一键才拦得住。</li>
 * </ol>
 */
@Service
public class NotifyDispatchService {

    private static final Logger log = LoggerFactory.getLogger(NotifyDispatchService.class);

    /**
     * 发送窗口容差（分钟）。窗口 = {@code [应发时刻, 应发时刻 + 容差)}。
     *
     * <p>必须大于任务执行周期（1 分钟），否则任务稍慢一拍、或短期宕机 2 分钟，
     * 分钟级档位就永远错过了。取 5 分钟：既能扛住短暂抖动，又不至于让「课前 30 分钟」的提醒
     * 拖到「课前 25 分钟」才到。超过容差即跳过，不补发。
     */
    private static final int TOLERANCE_MINUTES = 5;

    /** 扫描窗口：只看未来 30 天内的课次。远期课次现在算也是白算，还拖慢每分钟一次的任务 */
    private static final int SCAN_DAYS = 30;

    /**
     * 视为「不会再上课」的课次状态，扫描时直接排除。
     *
     * <p>重点是 {@code cancelling / s-cancelling / t-cancelling} 这几个请假申请中/已通过的状态：
     * 学生已经明确表示这次不来，再给他推「30 分钟后上课」只会骚扰。
     * （驳回请假会把状态改回 active，届时提醒照常恢复。）
     */
    private static final List<String> DEAD_APPOINTMENT_STATUS = List.of(
            "completed", "cancelled", "canceled", "changed", "frozen",
            "cancelling", "canceling", "s-cancelling", "t-cancelling",
            "rej-booking", "rej-cancelling", "delete");

    private static final DateTimeFormatter TIME_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
    private static final DateTimeFormatter DEDUP_STAMP = DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS");

    @Autowired
    private AppointmentMapper appointmentMapper;
    @Autowired
    private BookingMapper bookingMapper;
    @Autowired
    private CourseScheduleMapper courseScheduleMapper;
    @Autowired
    private CourseMapper courseMapper;
    @Autowired
    private NotifyRuleService notifyRuleService;
    @Autowired
    private NotificationDispatchLogMapper dispatchLogMapper;
    @Autowired
    private MessageNotifyService messageNotifyService;

    // ========================================================================
    // 一、自动发送
    // ========================================================================

    /**
     * 扫描并发送「当前到达发送窗口」的上课提醒（自动任务入口）。
     *
     * <p><b>调用方必须已设置租户上下文</b>（{@code TenantContext.setTenantId}）。
     * 本方法内部所有查询都依赖租户插件自动拼 {@code tenant_id}；
     * 若在无上下文时调用，插件会用 -1 兜底，查询恒空——「任务在跑但永远没有通知」的经典症状。
     *
     * @return 实际成功发送的消息条数
     */
    public int dispatchDueNotifications() {
        LocalDateTime now = LocalDateTime.now();
        List<Appointment> candidates = loadCandidates(now);
        if (candidates.isEmpty()) {
            return 0;
        }

        // 一个订单只保留「最近一个未完成课次」。candidates 已按课次时间升序，
        // 故首次出现的那条即该订单最早的未完成课次。
        Map<String, Appointment> earliestByBooking = new LinkedHashMap<>();
        for (Appointment a : candidates) {
            if (a.getBookingId() == null || a.getAppointmentDatetime() == null) {
                continue;
            }
            earliestByBooking.putIfAbsent(a.getBookingId(), a);
        }
        if (earliestByBooking.isEmpty()) {
            return 0;
        }

        // 订单必须是「已确认的正式预订」：booking / waiting / cancelled 都不该发提醒
        List<Booking> bookings = bookingMapper.selectBatchIds(earliestByBooking.keySet());
        Map<String, Booking> bookingMap = new HashMap<>();
        if (bookings != null) {
            for (Booking b : bookings) {
                if (b != null && b.getBookingId() != null && BookingStatus.isBooked(b.getStatus())) {
                    bookingMap.put(b.getBookingId(), b);
                }
            }
        }
        if (bookingMap.isEmpty()) {
            return 0;
        }

        Map<String, String> courseIdBySchedule = loadCourseIds(bookingMap.values());
        Map<String, String> courseNameById = loadCourseNames(courseIdBySchedule.values());

        int sent = 0;
        for (Map.Entry<String, Appointment> entry : earliestByBooking.entrySet()) {
            Booking booking = bookingMap.get(entry.getKey());
            if (booking == null) {
                continue;
            }
            String courseId = courseIdBySchedule.get(booking.getScheduleId());
            try {
                sent += dispatchOneAppointment(entry.getValue(), booking, courseId,
                        courseNameById.get(courseId), now);
            } catch (Exception e) {
                // 单个课次失败不能中断整轮扫描（否则一个坏数据会挡住同租户后面所有课次）
                log.warn("课次提醒发送异常(已跳过): appointmentId={}, err={}",
                        entry.getValue().getId(), e.getMessage());
            }
        }
        return sent;
    }

    /**
     * 对一个课次发送所有「当前处于发送窗口」的档位。
     *
     * <p>正常情况下一轮只会命中一档（档位间距远大于 5 分钟容差）；
     * 若管理员把两档配得很近（如 35 分钟与 30 分钟），则两条都会发出——这是配置的忠实结果，
     * 界面上用「应发时刻」预览能提前看出这种重叠。
     */
    private int dispatchOneAppointment(Appointment appointment, Booking booking, String courseId,
                                       String courseName, LocalDateTime now) {
        NotifyRuleService.Effective eff = notifyRuleService.resolve(courseId);
        if (eff.points.isEmpty()) {
            return 0;
        }
        int sent = 0;
        // eff.points 已按 offset 降序（越早发排前面），消息顺序自然符合时间轴
        for (CourseNotifyRulePoint point : eff.points) {
            if (!inDispatchWindow(appointment, point, now)) {
                continue;
            }
            sent += pushToRecipients(appointment, booking, point, eff, courseName, false, null);
        }
        return sent;
    }

    /**
     * 是否落在该档的发送窗口内：{@code now ∈ [应发时刻, 应发时刻 + 容差)} 且尚未上课。
     *
     * <p>三个条件缺一不可，顺序也有意为之——先判「已过上课时间」是最省事也最要紧的一道：
     * 它同时挡住了「窗口过期」与「课已上完」两种不该发的情形。
     */
    private boolean inDispatchWindow(Appointment appointment, CourseNotifyRulePoint point, LocalDateTime now) {
        LocalDateTime lesson = appointment.getAppointmentDatetime();
        Integer offset = point.getOffsetMinutes();
        if (lesson == null || offset == null || offset <= 0) {
            return false;
        }
        if (!lesson.isAfter(now)) {
            return false;   // 已过上课时间，绝不补发
        }
        LocalDateTime expect = lesson.minusMinutes(offset);
        if (expect.isAfter(now)) {
            return false;   // 还没到应发时刻
        }
        return !expect.plusMinutes(TOLERANCE_MINUTES).isBefore(now);
    }

    // ========================================================================
    // 二、管理员手动发送
    // ========================================================================

    /**
     * 管理员手动发送一次上课提醒。
     *
     * <p>与自动发送的三点差别：
     * <ol>
     *   <li><b>不受窗口约束</b>：不要求当前处于应发窗口内，只要还没上课就能发；</li>
     *   <li><b>不受幂等约束</b>：{@code dedup_key} 取 {@code MANUAL#时间戳}，每次唯一，
     *       可以反复发；照常入库以便审计（谁在什么时候手动补过一条）；</li>
     *   <li><b>档位按当前提前量自动判定</b>：管理员不需要知道「现在该发第几档」，
     *       系统按「距上课还有多久」回推最靠前的那一档。</li>
     * </ol>
     */
    public Map<String, Object> manualSend(Integer appointmentId, String operatorId) {
        if (appointmentId == null) {
            throw new BusinessException(TermMsg.t("课次ID不能为空"));
        }
        Appointment appointment = appointmentMapper.selectById(appointmentId);
        if (appointment == null) {
            throw new BusinessException(TermMsg.t("课次不存在"));
        }
        LocalDateTime lesson = appointment.getAppointmentDatetime();
        if (lesson == null) {
            throw new BusinessException(TermMsg.t("该课次没有上课时间，无法发送提醒"));
        }
        LocalDateTime now = LocalDateTime.now();
        if (!lesson.isAfter(now)) {
            throw new BusinessException(TermMsg.t("该课次的上课时间已过，不再发送提醒"));
        }
        if (appointment.getBookingId() == null) {
            throw new BusinessException(TermMsg.t("该课次没有关联订单，无法发送提醒"));
        }
        Booking booking = bookingMapper.selectById(appointment.getBookingId());
        if (booking == null) {
            throw new BusinessException(TermMsg.t("课次对应的订单不存在"));
        }
        if (!BookingStatus.isBooked(booking.getStatus())) {
            throw new BusinessException(TermMsg.t("该订单当前状态不是已确认的正式预订，不发送上课提醒"));
        }

        String courseId = resolveCourseId(booking.getScheduleId());
        String courseName = courseId == null ? null : loadCourseNames(Collections.singletonList(courseId)).get(courseId);
        NotifyRuleService.Effective eff = notifyRuleService.resolve(courseId);
        CourseNotifyRulePoint point = pickCurrentPoint(eff.points, lesson, now);
        if (point == null) {
            throw new BusinessException(TermMsg.t("该课程没有可用的通知时间点，请先在「系统配置 → 通知规则」里配置"));
        }

        int sent = pushToRecipients(appointment, booking, point, eff, courseName, true, operatorId);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("stage", point.getStage());
        result.put("stageText", NotifyStage.text(point.getStage()));
        result.put("offsetMinutes", point.getOffsetMinutes());
        result.put("offsetText", notifyRuleService.formatMinutes(point.getOffsetMinutes()));
        result.put("audience", point.getAudience());
        result.put("audienceText", NotifyAudience.text(point.getAudience()));
        result.put("sent", sent);
        result.put("scope", eff.scope);
        result.put("ruleScopeText", notifyRuleService.scopeText(eff.scope));
        return result;
    }

    /**
     * 按「当前提前量」自动判定该发哪一档。
     *
     * <p>判定规则：取<b>满足 {@code offset ≤ 距上课分钟数} 中 offset 最大</b>的那一档，
     * 也就是「按时间轴，此刻最应该已经发过的那一档」。
     * 举例（档位 3 天 / 1 天 / 1 小时 / 30 分钟）：
     * <ul>
     *   <li>距上课 3.5 天 → 应发「提前 3 天」那档</li>
     *   <li>距上课 100 分钟 → 应发「课前 1 小时」那档</li>
     *   <li>距上课 10 分钟（所有档位都已越过）→ 取最小档位「课前 30 分钟」</li>
     * </ul>
     *
     * <p>{@code points} 必须已按 offset 降序排列（{@link NotifyRuleService#resolve} 的约定），
     * 因此第一个满足条件的就是 offset 最大者——不需要遍历完再比较。
     */
    private CourseNotifyRulePoint pickCurrentPoint(List<CourseNotifyRulePoint> points,
                                                   LocalDateTime lesson, LocalDateTime now) {
        if (points == null || points.isEmpty()) {
            return null;
        }
        long minutesAhead = Duration.between(now, lesson).toMinutes();
        for (CourseNotifyRulePoint p : points) {
            if (p.getOffsetMinutes() != null && p.getOffsetMinutes() <= minutesAhead) {
                return p;
            }
        }
        return points.get(points.size() - 1);
    }

    // ========================================================================
    // 三、投递与幂等
    // ========================================================================

    /**
     * 向该档的所有收件人推送，逐人抢流水行做幂等。
     *
     * @return 实际成功发送条数
     */
    private int pushToRecipients(Appointment appointment, Booking booking, CourseNotifyRulePoint point,
                                 NotifyRuleService.Effective eff, String courseName,
                                 boolean manual, String operatorId) {
        List<String> recipients = new ArrayList<>();
        List<String> roles = new ArrayList<>();
        if (NotifyAudience.includesStudent(point.getAudience()) && notBlank(booking.getStudentId())) {
            recipients.add(booking.getStudentId());
            roles.add(RoleConst.STUDENT);
        }
        if (NotifyAudience.includesTeacher(point.getAudience()) && notBlank(booking.getTeacherId())) {
            recipients.add(booking.getTeacherId());
            roles.add(RoleConst.TEACHER);
        }
        if (recipients.isEmpty()) {
            return 0;
        }

        LocalDateTime lesson = appointment.getAppointmentDatetime();
        LocalDateTime expect = lesson.minusMinutes(point.getOffsetMinutes());
        String offsetText = notifyRuleService.formatMinutes(point.getOffsetMinutes());
        String lessonAtText = lesson.format(TIME_FMT);
        String dedupKey = manual
                ? NotificationDispatchLog.DEDUP_MANUAL_PREFIX + LocalDateTime.now().format(DEDUP_STAMP)
                : NotificationDispatchLog.DEDUP_AUTO;

        int sent = 0;
        for (int i = 0; i < recipients.size(); i++) {
            String receiverId = recipients.get(i);
            String receiverRole = roles.get(i);

            NotificationDispatchLog row = new NotificationDispatchLog();
            row.setTenantId(booking.getTenantId());
            row.setAppointmentId(appointment.getId());
            row.setBookingId(appointment.getBookingId());
            row.setRuleId(eff.rule == null ? null : eff.rule.getId());
            row.setSeq(point.getSeq());
            row.setStage(point.getStage());
            row.setOffsetMinutes(point.getOffsetMinutes());
            row.setExpectTime(expect);
            row.setReceiverUserId(receiverId);
            row.setReceiverRole(receiverRole);
            row.setTriggerType(manual ? NotificationDispatchLog.TRIGGER_MANUAL : NotificationDispatchLog.TRIGGER_AUTO);
            row.setOperatorId(operatorId);
            row.setDedupKey(dedupKey);
            row.setSentAt(LocalDateTime.now());
            row.setStatus(NotificationDispatchLog.STATUS_SENT);
            try {
                dispatchLogMapper.insert(row);
            } catch (DuplicateKeyException dup) {
                // 撞唯一键 = 这条通知（该课次 + 该档 + 该收件人）已经发过了。
                // 这是幂等的正常路径，不是错误——自动任务每分钟都会走到这里。
                continue;
            } catch (Exception e) {
                log.warn("通知流水写入失败(已跳过): appointmentId={}, seq={}, receiver={}, err={}",
                        appointment.getId(), point.getSeq(), receiverId, e.getMessage());
                continue;
            }

            // 抢到流水行才推送。推送失败则删除该行，让窗口内的下一轮重新尝试：
            // 上课提醒的价值在于送达，而窗口只有 5 分钟，重试次数天然有限（不会变成无限轰炸）；
            // 「尝试过但失败」的事实留在日志里，不用一行永远为 FAILED 的流水占位。
            boolean ok = messageNotifyService.notifyLessonReminder(
                    booking.getTenantId(), Collections.singletonList(receiverId),
                    point.getStage(), courseName, offsetText, lessonAtText);
            if (ok) {
                sent++;
            } else {
                log.warn("上课提醒推送失败，已回滚流水以便稍后重试: appointmentId={}, seq={}, receiver={}",
                        appointment.getId(), point.getSeq(), receiverId);
                try {
                    dispatchLogMapper.deleteById(row.getId());
                } catch (Exception ignore) {
                    // 删不掉也不影响：该档会因唯一键被判为已发（宁可漏发一条，不重复轰炸用户）
                }
            }
        }
        return sent;
    }

    // ========================================================================
    // 四、查询辅助
    // ========================================================================

    /**
     * 按课次ID试算各档应发时刻（含「该档是否已发」）。
     *
     * <p>供两类入口使用：管理端在课次上点「发送提醒」前先看会发哪一档；
     * 以及排查「为什么这一档没发」——已发的显示「已发送」，过期的显示「已过期，不补发」。
     */
    public NotifyPlanVO planByAppointment(Integer appointmentId) {
        if (appointmentId == null) {
            throw new BusinessException(TermMsg.t("课次ID不能为空"));
        }
        Appointment appointment = appointmentMapper.selectById(appointmentId);
        if (appointment == null) {
            throw new BusinessException(TermMsg.t("课次不存在"));
        }
        if (appointment.getAppointmentDatetime() == null) {
            throw new BusinessException(TermMsg.t("该课次没有上课时间，无法试算"));
        }
        Booking booking = appointment.getBookingId() == null
                ? null : bookingMapper.selectById(appointment.getBookingId());
        String courseId = booking == null ? null : resolveCourseId(booking.getScheduleId());
        return notifyRuleService.plan(courseId, appointment.getAppointmentDatetime(),
                dispatchedSeqs(appointmentId));
    }

    /** 某课次已发送过的档位序号集合（供配置页 / 课次详情展示「哪几档已发」） */
    public Set<Integer> dispatchedSeqs(Integer appointmentId) {
        if (appointmentId == null) {
            return Collections.emptySet();
        }
        LambdaQueryWrapper<NotificationDispatchLog> wrapper = new LambdaQueryWrapper<>();
        wrapper.select(NotificationDispatchLog::getSeq);
        wrapper.eq(NotificationDispatchLog::getAppointmentId, appointmentId);
        wrapper.eq(NotificationDispatchLog::getStatus, NotificationDispatchLog.STATUS_SENT);
        List<NotificationDispatchLog> rows = dispatchLogMapper.selectList(wrapper);
        if (rows == null) {
            return Collections.emptySet();
        }
        return rows.stream()
                .map(NotificationDispatchLog::getSeq)
                .filter(java.util.Objects::nonNull)
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    /** 某课次的发送流水明细（管理端排查用） */
    public List<NotificationDispatchLog> dispatchLogs(Integer appointmentId) {
        if (appointmentId == null) {
            return Collections.emptyList();
        }
        LambdaQueryWrapper<NotificationDispatchLog> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(NotificationDispatchLog::getAppointmentId, appointmentId);
        wrapper.orderByDesc(NotificationDispatchLog::getId);
        List<NotificationDispatchLog> rows = dispatchLogMapper.selectList(wrapper);
        return rows == null ? Collections.emptyList() : rows;
    }

    private List<Appointment> loadCandidates(LocalDateTime now) {
        LambdaQueryWrapper<Appointment> wrapper = new LambdaQueryWrapper<>();
        wrapper.gt(Appointment::getAppointmentDatetime, now);
        wrapper.le(Appointment::getAppointmentDatetime, now.plusDays(SCAN_DAYS));
        wrapper.notIn(Appointment::getStatus, DEAD_APPOINTMENT_STATUS);
        wrapper.orderByAsc(Appointment::getAppointmentDatetime);
        List<Appointment> list = appointmentMapper.selectList(wrapper);
        return list == null ? Collections.emptyList() : list;
    }

    private Map<String, String> loadCourseIds(java.util.Collection<Booking> bookings) {
        Map<String, String> map = new HashMap<>();
        Set<String> scheduleIds = bookings.stream()
                .map(Booking::getScheduleId)
                .filter(this::notBlank)
                .collect(Collectors.toSet());
        if (scheduleIds.isEmpty()) {
            return map;
        }
        List<CourseSchedule> schedules = courseScheduleMapper.selectBatchIds(scheduleIds);
        if (schedules != null) {
            for (CourseSchedule s : schedules) {
                if (s != null && s.getScheduleId() != null) {
                    map.put(s.getScheduleId(), s.getCourseId());
                }
            }
        }
        return map;
    }

    private Map<String, String> loadCourseNames(java.util.Collection<String> courseIds) {
        Map<String, String> map = new HashMap<>();
        Set<String> ids = courseIds.stream().filter(this::notBlank).collect(Collectors.toSet());
        if (ids.isEmpty()) {
            return map;
        }
        List<Course> courses = courseMapper.selectBatchIds(ids);
        if (courses != null) {
            for (Course c : courses) {
                if (c != null && c.getCourseId() != null) {
                    map.put(c.getCourseId(), c.getCourseName());
                }
            }
        }
        return map;
    }

    /** 由排期取课程ID；排期不存在或没挂课程时返回 null（此时走内置兜底档位） */
    private String resolveCourseId(String scheduleId) {
        if (!notBlank(scheduleId)) {
            return null;
        }
        CourseSchedule schedule = courseScheduleMapper.selectById(scheduleId);
        return schedule == null ? null : schedule.getCourseId();
    }

    private boolean notBlank(String s) {
        return s != null && !s.trim().isEmpty();
    }
}
