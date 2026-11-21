package com.classroom.scheduler;

import com.classroom.dto.ClassroomAlertReq;
import com.classroom.entity.Classroom;
import com.classroom.entity.Membership;
import com.classroom.entity.RollCallRecord;
import com.classroom.mapper.PresenceSegmentMapper;
import com.classroom.mapper.ReconcileLogMapper;
import com.classroom.mapper.RollCallRecordMapper;
import com.classroom.mapper.SessionRecordMapper;
import com.classroom.mapper.SubmissionMapper;
import com.classroom.service.CallbackService;
import com.classroom.service.ClassroomService;
import com.classroom.service.MembershipService;
import com.classroom.service.RecordingService;
import com.classroom.ws.OnlineStateManager;
import com.classroom.ws.WsRoomRegistry;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

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
 *   <li>状态流转成功后一律广播 {@code class:state}（见 {@link #broadcastState}）：修复前调度器
 *       只改库不广播，自动开课后前端仍以为课堂是 SCHEDULED/READY，会误禁学生发布、徽标显示「待开课」。</li>
 * </ol>
 *
 * <p><b>七个扫描器</b>
 * <ol>
 *   <li>就绪提醒：SCHEDULED → READY + 推提醒（手动模式下只推提醒、不改状态）</li>
 *   <li>自动开课：到点 SCHEDULED/READY → LIVE（手动模式下整轮跳过）</li>
 *   <li>自动下课：LIVE 超计划结束 + 宽限 → CLOSED（手动模式下整轮跳过）</li>
 *   <li>学生掉线判定：DB 在线但 Redis key 消失 → OFFLINE（不改课堂状态，始终运行）</li>
 *   <li>点名超时：PENDING 超时被发起时长 → TIMEOUT（不涉及课堂状态，始终运行）</li>
 *   <li>教师掉线结课：教师离线超宽限 → 自动结课（手动模式下整轮跳过）</li>
 *   <li>过期数据清理：每日清理历史表（不涉及课堂状态，始终运行）</li>
 * </ol>
 *
 * <p><b>★课堂状态显式修改（{@code classroom.state-manual-only=true}，2026-11-16 起默认）</b>
 * <p>课堂状态 {@code SCHEDULED/READY/LIVE/PAUSED/CLOSED} 只允许由显式接口变更：
 * 教师 {@code /classrooms/{sid}/start|pause|resume|end}、管理员 {@code /admin/classrooms/{sid}/end}。
 * 因此扫描器 2/3/6 整轮跳过、扫描器 1 只提醒不改状态——不会再出现「时间到了课自己开始/自己结束」。
 * 想恢复自动流转，把 {@code classroom.state-manual-only} 置 false 即可，无需改代码。
 * <p>代价（有意接受）：手动模式下一堂课结束后<b>必须有人点「下课」</b>，否则它会一直停在 LIVE，
 * 既不结算课时也不释放媒体房间；运营台「活跃课堂」里能看到这类忘记下课的课堂。
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
    private final RecordingService recordingService;
    private final SessionRecordMapper sessionRecordMapper;
    private final SubmissionMapper submissionMapper;
    private final CallbackService callbackService;
    private final WsRoomRegistry wsRegistry;

    /**
     * 手动模式下「就绪提醒已推送」的 scheduleId 集合。
     *
     * <p>手动模式不改状态，{@code listReadyToRemind} 的选行条件（status='SCHEDULED'）永远成立，
     * 每 30 秒都会命中同一批课堂 —— 靠这个集合做进程内去重，否则会刷屏推送。
     * 进程重启后每堂课最多再推一次（提醒消息，不是状态，可接受）；每日过期清理时一并清空。
     */
    private final Set<String> readyReminded = ConcurrentHashMap.newKeySet();

    @Value("${classroom.state-manual-only:true}")
    private boolean manualStateOnly;
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
                              RecordingService recordingService,
                              SessionRecordMapper sessionRecordMapper,
                              SubmissionMapper submissionMapper,
                              CallbackService callbackService,
                              WsRoomRegistry wsRegistry) {
        this.classroomService = classroomService;
        this.membershipService = membershipService;
        this.onlineStateManager = onlineStateManager;
        this.rollCallRecordMapper = rollCallRecordMapper;
        this.presenceSegmentMapper = presenceSegmentMapper;
        this.reconcileLogMapper = reconcileLogMapper;
        this.recordingService = recordingService;
        this.sessionRecordMapper = sessionRecordMapper;
        this.submissionMapper = submissionMapper;
        this.callbackService = callbackService;
        this.wsRegistry = wsRegistry;
    }

    /**
     * 启动时把当前生命周期模式打出来。
     *
     * <p>这几个开关的行为差异很大（状态是自己走还是要人点），排查「课怎么自己结束了 / 怎么一直不结束」
     * 时第一件事就是确认模式——从启动日志一眼可辨，不用去翻配置文件或问人。
     */
    @PostConstruct
    void logLifecycleMode() {
        if (manualStateOnly) {
            log.info("[课堂生命周期] 显式修改模式（classroom.state-manual-only=true）："
                    + "课堂状态只由 start/pause/resume/end 显式接口变更；"
                    + "就绪提醒只推提醒不改状态，自动开课/自动下课/教师掉线结课均已停用");
        } else {
            log.warn("[课堂生命周期] 自动流转模式（classroom.state-manual-only=false）："
                    + "自动开课={}, 自动下课宽限={}min, 教师掉线结课宽限={}s",
                    autoStartEnabled, autoEndGraceMinutes, teacherDropGraceSeconds);
        }
    }

    // ============ 1. 就绪提醒（每 30 秒） ============
    /**
     * 把「上课前 N 分钟内（含已开始但卡在 SCHEDULED 的）」课堂推提醒。
     *
     * <p>手动模式（{@code classroom.state-manual-only=true}）：<b>只推提醒、不改状态</b>。
     * 状态是显式概念，课什么时候变 READY/LIVE 由人决定；提醒本身仍有价值（让教师知道快上课了），
     * 只是改由 {@link #readyReminded} 做进程内去重（选行条件是 status='SCHEDULED'，不去重会每 30 秒推一次）。
     *
     * <p>自动模式：{@code markReady} 只在真翻成功时返回 true，扫描器据此发提醒——翻失败（已被开课）不重复发。
     */
    @Scheduled(cron = "0/30 * * * * ?")
    public void scanReadyReminder() {
        try {
            List<Classroom> due = classroomService.findReadyToRemind(readyBeforeStartMinutes);
            for (Classroom c : due) {
                try {
                    if (manualStateOnly) {
                        if (readyReminded.add(c.getScheduleId())) {
                            sendReadyAlert(c);
                        }
                        continue;
                    }
                    if (classroomService.markReady(c.getScheduleId())) {
                        broadcastState(c.getScheduleId(), "READY");
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
     *
     * <p>手动模式整轮跳过（开课必须由教师点「进行中」或管理员显式开课）；
     * 自动模式下仍受全局开关 {@code classroom.auto-start} 与单课堂 {@code auto_start} 双重约束。
     */
    @Scheduled(cron = "0/30 * * * * ?")
    public void scanAutoStart() {
        if (manualStateOnly || !autoStartEnabled) {
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
                    broadcastState(c.getScheduleId(), "LIVE");   // 与 Controller /start 同口径，前端立即解禁发布
                    log.info("[自动开课] scheduleId={}", c.getScheduleId());
                } catch (com.classroom.exception.ClassroomBizException e) {
                    if (e.getCode() == com.classroom.common.ErrorCodes.CLASSROOM_CAPACITY_EXCEEDED) {
                        // 实例并发满了：不是故障，这一轮跳过、下一轮(30s)自动重试，
                        // 别人下课腾出位置后这节课就能开起来。用 warn 而不是 error，
                        // 否则满载期间每 30 秒刷一批 error，把真故障淹没。
                        log.warn("[自动开课] 实例并发已满，本轮跳过待重试 scheduleId={}", c.getScheduleId());
                    } else {
                        log.error("[自动开课] 处理失败 scheduleId={}, err={}", c.getScheduleId(), e.getMessage());
                    }
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
     * 仍 LIVE/PAUSED 且计划结束时间已过去 {@code auto-end-grace-minutes} 分钟的课堂自动下课。
     *
     * <p><b>手动模式整轮跳过</b>：下课是显式动作（教师「下课」按钮 / 管理员强制结束），
     * 时间到了不再替人做决定。留下的 LIVE 课堂会出现在运营台「活跃课堂」与对账告警里，
     * 由人判断是拖堂还是忘了下课。
     *
     * <p>自动模式复用 {@code endClass}：下课收尾（出勤核算 + 课时回流）与人工下课同口径。
     */
    @Scheduled(cron = "0/30 * * * * ?")
    public void scanAutoEnd() {
        if (manualStateOnly) {
            return;
        }
        try {
            List<Classroom> overdue = classroomService.findOverdueLive(autoEndGraceMinutes);
            for (Classroom c : overdue) {
                try {
                    classroomService.endClass(c.getScheduleId());
                    broadcastState(c.getScheduleId(), "CLOSED");
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
        // Redis 是「谁还在线」的唯一真相源。它不可用时 lastSeenElapsed 一律返回 null（没法区分
        // 「真的没心跳」和「读不到 Redis」），照旧判定会把整堂课成员 leave 出去、毁掉出勤。
        // 没有真相源就不做判断：整轮跳过，等 Redis 恢复。
        if (!onlineStateManager.isAvailable()) {
            log.warn("[学生掉线] Redis 不可用，本轮跳过全部离场判定（在线态保持现状）");
            return;
        }
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
     *
     * <p><b>手动模式整轮跳过</b>：教师掉线不替人结课，课堂保持 LIVE 等教师重连或管理员显式结束。
     * 扫描器 4 仍会把教师置 OFFLINE 并写入 leaveTime，运营台「活跃课堂」据此可见「教师已离线」，
     * 由人决定是否强制下课。
     */
    @Scheduled(cron = "0/40 * * * * ?")
    public void scanTeacherDrop() {
        if (manualStateOnly) {
            return;
        }
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
                            broadcastState(c.getScheduleId(), "CLOSED");
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
            // 录制清理必须"先删对象再删记录"，由 service 保证顺序（只删记录会漏掉磁盘上的文件）
            int recording = recordingService.purgeExpired();
            // 就绪提醒去重集合每日重置一次：课堂只会往前走，昨天的 scheduleId 不会再用到
            readyReminded.clear();
            log.info("[过期清理] presence={}, rollcall={}, reconcile={}, session={}, submission={}, recording={}",
                    presence, rollcall, reconcile, session, submission, recording);
        } catch (Exception e) {
            log.error("[过期清理] 整轮清理失败: {}", e.getMessage());
        }
    }

    // ==================== 私有辅助 ====================

    /**
     * 状态流转后向房间广播服务端权威态 {@code class:state}（与 Controller 的 /start|pause|resume|end
     * 后广播同一格式，前端 ClassroomMain.setClassStatus 统一消费）。
     *
     * <p><b>为什么调度器也要广播</b>：自动开课/自动下课/教师掉线结课/就绪提醒都直接改库，
     * 修复前不广播，前端 classStatus 会一直停留在进页时 /status 的旧值。最典型的后果是
     * 自动开课后学生端仍按 SCHEDULED 判定「不可发布」，明明服务端已放行却发不出音视频/白板/聊天，
     * 状态徽标也一直显示「待开课」。
     *
     * <p>广播失败只记 WARN：WS 不可用不能影响已落库的状态流转，更不能打断下课收尾
     * （destroyRoom + closeAfterEnd）。各扫描器的自包含 try/catch 仍然生效，此处再兜一层。
     */
    private void broadcastState(String scheduleId, String status) {
        try {
            wsRegistry.broadcastSignal(scheduleId,
                    "{\"type\":\"class:state\",\"status\":\"" + status + "\"}");
        } catch (Exception e) {
            log.warn("[状态广播] 失败 scheduleId={}, status={}, err={}", scheduleId, status, e.getMessage());
        }
    }

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
