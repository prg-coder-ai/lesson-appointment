package com.classroom.controller;

import com.classroom.common.Result;
import com.classroom.common.ServiceInfo;
import com.classroom.service.ServiceInfoService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 服务运行信息查询接口。
 */
@RestController
@RequestMapping("/api/v1")
public class ApiInfoController {

    private final ServiceInfoService serviceInfoService;

    public ApiInfoController(ServiceInfoService serviceInfoService) {
        this.serviceInfoService = serviceInfoService;
    }

    @GetMapping({"/system/info", "/apiInfo"})
    public Result<ServiceInfo> getApiInfo(HttpServletRequest request) {
        return Result.ok(serviceInfoService.current(request));
    }
}