package com.classroom.config;

import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.task.TaskDecorator;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.annotation.AsyncConfigurer;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

import java.util.Map;
import java.util.concurrent.Executor;

/**
 * 异步线程池与调度线程池。
 *
 * <p><b>四个池，边界不要混</b>：
 * <ul>
 *   <li>{@code taskScheduler} —— 全部 {@code @Scheduled}（2 个对账 + 7 个课堂生命周期扫描器）；</li>
 *   <li>{@code callbackRetryScheduler} —— 只给 {@code CallbackService} 的退避重试（1/5/15 分钟）用；</li>
 *   <li>{@code callbackExecutor} / {@code reconcileExecutor} —— {@code @Async} 的方法体。</li>
 * </ul>
 * 把 {@code @Scheduled} 与回调重试分开，是为了让「扫描器变慢」和「回调重试拥堵」在日志线程名上
 * 一眼可分（{@code sched-N} vs {@code cb-retry-N}），也让 HTTP 超时不会拖住对账 —— 见
 * {@link #callbackRetryScheduler()} 的注释。
 */
@Configuration
public class AsyncConfig implements AsyncConfigurer {

    /**
     * 把提交线程的 MDC（traceId）搬到执行线程。
     *
     * <p><b>为什么必须做</b>：{@code @Async} 的回流投递与退避重试才是排查的主力——
     * 真正出问题的往往是异步那段，而它恰好没有 traceId。不做传播的话，
     * HTTP 入口那段日志有 traceId、异步那段没有，等于把最需要串起来的地方断开了。
     *
     * <p>子线程结束时**必须清空**：线程池复用线程，残留的 traceId 会把下一次任务
     * 的日志错绑到上一个请求上，比没有更误导。
     */
    private static final TaskDecorator MDC_DECORATOR = runnable -> {
        Map<String, String> captured = MDC.getCopyOfContextMap();
        return () -> {
            Map<String, String> prev = MDC.getCopyOfContextMap();
            try {
                if (captured == null) {
                    MDC.clear();
                } else {
                    MDC.setContextMap(captured);
                }
                runnable.run();
            } finally {
                if (prev == null) {
                    MDC.clear();
                } else {
                    MDC.setContextMap(prev);
                }
            }
        };
    };

