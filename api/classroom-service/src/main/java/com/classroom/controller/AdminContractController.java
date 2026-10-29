package com.classroom.controller;

import com.classroom.common.Result;
import com.classroom.dto.ScheduleEventReq;
import com.classroom.entity.Classroom;
import com.classroom.entity.ReconcileLog;
import com.classroom.event.EventIdempotentGuard;
import com.classroom.event.ScheduleEventConsumer;
import com.classroom.mapper.ClassroomMapper;
import com.classroom.security.AuthContext;
import com.classroom.service.ReconcileService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 契约联调控制台（F8-05）：事件状态可查、失败事件可重放、排期可批量对表。
 *
 * <p>修复前这块是空白的：{@code POST /schedules/sync} 忽略入参只打一行日志；
 * 消费失败的事件只能在日志里翻，翻到了也没有任何手段补一次。
 *
 * <p><b>重放为什么需要人工贴报文</b>：本服务不持久化原始事件报文（存了就等于存了一份
 * 预约侧的数据库副本，且 7 天后还得清理）。要让重放真正有用，只能由人把原始报文贴进来 ——
 * 这也是它作为「联调控制台」而不是「自动补偿」的定位：自动补偿应该有事件表，那是另一个工程。
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/admin/contract")
public class AdminContractController {

    private final ReconcileService reconcileService;
    private final EventIdempotentGuard idempotentGuard;
    private final ScheduleEventConsumer eventConsumer;
    private final ClassroomMapper classroomMapper;
    private final ObjectMapper objectMapper;

    public AdminContractController(ReconcileService reconcileService,
                                   EventIdempotentGuard idempotentGuard,
                                   ScheduleEventConsumer eventConsumer,
                                   ClassroomMapper classroomMapper,
                                   ObjectMapper objectMapper) {
        this.reconcileService = reconcileService;
        this.idempotentGuard = idempotentGuard;
        this.eventConsumer = eventConsumer;
        this.classroomMapper = classroomMapper;
        this.objectMapper = objectMapper;
    }

    /** 事件处理状态：按课次/结果查对账流水 */
    @GetMapping("/events")
    public Result<List<ReconcileLog>> events(@RequestParam(required = false) String scheduleId,
                                             @RequestParam(required = false) String result,
                                             @RequestParam(required = false, defaultValue = "7") int days) {
        if (!AuthContext.isManager()) {
            return Result.fail(403, "仅管理员可查看事件状态");
        }
        List<ReconcileLog> rows = reconcileService.listRecent(Math.max(1, days));
        List<ReconcileLog> filtered = new ArrayList<>();
        for (ReconcileLog r : rows) {
            if (scheduleId != null && !scheduleId.isBlank() && !scheduleId.equals(r.getScheduleId())) continue;
            if (result != null && !result.isBlank() && !result.equalsIgnoreCase(r.getResult())) continue;
            filtered.add(r);
            if (filtered.size() >= 500) break;
        }
        return Result.ok(filtered);
    }

    /**
     * 重放一条排期事件：清幂等键 → 走正常消费链路。
     *
     * <p>先 release 再 consume，正是为了避免「点重放没反应」：
     * 幂等键还在，消费入口会把它当重复事件直接丢掉。
     */
    @PostMapping("/replay")
    public Result<Map<String, Object>> replay(@RequestBody String rawBody) {
        if (!AuthContext.isManager()) {
            return Result.fail(403, "仅管理员可重放事件");
        }
        ScheduleEventReq req;
        try {
            req = objectMapper.readValue(rawBody, ScheduleEventReq.class);
        } catch (Exception e) {
            return Result.fail(400, "报文解析失败：" + e.getMessage());
        }
        if (isBlank(req.getEventId()) || isBlank(req.getScheduleId()) || isBlank(req.getEventType())) {
            return Result.fail(400, "eventId / scheduleId / eventType 均为必填");
        }

        idempotentGuard.release(req.getEventId());
        try {
            eventConsumer.consume(req);
        } catch (Exception e) {
            log.error("事件重放失败: eventId={}, scheduleId={}", req.getEventId(), req.getScheduleId(), e);
            return Result.fail(500, "重放失败：" + e.getMessage());
        }
        log.warn("管理员重放事件: eventId={}, scheduleId={}, type={}, operator={}",
                req.getEventId(), req.getScheduleId(), req.getEventType(), AuthContext.currentUserId());

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("eventId", req.getEventId());
        m.put("scheduleId", req.getScheduleId());
        m.put("eventType", req.getEventType());
        m.put("replayed", true);
        return Result.ok(m);
    }

    /**
     * 批量对表：给定排期 id，返回课堂侧是否存在及当前状态。
     *
     * <p>用途是预约侧「我这边有 20 个排期，你那边建了几个」——比一个个试 GET /schedules/{id} 快得多，
     * 也不会因为某个 id 不存在而整批 404。
     */
    @PostMapping("/resync")
    public Result<List<Map<String, Object>>> resync(@RequestBody ResyncReq req) {
        if (!AuthContext.isManager()) {
            return Result.fail(403, "仅管理员可执行对表");
        }
        List<Map<String, Object>> out = new ArrayList<>();
        if (req != null && req.getScheduleIds() != null) {
            for (String sid : req.getScheduleIds()) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("scheduleId", sid);
                Classroom c = sid == null ? null : classroomMapper.selectById(sid);
                item.put("exists", c != null);
                if (c != null) {
                    item.put("status", c.getStatus());
                    item.put("version", c.getVersion());
                    item.put("consumptionVersion", c.getConsumptionVersion());
                    item.put("startTime", c.getStartTime());
                    item.put("endTime", c.getEndTime());
                    item.put("actualStart", c.getActualStart());
                    item.put("actualEnd", c.getActualEnd());
                }
                out.add(item);
            }
        }
        return Result.ok(out);
    }

    private boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    @Data
    public static class ResyncReq {
        private List<String> scheduleIds;
    }
}
