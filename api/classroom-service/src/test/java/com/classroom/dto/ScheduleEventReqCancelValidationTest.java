package com.classroom.dto;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 取消事件的「最小载荷」校验（2026-10-28）。
 *
 * <p>预约系统删排期是<b>先删行、事务提交后再推 cancelled</b>，那时课程、教师、
 * 起止时间一概查不到。若取消事件沿用 created/updated 的全量必填，
 * 删除排期就永远推不出取消事件——课堂会永久残留在监控列表里。
 *
 * <p>这里钉住分组校验的边界：取消只认 eventId/eventType/scheduleId，
 * 建课堂/改课堂仍然全量必填（不能因为放宽取消而把建课堂的校验一起放掉）。
 */
class ScheduleEventReqCancelValidationTest {

    private static final Validator V = Validation.buildDefaultValidatorFactory().getValidator();

    private static ScheduleEventReq full(String type) {
        ScheduleEventReq e = new ScheduleEventReq();
        e.setEventId("evt-1");
        e.setEventType(type);
        e.setScheduleId("SCH-1");
        e.setCourseId("C-1");
        e.setCourseName("英语口语");
        ScheduleEventReq.TeacherInfo t = new ScheduleEventReq.TeacherInfo();
        t.setUserId("T-1");
        e.setTeacher(t);
        e.setStartTime(LocalDateTime.parse("2026-11-03T10:00:00"));
        e.setEndTime(LocalDateTime.parse("2026-11-03T10:45:00"));
        return e;
    }

    private static Set<String> props(Set<? extends ConstraintViolation<?>> v) {
        Set<String> out = new java.util.HashSet<>();
        for (ConstraintViolation<?> c : v) out.add(c.getPropertyPath().toString());
        return out;
    }

    @Test
    @DisplayName("完整载荷的 created 事件：无违反")
    void fullCreatedValid() {
        assertTrue(V.validate(full("created")).isEmpty());
    }

    @Test
    @DisplayName("created 缺课程/教师/时间 → 仍然报错（建课堂的校验没被放宽）")
    void createdStillRequiresCourseAndTeacher() {
        ScheduleEventReq e = new ScheduleEventReq();
        e.setEventId("evt-1");
        e.setEventType("created");
        e.setScheduleId("SCH-1");
        Set<String> bad = props(V.validate(e));
        assertTrue(bad.contains("courseId"), bad.toString());
        assertTrue(bad.contains("courseName"), bad.toString());
        assertTrue(bad.contains("teacher"), bad.toString());
        assertTrue(bad.contains("startTime"), bad.toString());
        assertTrue(bad.contains("endTime"), bad.toString());
    }

    @Test
    @DisplayName("取消只带 eventId/type/scheduleId → 按 CancelGroup 校验通过")
    void minimalCancelValid() {
        ScheduleEventReq e = new ScheduleEventReq();
        e.setEventId("evt-1");
        e.setEventType("cancelled");
        e.setScheduleId("SCH-1");
        assertTrue(V.validate(e, ScheduleEventReq.CancelGroup.class).isEmpty());
    }

    @Test
    @DisplayName("取消缺 scheduleId → 仍然报错（定位不到要取消哪个排期）")
    void cancelStillRequiresScheduleId() {
        ScheduleEventReq e = new ScheduleEventReq();
        e.setEventId("evt-1");
        e.setEventType("cancelled");
        Set<String> bad = props(V.validate(e, ScheduleEventReq.CancelGroup.class));
        assertTrue(bad.contains("scheduleId"), bad.toString());
        assertFalse(bad.contains("courseName"), "取消不该要求课程名");
        assertFalse(bad.contains("teacher"), "取消不该要求教师");
    }
}
