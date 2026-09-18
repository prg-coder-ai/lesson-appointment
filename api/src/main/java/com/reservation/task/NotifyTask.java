package com.reservation.task;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.reservation.entity.Tenant;
import com.reservation.mapper.TenantMapper;
import com.reservation.service.NotifyDispatchService;
import com.reservation.service.SysConfigService;
import com.reservation.utils.TenantContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 上课通知定时任务：每分钟扫描一次「当前到达发送窗口」的上课提醒并推送。
 *
 * <h3>为什么必须逐租户设置上下文</h3>
 * 定时任务没有 HTTP 请求，也就没有租户上下文。而全局租户插件在
 * {@code TenantContext.getTenantId()} 为 null 时会兜底成 {@code -1}
 * （见 MyBatisPlusConfig：返回 NullValue 会让条件退化成 {@code tenant_id = NULL} 恒不成立，
 * 返回 null 又会查全量，所以只能兜 -1）。
 * 结果是：任务照常在跑、日志照常打印，但所有查询恒为空——「任务在跑但永远没有通知」。
 *
 * <p>所以这里的写法与 {@code MonitorTask.snapshotTenantStats} 保持一致：
 * 先扫出全部有效租户 → 逐个 {@code setTenantId} → 处理 → {@code finally clear()}。
 *
 * <p>另一个坑：{@code finally clear()} 不能省。线程池里的线程会被复用，
 * 残留的租户上下文会让**下一个**任务把数据算到上一个租户头上。
 */
@Component
public class NotifyTask {

    private static final Logger log = LoggerFactory.getLogger(NotifyTask.class);

    /** 扫描周期（毫秒）。必须小于 NotifyDispatchService.TOLERANCE_MINUTES，否则分钟级档位会漏 */
    private static final long TICK_MS = 60_000L;

    /**
     * 本任务专属开关。取不到该配置项时默认为「开」，
     * 故不需要预先往 sys_system_config 插记录；要临时停掉时插入该键并置 0 即可。
     */
    private static final String KEY_NOTIFY_TASK_ENABLED = "notify.task.enabled";

    @Autowired
    private NotifyDispatchService notifyDispatchService;
    @Autowired
    private TenantMapper tenantMapper;
    @Autowired
    private SysConfigService sysConfigService;

    /**
     * 每 60 秒执行一轮。
     *
     * <p>用 {@code fixedDelay} 而非 {@code fixedRate}：一轮扫描耗时不确定
     * （取决于课次数量与 message-service 的响应），fixedDelay 保证上一轮跑完才起下一轮，
     * 不会因为任务堆积而并发重入。
     */
    @Scheduled(fixedDelay = TICK_MS)
    public void dispatchLessonReminders() {
        if (!taskEnabled()) {
            return;
        }
        int total = 0;
        try {
            LambdaQueryWrapper<Tenant> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(Tenant::getDeleted, 0);
            List<Tenant> tenants = tenantMapper.selectList(wrapper);
            if (tenants == null || tenants.isEmpty()) {
                return;
            }
            for (Tenant tenant : tenants) {
                if (tenant == null || tenant.getId() == null) {
                    continue;
                }
                // 定时任务无 HTTP 上下文，必须显式设置，否则租户插件按兜底值拼条件，查询恒为空
                TenantContext.setTenantId(tenant.getId());
                try {
                    total += notifyDispatchService.dispatchDueNotifications();
                } catch (Exception e) {
                    // 单租户失败不能中断其他租户
                    log.warn("租户{}上课提醒发送失败: {}", tenant.getId(), e.getMessage());
                } finally {
                    TenantContext.clear();
                }
            }
            if (total > 0) {
                log.info("上课提醒发送完成，本轮共 {} 条", total);
            }
        } catch (Exception e) {
            log.warn("上课提醒任务执行失败: {}", e.getMessage());
        }
    }

    private boolean taskEnabled() {
        // 总开关（「系统配置 → 系统参数」里的定时任务开关）优先
        if (!sysConfigService.getBool(SysConfigService.KEY_TASK_ENABLED, true)) {
            return false;
        }
        return sysConfigService.getBool(KEY_NOTIFY_TASK_ENABLED, true);
    }
}
