package com.classroom.service;

import com.classroom.entity.ReconcileLog;
import com.classroom.mapper.ReconcileLogMapper;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
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

    public void dailyReconcile() {
        log.info("日终对账开始");
        List<ReconcileLog> recent = listRecent(7);
        log.info("日终对账完成: 近7日事件数={}", recent.size());
    }
}