    @Bean("callbackExecutor")
    public Executor callbackExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(8);
        executor.setQueueCapacity(200);
        executor.setThreadNamePrefix("callback-");
        executor.setTaskDecorator(MDC_DECORATOR);
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(30);
        executor.initialize();
        return executor;
    }

    @Bean("reconcileExecutor")
    public Executor reconcileExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(1);
        executor.setMaxPoolSize(2);
        executor.setQueueCapacity(50);
        executor.setThreadNamePrefix("reconcile-");
        executor.setTaskDecorator(MDC_DECORATOR);
        executor.initialize();
        return executor;
    }

    /**
     * {@code @Scheduled} 专用池（9 个常驻扫描器：日终对账、周度全查、就绪提升、自动开课、
     * 自动下课、学生掉线、点名超时、教师掉线结课、每日清理）。
     *
     * <p><b>为什么必须显式声明、且 Bean 名必须是 {@code taskScheduler}</b>：
     * {@code ScheduledAnnotationBeanPostProcessor} 找调度器的顺序是「先按名字找
     * {@code taskScheduler}，找不到再按类型找唯一个」。
     * <ul>
     *   <li>名字对得上 → 直接用，这也是 Boot 自动装配那个 Bean 的名字；</li>
     *   <li>按类型找 → 只要容器里有**任意**一个 {@code TaskScheduler} 就会命中它。</li>
     * </ul>
     * 而后者的成因在 Boot 侧：{@code TaskSchedulingAutoConfiguration} 的 taskScheduler Bean 带
     * {@code @ConditionalOnMissingBean(TaskScheduler.class)} —— 我们自己声明了
     * {@link #callbackRetryScheduler()}，它就不再创建。结果 9 个扫描器全落到那个 2 线程的
     * 回调重试池上（2026-11-20 之前的真实形态），表现为：
     * <ul>
     *   <li>日志线程名一律 {@code cb-retry-N}，{@code spring.task.scheduling.thread-name-prefix=sched-} 形同虚设；</li>
     *   <li>{@code spring.task.scheduling.pool.size=8} 也不生效，实际只有 2 条线程跑 9 个扫描器；</li>
     *   <li>回调重试的 HTTP 超时（3s/8s）会直接占住线程，把对账/掉线判定拖住 ——
     *       正是原设计想避免的耦合，却以另一种方式回来了。</li>
     * </ul>
     *
     * <p>池大小与线程前缀仍从 {@code application.properties} 的
     * {@code spring.task.scheduling.*} 读，保持"配置项改了就生效、不用改代码"。
     * 9 个扫描器 + 8 线程：扫描周期分别是 20/30/40 秒与每日，正常情况下大量线程是空闲的，
     * 靠周期错开足够；若要留出「一个卡住也不排队」的余量，把 pool.size 调到 10 即可。
     *
     * <p>不挂 {@link #MDC_DECORATOR}：定时任务没有入向请求，提交时 MDC 本来就是空的，
     * 传播它只会把「上一次调度的残留」带进来。扫描器日志靠 scheduleId 定位，不靠 traceId。
     */
    @Bean("taskScheduler")
    public TaskScheduler taskScheduler(
            @Value("${spring.task.scheduling.pool.size:8}") int poolSize,
            @Value("${spring.task.scheduling.thread-name-prefix:sched-}") String threadNamePrefix) {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(poolSize);
        scheduler.setThreadNamePrefix(threadNamePrefix);
        // 停机：让正在跑的这一轮跑完（扫描到一半退出会留下半截状态），但不再触发下一轮。
        // 与 callbackRetryScheduler 的「不等」相反 —— 那边的队列最长要等 15 分钟，等不完。
        scheduler.setWaitForTasksToCompleteOnShutdown(true);
        scheduler.setAwaitTerminationSeconds(30);
        scheduler.setExecuteExistingDelayedTasksAfterShutdownPolicy(false);
        scheduler.setContinueExistingPeriodicTasksAfterShutdownPolicy(false);
        scheduler.setRemoveOnCancelPolicy(true);
        scheduler.initialize();
        return scheduler;
    }

    /**
     * 回调退避重试用调度器（1/5/15 分钟）—— **只服务 {@code CallbackService}，不接 {@code @Scheduled}**。
     *
     * <p>由 {@code CallbackService} 用 {@code @Qualifier("callbackRetryScheduler")} 精确注入，
     * 所以它和 {@link #taskScheduler} 同时存在不会产生注入歧义
     * （全仓库仅此一处注入 {@code TaskScheduler}，且带 Qualifier）。
     *
     * <p><b>注意别把它当成"自动装配那个的替代品"</b>：只声明这一个 Bean、指望
     * {@code @Scheduled} 继续走 Boot 自动装配的调度器，是做不到的 —— 自动装配会因
     * {@code @ConditionalOnMissingBean} 直接退让，{@code @Scheduled} 反而被它抢走。
     * 完整机理见 {@link #taskScheduler(int, String)}。改这一对 Bean 时务必两个一起看。
     *
     * <p>固定 2 线程：重试只是"到点发一次 HTTP"，本身很快，真正占用时间的是
     * 网络超时（已设 3s/8s），2 线程足以覆盖 100 课堂规模下的回调尖峰。
     */
    @Bean("callbackRetryScheduler")
    public TaskScheduler callbackRetryScheduler() {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(2);
        scheduler.setThreadNamePrefix("cb-retry-");
        // 停机不等待：重试队列在内存中，等也等不完（最长 15 分钟），
        // 遗留事件靠日终对账补偿，比卡住滚动发布更划算
        scheduler.setWaitForTasksToCompleteOnShutdown(false);
        scheduler.initialize();
        return scheduler;
    }
}
