package com.reservation.service;

import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * {@link TimePhaseService} 三态推导单测（2026-10-11 时间态处理方案 B1）。
 *
 * <p>全部用裸 LocalDateTime 比较（纯函数，无 Spring 上下文、无时区换算——
 * 墙钟→UTC 的换算正确性由 ScheduleGeneratorTimeZoneTest 覆盖，这里只测推导逻辑）。
 */
class TimePhaseServiceTest {

    private static final LocalDateTime START = LocalDateTime.of(2026, 10, 15, 10, 0, 0);
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 10, 11, 10, 0, 0);

    // ---------------- hasStarted（写路径闸门的唯一判定） ----------------

    @Test
    void hasStarted_false_whenLessonUpcoming() {
        // 课次在 4 天后 → 未开始
        assertFalse(TimePhaseService.hasStarted(START, NOW));
    }

    @Test
    void hasStarted_true_atExactStart() {
        // 边界：now == start 视为已开始（开始那一刻起不可再取消/请假）
        assertTrue(TimePhaseService.hasStarted(START, START));
    }

    @Test
    void hasStarted_true_afterStart() {
        assertTrue(TimePhaseService.hasStarted(START, START.plusMinutes(30)));
        assertTrue(TimePhaseService.hasStarted(START, START.plusDays(2)));
    }

    @Test
    void hasStarted_false_whenAnyTimeNull() {
        // null = 无法判定 → 不拦（宁可放行不误伤既有流程）
        assertFalse(TimePhaseService.hasStarted(null, NOW));
        assertFalse(TimePhaseService.hasStarted(START, null));
        assertFalse(TimePhaseService.hasStarted(null, null));
    }

    // ---------------- phaseOf（展示语义，ONGOING/FINISHED 边界按默认 60 分钟估算） ----------------

    @Test
    void phase_upcoming_beforeStart() {
        assertEquals(TimePhaseService.Phase.UPCOMING,
                TimePhaseService.phaseOf(START, NOW));
        assertEquals(TimePhaseService.Phase.UPCOMING,
                TimePhaseService.phaseOf(START, START.minusSeconds(1)));
    }

    @Test
    void phase_ongoing_withinDefaultDuration() {
        assertEquals(TimePhaseService.Phase.ONGOING,
                TimePhaseService.phaseOf(START, START));
        assertEquals(TimePhaseService.Phase.ONGOING,
                TimePhaseService.phaseOf(START, START.plusMinutes(59)));
    }

    @Test
    void phase_finished_atAndAfterDurationEnd() {
        // 默认课时长 60 分钟：start+60 起视为已结束（展示口径）
        assertEquals(TimePhaseService.Phase.FINISHED,
                TimePhaseService.phaseOf(START, START.plusMinutes(60)));
        assertEquals(TimePhaseService.Phase.FINISHED,
                TimePhaseService.phaseOf(START, START.plusHours(3)));
    }

    @Test
    void phase_customDurationOverridesDefault() {
        // 自定义 30 分钟课时长：start+45 已结束
        assertEquals(TimePhaseService.Phase.FINISHED,
                TimePhaseService.phaseOf(START, START.plusMinutes(45), 30));
        // 自定义 120 分钟：start+90 仍在进行中
        assertEquals(TimePhaseService.Phase.ONGOING,
                TimePhaseService.phaseOf(START, START.plusMinutes(90), 120));
    }

    @Test
    void phase_zeroOrNegativeDurationMeansStartEqualsEnd() {
        assertEquals(TimePhaseService.Phase.FINISHED,
                TimePhaseService.phaseOf(START, START, 0));
        assertEquals(TimePhaseService.Phase.FINISHED,
                TimePhaseService.phaseOf(START, START, -5));
    }

    @Test
    void phase_nullTimeReturnsNull() {
        assertNull(TimePhaseService.phaseOf(null, NOW));
        assertNull(TimePhaseService.phaseOf(START, null));
    }
}
