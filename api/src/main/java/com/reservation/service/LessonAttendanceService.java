package com.reservation.service;

import com.reservation.dto.AttendanceCallbackReq;
import com.reservation.entity.CourseSchedule;
import com.reservation.entity.LessonAttendance;
import com.reservation.mapper.CourseScheduleMapper;
import com.reservation.mapper.LessonAttendanceMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 课堂出勤回流落库（classroom-service → booking-api）。
 *
 * <p>需求对应：F2-06（出勤名单随课时消耗回流）、F7-01（课时消耗明细生成）、
 * F7-02（回调含重试与对账）。
 *
 * <p><b>幂等与防乱序</b>：
 * <ul>
 *   <li>业务键 {@code (schedule_id, user_id)} 唯一，重复回调只覆盖不新增；</li>
 *   <li>{@code consumption_version} 小于库内已有值时整条丢弃并计入 stale，
 *       防止「下课回调」被「中途某次补发」覆盖成低版本；</li>
 *   <li>版本相等时允许覆盖（同一版本内的补签/修正走这条路径）。</li>
 * </ul>
 *
 * <p><b>租户</b>：由 {@code course_schedule.tenant_id} 反查，<b>不采信回调载荷</b>。
 * 回调是免登录 HMAC 通道，载荷里的任何租户字段都可被伪造，一律不用。
 *
 * <p><b>不做的事（有意）</b>：不改 {@code appointment.status}、不扣
 * {@code student_balance.lesson_remaining}。课时扣减要与请假/退费档位
 * （{@code refund_snapshot}）统一口径后再接，否则会出现「课堂扣一次、退费又退一次」的账实不符。
 * 本表先把「课上成什么样」钉死，账务侧随时可基于它重算。
 */
@Service
public class LessonAttendanceService {

    private static final Logger log = LoggerFactory.getLogger(LessonAttendanceService.class);

    /** 回调来源标记，便于日后区分课堂回流与人工导入 */
    private static final String SOURCE_CLASSROOM = "classroom";

    private final LessonAttendanceMapper attendanceMapper;
    private final CourseScheduleMapper scheduleMapper;

    public LessonAttendanceService(LessonAttendanceMapper attendanceMapper,
                                   CourseScheduleMapper scheduleMapper) {
        this.attendanceMapper = attendanceMapper;
        this.scheduleMapper = scheduleMapper;
    }

    /**
     * 写入一次出勤回流。整体一个事务：要么全部落库，要么全不落
     * ——部分落库会让「出勤率」统计出现半截数据，比全丢更难查。
     */
    @Transactional(rollbackFor = Exception.class)
    public WritebackResult writeback(AttendanceCallbackReq req) {
        WritebackResult result = new WritebackResult();
        if (req == null || isBlank(req.getScheduleId())) {
            throw new IllegalArgumentException("回流出勤缺少 scheduleId");
        }
        String scheduleId = req.getScheduleId().trim();

        // 回调里的 scheduleId 是课次级编码（sid 或 sid~N），排期表用的是裸 id，必须先解码。
        // 不解码不会报错，只会「查不到排期 → 404」，属于最难查的一类静默失败。
        CourseSchedule schedule = scheduleMapper.selectByIdIgnoreTenant(
                com.reservation.common.ClassroomKey.scheduleIdOf(scheduleId));
        if (schedule == null) {
            // 排期不存在：可能是排期删除后才到达的回调，重试无意义但需可见，交给调用方按 404 处理
            throw new IllegalArgumentException("排期不存在，无法归户: scheduleId=" + scheduleId);
        }
        Long tenantId = schedule.getTenantId() == null ? 0L : schedule.getTenantId();
        int version = req.getConsumptionVersion() == null ? 1 : req.getConsumptionVersion();

        List<AttendanceCallbackReq.AttendanceItem> items = req.getItems();
        if (items == null || items.isEmpty()) {
            log.warn("出勤回流无明细: scheduleId={}, version={}", scheduleId, version);
            return result;
        }

        for (AttendanceCallbackReq.AttendanceItem item : items) {
            if (item == null || isBlank(item.getUserId())) {
                result.invalid++;
                continue;
            }
            LessonAttendance row = buildRow(req, item, scheduleId, tenantId, version);
            LessonAttendance existing = attendanceMapper.selectOneIgnoreTenant(scheduleId, row.getUserId());

            if (existing == null) {
                attendanceMapper.insertExplicitTenant(row);
                result.inserted++;
                continue;
            }
            int existingVersion = existing.getConsumptionVersion() == null ? 0 : existing.getConsumptionVersion();
            if (existingVersion > version) {
                result.stale++;
                log.info("出勤回流版本过旧已丢弃: scheduleId={}, userId={}, existingVersion={}, incomingVersion={}",
                        scheduleId, row.getUserId(), existingVersion, version);
                continue;
            }
            attendanceMapper.updateByKeyIgnoreTenant(row);
            result.updated++;
        }

        log.info("出勤回流落库完成: scheduleId={}, tenantId={}, version={}, 新增={}, 更新={}, 版本过旧={}, 非法={}",
                scheduleId, tenantId, version, result.inserted, result.updated, result.stale, result.invalid);
        return result;
    }

    /** 某课堂的出勤回流明细（供运营/教师查看，按 user_id 升序） */
    public List<LessonAttendance> listBySchedule(String scheduleId) {
        return attendanceMapper.listByScheduleIgnoreTenant(scheduleId);
    }

    private LessonAttendance buildRow(AttendanceCallbackReq req, AttendanceCallbackReq.AttendanceItem item,
                                      String scheduleId, Long tenantId, int version) {
        LessonAttendance row = new LessonAttendance();
        row.setTenantId(tenantId);
        row.setScheduleId(scheduleId);
        row.setCourseId(req.getCourseId());
        row.setUserId(item.getUserId().trim());
        row.setRole(item.getRole());
        row.setAttendanceStatus(normalizeStatus(item.getAttendanceStatus()));
        row.setCheckInAt(item.getCheckInAt());
        row.setCheckOutAt(item.getCheckOutAt());
        row.setEffectiveMinutes(item.getEffectiveMinutes() == null ? 0 : Math.max(0, item.getEffectiveMinutes()));
        row.setClassroomStatus(req.getClassroomStatus());
        row.setActualStart(req.getActualStart());
        row.setActualEnd(req.getActualEnd());
        row.setConsumptionVersion(version);
        row.setSource(SOURCE_CLASSROOM);
        return row;
    }

    /**
     * 出勤状态归一：课堂侧可能给出 PRESENT/LATE/ABSENT/LEFT/REJOINED（大小写不一），
     * 统一转小写并落固定枚举；无法识别的按 absent 处理并留日志，不允许写进自由文本
     * ——否则出勤率统计会被脏值静默带偏。
     */
    private String normalizeStatus(String raw) {
        if (isBlank(raw)) return "absent";
        String s = raw.trim().toLowerCase();
        switch (s) {
            case "present":
            case "late":
            case "absent":
            case "left":
            case "rejoined":
                return s;
            default:
                log.warn("未知出勤状态，按 absent 处理: raw={}", raw);
                return "absent";
        }
    }

    private boolean isBlank(String s) {
        return s == null || s.trim().isEmpty();
    }

    /** 落库结果统计（用于回调响应体，便于教学服务侧对账） */
    public static class WritebackResult {
        public int inserted;
        public int updated;
        public int stale;
        public int invalid;

        public int affected() {
            return inserted + updated;
        }
    }
}
