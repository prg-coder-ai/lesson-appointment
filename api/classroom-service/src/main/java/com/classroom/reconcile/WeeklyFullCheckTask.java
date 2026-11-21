package com.classroom.reconcile;

import com.classroom.service.ReconcileService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 每周全量核对（周一 02:00）。
 */
@Slf4j
@Component
public class WeeklyFullCheckTask {

    private final ReconcileService reconcileService;

    public WeeklyFullCheckTask(ReconcileService reconcileService) {
        this.reconcileService = reconcileService;
    }

    @Scheduled(cron = "${classroom.reconcile.fullcheck.cron:0 0 2 ? * MON}")
    public void execute() {
        log.info("每周全量核对任务启动");
        reconcileService.dailyReconcile();
        log.info("每周全量核对任务完成");
    }
}