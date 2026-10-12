package com.reservation.task;

import com.reservation.utils.TenantContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 租户感知的异步执行器（供定时任务把「逐租户的慢操作」移出调度线程）。
 *
 * <h3>为什么不用 {@code @Async}</h3>
 * {@code @Async} 有三个特性让它不适合这个场景：
 * <ol>
 *   <li><b>它不传递租户上下文</b>。Spring 的 {@code TaskDecorator} 机制可以补，
 *       但那是把上下文"拷进"子线程；而这里需要的是"每个租户一个独立任务，
 *       各自设置自己的租户 id" —— 用装饰器表达不了。</li>
 *   <li><b>它作用于 {@code @Async} 注解</b>，而本项目的慢操作是
 *       {@code List<租户>} 循环，注解只能标在整个方法上，等于没拆。</li>
 *   <li><b>它默认共用全局 SimpleAsyncTaskExecutor 或 auto-config 的池</b>，
 *       而这个池与业务 HTTP 线程混用会互相拖累 —— 定时任务慢不该拖慢用户请求。</li>
 * </ol>
 * 所以这里自建池：<b>专用、有界、命名清晰、显式管理生命周期</b>。
 *
 * <h3>租户上下文必须在这里设，不在调用方设</h3>
 * {@link TenantContext} 底层是 {@link ThreadLocal}，<b>不跨线程</b>。
 * 调用方（调度线程）设的租户在子线程里读到的仍是 null→ 被租户插件兜底成 -1，
 * 所有查询恒空 —— 也就是"任务在跑、日志在打、一条通知不发"的那个静默故障。
 * 所以契约是：<b>提交的任务必须自带租户 id，由本类在工作线程里 set/clear</b>。
 *
 * <h3>为什么用有界队列 + CallerRuns 拒绝策略</h3>
 * <ul>
 *   <li><b>有界</b>：租户数量可能很多，每租户一次 HTTP。若用无界队列，
 *       某轮扫描遇到大量到期课次时会把内存吃光；用有界队列则会在入口处挡住。</li>
 *   <li><b>CallerRuns</b>：队列满时<b>由提交者（调度线程）自己跑</b>这一条。
 *       这看起来"退化成同步"，实际上是最安全的降级 —— 不会丢任务，
 *       施加背压让调度线程变慢，而不是让任务被静默丢弃。</li>
 *   <li><b>绝不用 DiscardPolicy / AbortPolicy</b>：前者静默丢通知（不可接受），
 *       后者抛异常导致后续租户全部不处理。</li>
 * </ul>
 *
 * <h3>重复执行是安全的</h3>
 * 本执行器<b>刻意不做"同一租户去重"</b>。原因：上课提醒的幂等由数据库唯一键
 * {@code uk_dispatch_once(appointment_id, seq, receiver_user_id, dedup_key)} 保证，
 * {@code NotifyDispatchService} 靠"先插流水、撞键就跳过"实现
 * 天然幂等（见该类 catch DuplicateKeyException 分支）。
 * 在这里再加一层去重只会引入"上一轮还在跑、这轮被跳过→ 真实通知延迟"的新问题，
 * 却不带来任何额外安全性 —— 两个真相源反而更危险。
 */
@Component
public class TenantAwareExecutor implements DisposableBean {

    private static final Logger log = LoggerFactory.getLogger(TenantAwareExecutor.class);

    /** 线程数。取 4：与调度池同量级，专心服务定时任务，不与业务 HTTP 线程抢资源。 */
    private static final int POOL_SIZE = 4;

    /** 队列容量。取 64：足够吸收租户数量的抖动，又不会在内存里堆积无界的任务。 */
    private static final int QUEUE_CAPACITY = 64;

    private final ThreadPoolExecutor executor;

    public TenantAwareExecutor() {
        AtomicInteger seq = new AtomicInteger(1);
        ThreadFactory tf = r -> {
            Thread t = new Thread(r, "notify-async-" + seq.getAndIncrement());
            t.setDaemon(false);   // 非守护线程：让它在停机时有被join 的机会
            return t;
        };
        this.executor = new ThreadPoolExecutor(
                POOL_SIZE, POOL_SIZE,
                0L, TimeUnit.MILLISECONDS,
                new ArrayBlockingQueue<>(QUEUE_CAPACITY),
                tf,
                // 队列满时由提交线程自己跑：施加背压，绝不丢任务
                new ThreadPoolExecutor.CallerRunsPolicy());
        this.executor.allowCoreThreadTimeOut(false);
    }

    /**
     * 为单个租户提交一个任务：工作线程内自动 {@code setTenantId → 执行 → finally clear}。
     *
     * @param tenantId 该任务所属租户；<b>必须在提交时确定</b>，
     *                 不能依赖调用线程的TenantContext（那是null，跨不了线程）
     * @param work     租户上下文已就绪后的业务逻辑
     */
    public void submitForTenant(Long tenantId, Runnable work) {
        if (tenantId == null || work == null) {
            log.warn("异步任务参数缺失，已跳过: tenantId={}", tenantId);
            return;
        }
        executor.execute(() -> {
            try {
                TenantContext.setTenantId(tenantId);
                work.run();
            } catch (Exception e) {
                // 单租户失败不能拖垮整个池，也不该让异常冒到线程池的默认处理器
                log.warn("异步任务执行失败: tenantId={}, err={}", tenantId, e.getMessage());
            } finally {
                // 缺这行会把租户上下文留在被复用的线程里，
                // 让下一个任务把数据算到上一个租户头上 —— 跨租户数据泄露。
                TenantContext.clear();
            }
        });
    }

    /**
     * 一次性提交一批租户任务。
     *
     * <p><b>注意</b>：队列满时 CallerRuns 会让<b>调用方线程</b>同步跑剩余任务，
     * 于是"异步"退化为"同步"。这是有意的安全降级（背压），不是缺陷。
     */
    public int submitAllForTenants(List<Long> tenantIds, java.util.function.LongConsumer work) {
        if (tenantIds == null || tenantIds.isEmpty() || work == null) {
            return 0;
        }
        int n = 0;
        for (Long id : tenantIds) {
            if (id != null) {
                submitForTenant(id, () -> work.accept(id));
                n++;
            }
        }
        return n;
    }

    /** 当前排队 + 执行中的任务数，用于健康检查与排障。 */
    public int getActiveCount() {
        return executor.getActiveCount() + executor.getQueue().size();
    }

    /**
     * 停机时优雅关闭：最多等 30s 让在跑的任务（含 HTTP 投递）完成。
     * 超过则强制 shutdownNow —— 那会砍掉半途的通知，但强于进程直接退出什么都不剩。
     */
    @Override
    public void destroy() {
        log.info("异步执行器关闭中，等待在跑的任务完成（最多 30s），当前在跑 {} 个任务", getActiveCount());
        executor.shutdown();
        try {
            if (!executor.awaitTermination(30, TimeUnit.SECONDS)) {
                int left = getActiveCount();
                executor.shutdownNow();
                log.warn("异步执行器关闭超时，已强制中断，残留 {} 个未完成任务（对应的上课提醒将改由下一轮补发）", left);
            }
        } catch (InterruptedException e) {
            executor.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }
}