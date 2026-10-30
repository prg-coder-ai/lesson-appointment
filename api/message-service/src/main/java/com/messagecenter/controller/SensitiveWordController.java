package com.messagecenter.controller;

import com.messagecenter.common.PageResult;
import com.messagecenter.common.Result;
import com.messagecenter.dto.SensitiveGroupReq;
import com.messagecenter.dto.SensitiveWordReq;
import com.messagecenter.entity.MsgSensitiveGroup;
import com.messagecenter.entity.MsgSensitiveWord;
import com.messagecenter.exception.MessageBizException;
import com.messagecenter.security.MessageAuthContext;
import com.messagecenter.service.SensitiveWordService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 敏感词管理（平台管理员 / 租户管理员）。
 *  - 分组(GET/POST/PUT/DELETE /api/v1/sensitive/groups)
 *  - 敏感词(GET/POST/PUT/DELETE /api/v1/sensitive/words)
 *  - 检测预览(POST /api/v1/sensitive/test)、缓存刷新(POST /api/v1/sensitive/refresh, 仅平台管理员)
 */
@RestController
@RequestMapping("/api/v1/sensitive")
public class SensitiveWordController {

    private final SensitiveWordService service;

    public SensitiveWordController(SensitiveWordService service) {
        this.service = service;
    }

    private boolean platformAdmin() {
        return MessageAuthContext.isPlatformAdmin();
    }

    private Long tenant() {
        Long t = MessageAuthContext.currentTenantId();
        return (t == null) ? 0L : t;
    }

    private void requireManager() {
        if (!MessageAuthContext.isManager()) throw new MessageBizException(403, "仅管理员可管理敏感词");
    }

    // ===================== 分组 =====================

    @GetMapping("/groups")
    public Result<List<MsgSensitiveGroup>> groups() {
        requireManager();
        return Result.success(service.listGroups(tenant(), platformAdmin()), "查询成功");
    }

    @PostMapping("/groups")
    public Result<MsgSensitiveGroup> createGroup(@RequestBody SensitiveGroupReq req) {
        requireManager();
        return Result.success(service.createGroup(req, tenant(), platformAdmin()), "创建成功");
    }

    @PutMapping("/groups/{id}")
    public Result<Object> updateGroup(@PathVariable Long id, @RequestBody SensitiveGroupReq req) {
        requireManager();
        service.updateGroup(id, req, tenant(), platformAdmin());
        return Result.success();
    }

    @DeleteMapping("/groups/{id}")
    public Result<Object> deleteGroup(@PathVariable Long id) {
        requireManager();
        service.deleteGroup(id, tenant(), platformAdmin());
        return Result.success();
    }

    // ===================== 敏感词 =====================

    @GetMapping("/words")
    public Result<PageResult<MsgSensitiveWord>> words(
            @RequestParam(required = false) Long groupId,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "1") int pageNum,
            @RequestParam(defaultValue = "20") int pageSize) {
        requireManager();
        return Result.success(service.listWords(groupId, keyword, pageNum, pageSize, tenant(), platformAdmin()), "查询成功");
    }

    @PostMapping("/words")
    public Result<MsgSensitiveWord> createWord(@RequestBody SensitiveWordReq req) {
        requireManager();
        return Result.success(service.createWord(req, tenant(), platformAdmin()), "创建成功");
    }

    @PutMapping("/words/{id}")
    public Result<Object> updateWord(@PathVariable Long id, @RequestBody SensitiveWordReq req) {
        requireManager();
        service.updateWord(id, req, tenant(), platformAdmin());
        return Result.success();
    }

    @DeleteMapping("/words/{id}")
    public Result<Object> deleteWord(@PathVariable Long id) {
        requireManager();
        service.deleteWord(id, tenant(), platformAdmin());
        return Result.success();
    }

    // ===================== 检测预览 / 刷新 =====================

    @PostMapping("/test")
    public Result<Map<String, Object>> test(@RequestBody Map<String, String> body) {
        requireManager();
        String text = body == null ? null : body.get("text");
        return Result.success(service.test(text, tenant(), platformAdmin()), "检测完成");
    }

    @PostMapping("/refresh")
    public Result<Object> refresh() {
        if (!platformAdmin()) throw new MessageBizException(403, "仅平台管理员可刷新敏感词缓存");
        service.reloadAll();
        return Result.success();
    }
}
