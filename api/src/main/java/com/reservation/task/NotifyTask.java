package com.reservation.task;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.reservation.entity.Tenant;
import com.reservation.mapper.TenantMapper;
import com.reservation.service.NotifyDispatchService;
import com.reservation.service.SysConfigService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * 上课通知定时任务：每分钟扫描一次「当前到达发送窗口」的上课提醒并推送。
 *
 * <h3>为什么必须逐租户处理</h3>
 * 定时任务没有 HTTP 请求，也就没有租户上下文。而全局租户插件在
 * {@code com.reservation.utils.TenantContext#getTenantId()} 为 null 时会兜底成 {@code -1}
 * （见 MyBatisPlusConfig：返回 NullValue 会让条件退化成 {@code tenant_id = NULL} 恒不成立，
 * 返回 null 又会查全量，所以只能兜 -1）。
 * 结果是：任务照常在跑、日志照常打印，但所有查询恒为空——「任务在跑但永远没有通知」。
 *
 * <p>所以这里的写法与 {@code MonitorTask.snapshotTenantStats} 保持一致：
 * 先扫出全部有效租户 → 逐个处理 → 每个租户处理完清上下文。
 *
 * <h3>2026-10-09 起改为异步逐租户投递</h3>
 * 原本是调度线程内for 循环同步发HTTP，轮耗时 = Σ(各租户 HTTP 耗时)，
 * 慢时一轮超过 60s，与其它定时任务抢同一条调度线程。
 * 现改为：调度线程只负责「扫描租户 + 提交」，投递在
 * {@link TenantAwareExecutor} 的工作线程里并行完成。
 *
 * <p><b>租户上下文的所有权也随之转移</b>：因为 {@code TenantContext} 是 ThreadLocal、
 * 不跨线程，所以 {@code setTenantId / clear} 必须由执行器在<b>工作线程内</b>完成，
 * 不能留在本类的调度线程里——那样子线程读到null，一切照旧恒空。
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
     * 逐租户的投递被移到该执行器异步跑（2026-10-09）。
     *
     * <p><b>为什么改</b>：原先是"调度线程里 for 循环逐租户同步发 HTTP"，
     * 轮耗时 = Σ(各租户的 HTTP 耗时)。租户多或 message-service 变慢时，
     * 一轮会超过 60s，与 8 个 @Scheduled 共用一条调度线程时会把指标采样等一起推迟。
     *
     * <p><b>改完必须知道的两件事</b>：
     * <ol>
     *   <li><b>租户上下文不能设在调度线程里</b>。TenantContext 是 ThreadLocal，
     *       子线程读到的仍是 null → 被租户插件兜底成 tenant_id=-1 → 恒空。
     *       所以必须由 {@link TenantAwareExecutor} 在<b>工作线程内</b>自己 set/clear。</li>
     *   <li><b>本方法现在只负责"扫描租户 + 提交"，不再关心发送结果</b>，
     *       因此方法末尾不能再打"本轮共 N 条"——那时发送还没开始，
     *       统计已无从谈起。逐租户的条数改在异步侧汇总。</li>
     * </ol>
     */
    @Autowired
    private TenantAwareExecutor tenantAwareExecutor;

    /**
     * 每 60 秒执行一轮。
     *
     * <p>用 {@code fixedDelay} 而非 {@code fixedRate}：上一轮跑完才起下一轮。
     * 但注意 fixedDelay 约束的是<b>本方法</b>，异步投出去的任务不受它约束 ——
     * 因此可能出现"上一轮异步任务还在跑、这一轮又扫了一遍"的情况。
     * <b>这是安全的</b>：投递幂等由数据库唯一键 {@code uk_dispatch_once} 保证
     * （NotifyDispatchService 里 catch DuplicateKeyException 即为幂等路径），
     * 不需要、也不应该在这里再加一层去重（见 {@link TenantAwareExecutor} 类注释）。
     */
    @Scheduled(fixedDelay = TICK_MS)
    public void dispatchLessonReminders() {
        if (!taskEnabled()) {
            return;
        }
        try {
            LambdaQueryWrapper<Tenant> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(Tenant::getDeleted, 0);
            List<Tenant> tenants = tenantMapper.selectList(wrapper);
            if (tenants == null || tenants.isEmpty()) {
                return;
            }
            List<Long> tenantIds = new ArrayList<>(tenants.size());
            for (Tenant t : tenants) {
                if (t != null && t.getId() != null) {
                    tenantIds.add(t.getId());
                }
            }
            if (tenantIds.isEmpty()) {
                return;
            }
            // 逐租户异步投递：每租户一次失败不会影响其他租户，也不再占住调度线程。
            int submitted = tenantAwareExecutor.submitAllForTenants(tenantIds, this::dispatchOneTenant);
            log.info("上课提醒已派发：{} 个租户进入投递队列，{} 租户", tenantIds.size(), submitted);
        } catch (Exception e) {
            log.warn("上课提醒任务执行失败: {}", e.getMessage());
        }
    }

    /**
     * 单租户投递（在<b>异步工作线程</b>内执行，租户上下文已由执行器设好）。
     *
     * <p>这里的 try/catch 是第二层保险：执行器里也有一层。
     * 双层不是冗余 —— 执行器那层防的是"任务体本身抛异常"，
     * 这层防的是"日志与计数"相关的异常不致于影响投递主流程。
     */
    private void dispatchOneTenant(Long tenantId) {
        int sent;
        try {
            sent = notifyDispatchService.dispatchDueNotifications();
        } catch (Exception e) {
            // 单租户失败不能中断其他租户
            log.warn("租户{}上课提醒发送失败: {}", tenantId, e.getMessage());
            return;
        }
        if (sent > 0) {
            log.info("租户{}上课提醒发送完成，本租户共 {} 条", tenantId, sent);
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
