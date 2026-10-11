package com.reservation.service;

import java.time.LocalDateTime;

/**
 * 时间态推导单一入口（2026-10-11 时间态处理方案 B1）。
 *
 * <p><b>设计原则：时间态是派生态，不是存储态</b>——不落库、不定时任务刷状态，
 * 每次按「课次 UTC 时间 vs 服务器当前 UTC 时间」即时推导，永远自洽。
 * 排期墙钟必须先经 {@code ScheduleGenerator.scheduleLocalToUtc} 换算成 UTC 再进来，
 * 本类只做纯比较，不做任何时区换算（换算只经 ScheduleGenerator 三入口的既有红线）。
 *
 * <p><b>三态定义</b>（课次开始时间 startUtc，课时长默认 {@link #DEFAULT_LESSON_MINUTES}）：
 * <ul>
 *   <li>{@code UPCOMING} — now &lt; start：待开始；</li>
 *   <li>{@code ONGOING}  — start ≤ now &lt; start + 时长：进行中；</li>
 *   <li>{@code FINISHED} — now ≥ start + 时长：已结束。</li>
 * </ul>
 *
 * <p><b>写路径闸门只需 {@link #hasStarted}</b>：预约/请假/改期的准入判定是
 * 「课次是否已开始」（now ≥ start 即拦），与课时长估算无关——
 * 库内没有课时长字段，ONGOING/FINISHED 的 60 分钟边界只用于展示语义，
 * 不参与任何准入决策，避免估算值影响业务正确性。
 *
 * <p>课次时间为 null（历史脏数据）时一律视为「无法判定 → 不拦」：
 * 时间闸宁可放行也不能误伤既有流程，与守卫「误报比漏报更伤信任」同一哲学。
 */
public final class TimePhaseService {

    private TimePhaseService() {
    }

    /** 时间态 */
    public enum Phase {
        /** 待开始 */
        UPCOMING,
        /** 进行中 */
        ONGOING,
        /** 已结束 */
        FINISHED
    }

    /**
     * 默认课时长（分钟）。
     *
     * <p>库内目前没有课时长字段（排期只有开始时间），ONGOING/FINISHED 的边界
     * 按行业常见的 60 分钟估算。<b>仅用于展示语义</b>；准入闸门用 {@link #hasStarted}，
     * 不依赖本值。后续若落「课时长」配置列，把这里改成读配置即可，调用方不动。
     */
    public static final int DEFAULT_LESSON_MINUTES = 60;

    /**
     * 课次是否已开始（now ≥ start）。
     *
     * @param lessonStartUtc 课次开始时间（UTC），null 视为无法判定 → false（不拦）
     * @param nowUtc         服务器当前 UTC 时间
     */
    public static boolean hasStarted(LocalDateTime lessonStartUtc, LocalDateTime nowUtc) {
        if (lessonStartUtc == null || nowUtc == null) {
            return false;
        }
        return !nowUtc.isBefore(lessonStartUtc);
    }

    /** 按默认课时长推导三态（见类注释）。时间缺失返回 null（由调用方决定展示兜底）。 */
    public static Phase phaseOf(LocalDateTime lessonStartUtc, LocalDateTime nowUtc) {
        return phaseOf(lessonStartUtc, nowUtc, DEFAULT_LESSON_MINUTES);
    }

    /**
     * 按指定课时长推导三态。
     *
     * @param lessonStartUtc 课次开始时间（UTC），null → 返回 null
     * @param nowUtc         当前 UTC 时间，null → 返回 null
     * @param lessonMinutes  课时长（分钟），≤0 时按 0 处理（开始即结束）
     */
    public static Phase phaseOf(LocalDateTime lessonStartUtc, LocalDateTime nowUtc, int lessonMinutes) {
        if (lessonStartUtc == null || nowUtc == null) {
            return null;
        }
        int minutes = Math.max(0, lessonMinutes);
        if (nowUtc.isBefore(lessonStartUtc)) {
            return Phase.UPCOMING;
        }
        if (nowUtc.isBefore(lessonStartUtc.plusMinutes(minutes))) {
            return Phase.ONGOING;
        }
        return Phase.FINISHED;
    }
}
