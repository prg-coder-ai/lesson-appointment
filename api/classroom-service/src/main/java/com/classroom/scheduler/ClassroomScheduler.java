package com.classroom.scheduler;

import com.classroom.dto.ClassroomAlertReq;
import com.classroom.entity.Classroom;
import com.classroom.entity.Membership;
import com.classroom.entity.RollCallRecord;
import com.classroom.mapper.PresenceSegmentMapper;
import com.classroom.mapper.ReconcileLogMapper;
import com.classroom.mapper.RecordingMapper;
import com.classroom.mapper.RollCallRecordMapper;
import com.classroom.mapper.SessionRecordMapper;
import com.classroom.mapper.SubmissionMapper;
import com.classroom.service.CallbackService;
import com.classroom.service.ClassroomService;
import com.classroom.service.MembershipService;
import com.classroom.ws.OnlineStateManager;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 课堂生命周期定时扫描器（P0-D 七个）。
 *
 * <p><b>设计要点</b>
 * <ol>
 *   <li>每个扫描器<b>自包含 try/catch</b>：单条课堂/记录失败只记 ERROR，绝不污染整轮或其它课堂。</li>
 *   <li>状态流转一律复用 {@link ClassroomService#markReady}/{@code startClass}/{@code endClass}，
 *       与教师手动「开始/结束」同口径——不会出现「自动下课少做一步收尾」这类偏差。</li>
 *   <li>选行查询下推到 SQL（{@code ClassroomMapper.list*} 与 Mapper default 方法），扫描器只做动作。</li>
 *   <li>掉线/结课类以 <b>Redis 在线 key 是否还在</b> 为在线真相源（{@link OnlineStateManager}），
 *       DB 的 {@code online_state} 只是展示态，靠扫描器把两者对齐。</li>
 * </ol>
 *
 * <p><b>七个扫描器</b>
 * <ol>
 *   <li>就绪提醒：SCHEDULED → READY + 推提醒</li>
 *   <li>自动开课：到点 SCHEDULED/READY → LIVE</li>
 *   <li>自动下课：LIVE 超计划结束 + 宽限 → CLOSED</li>
 *   <li>学生掉线判定：DB 在线但 Redis key 消失 → OFFLINE</li>
 *   <li>点名超时：PENDING 超时被发起时长 → TIMEOUT</li>
 *   <li>教师掉线结课：教师离线超宽限 → 自动结课</li>
 *   <li>过期数据清理：每日清理历史表</li>
 * </ol>
 */
@Slf4j
@Component
public class ClassroomScheduler {

    private final ClassroomService classroomService;
    private final MembershipService membershipService;
    private final OnlineStateManager onlineStateManager;
    private final RollCallRecordMapper rollCallRecordMapper;
    private final PresenceSegmentMapper presenceSegmentMapper;
    private final ReconcileLogMapper reconcileLogMapper;
    private final RecordingMapper recordingMapper;
    private final SessionRecordMapper sessionRecordMapper;
    private final SubmissionMapper submissionMapper;
    private final CallbackService callbackService;

    @Value("${classroom.ready-before-start-minutes:10}")
    private int readyBeforeStartMinutes;
    @Value("${classroom.auto-start:true}")
    private boolean autoStartEnabled;
    @Value("${classroom.auto-end-grace-minutes:5}")
    private int autoEndGraceMinutes;
    @Value("${classroom.teacher-drop-grace-seconds:120}")
    private int teacherDropGraceSeconds;
    @Value("${classroom.rollcall-timeout-minutes:2}")
    private int rollcallTimeoutMinutes;
    @Value("${classroom.presence-retention-days:180}")
    private int presenceRetentionDays;
    @Value("${classroom.rollcall-retention-days:90}")
    private int rollcallRetentionDays;
    @Value("${classroom.reconcile-retention-days:365}")
    private int reconcileRetentionDays;
    @Value("${classroom.session-retention-days:180}")
    private int sessionRetentionDays;
    @Value("${classroom.submission-retention-days:730}")
    private int submissionRetentionDays;
    @Value("${classroom.recording-retention-days:90}")
    private int recordingRetentionDays;

    public ClassroomScheduler(ClassroomService classroomService,
                              MembershipService membershipService,
                              OnlineStateManager onlineStateManager,
                              RollCallRecordMapper rollCallRecordMapper,
                              PresenceSegmentMapper presenceSegmentMapper,
                              ReconcileLogMapper reconcileLogMapper,
                              RecordingMapper recordingMapper,
                              SessionRecordMapper sessionRecordMapper,
                              SubmissionMapper submissionMapper,
                              CallbackService callbackService) {
        this.classroomService = classroomService;
        this.membershipService = membershipService;
        this.onlineStateManager = onlineStateManager;
        this.rollCallRecordMapper = rollCallRecordMapper;
        this.presenceSegmentMapper = presenceSegmentMapper;
        this.reconcileLogMapper = reconcileLogMapper;
        this.recordingMapper = recordingMapper;
        this.sessionRecordMapper = sessionRecordMapper;
        this.submissionMapper = submissionMapper;
        this.callbackService = callbackService;
    }

    // ============ 1. 就绪提醒（每 30 秒） ============
    /**
     * 把「上课前 N 分钟内（含已开始但卡在 SCHEDULED 的）」课堂翻成 READY 并推提醒。
     * 幂等：{@code markReady} 只在真翻成功时返回 true，扫描器据此发提醒——翻失败（已被开课）不重复发。
     */
    @Scheduled(cron = "0/30 * * * * ?")
    public void scanReadyReminder() {
        try {
            List<Classroom> due = classroomService.findReadyToRemind(readyBeforeStartMinutes);
            for (Classroom c : due) {
                try {
                    if (classroomService.markReady(c.getScheduleId())) {
                        sendReadyAlert(c);
                    }
                } catch (Exception e) {
                    log.error("[就绪提醒] 处理失败 scheduleId={}, err={}", c.getScheduleId(), e.getMessage());
                }
            }
        } catch (Exception e) {
            log.error("[就绪提醒] 整轮扫描失败: {}", e.getMessage());
        }
    }

    // ============ 2. 自动开课（每 30 秒） ============
    /**
     * 到点且状态 SCHEDULED/READY、未过结束时间的课堂自动开课。
     * 全局开关 {@code classroom.auto-start=false} 时整轮跳过；单课堂 {@code auto_start=false} 时跳过该课堂。
     */
    @Scheduled(cron = "0/30 * * * * ?")
    public void scanAutoStart() {
        if (!autoStartEnabled) {
            return;
        }
        try {
            List<Classroom> due = classroomService.findDueToStart();
            for (Classroom c : due) {
                try {
                    if (Boolean.FALSE.equals(c.getAutoStart())) {
                        continue;
                    }
                    classroomService.startClass(c.getScheduleId());
                    log.info("[自动开课] scheduleId={}", c.getScheduleId());
                } catch (Exception e) {
                    log.error("[自动开课] 处理失败 scheduleId={}, err={}", c.getScheduleId(), e.getMessage());
                }
            }
        } catch (Exception e) {
            log.error("[自动开课] 整轮扫描失败: {}", e.getMessage());
        }
    }

    // ============ 3. 自动下课（每 30 秒） ============
    /**
     * 仍 LIVE 且计划结束时间已过去 {@code auto-end-grace-minutes} 分钟的课堂自动下课。
     * 复用 {@code endClass}：下课收尾（出勤核算 + 课时回流）与人工下课同口径。
     */
    @Scheduled(cron = "0/30 * * * * ?")
    public void scanAutoEnd() {
        try {
            List<Classroom> overdue = classroomService.findOverdueLive(autoEndGraceMinutes);
            for (Classroom c : overdue) {
                try {
                    classroomService.endClass(c.getScheduleId());
                    log.info("[自动下课] scheduleId={}", c.getScheduleId());
                } catch (Exception e) {
                    log.error("[自动下课] 处理失败 scheduleId={}, err={}", c.getScheduleId(), e.getMessage());
                }
            }
        } catch (Exception e) {
            log.error("[自动下课] 整轮扫描失败: {}", e.getMessage());
        }
    }

    // ============ 4. 学生掉线判定（每 20 秒） ============
    /**
     * 对所有 LIVE 课堂，按「距最后心跳的 elapsed」分级：ONLINE / IDLE / OFFLINE（F3-03/04）。
     * 这是「WS 断连事件丢失」（JVM 崩溃 / 网络分区未触发 disconnect）时的安全兜底。
     * IDLE 期间不离开课堂，给 15-60s 闪断/切网留重连续课缓冲；超过 offline-timeout 才判 OFFLINE + leave。
     */
    @Scheduled(cron = "0/20 * * * * ?")
    public void scanStudentDrop() {
        int grace = onlineStateManager.getReconnectGraceSeconds();
        int offlineTimeout = onlineStateManager.getOfflineTimeoutSeconds();
        try {
            List<Classroom> live = classroomService.listByStatus("LIVE", null);
            for (Classroom c : live) {
                try {
                    List<Membership> members = membershipService.listByStates(c.getScheduleId(),
                            java.util.List.of("ONLINE", "IDLE"));
                    for (Membership m : members) {
                        Long elapsed = onlineStateManager.lastSeenElapsed(c.getScheduleId(), m.getUserId());
                        if (elapsed == null || elapsed > offlineTimeout) {
                            // 心跳 key 已消失且超过 offlineTimeout → 真正掉线
                            membershipService.leave(c.getScheduleId(), m.getUserId(), "timeout");
                            onlineStateManager.setOffline(c.getScheduleId(), m.getUserId());
                            log.info("[学生掉线] scheduleId={}, userId={}", c.getScheduleId(), m.getUserId());
                        } else if (elapsed > grace) {
                            membershipService.setState(c.getScheduleId(), m.getUserId(), "IDLE");
                        } else {
                            membershipService.setState(c.getScheduleId(), m.getUserId(), "ONLINE");
                        }
                    }
                } catch (Exception e) {
                    log.error("[学生掉线] 处理失败 scheduleId={}, err={}", c.getScheduleId(), e.getMessage());
                }
            }
        } catch (Exception e) {
            log.error("[学生掉线] 整轮扫描失败: {}", e.getMessage());
        }
    }

    // ============ 5. 点名超时（每 30 秒） ============
    /**
     * 仍 PENDING 且发起时间早于「现在 - rollcall-timeout-minutes」的点名记录判为超时。
     * 仅把状态从 PENDING 改为 TIMEOUT（幂等：已应答/已超时的不在此列）。
     */
    @Scheduled(cron = "0/30 * * * * ?")
    public void scanRollCallTimeout() {
        try {
            LocalDateTime before = LocalDateTime.now().minusMinutes(rollcallTimeoutMinutes);
            List<RollCallRecord> expired = rollCallRecordMapper.listExpiredPending(before);
            for (RollCallRecord r : expired) {
                try {
                    RollCallRecord upd = new RollCallRecord();
                    upd.setRollcallId(r.getRollcallId());
                    upd.setStatus("TIMEOUT");
                    upd.setAnsweredAt(LocalDateTime.now());
                    if (rollCallRecordMapper.updateById(upd) > 0) {
                        log.info("[点名超时] rollcallId={}, scheduleId={}", r.getRollcallId(), r.getScheduleId());
                    }
                } catch (Exception e) {
                    log.error("[点名超时] 处理失败 rollcallId={}, err={}", r.getRollcallId(), e.getMessage());
                }
            }
        } catch (Exception e) {
            log.error("[点名超时] 整轮扫描失败: {}", e.getMessage());
        }
    }

    // ============ 6. 教师掉线结课（每 40 秒） ============
    /**
     * 对所有 LIVE 课堂检查教师：教师已 OFFLINE 且离开时间距现已超过 {@code teacher-drop-grace-seconds}
     * → 自动结课（给教师重连留足时间，避免误杀）。
     * 教师 OFFLINE + leaveTime 由扫描器 4（或 WS 断连处理器）写入，本扫描器只消费该结论。
     */
    @Scheduled(cron = "0/40 * * * * ?")
    public void scanTeacherDrop() {
        try {
            List<Classroom> live = classroomService.listByStatus("LIVE", null);
            for (Classroom c : live) {
                try {
                    Membership teacher = membershipService.getTeacher(c.getScheduleId());
                    if (teacher == null) {
                        continue;
                    }
                    if ("OFFLINE".equals(teacher.getOnlineState()) && teacher.getLeaveTime() != null) {
                        long goneSec = Duration.between(teacher.getLeaveTime(), LocalDateTime.now()).getSeconds();
                        if (goneSec >= teacherDropGraceSeconds) {
                            classroomService.endClass(c.getScheduleId());
                            log.warn("[教师掉线结课] 教师掉线 {}s，自动结课: scheduleId={}", goneSec, c.getScheduleId());
                        }
                    }
                } catch (Exception e) {
                    log.error("[教师掉线结课] 处理失败 scheduleId={}, err={}", c.getScheduleId(), e.getMessage());
                }
            }
        } catch (Exception e) {
            log.error("[教师掉线结课] 整轮扫描失败: {}", e.getMessage());
        }
    }

    // ============ 7. 过期数据清理（每日 03:30） ============
    /**
     * 每日清理历史/过程表：在线区间、点名、对账日志、会话、提交、录制。
     * 各表按各自保留天数（配置）删除早于阈值的记录，日志打出各类删除条数便于核对。
     */
    @Scheduled(cron = "${classroom.retention.cron:0 30 3 * * ?}")
    public void scanRetentionCleanup() {
        try {
            LocalDateTime now = LocalDateTime.now();
            int presence = presenceSegmentMapper.deleteBefore(now.minusDays(presenceRetentionDays));
            int rollcall = rollCallRecordMapper.deleteByInitiatedAtBefore(now.minusDays(rollcallRetentionDays));
            int reconcile = reconcileLogMapper.deleteByReceivedAtBefore(now.minusDays(reconcileRetentionDays));
            int session = sessionRecordMapper.deleteByEndTimeBefore(now.minusDays(sessionRetentionDays));
            int submission = submissionMapper.deleteByCreatedAtBefore(now.minusDays(submissionRetentionDays));
            int recording = recordingMapper.deleteByCreatedAtBefore(now.minusDays(recordingRetentionDays));
            log.info("[过期清理] presence={}, rollcall={}, reconcile={}, session={}, submission={}, recording={}",
                    presence, rollcall, reconcile, session, submission, recording);
        } catch (Exception e) {
            log.error("[过期清理] 整轮清理失败: {}", e.getMessage());
        }
    }

    // ==================== 私有辅助 ====================

    private void sendReadyAlert(Classroom c) {
        try {
            ClassroomAlertReq alert = new ClassroomAlertReq();
            alert.setScheduleId(c.getScheduleId());
            alert.setCourseId(c.getCourseId());
            alert.setAlertType("READY_REMINDER");
            alert.setSeverity("INFO");
            alert.setMessage("课堂即将开始：" + (c.getCourseName() != null ? c.getCourseName() : c.getScheduleId()));
            alert.setOccurredAt(LocalDateTime.now());
            callbackService.sendAlert(c.getScheduleId(), alert);
        } catch (Exception e) {
            log.warn("[就绪提醒] 推送提醒失败 scheduleId={}, err={}", c.getScheduleId(), e.getMessage());
        }
    }
}
