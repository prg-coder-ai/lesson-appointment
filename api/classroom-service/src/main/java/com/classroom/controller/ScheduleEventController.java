package com.classroom.controller;

import com.classroom.common.Result;
import com.classroom.dto.ScheduleEventReq;
import com.classroom.entity.Classroom;
import com.classroom.event.EventIdempotentGuard;
import com.classroom.event.ScheduleEventConsumer;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

/**
 * 入向接口：接收排期事件（F1-01）。
 * 预约系统通过 MQ 或 REST 推送排期事件到本服务。
 */
@RestController
@RequestMapping("/api/v1/schedules")
public class ScheduleEventController {

    private final ScheduleEventConsumer eventConsumer;
    private final EventIdempotentGuard idempotentGuard;

    public ScheduleEventController(ScheduleEventConsumer eventConsumer, EventIdempotentGuard idempotentGuard) {
        this.eventConsumer = eventConsumer;
        this.idempotentGuard = idempotentGuard;
    }

    @PostMapping("/events")
    public Result<Void> receiveEvent(@Valid @RequestBody ScheduleEventReq req) {
        if (!idempotentGuard.tryAcquire(req.getEventId())) {
            return Result.fail(409, "重复事件已忽略：" + req.getEventId());
        }
        eventConsumer.consume(req);
        return Result.success();
    }

    @GetMapping("/{scheduleId}")
    public Result<Classroom> getSchedule(@PathVariable String scheduleId) {
        return Result.ok(eventConsumer.getSchedule(scheduleId));
    }
}