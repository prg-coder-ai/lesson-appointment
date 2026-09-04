package com.reservation.task;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.reservation.entity.Tenant;
import com.reservation.entity.TenantStatsMonthly;
import com.reservation.mapper.TenantMapper;
import com.reservation.mapper.TenantStatsMonthlyMapper;
import com.reservation.service.MonitorService;
import com.reservation.service.SysConfigService;
import com.reservation.service.TenantQuotaService;
import com.reservation.service.UserSessionService;
import com.reservation.utils.TenantContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 平台监控与统计定时任务（单机部署）
 *
 * 采样间隔、数据保留天数等参数全部取自 sys_system_config，可在「系统配置」菜单调整；
 * monitor.task.enabled = 0 时全部跳过。
 */
@Component
public class MonitorTask {

    private static final Logger log = LoggerFactory.getLogger(MonitorTask.class);

    /** 任务调度周期（毫秒）：每分钟检查一次是否需要采样 */
    private static final long TICK_MS = 60_000L;

    @Autowired
    private MonitorService monitorService;
    @Autowired
    private SysConfigService sysConfigService;
    @Autowired
    private UserSessionService userSessionService;
    @Autowired
    private TenantQuotaService tenantQuotaService;
    @Autowired
    private TenantMapper tenantMapper;
    @Autowired
    private TenantStatsMonthlyMapper tenantStatsMonthlyMapper;

    /** 上次采样时间 */
    private LocalDateTime lastSampleTime;

    /**
     * 指标采样：按配置的间隔落库
     */
    @Scheduled(fixedDelay = TICK_MS)
    public void sampleMetrics() {
        if (!taskEnabled()) {
            return;
        }
        int intervalSeconds = sysConfigService.getInt(SysConfigService.KEY_SAMPLE_INTERVAL, 60);
        LocalDateTime now = LocalDateTime.now();
        if (lastSampleTime != null
                && lastSampleTime.plusSeconds(intervalSeconds).isAfter(now)) {
            return;
        }
        lastSampleTime = now;
        monitorService.sampleAndSave();
    }

    /**
     * 小时聚合：每小时第 5 分钟聚合上一小时
     */
    @Scheduled(cron = "0 5 * * * ?")
    public void aggregateHourly() {
        if (!taskEnabled()) {
            return;
        }
        try {
            monitorService.aggregateHourly();
        } catch (Exception e) {
            log.warn("小时聚合失败: {}", e.getMessage());
        }
    }

    /**
     * 每日清理：指标明细、小时聚合、历史会话、过期会话
     */
    @Scheduled(cron = "0 10 3 * * ?")
    public void cleanHistory() {
        if (!taskEnabled()) {
            return;
        }
        try {
            monitorService.cleanDetail();
            monitorService.cleanHourly();
            userSessionService.cleanExpired();
            userSessionService.cleanHistory(
                    sysConfigService.getInt(SysConfigService.KEY_RETENTION_DETAIL, 7));
        } catch (Exception e) {
            log.warn("历史数据清理失败: {}", e.getMessage());
        }
    }

    /**
     * 额度对账：每日凌晨 3:30 把各租户套餐的当前数量校正为实际统计值，
     * 防止并发异常、手工改库等造成计数漂移
     */
    @Scheduled(cron = "0 30 3 * * ?")
    public void reconcileQuota() {
        if (!taskEnabled()) {
            return;
        }
        try {
            tenantQuotaService.reconcileAll();
        } catch (Exception e) {
            log.warn("额度对账失败: {}", e.getMessage());
        }
    }

    /**
     * 会话过期清理：每 5 分钟一次
     */
    @Scheduled(cron = "0 0/5 * * * ?")
    public void cleanExpiredSession() {
        if (!taskEnabled()) {
            return;
        }
        try {
            userSessionService.cleanExpired();
        } catch (Exception e) {
            log.warn("过期会话清理失败: {}", e.getMessage());
        }
    }

    /**
     * 租户月度用量快照：每日凌晨 2:05 生成/刷新当月快照，
     * 使「与上月的变化」始终以上月记录为基准
     */
    @Scheduled(cron = "0 5 2 * * ?")
    public void snapshotTenantStats() {
        if (!taskEnabled()) {
            return;
        }
        String month = TenantQuotaService.currentMonth();
        try {
            LambdaQueryWrapper<Tenant> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(Tenant::getDeleted, 0);
            List<Tenant> tenants = tenantMapper.selectList(wrapper);
            if (tenants == null || tenants.isEmpty()) {
                return;
            }
            for (Tenant tenant : tenants) {
                // 定时任务无 HTTP 上下文，显式设置租户上下文，
                // 否则租户插件按兜底值拼条件，统计结果会恒为 0
                TenantContext.setTenantId(tenant.getId());
                try {
                    upsertSnapshot(tenant.getId(), month);
                } finally {
                    TenantContext.clear();
                }
            }
            log.info("租户月度快照生成完成, month={}, 租户数={}", month, tenants.size());
        } catch (Exception e) {
            log.warn("租户月度快照生成失败: {}", e.getMessage());
        }
    }

    /**
     * 清理过期的月度快照（保留月数由配置控制）
     */
    @Scheduled(cron = "0 20 2 * * ?")
    public void cleanExpiredSnapshot() {
        if (!taskEnabled()) {
            return;
        }
        int keepMonths = sysConfigService.getInt(SysConfigService.KEY_STATS_RETENTION, 12);
        String deadlineMonth = java.time.YearMonth.now().minusMonths(keepMonths).toString();
        LambdaQueryWrapper<TenantStatsMonthly> wrapper = new LambdaQueryWrapper<>();
        wrapper.lt(TenantStatsMonthly::getStatMonth, deadlineMonth);
        int rows = tenantStatsMonthlyMapper.delete(wrapper);
        if (rows > 0) {
            log.info("清理过期月度快照, 保留{}个月, 删除{}条", keepMonths, rows);
        }
    }

    private void upsertSnapshot(Long tenantId, String month) {
        TenantStatsMonthly stat = tenantQuotaService.buildMonthlySnapshot(tenantId, month);
        TenantStatsMonthly exist = tenantQuotaService.getSnapshot(tenantId, month);
        if (exist != null) {
            stat.setId(exist.getId());
            tenantStatsMonthlyMapper.updateById(stat);
        } else {
            tenantStatsMonthlyMapper.insert(stat);
        }
    }

    private boolean taskEnabled() {
        return sysConfigService.getBool(SysConfigService.KEY_TASK_ENABLED, true);
    }
}
