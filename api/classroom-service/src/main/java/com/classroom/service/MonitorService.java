package com.classroom.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.classroom.entity.Classroom;
import com.classroom.entity.Membership;
import com.classroom.entity.ReconcileDiff;
import com.classroom.mapper.ClassroomMapper;
import com.classroom.mapper.MembershipMapper;
import com.classroom.recording.RecordingBackendRegistry;
import com.classroom.reconcile.ReconcileDiffHandler;
import com.classroom.rtc.RtcProviderRegistry;
import com.classroom.storage.StorageService;
import com.classroom.metrics.BizMetrics;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 实时监控（F8-01）。
 *
 * <p>修复前只有 {@code GET /admin/classrooms/monitor?status=LIVE} 一个裸列表：
 * 看不到并发数、看不到在线人数、看不到有没有异常在堆着。
 *
 * <p>这里的「并发数」口径写死为<b>今日 LIVE 课堂数</b>，而不是"所有 LIVE"——
 * 历史遗留的僵尸课堂（自动下课没生效）会把并发数永久虚高，反而掩盖真问题；
 * 僵尸课堂单独在 {@link #alerts} 里暴露，该修就修，不要混进实时水位里。
 */
@Slf4j
@Service
public class MonitorService {

    private final ClassroomMapper classroomMapper;
    private final MembershipMapper membershipMapper;
    private final ReconcileDiffHandler diffHandler;
    private final MediaService mediaService;
    private final RtcProviderRegistry rtcProviderRegistry;
    private final RecordingBackendRegistry recordingRegistry;
    private final StorageService storageService;
    /** 指标回写：概览接口本来就要算这几个数，顺手写进 Gauge，零额外扫描 */
    private final BizMetrics metrics;

    public MonitorService(ClassroomMapper classroomMapper,
                          MembershipMapper membershipMapper,
                          ReconcileDiffHandler diffHandler,
                          MediaService mediaService,
                          RtcProviderRegistry rtcProviderRegistry,
                          RecordingBackendRegistry recordingRegistry,
                          StorageService storageService,
                          BizMetrics metrics) {
        this.classroomMapper = classroomMapper;
        this.membershipMapper = membershipMapper;
        this.diffHandler = diffHandler;
        this.mediaService = mediaService;
        this.rtcProviderRegistry = rtcProviderRegistry;
        this.recordingRegistry = recordingRegistry;
        this.storageService = storageService;
        this.metrics = metrics;
    }

    /** 实时概览：并发课堂、在线人数、今日课程水位、异常堆积 */
    public Map<String, Object> overview(Long tenantId) {
        LocalDateTime dayStart = LocalDate.now().atStartOfDay();
        LocalDateTime dayEnd = dayStart.plusDays(1);

        LambdaQueryWrapper<Classroom> todayWrapper = new LambdaQueryWrapper<>();
        todayWrapper.ge(Classroom::getStartTime, dayStart)
                    .lt(Classroom::getStartTime, dayEnd);
        if (tenantId != null) todayWrapper.eq(Classroom::getTenantId, tenantId);
        List<Classroom> today = classroomMapper.selectList(todayWrapper);

        int live = 0, ready = 0, closed = 0, scheduled = 0;
        for (Classroom c : today) {
            String s = c.getStatus();
            if ("LIVE".equals(s)) live++;
            else if ("READY".equals(s)) ready++;
            else if ("CLOSED".equals(s)) closed++;
            else if ("SCHEDULED".equals(s)) scheduled++;
        }

        // 活跃课堂明细（LIVE + READY）：每节带在线人数，运营要能一眼看出「哪个班没人」
        List<Map<String, Object>> activeClasses = new ArrayList<>();
        long onlineTotal = 0;
        for (Classroom c : today) {
            if (!"LIVE".equals(c.getStatus()) && !"READY".equals(c.getStatus())) continue;
            long online = countOnline(c.getScheduleId());
            long members = countMembers(c.getScheduleId());
            onlineTotal += online;

            Map<String, Object> item = new LinkedHashMap<>();
            item.put("scheduleId", c.getScheduleId());
            item.put("courseName", c.getCourseName());
            item.put("teacherId", c.getTeacherId());
            item.put("teacherName", c.getTeacherName());
            item.put("startTime", c.getStartTime());
            item.put("endTime", c.getEndTime());
            item.put("status", c.getStatus());
            item.put("onlineCount", online);
            item.put("memberCount", members);
            item.put("actualStart", c.getActualStart());
            activeClasses.add(item);
        }

        // 顺带回写 Gauge：Prometheus 抓取时不希望再打一次 DB（抓取是周期性的，
        // 15s 一次的全表统计在生产上会成为显著负载）
        metrics.setLiveClassrooms(live);
        metrics.setOnlineUsers(onlineTotal);

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("serverTime", LocalDateTime.now());
        m.put("todayClasses", today.size());
        m.put("liveClasses", live);
        m.put("readyClasses", ready);
        m.put("closedClasses", closed);
        m.put("scheduledClasses", scheduled);
        m.put("concurrency", live);
        m.put("onlineUsers", onlineTotal);
        m.put("openDiffs", diffHandler.countOpen());
        m.put("activeClasses", activeClasses);
        m.put("media", mediaService.activeProvider());
        m.put("recordingMode", recordingRegistry.activeMode());
        return m;
    }

    /** 告警聚合：未处置的对账差异 + 卡在 LIVE 下不来的课堂 */
    public Map<String, Object> alerts(Long tenantId) {
        List<ReconcileDiff> diffs = diffHandler.list("OPEN", 30);

        LocalDateTime staleBefore = LocalDateTime.now().minusHours(2);
        List<Classroom> stale = classroomMapper.listStaleLive(staleBefore);
        List<Map<String, Object>> staleItems = new ArrayList<>();
        for (Classroom c : stale) {
            if (tenantId != null && c.getTenantId() != null && !tenantId.equals(c.getTenantId())) continue;
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("scheduleId", c.getScheduleId());
            item.put("courseName", c.getCourseName());
            item.put("teacherName", c.getTeacherName());
            item.put("endTime", c.getEndTime());
            item.put("status", c.getStatus());
            staleItems.add(item);
        }

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("openDiffCount", diffs.size());
        m.put("diffs", diffs);
        m.put("staleLiveCount", staleItems.size());
        m.put("staleLive", staleItems);
        m.put("level", (!diffs.isEmpty() || !staleItems.isEmpty()) ? "WARN" : "OK");
        return m;
    }

    /**
     * 部署健康：把 RTC/录制/存储的实际选型摊开。
     *
     * <p>「配了 livekit 却一直跑 mesh」「配了 cloud 录制但只有 client」这类事故，
     * 不会有任何报错，只有把 configured 与 active 并排显示才查得出来。
     */
    public Map<String, Object> metrics() {
        Map<String, Object> m = new LinkedHashMap<>();
        Map<String, Object> rtc = new LinkedHashMap<>();
        rtc.put("active", rtcProviderRegistry.activeName());
        rtc.put("providers", rtcProviderRegistry.describe());
        m.put("rtc", rtc);
        m.put("recording", recordingRegistry.describe());
        m.put("storage", Map.of("type", storageService.storageType()));
        m.put("serverTime", LocalDateTime.now());
        return m;
    }

    private long countOnline(String scheduleId) {
        LambdaQueryWrapper<Membership> w = new LambdaQueryWrapper<>();
        w.eq(Membership::getScheduleId, scheduleId)
         .in(Membership::getOnlineState, List.of("ONLINE", "IDLE"))
         .eq(Membership::getKicked, false);
        Long n = membershipMapper.selectCount(w);
        return n == null ? 0 : n;
    }

    private long countMembers(String scheduleId) {
        LambdaQueryWrapper<Membership> w = new LambdaQueryWrapper<>();
        w.eq(Membership::getScheduleId, scheduleId).eq(Membership::getKicked, false);
        Long n = membershipMapper.selectCount(w);
        return n == null ? 0 : n;
    }
}
