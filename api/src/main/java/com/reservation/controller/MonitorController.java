package com.reservation.controller;

import com.reservation.common.Result;
import com.reservation.entity.MetricHourly;
import com.reservation.entity.MetricSample;
import com.reservation.service.MonitorService;
import com.reservation.utils.PermissionCheck;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 系统监视控制器
 * 接口前缀: /monitor/*
 * 权限: 仅平台管理员
 * 部署形态: 单机
 */
@RestController
@RequestMapping("/monitor")
public class MonitorController {

    @Autowired
    private MonitorService monitorService;
    @Autowired
    private PermissionCheck permissionCheck;

    /**
     * 系统概览：CPU / 内存 / 磁盘 / JVM / 在线人数
     */
    @GetMapping("/overview")
    public Result<Map<String, Object>> overview(@RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        return Result.success(monitorService.getOverview(), "查询成功");
    }

    /**
     * 实时采样明细趋势，默认最近 24 小时
     */
    @GetMapping("/trend")
    public Result<List<MetricSample>> trend(@RequestHeader("Authorization") String token,
                                            @RequestParam(defaultValue = "24") int hours) {
        permissionCheck.checkPlatformAdmin(token);
        return Result.success(monitorService.getTrend(hours), "查询成功");
    }

    /**
     * 小时聚合趋势（长期趋势，明细清理后仍可查看），默认最近 7 天
     */
    @GetMapping("/hourly")
    public Result<List<MetricHourly>> hourly(@RequestHeader("Authorization") String token,
                                             @RequestParam(defaultValue = "7") int days) {
        permissionCheck.checkPlatformAdmin(token);
        return Result.success(monitorService.getHourlyTrend(days), "查询成功");
    }

    /**
     * 接口健康度：QPS / 错误率 / 平均耗时 / P95 / 慢接口 Top10
     */
    @GetMapping("/api-health")
    public Result<Map<String, Object>> apiHealth(@RequestHeader("Authorization") String token,
                                                 @RequestParam(defaultValue = "60") int minutes) {
        permissionCheck.checkPlatformAdmin(token);
        return Result.success(monitorService.getApiHealth(minutes), "查询成功");
    }

    /**
     * 手动触发一次采样（调试用）
     */
    @PostMapping("/sample")
    public Result<Boolean> sample(@RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        monitorService.sampleAndSave();
        return Result.success(true, "采样完成");
    }
}
