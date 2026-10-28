package com.reservation.common;

import com.reservation.dto.ScheduleVO;
import com.reservation.entity.CourseSchedule;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 排期 → 课次实例展开的回归测试（2026-10-28，多课次事件推送）。
 *
 * <p>被测逻辑与 {@code CourseScheduleService} 建课次时用的是同一个
 * {@link ScheduleGenerator}，本测试钉住「输入映射」这一层：字段从哪个列取、
 * repeatType 怎么翻译、时区怎么传。映射一旦漂移，课堂侧的课次数与课次时间
 * 就会和课次表（appointment）不一致——而且不会报错，只是两边各说各话。
 */
class ScheduleInstancesTest {

    private static CourseSchedule schedule(int repeatType, String start, String end,
                                           String repeatDays, int interval) {
        CourseSchedule cs = new CourseSchedule();
        cs.setScheduleId("SCH-TEST-0001");
        cs.setCourseId("COURSE-1");
        cs.setStartTime(start);
        cs.setEndTime(end);
        cs.setRepeatType(repeatType);
        cs.setRepeatInterval(interval);
        cs.setRepeatDays(repeatDays);
        cs.setTimeZone("Asia/Shanghai");
        return cs;
    }

    @Test
    @DisplayName("每周（周二）3 周 → 3 个课次，时间都落在 10:00，间隔 7 天")
    void expandWeekly() {
        CourseSchedule cs = schedule(2, "2026-11-03 10:00:00", "2026-11-17 11:00:00", "2", 1);
        List<ScheduleVO> list = ScheduleInstances.expand(cs);

        assertEquals(3, list.size(), "2026-11-03/10/17 三个周二");
        assertEquals("2026-11-03", list.get(0).getDate());
        assertEquals("10:00:00", list.get(0).getTime());
        assertEquals("2026-11-10", list.get(1).getDate());
        assertEquals("2026-11-17", list.get(2).getDate());
    }

    @Test
    @DisplayName("不重复（repeatType=0）→ 恰好 1 个课次，不会按日期范围铺满")
    void expandNone() {
        CourseSchedule cs = schedule(0, "2026-11-03 10:00:00", "2026-11-03 10:45:00", null, 1);
        List<ScheduleVO> list = ScheduleInstances.expand(cs);
        assertEquals(1, list.size());
        assertEquals("2026-11-03", list.get(0).getDate());
    }

    @Test
    @DisplayName("每天 3 天 → 3 个课次，逐日递增")
    void expandDaily() {
        CourseSchedule cs = schedule(1, "2026-11-03 09:30:00", "2026-11-05 10:15:00", null, 1);
        List<ScheduleVO> list = ScheduleInstances.expand(cs);
        assertEquals(3, list.size());
        assertEquals("2026-11-03", list.get(0).getDate());
        assertEquals("2026-11-04", list.get(1).getDate());
        assertEquals("2026-11-05", list.get(2).getDate());
        assertEquals("09:30:00", list.get(0).getTime());
    }

    @Test
    @DisplayName("起始时间缺失 → 空列表（由调用方回落单次课，不抛异常）")
    void expandEmptyOnBadInput() {
        assertTrue(ScheduleInstances.expand(null).isEmpty());
        assertTrue(ScheduleInstances.expand(new CourseSchedule()).isEmpty());
        // 只有日期没有时刻：长度不足 16，按脏数据拒绝
        CourseSchedule bad = schedule(0, "2026-11-03", "2026-11-03 10:00:00", null, 1);
        assertTrue(ScheduleInstances.expand(bad).isEmpty());
    }

    @Test
    @DisplayName("单课时长优先 class_duration")
    void durationFromColumn() {
        CourseSchedule cs = schedule(0, "2026-11-03 10:00:00", "2026-11-03 10:45:00", null, 1);
        cs.setClassDuration(45);
        assertEquals(45, ScheduleInstances.durationMinutes(cs));
        cs.setClassDuration(30);
        assertEquals(30, ScheduleInstances.durationMinutes(cs));
    }

    @Test
    @DisplayName("class_duration 缺失时按当天时刻差推算，算不出回落 60")
    void durationFallback() {
        CourseSchedule cs = schedule(0, "2026-11-03 10:00:00", "2026-11-03 11:30:00", null, 1);
        assertEquals(90, ScheduleInstances.durationMinutes(cs));

        // 重复排期的 end_time 是「重复结束日期」，当天时刻可能与开始时刻相同 → 差为 0 → 回落 60
        CourseSchedule weekly = schedule(2, "2026-11-03 10:00:00", "2026-11-17 10:00:00", "2", 1);
        assertEquals(60, ScheduleInstances.durationMinutes(weekly));
    }

    @Test
    @DisplayName("repeatDays 容错：全角逗号、空格、脏片段")
    void parseRepeatDays() {
        assertEquals(List.of(1, 3, 5), ScheduleInstances.parseRepeatDays("1,3,5"));
        assertEquals(List.of(2, 4), ScheduleInstances.parseRepeatDays(" 2， 4 "));
        assertEquals(List.of(3), ScheduleInstances.parseRepeatDays("3,x,,7x"));
        assertTrue(ScheduleInstances.parseRepeatDays(null).isEmpty());
        assertTrue(ScheduleInstances.parseRepeatDays("  ").isEmpty());
    }

    @Test
    @DisplayName("repeatType 整数 → 生成器关键字")
    void repeatTypeText() {
        assertEquals("none", ScheduleInstances.repeatTypeText(0));
        assertEquals("day", ScheduleInstances.repeatTypeText(1));
        assertEquals("week", ScheduleInstances.repeatTypeText(2));
        assertEquals("month", ScheduleInstances.repeatTypeText(3));
        assertEquals("none", ScheduleInstances.repeatTypeText(9));
    }

    @Test
    @DisplayName("课次时间可转成 LocalDateTime（payload 用），只有 HH:mm 也补秒")
    void localDateTime() {
        ScheduleVO vo = new ScheduleVO();
        vo.setDate("2026-11-03");
        vo.setTime("10:00");
        // LocalDateTime.toString() 会省略秒，故按时分秒格式比对
        assertEquals("2026-11-03T10:00:00",
                ScheduleInstances.localDateTime(vo).format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss")));
        assertEquals("2026-11-03 10:00:00", ScheduleInstances.localText(vo));
    }
}
