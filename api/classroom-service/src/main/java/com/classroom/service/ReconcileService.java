package com.classroom.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.classroom.dto.ReconcileReportReq;
import com.classroom.entity.Classroom;
import com.classroom.entity.ReconcileLog;
import com.classroom.mapper.ClassroomMapper;
import com.classroom.mapper.ReconcileLogMapper;
import com.classroom.reconcile.ReconcileDiffHandler;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 对账服务（F7-05）。
 *
 * <p>修复前 {@link #dailyReconcile()} 只统计"近 7 日事件条数"就打完了 —— 它不是对账，
 * 是日志计数。真正要回答的是三个问题：
 * <ol>
 *   <li>昨天结束的课堂，<b>课时回流发出去没有</b>（consumption_version 是否被推进）；</li>
 *   <li>有没有课堂<b>卡在 LIVE 下不来</b>（自动下课没生效）；</li>
 *   <li>有没有<b>排期事件处理失败</b>（消费侧 FAILED）导致课堂数据本身就是错的。</li>
 * </ol>
 *
 * <p>三类结论都会落 {@code classroom_reconcile_diff}（可查、可处置），并汇成
 * {@link ReconcileReportReq} 推给预约系统 —— 这也是 {@code sendReconcileReport}
 * 从「零调用」变成有真实调用者的地方。
 */
@Slf4j
@Service
public class ReconcileService {

    private final ReconcileLogMapper reconcileLogMapper;
    private final ClassroomMapper classroomMapper;
    private final ReconcileDiffHandler diffHandler;
    private final CallbackService callbackService;

    @Value("${classroom.auto-end-grace-minutes:5}")
    private int autoEndGraceMinutes;

    public ReconcileService(ReconcileLogMapper reconcileLogMapper,
                            ClassroomMapper classroomMapper,
                            ReconcileDiffHandler diffHandler,
                            CallbackService callbackService) {
        this.reconcileLogMapper = reconcileLogMapper;
        this.classroomMapper = classroomMapper;
        this.diffHandler = diffHandler;
        this.callbackService = callbackService;
    }

    /**
     * 落一条对账流水。
     *
     * <p><b>必须容错，不能抛</b>：event_id 是主键，重复投递（Redis 不可用时幂等会降级放行，
     * 或同一事件被重试）必然撞键。若这里抛出，调用方 {@code ScheduleEventConsumer} 的
     * catch 会再调一次 logEvent 写 FAILED，于是第二次撞键 → 又一个异常 → 整个请求 500。
     * 对账流水是「审计旁路」，它挂了不该把主线事件处理也带挂。
     *
     * <p><b>字段长度截断</b>：fail_reason 是 varchar(500)、skip_reason 是 varchar(50)，
     * 而异常 message 常常带着整段 SQL 远超 500 —— 不截断就是 MysqlDataTruncation（已实测踩到）。
     */
    public void logEvent(String eventId, String eventType, String scheduleId, String result,
                         String skipReason, String failReason) {
        // 局部变量名不能叫 log：会遮蔽 Lombok @Slf4j 注入的 logger，
        // 导致 catch 里的 log.debug/log.warn 编译不过（曾踩）
        ReconcileLog row = new ReconcileLog();
        row.setEventId(eventId);
        row.setEventType(eventType);
        row.setScheduleId(scheduleId);
        row.setResult(result);
        row.setSkipReason(truncate(skipReason, 50));
        row.setFailReason(truncate(failReason, 500));
        row.setRetryCount(0);
        row.setReceivedAt(LocalDateTime.now());
        try {
            reconcileLogMapper.insert(row);
        } catch (DuplicateKeyException e) {
            // 同一 eventId 已有审计记录：幂等语义下不是错误，保留首次结论即可
            log.debug("对账流水已存在，跳过重复写入: eventId={}", eventId);
        } catch (Exception e) {
            // 审计旁路失败不得上抛，否则会把主线业务异常化
            log.warn("对账流水写入失败(已忽略): eventId={}, err={}", eventId, e.getMessage());
        }
    }

    private String truncate(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max);
    }

    public List<ReconcileLog> listRecent(int days) {
        LambdaQueryWrapper<ReconcileLog> wrapper = new LambdaQueryWrapper<>();
        wrapper.ge(ReconcileLog::getReceivedAt, LocalDateTime.now().minusDays(days))
               .orderByDesc(ReconcileLog::getReceivedAt);
        return reconcileLogMapper.selectList(wrapper);
    }

    /** 近 N 日失败事件（按 scheduleId 去重，供对账判定用） */
    public List<ReconcileLog> listFailures(int days) {
        LambdaQueryWrapper<ReconcileLog> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(ReconcileLog::getResult, "FAILED")
               .ge(ReconcileLog::getReceivedAt, LocalDateTime.now().minusDays(days))
               .orderByDesc(ReconcileLog::getReceivedAt);
        return reconcileLogMapper.selectList(wrapper);
    }

    /**
     * 日终对账（默认窗口：昨日 00:00 ~ 今日 00:00）。
     *
     * @return 对账结论（供运营台/日志展示）
     */
    public Map<String, Object> dailyReconcile() {
        LocalDateTime to = LocalDate.now().atStartOfDay();
        LocalDateTime from = to.minusDays(1);
        log.info("日终对账开始: 窗口 {} ~ {}", from, to);

        // scheduleId -> 差异类型（同一课堂多类差异只上报一次，取首个命中的类型）
        Map<String, String> diffs = new LinkedHashMap<>();
        Map<String, String> statuses = new LinkedHashMap<>();
        int missingCallback = 0, statusMismatch = 0, staleLive = 0, callbackFailed = 0;

        // 规则 1&2：昨日已结束的课堂，回流版本未推进 / 实际下课时间为空
        for (Classroom c : classroomMapper.listClosedBetween(from, to)) {
            statuses.put(c.getScheduleId(), c.getStatus());
            int version = c.getConsumptionVersion() == null ? 0 : c.getConsumptionVersion();
            if (version <= 0) {
                missingCallback++;
                diffs.putIfAbsent(c.getScheduleId(), ReconcileDiffHandler.TYPE_MISSING_CALLBACK);
                diffHandler.handleDiff(c.getScheduleId(), ReconcileDiffHandler.TYPE_MISSING_CALLBACK,
                        "课堂已 CLOSED 但 consumption_version=0，课时回流未发生", "ERROR");
                continue;
            }
            if (c.getActualEnd() == null) {
                statusMismatch++;
                diffs.putIfAbsent(c.getScheduleId(), ReconcileDiffHandler.TYPE_STATUS_MISMATCH);
                diffHandler.handleDiff(c.getScheduleId(), ReconcileDiffHandler.TYPE_STATUS_MISMATCH,
                        "课堂已 CLOSED 但 actual_end 为空", "ERROR");
            }
        }

        // 规则 3：卡在 LIVE 下不来的课堂（自动下课扫描器 2 倍宽限后仍未处理 = 有问题）
        LocalDateTime staleBefore = LocalDateTime.now().minusMinutes(autoEndGraceMinutes * 2L);
        for (Classroom c : classroomMapper.listStaleLive(staleBefore)) {
            staleLive++;
            statuses.putIfAbsent(c.getScheduleId(), c.getStatus());
            diffs.putIfAbsent(c.getScheduleId(), ReconcileDiffHandler.TYPE_STATUS_MISMATCH);
            diffHandler.handleDiff(c.getScheduleId(), ReconcileDiffHandler.TYPE_STATUS_MISMATCH,
                    "课堂仍为 LIVE，计划结束时间 " + c.getEndTime() + " 已过宽限仍未下课", "ERROR");
        }

        // 规则 4：近 3 日事件消费失败（这些课堂的数据本身就是不可信的）
        for (ReconcileLog failure : listFailures(3)) {
            if (failure.getScheduleId() == null) continue;
            if (diffs.containsKey(failure.getScheduleId())) continue;
            callbackFailed++;
            diffs.putIfAbsent(failure.getScheduleId(), ReconcileDiffHandler.TYPE_CALLBACK_FAILED);
            diffHandler.handleDiff(failure.getScheduleId(), ReconcileDiffHandler.TYPE_CALLBACK_FAILED,
                    "排期事件处理失败: " + truncate(failure.getFailReason(), 200), "ERROR");
        }

        // 汇总上报（空报告也要发：让预约侧知道「今天跑过且无差异」，比沉默更有信息量）
        ReconcileReportReq report = new ReconcileReportReq();
        report.setBatchId("RC" + LocalDate.now().format(DateTimeFormatter.BASIC_ISO_DATE));
        report.setReportTime(LocalDateTime.now());
        report.setScope("DAILY");
        List<ReconcileReportReq.ReconcileItem> items = new ArrayList<>();
        for (Map.Entry<String, String> e : diffs.entrySet()) {
            ReconcileReportReq.ReconcileItem item = new ReconcileReportReq.ReconcileItem();
            item.setScheduleId(e.getKey());
            item.setClassroomStatus(statuses.get(e.getKey()));
            item.setDiff(e.getValue());
            items.add(item);
        }
        report.setItems(items);
        callbackService.sendReconcileReport(report);

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("batchId", report.getBatchId());
        summary.put("windowFrom", from);
        summary.put("windowTo", to);
        summary.put("missingCallback", missingCallback);
        summary.put("statusMismatch", statusMismatch);
        summary.put("staleLive", staleLive);
        summary.put("callbackFailed", callbackFailed);
        summary.put("reported", items.size());
        summary.put("openDiffs", diffHandler.countOpen());
        log.info("日终对账完成: {}", summary);
        return summary;
    }
}
