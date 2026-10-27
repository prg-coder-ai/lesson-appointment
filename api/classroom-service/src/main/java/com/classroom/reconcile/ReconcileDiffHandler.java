package com.classroom.reconcile;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * 差异补偿任务生成。
 * M1 阶段为 stub，后续接入完整对账逻辑。
 */
@Slf4j
@Component
public class ReconcileDiffHandler {

    public void handleDiff(String scheduleId, String diffType, String detail) {
        log.warn("对账差异: scheduleId={}, type={}, detail={}", scheduleId, diffType, detail);
    }
}