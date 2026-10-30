package com.reservation.controller;

import com.reservation.common.Result;
import com.reservation.entity.LegalDoc;
import com.reservation.service.LegalDocService;
import com.reservation.utils.PermissionCheck;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 协议 / 隐私政策 —— 管理端维护端点（需登录）
 *
 * <h3>权限</h3>
 * 平台管理员（platform_admin）：维护平台级文档（tenantId=0），租户只能签不能改。
 * 租户管理员（admin）：维护本租户覆盖级文档（tenantId=自身租户），平台级文档仅可读不可改。
 *
 * <h3>端点</h3>
 *   GET  /api/v1/sys/legal-doc        读取当前生效文档（按调用者身份推导作用域）
 *   POST /api/v1/sys/legal-doc/update 保存新版本（version+1，旧版本停用）
 *
 * <p>授权登记在 {@code AuthzRules}（PLATFORM_OR_TENANT_ADMIN）；方法体再按身份
 * 派生作用域 + checkTenantAdmin 兜底，越权面（改别人租户文档）在此断链。
 */
@RestController
@RequestMapping("/api/v1/sys/legal-doc")
public class LegalDocAdminController {

    @Autowired
    private LegalDocService legalDocService;
    @Autowired
    private PermissionCheck permissionCheck;

    /** 读取当前生效文档：平台管理员读平台级，租户管理员读本租户覆盖级（含平台兜底）。 */
    @GetMapping
    public Result<LegalDoc> get(@RequestParam("docType") String docType,
                                @RequestParam(required = false) String lang,
                                @RequestHeader("Authorization") String token) {
        if (docType == null || docType.isBlank()) {
            return Result.fail(400, "docType 不能为空");
        }
        Long tenantId = resolveScope(token);
        LegalDoc doc = legalDocService.resolve(tenantId, docType, lang);
        return Result.success(doc, "查询成功");
    }

    /**
     * 读取平台提供的「租户参考模板」（docType + "_template"，tenantId=0）。
     * 租户管理员调用后可一键采纳为自己 tenantId=N 的生效版本。
     * 仅返回平台侧最新启用版本；若平台尚未配置，返回 404。
     */
    @GetMapping("/template")
    public Result<LegalDoc> getTemplate(@RequestParam("docType") String docType,
                                        @RequestParam(required = false) String lang,
                                        @RequestHeader("Authorization") String token) {
        if (docType == null || docType.isBlank()) {
            return Result.fail(400, "docType 不能为空");
        }
        // 仅允许正式版 docType 查模板（避免直接查 *_template 绕回正式版路径）
        if ("user_agreement".equals(docType) || "privacy_policy".equals(docType)) {
            String templateType = docType + "_template";
            LegalDoc doc = legalDocService.resolve(0L, templateType, lang);
            return Result.success(doc, doc == null ? "尚未配置" : "查询成功");
        }
        return Result.fail(400, "非法 docType，仅支持 user_agreement / privacy_policy");
    }

    /**
     * 保存新版本。
     * 平台管理员写平台级（tenantId=0）；租户管理员写本租户覆盖级（tenantId=自身）。
     * tenant_id 一律由服务端从令牌派生，不接受客户端传值（防篡改）。
     */
    @PostMapping("/update")
    public Result<LegalDoc> update(@RequestBody Map<String, String> body,
                                   @RequestHeader("Authorization") String token) {
        String docType = body.get("docType");
        if (docType == null || docType.isBlank()) {
            return Result.fail(400, "docType 不能为空");
        }
        Long tenantId = resolveScope(token);
        String lang = body.get("language");
        String title = body.get("title");
        String content = body.get("content");
        LegalDoc doc = legalDocService.saveVersion(tenantId, docType, lang, title, content);
        return Result.success(doc, "已保存（版本 " + doc.getVersion() + "）");
    }

    /** 由令牌派生维护作用域：平台管理员→0；租户管理员→本租户（并校验 role=admin）。 */
    private Long resolveScope(String token) {
        if (permissionCheck.isPlatformAdmin(token)) {
            return 0L;
        }
        Long tenantId = permissionCheck.getTenantIdFromToken(token);
        permissionCheck.checkTenantAdmin(token);
        return tenantId;
    }
}
