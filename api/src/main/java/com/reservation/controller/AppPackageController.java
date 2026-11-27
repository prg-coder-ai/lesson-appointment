package com.reservation.controller;

import com.reservation.audit.Audit;
import com.reservation.audit.AuditAction;
import com.reservation.common.Result;
import com.reservation.entity.AppPackage;
import com.reservation.service.AppPackageService;
import com.reservation.utils.PermissionCheck;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 课堂 App 安装包接口（系统配置 → 课堂 App 包管理）。
 *
 * <p>前缀 {@code /api/v1/app-package}：
 * <ul>
 *   <li>{@code /list}　　—— 管理视角列表（平台管理员 / 租户管理员）；</li>
 *   <li>{@code /available} —— 下载视角列表（教师 / 学生 / 管理员均可）；</li>
 *   <li>{@code /upload}　 —— 上传（平台管理员 + 租户管理员）；</li>
 *   <li>{@code /status}　 —— 上架/下架（不做物理删除，审计要留痕）；</li>
 *   <li>{@code /download/{id}} —— 下载（所有登录角色，写审计）。</li>
 * </ul>
 *
 * <p><b>权限两层</b>：路径层（AuthzRules）声明角色，方法体再 {@code permissionCheck} 兜一次——
 * 与全仓 120 处方法体校验同一口径。数据归属（平台包 vs 本租户包）由 Service 显式条件控制。
 *
 * <p><b>为什么上传/下载都写审计</b>：安装包一旦被换成带毒的 exe，事后必须能回答
 * 「谁在什么时候传的、谁下载过」。上传记 {@code APP_PACKAGE_UPLOAD}，
 * 下载记 {@code APP_PACKAGE_DOWNLOAD}，上下架记 {@code APP_PACKAGE_STATUS}。
 */
@RestController
@RequestMapping("/api/v1/app-package")
public class AppPackageController {

    @Autowired
    private AppPackageService appPackageService;
    @Autowired
    private PermissionCheck permissionCheck;

    /** 管理视角列表：平台管理员看全部（含各租户上传的），租户管理员看「平台包 + 本租户包」 */
    @GetMapping("/list")
    public Result<List<AppPackage>> list(@RequestParam(value = "platform", required = false) String platform,
                                         @RequestHeader("Authorization") String token) {
        permissionCheck.checkAdmin(token);
        Long tenantId = permissionCheck.getTenantIdFromToken(token);
        boolean platformAdmin = permissionCheck.isPlatformAdmin(token);
        return Result.success(appPackageService.list(tenantId, platformAdmin, platform, false), "查询成功");
    }

    /**
     * 下载视角列表：只返回上架中的包。
     * 教师 / 学生 / 管理员都能调——「租户端可见性与我的课堂一致」由前端按
     * {@code /eclassroom/config} 的 enabled 控制菜单显隐，这里不再二次判断。
     */
    @GetMapping("/available")
    public Result<List<AppPackage>> available(@RequestParam(value = "platform", required = false) String platform,
                                              @RequestHeader("Authorization") String token) {
        permissionCheck.checkAnyLogin(token);
        Long tenantId = permissionCheck.getTenantIdFromToken(token);
        boolean platformAdmin = permissionCheck.isPlatformAdmin(token);
        return Result.success(appPackageService.list(tenantId, platformAdmin, platform, true), "查询成功");
    }

    /** 平台支持的目标平台清单（前端下拉用，避免两端各写一份） */
    @GetMapping("/platforms")
    public Result<List<String>> platforms(@RequestHeader("Authorization") String token) {
        permissionCheck.checkAnyLogin(token);
        return Result.success(AppPackageService.platforms(), "查询成功");
    }

    /**
     * 上传安装包。
     *
     * <p>{@code logParams = false}：请求体是二进制文件，序列化进审计表既无意义又会把
     * 表撑爆；文件名/大小/摘要已在返回值与业务字段里。审计仍会记录操作人、IP、时间。
     */
    @PostMapping("/upload")
    @Audit(action = AuditAction.APP_PACKAGE_UPLOAD, resourceType = "app_package", logParams = false)
    public Result<Map<String, Object>> upload(@RequestParam("file") MultipartFile file,
                                              @RequestParam("platform") String platform,
                                              @RequestParam(value = "version", required = false) String version,
                                              @RequestParam(value = "remark", required = false) String remark,
                                              @RequestHeader("Authorization") String token) {
        permissionCheck.checkAdmin(token);
        String userId = permissionCheck.getUserIdFromToken(token);
        String role = permissionCheck.getRoleFromToken(token);
        Long tenantId = permissionCheck.getTenantIdFromToken(token);
        // 平台管理员上传的包对全部租户可见（tenant_id=0）；租户管理员上传的只在本租户可见
        Long ownerTenant = permissionCheck.isPlatformAdmin(token) ? 0L : tenantId;
        // 上传人姓名在审计表里已按 token 记录，这里不额外查库（列表页用 uploaderId 展示）
        return appPackageService.upload(file, platform, version, remark, userId, role, null, ownerTenant);
    }

