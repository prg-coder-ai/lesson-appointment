package com.classroom.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.annotation.AsyncConfigurer;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

import java.util.concurrent.Executor;

/**
 * 异步线程池：回流/回调/录制清理等异步任务。
 */
@Configuration
public class AsyncConfig implements AsyncConfigurer {

    @Bean("callbackExecutor")
    public Executor callbackExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(8);
        executor.setQueueCapacity(200);
        executor.setThreadNamePrefix("callback-");
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
        executor.initialize();
        return executor;
    }

    /**
     * 回调退避重试用调度器（1/5/15 分钟）。
     *
     * <p>为什么单独一个 Bean 而不用 Boot 自动装配的 {@code taskScheduler}：
     * 自动装配那个被 {@code @Scheduled} 对账任务共用，若重试任务把它的线程占住，
     * 日终对账会被推迟（而且现场只看到"对账没跑"，很难联想到是回调重试拖的）。
     * 显式命名便于在日志/线程转储里一眼区分。
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