package com.classroom.controller;

import com.classroom.common.Result;
import com.classroom.dto.ReconcilePullReq;
import com.classroom.entity.ReconcileLog;
import com.classroom.service.ReconcileService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 入向接口：对账拉取（F7-05）。
 */
@RestController
@RequestMapping("/api/v1/schedules")
public class ReconcileController {

    private final ReconcileService reconcileService;

    public ReconcileController(ReconcileService reconcileService) {
        this.reconcileService = reconcileService;
    }

    @PostMapping("/sync")
    public Result<List<ReconcileLog>> sync(@RequestBody(required = false) ReconcilePullReq req) {
        int days = 7;
        return Result.ok(reconcileService.listRecent(days));
    }
}