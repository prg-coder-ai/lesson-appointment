package com.classroom.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.classroom.entity.Attendance;
import com.classroom.entity.Classroom;
import com.classroom.entity.PresenceSegment;
import com.classroom.mapper.AttendanceMapper;
import com.classroom.mapper.ClassroomMapper;
import com.classroom.mapper.PresenceSegmentMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 签到与出勤核算。
 *
 * <p><b>状态机</b>：ABSENT → PRESENT/LATE → LEFT → REJOINED → LEFT …
 * 其中 LEFT / REJOINED 是过程态；下课收尾（{@link #finalizeSchedule}）会把最终结论
 * 归一为 {@code ABSENT / PRESENT / LATE} 三种，供出勤名单回流。
 *
 * <p><b>有效时长（需求 F2-03）</b>：修复前只算「首次签到 → 最后一次签退」的单段差并取 max，
 * 三个硬伤——①离线时长被计入（10:00 进 / 10:20 掉 / 11:00 回 / 11:30 退 会算成 90 分钟，
 * 实际在线 50 分钟）；②不扣 60 秒抖动重连；③不封顶课时。现在改为
 * <b>在线区间累加</b>：每次进出落一段 {@link PresenceSegment}，
 * 相邻段间隙 ≤ {@code jitterGraceSeconds} 视为抖动重连（间隙算作连续在线，即不扣），
 * 其余间隙不计；各合并段秒数合计后换算成分钟，再 {@code Math.min(总分钟, 课时时长)} 封顶。
 *
 * <p><b>为什么单独建段表</b>：{@code classroom_membership} 是
 * {@code (schedule_id,user_id)} 单行，只存最后一次 join/leave，装不下多次进出。
 */
@Slf4j
@Service
public class AttendanceService {

    private final AttendanceMapper attendanceMapper;
    private final PresenceSegmentMapper segmentMapper;
    private final ClassroomMapper classroomMapper;

    /** 迟到宽限（分钟），需求 F2-02 默认 5 分钟可配置 */
    @Value("${classroom.late-grace-minutes:5}")
    private int lateGraceMinutes;

    /** 抖动重连阈值（秒），需求 F2-03：60 秒内重连不视为中断 */
    @Value("${classroom.jitter-grace-seconds:60}")
    private int jitterGraceSeconds;

    public AttendanceService(AttendanceMapper attendanceMapper,
                             PresenceSegmentMapper segmentMapper,
                             ClassroomMapper classroomMapper) {
        this.attendanceMapper = attendanceMapper;
        this.segmentMapper = segmentMapper;
        this.classroomMapper = classroomMapper;
    }

    // ==================== 进出场 ====================

    /**
     * 进入课堂即签到（需求 F2-01）+ 开启一段在线区间。
     *
     * <p>「迟到只改标记不改已记录时间」：已签到过的用户重进只把状态改成 REJOINED，
     * 不覆盖 {@code checkInAt}，否则早退早到的证据会被最后一次重连冲掉。
     */
    @Transactional(rollbackFor = Exception.class)
    public void checkIn(String scheduleId, String userId, LocalDateTime classStartTime) {
        Attendance existing = getOne(scheduleId, userId);
        LocalDateTime now = LocalDateTime.now();

        if (existing == null) {
            Attendance a = new Attendance();
            a.setScheduleId(scheduleId);
            a.setUserId(userId);
            boolean late = classStartTime != null && now.isAfter(classStartTime.plusMinutes(lateGraceMinutes));
            a.setAttendanceStatus(late ? "LATE" : "PRESENT");
            a.setCheckInAt(now);
            a.setEffectiveMinutes(0);
            a.setLate(late);
            a.setManualAdjust(false);
            attendanceMapper.insert(a);
            log.info("签到: scheduleId={}, userId={}, late={}", scheduleId, userId, late);
        } else if ("ABSENT".equals(existing.getAttendanceStatus())) {
            // 课堂创建时名单已预置为 ABSENT（见 initRoster）。漏掉这个分支，
            // 学生真进来了状态也永远停在缺席——预置名单反而把出勤打成了全缺席。
            boolean late = classStartTime != null && now.isAfter(classStartTime.plusMinutes(lateGraceMinutes));
            existing.setAttendanceStatus(late ? "LATE" : "PRESENT");
            existing.setCheckInAt(now);
            existing.setLate(late);
            existing.setCheckOutAt(null);
            attendanceMapper.updateByKey(existing);
            log.info("签到(名单预置升级): scheduleId={}, userId={}, late={}", scheduleId, userId, late);
        } else if ("LEFT".equals(existing.getAttendanceStatus())) {
            existing.setAttendanceStatus("REJOINED");
            existing.setCheckOutAt(null);
            attendanceMapper.updateByKey(existing);
            log.info("重连签到: scheduleId={}, userId={}", scheduleId, userId);
        }
        openSegment(scheduleId, userId, now);
    }

    /**
     * 主动离开课堂（{@code /leave}）：闭合区间 + 状态置 LEFT + 重算有效时长。
     */
    @Transactional(rollbackFor = Exception.class)
    public void checkOut(String scheduleId, String userId) {
        Attendance a = getOne(scheduleId, userId);
        if (a != null) {
            LocalDateTime now = LocalDateTime.now();
            a.setCheckOutAt(now);
            a.setAttendanceStatus("LEFT");
            attendanceMapper.updateByKey(a);
        }
        closeSegment(scheduleId, userId, "active", LocalDateTime.now());
        int minutes = recalcEffectiveMinutes(scheduleId, userId, LocalDateTime.now());
        log.info("签退: scheduleId={}, userId={}, effectiveMinutes={}", scheduleId, userId, minutes);
    }

    /**
     * 掉线（WS 断开 / 心跳超时）：只闭合区间，<b>不改出勤状态</b>。
     *
     * <p>不改状态的理由：WS 断开不等于人走了（切网、锁屏、后台挂起都会断），
     * 若直接标 LEFT，一次抖动就会把「在课」误判成「早退」。人是否真的走了由
     * 有效时长与最终名单体现，状态只由显式 {@code /leave}、踢人或下课收尾改。
     */
    @Transactional(rollbackFor = Exception.class)
    public void onDisconnect(String scheduleId, String userId) {
        closeSegment(scheduleId, userId, "disconnect", LocalDateTime.now());
        recalcEffectiveMinutes(scheduleId, userId, LocalDateTime.now());
    }

    /**
     * 教师手动补签/修正（F2-04，P1）：留原因与 manual_adjust 标记。
     */
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
            attendanceMapper.updateByKey(a);
        }
    }

    // ==================== 区间维护 ====================

    /**
     * 开一段在线区间。开之前先闭合该用户所有残留的未闭合段——
     * 正常情况下至多一条（异常重启、重复 enter 会留下多条，不清理会重复计时）。
     */
    private void openSegment(String scheduleId, String userId, LocalDateTime at) {
        for (PresenceSegment seg : segmentMapper.listOpen(scheduleId, userId)) {
            // 残留段按新段的进入时间闭合：中间空档由抖动合并规则决定是否计入
            seg.setLeaveAt(at.isBefore(seg.getJoinAt()) ? seg.getJoinAt() : at);
            seg.setLeaveReason("reenter");
            segmentMapper.updateById(seg);
        }
        PresenceSegment seg = new PresenceSegment();
        seg.setScheduleId(scheduleId);
        seg.setUserId(userId);
        seg.setJoinAt(at);
        seg.setCreatedAt(LocalDateTime.now());
        segmentMapper.insert(seg);
    }

    private void closeSegment(String scheduleId, String userId, String reason, LocalDateTime at) {
        for (PresenceSegment seg : segmentMapper.listOpen(scheduleId, userId)) {
            seg.setLeaveAt(at.isBefore(seg.getJoinAt()) ? seg.getJoinAt() : at);
            seg.setLeaveReason(reason);
            segmentMapper.updateById(seg);
        }
    }

    // ==================== 有效时长核算 ====================

    /**
     * 下课收尾（需求 F2-05）：闭合全部未结束区间 → 重算全员有效时长 →
     * 把过程态归一为 ABSENT / PRESENT / LATE 的最终名单。
     *
     * @param closeAt 下课时间（课堂 actualEnd）
     * @return 收尾后的名单（按 user_id 升序）
     */
    @Transactional(rollbackFor = Exception.class)
    public List<Attendance> finalizeSchedule(String scheduleId, LocalDateTime closeAt) {
        List<PresenceSegment> open = segmentMapper.listAllOpen(scheduleId);
        for (PresenceSegment seg : open) {
            seg.setLeaveAt(closeAt.isBefore(seg.getJoinAt()) ? seg.getJoinAt() : closeAt);
            seg.setLeaveReason("closed");
            segmentMapper.updateById(seg);
        }
        List<Attendance> list = listBySchedule(scheduleId);
        int cap = resolveCapMinutes(scheduleId);
        for (Attendance a : list) {
            int minutes = computeEffectiveMinutes(scheduleId, a.getUserId(), closeAt, cap);
            a.setEffectiveMinutes(minutes);
            if (a.getCheckInAt() == null) {
                // 全程未签到：缺席。即便有残留区间（异常数据）也不改结论
                a.setAttendanceStatus("ABSENT");
            } else {
                // LEFT / REJOINED 等过程态归一为最终结论
                boolean late = Boolean.TRUE.equals(a.getLate());
                a.setAttendanceStatus(late ? "LATE" : "PRESENT");
                if (a.getCheckOutAt() == null) {
                    a.setCheckOutAt(closeAt);
                }
            }
            attendanceMapper.updateByKey(a);
        }
        log.info("出勤收尾完成: scheduleId={}, closeAt={}, 名单人数={}, 闭合区间={}",
                scheduleId, closeAt, list.size(), open.size());
        return list;
    }

    /** 重算并写回单个用户的有效时长，返回分钟数。 */
    public int recalcEffectiveMinutes(String scheduleId, String userId, LocalDateTime refTime) {
        int cap = resolveCapMinutes(scheduleId);
        int minutes = computeEffectiveMinutes(scheduleId, userId, refTime, cap);
        Attendance a = getOne(scheduleId, userId);
        if (a != null && !Integer.valueOf(minutes).equals(a.getEffectiveMinutes())) {
            a.setEffectiveMinutes(minutes);
            attendanceMapper.updateByKey(a);
        }
        return minutes;
    }

    /**
     * 有效时长核心算法：区间合并 + 抖动豁免 + 课时封顶。
     *
     * <p>合并规则：按进入时间升序扫描，若下一段的进入时间 ≤ 上一合并段的结束时间
     * + {@code jitterGraceSeconds}，则视为同一次在线（重叠或 60 秒内重连），
     * 间隙计入；否则视为真的离线，间隙不计。
     *
     * <p>未闭合段（{@code leaveAt == null}）以 {@code refTime} 作为结束时间参与计算，
     * 这样中途查询也能得到「截至当前」的有效时长。
     */
    public int computeEffectiveMinutes(String scheduleId, String userId,
                                       LocalDateTime refTime, int capMinutes) {
        List<PresenceSegment> segments = segmentMapper.listByScheduleUser(scheduleId, userId);
        if (segments.isEmpty()) return 0;

        long totalSeconds = 0;
        LocalDateTime mergedStart = null;
        LocalDateTime mergedEnd = null;

        for (PresenceSegment seg : segments) {
            LocalDateTime s = seg.getJoinAt();
            if (s == null) continue;
            LocalDateTime e = seg.getLeaveAt() != null ? seg.getLeaveAt() : refTime;
            if (e.isBefore(s)) {
                // 脏数据兜底：结束早于开始按零长度处理，不让负时长把总账扣飞
                log.warn("在线区间异常(结束早于开始)，按零长度处理: scheduleId={}, userId={}, segId={}",
                        scheduleId, userId, seg.getId());
                e = s;
            }
            if (mergedStart == null) {
                mergedStart = s;
                mergedEnd = e;
                continue;
            }
            boolean overlapOrJitter = !s.isAfter(mergedEnd)
                    || Duration.between(mergedEnd, s).getSeconds() <= jitterGraceSeconds;
            if (overlapOrJitter) {
                if (e.isAfter(mergedEnd)) mergedEnd = e;
            } else {
                totalSeconds += Duration.between(mergedStart, mergedEnd).getSeconds();
                mergedStart = s;
                mergedEnd = e;
            }
        }
        if (mergedStart != null) {
            totalSeconds += Duration.between(mergedStart, mergedEnd).getSeconds();
        }

        int minutes = (int) (totalSeconds / 60);
        if (capMinutes > 0 && minutes > capMinutes) {
            minutes = capMinutes;
        }
        return Math.max(minutes, 0);
    }

    /** 课时时长（分钟）作为封顶值；查不到课堂返回 0 表示不封顶 */
    private int resolveCapMinutes(String scheduleId) {
        Classroom c = classroomMapper.selectById(scheduleId);
        if (c == null) return 0;
        if (c.getDuration() != null && c.getDuration() > 0) return c.getDuration();
        if (c.getStartTime() != null && c.getEndTime() != null) {
            long m = Duration.between(c.getStartTime(), c.getEndTime()).toMinutes();
            return (int) Math.max(m, 0);
        }
        return 0;
    }

    // ==================== 查询 ====================

    public Attendance getOne(String scheduleId, String userId) {
        LambdaQueryWrapper<Attendance> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Attendance::getScheduleId, scheduleId)
               .eq(Attendance::getUserId, userId);
        return attendanceMapper.selectOne(wrapper);
    }

    public List<Attendance> listBySchedule(String scheduleId) {
        LambdaQueryWrapper<Attendance> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Attendance::getScheduleId, scheduleId)
               .orderByAsc(Attendance::getUserId);
        return attendanceMapper.selectList(wrapper);
    }

    /**
     * 课堂创建时初始化出勤名单（需求 F2-05 的前置条件）：
     * 名单内学生先全部记为 ABSENT，后续 enter 才升级为 PRESENT/LATE。
     *
     * <p>不预置就无法区分「缺席」与「名单里压根没这个人」——缺席统计会漏掉
     * 「一次都没进过课堂」的学生，而这恰恰是最需要被记录的一类。
     * 已存在则不覆盖（重投 created 事件时保持幂等，不会把已签到的人打回缺席）。
     */
    public void initRoster(String scheduleId, List<String> studentIds) {
        if (studentIds == null || studentIds.isEmpty()) return;
        int inserted = 0;
        for (String userId : studentIds) {
            if (userId == null || userId.isBlank()) continue;
            if (getOne(scheduleId, userId) != null) continue;
            Attendance a = new Attendance();
            a.setScheduleId(scheduleId);
            a.setUserId(userId);
            a.setAttendanceStatus("ABSENT");
            a.setEffectiveMinutes(0);
            a.setLate(false);
            a.setManualAdjust(false);
            attendanceMapper.insert(a);
            inserted++;
        }
        log.info("出勤名单初始化: scheduleId={}, 应到={}, 本次新增={}", scheduleId, studentIds.size(), inserted);
    }
}
