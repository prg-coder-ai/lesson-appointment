package com.classroom.controller;

import com.classroom.common.Result;
import com.classroom.dto.RollCallReq;
import com.classroom.entity.RollCallRecord;
import com.classroom.security.AuthContext;
import com.classroom.service.RollCallService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 客户端接口：点名（F4-11~14）。
 */
@RestController
@RequestMapping("/api/v1/classrooms/{scheduleId}/rollcall")
public class RollCallController {

    private final RollCallService rollCallService;

    public RollCallController(RollCallService rollCallService) {
        this.rollCallService = rollCallService;
    }

    @PostMapping
    public Result<RollCallRecord> initiate(@PathVariable String scheduleId, @RequestBody(required = false) RollCallReq req) {
        if (!AuthContext.isTeacher() && !AuthContext.isManager()) {
            return Result.fail(403, "仅教师可发起点名");
        }
        String target = req != null ? req.getTargetUserId() : null;
        return Result.ok(rollCallService.initiate(scheduleId, target));
    }

    @GetMapping
    public Result<List<RollCallRecord>> list(@PathVariable String scheduleId) {
        return Result.ok(rollCallService.listBySchedule(scheduleId));
    }

    @PostMapping("/{rollcallId}/answer")
    public Result<Void> answer(@PathVariable String scheduleId, @PathVariable Long rollcallId) {
        rollCallService.answer(scheduleId, rollcallId);
        return Result.success();
    }
}