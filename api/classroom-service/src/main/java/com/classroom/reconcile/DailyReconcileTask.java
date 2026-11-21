package com.classroom.reconcile;

import com.classroom.service.ReconcileService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 每日对账定时任务（01:00）。
 */
@Slf4j
@Component
public class DailyReconcileTask {

    private final ReconcileService reconcileService;

    public DailyReconcileTask(ReconcileService reconcileService) {
        this.reconcileService = reconcileService;
    }

    @Scheduled(cron = "${classroom.reconcile.cron:0 0 1 * * ?}")
    public void execute() {
        log.info("每日对账任务启动");
        reconcileService.dailyReconcile();
        log.info("每日对账任务完成");
    }
}