package com.messagecenter.controller;

import com.messagecenter.common.Result;
import com.messagecenter.common.ServiceInfo;
import com.messagecenter.service.ServiceInfoService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 服务运行信息查询接口（对应缺省页展示内容）。
 *
 * <p>用途：前端/运维无需打开缺省页，即可程序化获取「程序名称、版本、构建时间、
 * 服务器时间、时区、已运行时长」等信息，用于健康检查、环境自检、关于页面等。</p>
 *
 * <p>路径同时支持 {@code /api/v1/system/info} 与 {@code /api/v1/apiInfo}（后者为别名，方便记忆）。
 * 已在 WebMvcConfig 中从 MessageAuthInterceptor 排除（匿名可访问，无需 token）。</p>
 */
@RestController
@RequestMapping("/api/v1")
public class ApiInfoController {

    private final ServiceInfoService serviceInfoService;

    public ApiInfoController(ServiceInfoService serviceInfoService) {
        this.serviceInfoService = serviceInfoService;
    }

    /**
     * 获取服务运行信息（缺省页同款字段）
     *
     * @return {"code":200,"message":"操作成功","data":{service,appName,version,buildTime,serverTime,startTime,uptime,uptimeMillis,timezone{...},status,description}}
     */
    @GetMapping({"/system/info", "/apiInfo"})
    public Result<ServiceInfo> getApiInfo() {
        return Result.ok(serviceInfoService.current());
    }
}
