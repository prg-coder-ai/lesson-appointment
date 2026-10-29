package com.classroom.reconcile;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.classroom.dto.ClassroomAlertReq;
import com.classroom.entity.ReconcileDiff;
import com.classroom.mapper.ReconcileDiffMapper;
import com.classroom.service.CallbackService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 对账差异登记与处置（F7-05）。
 *
 * <p>修复前这里是 {@code log.warn} 一行就结束的 stub —— 差异只存在日志里，
 * 日志一滚动就查不到了，也没人能「处置」它。
 *
 * <p>现在做三件事：
 * <ol>
 *   <li><b>落库</b>：{@code classroom_reconcile_diff}，带类型、严重级、明细；</li>
 *   <li><b>去重</b>：同课堂同类型且仍 OPEN 的差异不再重复插（每天扫一次会连续命中同一个课堂）；</li>
 *   <li><b>告警</b>：只有 ERROR 级才推预约侧，WARN 留在运营台自己看，避免告警疲劳。</li>
 * </ol>
 */
@Slf4j
@Component
public class ReconcileDiffHandler {

    public static final String TYPE_MISSING_CALLBACK = "MISSING_CALLBACK";
    public static final String TYPE_CALLBACK_FAILED = "CALLBACK_FAILED";
    public static final String TYPE_VERSION_GAP = "VERSION_GAP";
    public static final String TYPE_STATUS_MISMATCH = "STATUS_MISMATCH";
    public static final String TYPE_DURATION_MISMATCH = "DURATION_MISMATCH";

    private final ReconcileDiffMapper diffMapper;
    private final CallbackService callbackService;

    public ReconcileDiffHandler(ReconcileDiffMapper diffMapper, CallbackService callbackService) {
        this.diffMapper = diffMapper;
        this.callbackService = callbackService;
    }

    /** 记录一条差异（默认 WARN） */
    public void handleDiff(String scheduleId, String diffType, String detail) {
        handleDiff(scheduleId, diffType, detail, "WARN");
    }

    public void handleDiff(String scheduleId, String diffType, String detail, String severity) {
        if (scheduleId == null || diffType == null) return;

        ReconcileDiff existing = findOpen(scheduleId, diffType);
        if (existing != null) {
            // 同课堂同类型仍 OPEN：只更新明细，不刷出一堆重复行
            existing.setDetail(truncate(detail, 1000));
            existing.setSeverity(severity);
            diffMapper.updateById(existing);
            log.debug("对账差异已存在，更新明细: scheduleId={}, type={}", scheduleId, diffType);
            return;
        }

        ReconcileDiff diff = new ReconcileDiff();
        diff.setScheduleId(scheduleId);
        diff.setDiffType(diffType);
        diff.setSeverity(severity);
        diff.setDetail(truncate(detail, 1000));
        diff.setStatus("OPEN");
        diff.setCreatedAt(LocalDateTime.now());
        diffMapper.insert(diff);
        log.warn("对账差异登记: scheduleId={}, type={}, severity={}, detail={}",
                scheduleId, diffType, severity, detail);

        if ("ERROR".equals(severity)) {
            ClassroomAlertReq alert = new ClassroomAlertReq();
            alert.setScheduleId(scheduleId);
            alert.setAlertType("RECONCILE_DIFF");
            alert.setMessage(truncate("对账差异[" + diffType + "] " + detail, 200));
            callbackService.sendAlert(scheduleId, alert);
        }
    }

    public ReconcileDiff findOpen(String scheduleId, String diffType) {
        LambdaQueryWrapper<ReconcileDiff> w = new LambdaQueryWrapper<>();
        w.eq(ReconcileDiff::getScheduleId, scheduleId)
         .eq(ReconcileDiff::getDiffType, diffType)
         .eq(ReconcileDiff::getStatus, "OPEN")
         .orderByDesc(ReconcileDiff::getCreatedAt)
         .last("LIMIT 1");
        return diffMapper.selectOne(w);
    }

    /** 运营台：按状态查询差异（默认 OPEN） */
    public List<ReconcileDiff> list(String status, int days) {
        LambdaQueryWrapper<ReconcileDiff> w = new LambdaQueryWrapper<>();
        if (status != null && !status.isBlank()) {
            w.eq(ReconcileDiff::getStatus, status.toUpperCase());
        }
        w.ge(ReconcileDiff::getCreatedAt, LocalDateTime.now().minusDays(Math.max(1, days)));
        w.orderByDesc(ReconcileDiff::getCreatedAt);
        return diffMapper.selectList(w);
    }

    /** 处置：RESOLVED（已修）/ IGNORED（确认无害） */
    public boolean resolve(Long diffId, String operatorId, String note, boolean ignore) {
        ReconcileDiff diff = diffMapper.selectById(diffId);
        if (diff == null) return false;
        diff.setStatus(ignore ? "IGNORED" : "RESOLVED");
        diff.setResolvedAt(LocalDateTime.now());
        diff.setResolvedBy(operatorId);
        diff.setResolveNote(truncate(note, 255));
        diffMapper.updateById(diff);
        log.info("对账差异已处置: diffId={}, status={}, by={}", diffId, diff.getStatus(), operatorId);
        return true;
    }

    public long countOpen() {
        LambdaQueryWrapper<ReconcileDiff> w = new LambdaQueryWrapper<>();
        w.eq(ReconcileDiff::getStatus, "OPEN");
        return diffMapper.selectCount(w);
    }

    private String truncate(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max);
    }
}
