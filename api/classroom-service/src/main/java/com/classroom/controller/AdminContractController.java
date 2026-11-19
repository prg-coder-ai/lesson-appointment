package com.classroom.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.classroom.common.ClassroomKey;
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
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

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

    /** 查询窗口上限（天）：不钳制等于允许 `days=3650` 做一次全表扫再内存过滤 */
    private static final int MAX_DAYS = 90;

    /** 事件处理状态：按课次/结果查对账流水 */
    @GetMapping("/events")
    public Result<List<ReconcileLog>> events(@RequestParam(required = false) String scheduleId,
                                             @RequestParam(required = false) String result,
                                             @RequestParam(required = false, defaultValue = "7") int days) {
        if (!AuthContext.isManager()) {
            return Result.fail(403, "仅管理员可查看事件状态");
        }
        Set<String> mine = allowedScheduleGroups();
        if (mine != null && mine.isEmpty()) {
            // 取不到租户（或该租户还没建过任何课堂）：直接空结果，不要落到「全平台可见」
            return Result.ok(new ArrayList<>());
        }
        List<ReconcileLog> rows = reconcileService.listRecent(clampDays(days));
        List<ReconcileLog> filtered = new ArrayList<>();
        for (ReconcileLog r : rows) {
            if (scheduleId != null && !scheduleId.isBlank() && !scheduleId.equals(r.getScheduleId())) continue;
            if (result != null && !result.isBlank() && !result.equalsIgnoreCase(r.getResult())) continue;
            if (mine != null && !mine.contains(ClassroomKey.scheduleIdOf(r.getScheduleId()))) continue;
            filtered.add(r);
            if (filtered.size() >= 500) break;
        }
        return Result.ok(filtered);
    }

    /**
     * 调用者可见的**排期组**集合；{@code null} 表示不限（仅平台管理员）。
     *
     * <p>为什么按「排期组」而不是课堂 id：{@code reconcile_log.schedule_id} 存的是事件报文里的
     * 原始排期 id（不带课次后缀），而 {@code classroom} 的标识可能是 {@code sid~2}。
     * 用 {@link ClassroomKey#scheduleIdOf} 去掉后缀再比，多课次的流水才能归到同一排期上。
     *
     * <p>为什么一次全量查课堂、而不是逐条流水 join：流水单次最多 500 条、窗口已钳到 90 天，
     * 逐条查课堂是 N 次往返；按租户拉一次 id 集合是常数次。
     *
     * <p><b>fail closed</b>：拿不到租户 id 时返回空集合而不是 {@code null}——{@code null} 的语义是
     * 「不限」，把鉴权异常放大成越权读取比返回空列表危险得多。
     */
    private Set<String> allowedScheduleGroups() {
        if (AuthContext.isPlatformAdmin()) return null;
        Long tenantId = AuthContext.currentTenantId();
        if (tenantId == null) return Collections.emptySet();
        List<Classroom> list = classroomMapper.selectList(new LambdaQueryWrapper<Classroom>()
                .select(Classroom::getScheduleId)
                .eq(Classroom::getTenantId, tenantId));
        Set<String> groups = new HashSet<>();
        for (Classroom c : list) {
            groups.add(ClassroomKey.scheduleIdOf(c.getScheduleId()));
        }
        return groups;
    }

    private static int clampDays(int days) {
        return Math.min(MAX_DAYS, Math.max(1, days));
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
        // 租户归属校验（2026-11-19）：重放是**写**操作，报文由调用方自由粘贴，
        // 不校验就等于给租户管理员一把能改别家课堂的钥匙（created 更直接：能建到别人租户里）。
        // 平台管理员跨租户运维，不设限。
        if (!AuthContext.isPlatformAdmin()) {
            Long tenantId = AuthContext.currentTenantId();
            if (tenantId == null) {
                return Result.fail(403, "无法确定所属租户，禁止重放");
            }
            if ("created".equals(req.getEventType())) {
                // 新建课堂的租户由服务端定，不信报文里的 tenantId
                req.setTenantId(tenantId);
            } else {
                Classroom target = classroomMapper.selectById(
                        ClassroomKey.of(req.getScheduleId(), req.getClassIndex()));
                if (target != null && !tenantId.equals(target.getTenantId())) {
                    return Result.fail(403, "该课次不属于当前租户，禁止重放");
                }
            }
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
     *
     * <p><b>2026-11-19 加租户隔离</b>：这里逐个 id 直查 classroom，原本等于提供了一个
     * 「输入任意 id 就能探测别家课堂状态」的接口。现在非平台管理员查到别家课次时按
     * {@code exists=false + denied=true} 返回（不暴露状态、时间等任何字段），
     * 前端据 denied 显示「非本租户」，避免被误解为大家的课堂都丢了。
     */
    @PostMapping("/resync")
    public Result<List<Map<String, Object>>> resync(@RequestBody ResyncReq req) {
        if (!AuthContext.isManager()) {
            return Result.fail(403, "仅管理员可执行对表");
        }
        Long tenantId = null;
        if (!AuthContext.isPlatformAdmin()) {
            tenantId = AuthContext.currentTenantId();
            if (tenantId == null) {
                return Result.fail(403, "无法确定所属租户，禁止对表");
            }
        }
        List<Map<String, Object>> out = new ArrayList<>();
        if (req != null && req.getScheduleIds() != null) {
            for (String sid : req.getScheduleIds()) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("scheduleId", sid);
                Classroom c = sid == null ? null : classroomMapper.selectById(sid);
                boolean allowed = c != null && (tenantId == null || tenantId.equals(c.getTenantId()));
                item.put("exists", allowed);
                if (c != null && !allowed) {
                    // 只给「不属于你」，不给状态/时间——否则等于变相泄露
                    item.put("denied", true);
                }
                if (allowed) {
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
