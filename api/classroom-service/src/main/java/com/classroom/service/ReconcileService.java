package com.classroom.service;

import com.classroom.entity.ReconcileLog;
import com.classroom.mapper.ReconcileLogMapper;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 对账服务。
 */
@Slf4j
@Service
public class ReconcileService {

    private final ReconcileLogMapper reconcileLogMapper;

    public ReconcileService(ReconcileLogMapper reconcileLogMapper) {
        this.reconcileLogMapper = reconcileLogMapper;
    }

    public void logEvent(String eventId, String eventType, String scheduleId, String result, String skipReason, String failReason) {
        ReconcileLog log = new ReconcileLog();
        log.setEventId(eventId);
        log.setEventType(eventType);
        log.setScheduleId(scheduleId);
        log.setResult(result);
        log.setSkipReason(skipReason);
        log.setFailReason(failReason);
        log.setRetryCount(0);
        log.setReceivedAt(LocalDateTime.now());
        reconcileLogMapper.insert(log);
    }

    public List<ReconcileLog> listRecent(int days) {
        LambdaQueryWrapper<ReconcileLog> wrapper = new LambdaQueryWrapper<>();
        wrapper.ge(ReconcileLog::getReceivedAt, LocalDateTime.now().minusDays(days))
               .orderByDesc(ReconcileLog::getReceivedAt);
        return reconcileLogMapper.selectList(wrapper);
    }

    public void dailyReconcile() {
        log.info("日终对账开始");
        List<ReconcileLog> recent = listRecent(7);
        log.info("日终对账完成: 近7日事件数={}", recent.size());
    }
}