    /**
     * 上架 / 下架。body: {"id":1,"status":0}
     *
     * <p>resourceId 刻意留空：AuditAspect.resolveParam 只按「参数名 / 参数名.字段」
     * 解析（对 Map 取不到 key），写 "body.id" 会静默得到 null。这里 body 本身就是
     * {"id","status"}，交给默认 logParams=true 整包记进 params 即可追溯，更可靠。
     */
    @PostMapping("/status")
    @Audit(action = AuditAction.APP_PACKAGE_STATUS, resourceType = "app_package")
    public Result<Boolean> status(@RequestBody Map<String, Object> body,
                                  @RequestHeader("Authorization") String token) {
        permissionCheck.checkAdmin(token);
        if (body == null || body.get("id") == null) {
            return Result.fail(400, "缺少 id");
        }
        Long id;
        int status;
        try {
            id = Long.valueOf(String.valueOf(body.get("id")).trim());
            status = Integer.parseInt(String.valueOf(body.get("status")).trim());
        } catch (NumberFormatException e) {
            return Result.fail(400, "id / status 格式不正确");
        }
        if (status != 0 && status != 1) {
            return Result.fail(400, "status 只能取 0（下架）或 1（上架）");
        }
        Long tenantId = permissionCheck.getTenantIdFromToken(token);
        boolean platformAdmin = permissionCheck.isPlatformAdmin(token);
        int rows = appPackageService.updateStatus(id, status, tenantId, platformAdmin);
        return rows > 0
                ? Result.success(true, status == 1 ? "已上架" : "已下架")
                : Result.fail(404, "安装包不存在，或无权操作该记录");
    }

    /**
     * 下载安装包（流式，支持大文件）。
     *
     * <p>返回 {@link ResponseEntity} 而不是 {@code Result}：包体最大 400MB，
     * 塞进 JSON 里 base64 会膨胀 33% 且无法断点续传。审计仍走 {@code @Audit}。
     * 文件名用 RFC 5987 的 {@code filename*} 传，中文名不会乱码。
     */
    @GetMapping("/download/{id}")
    @Audit(action = AuditAction.APP_PACKAGE_DOWNLOAD, resourceType = "app_package", resourceId = "id")
    public ResponseEntity<Resource> download(@PathVariable("id") Long id,
                                             @RequestHeader("Authorization") String token) {
        permissionCheck.checkAnyLogin(token);
        Long tenantId = permissionCheck.getTenantIdFromToken(token);
        boolean platformAdmin = permissionCheck.isPlatformAdmin(token);
        AppPackage p = appPackageService.findDownloadable(id, tenantId, platformAdmin);
        if (p == null) {
            return ResponseEntity.status(404).build();
        }
        File f = appPackageService.resolveFile(p);
        if (f == null) {
            // 记录还在但磁盘被清了：明确 404，不要假装成功给个空文件
            return ResponseEntity.status(404).build();
        }
        appPackageService.incrDownload(id);

        String encoded = URLEncoder.encode(p.getFileName() == null ? "package" : p.getFileName(),
                StandardCharsets.UTF_8).replace("+", "%20");
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_OCTET_STREAM);
        headers.setContentLength(f.length());
        headers.set(HttpHeaders.CONTENT_DISPOSITION,
                "attachment; filename=\"" + encoded + "\"; filename*=UTF-8''" + encoded);
        headers.set("X-Content-Type-Options", "nosniff");
        return new ResponseEntity<>(new FileSystemResource(f), headers, org.springframework.http.HttpStatus.OK);
    }

    /** 存储目录（仅平台管理员，排障用） */
    @GetMapping("/storage")
    public Result<Map<String, Object>> storage(@RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        Map<String, Object> m = new HashMap<>();
        m.put("dir", appPackageService.storageDir());
        return Result.success(m, "查询成功");
    }
}
