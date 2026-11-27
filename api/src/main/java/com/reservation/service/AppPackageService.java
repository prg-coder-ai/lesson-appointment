package com.reservation.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.reservation.common.Result;
import com.reservation.entity.AppPackage;
import com.reservation.mapper.AppPackageMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 课堂 App 安装包服务（系统配置 → 课堂 App 包管理）。
 *
 * <h3>为什么这张表不进租户插件</h3>
 * 表里同时存在「平台行（tenant_id=0）」和「租户行」，租户插件会无条件拼
 * {@code tenant_id = ?}，把平台行一起过滤掉，表现为"平台上传的包租户看不到"。
 * 所以在 MyBatisPlusConfig.IGNORE_TABLES 里排除，隔离改由本类显式条件控制——
 * 与 sys_term（三级词表）、sys_industry 同一套路。
 *
 * <h3>目录与安全</h3>
 * 包体落 {@code app.package.dir}（默认 ~/classroom-packages），表里只存
 * 随机前缀文件名，不存绝对路径：换部署目录不用洗数据，也不会因为把库里
 * 的字段拼进路径而出现目录穿越。下载时再 normalize + 前缀校验一次。
 */
@Slf4j
@Service
public class AppPackageService {

    @Autowired
    private AppPackageMapper appPackageMapper;

    /** 存储根目录（磁盘绝对路径）。默认落在用户主目录下的 classroom-packages */
    @Value("${app.package.dir:${user.home}/classroom-packages}")
    private String packageDir;

    /** 业务层单包上限（字节），默认 400MB —— 2026-11-27 由 150MB 放宽，容器层 450MB 同步 */
    @Value("${app.package.max-size:419430400}")
    private long maxBytes;

    private static final List<String> PLATFORMS = List.of("windows", "android", "ios", "macos");

    public static List<String> platforms() {
        return PLATFORMS;
    }

    /* ══════════════════ 查询 ══════════════════ */

    /**
     * 可下载/可管理列表。
     *
     * @param tenantId     当前租户（平台管理员为 0）
     * @param platformAdmin 平台管理员：看全部行；其余：只看「平台行 + 本租户行」
     * @param platform     可选平台过滤
     * @param onlyEnabled  仅上架（师生下载视角传 true，管理视角传 false）
     */
    public List<AppPackage> list(Long tenantId, boolean platformAdmin, String platform, boolean onlyEnabled) {
        QueryWrapper<AppPackage> w = new QueryWrapper<>();
        w.eq("deleted", 0);
        if (onlyEnabled) {
            w.eq("status", 1);
        }
        if (!platformAdmin) {
            Long tid = tenantId == null ? -1L : tenantId;
            // 平台行对所有租户可见；租户行只有本租户可见
            w.and(x -> x.eq("tenant_id", 0L).or().eq("tenant_id", tid));
        }
        if (platform != null && !platform.isBlank()) {
            w.eq("platform", platform.trim().toLowerCase());
        }
        w.orderByDesc("status").orderByDesc("create_time");
        return appPackageMapper.selectList(w);
    }

    /** 按 id 取一条可下载的记录（含归属校验）；返回 null = 不存在/无权/已下架 */
    public AppPackage findDownloadable(Long id, Long tenantId, boolean platformAdmin) {
        if (id == null) return null;
        AppPackage p = appPackageMapper.selectOne(new QueryWrapper<AppPackage>()
                .eq("id", id).eq("deleted", 0).eq("status", 1));
        if (p == null) return null;
        if (platformAdmin) return p;
        long tid = tenantId == null ? -1L : tenantId;
        if (p.getTenantId() != null && p.getTenantId() == 0L) return p;   // 平台包：所有租户可下
        if (p.getTenantId() != null && p.getTenantId() == tid) return p;  // 本租户专属包
        return null;
    }

    /* ══════════════════ 上传 ══════════════════ */

    /**
     * 保存一个安装包。
     *
     * @param tenantId 上传人所在租户；平台管理员传 0（= 全平台可见）
     */
    public Result<Map<String, Object>> upload(MultipartFile file, String platform, String version,
                                              String remark, String userId, String role, String userName,
                                              Long tenantId) {
        if (file == null || file.isEmpty()) {
            return Result.fail(400, "请选择要上传的安装包文件");
        }
        String pf = platform == null ? "" : platform.trim().toLowerCase();
        if (!PLATFORMS.contains(pf)) {
            return Result.fail(400, "平台只能取 windows / android / ios / macos");
        }
        if (file.getSize() > maxBytes) {
            return Result.fail(400, "单个安装包不能超过 " + (maxBytes / 1048576) + "MB，当前 "
                    + (file.getSize() / 1048576) + "MB");
        }
        String original = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().trim();
        if (original.isEmpty()) {
            return Result.fail(400, "文件名不能为空");
        }
        // 原始名只用于展示与下载回填，落盘名一律重建：防 ../ 与同名覆盖
        String ext = "";
        int dot = original.lastIndexOf('.');
        if (dot > 0 && dot < original.length() - 1) {
            ext = original.substring(dot).toLowerCase();
        }
        String stored = UUID.randomUUID().toString().replace("-", "") + ext;

        Path base = Paths.get(packageDir).toAbsolutePath().normalize();
        try {
            Files.createDirectories(base);
            Path target = base.resolve(stored).normalize();
            if (!target.startsWith(base)) {
                return Result.fail(400, "非法的存储路径");
            }
            // 顺手算 SHA-256（下载页展示/校验用），一次读流完成复制 + 摘要
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            try (InputStream in = new java.security.DigestInputStream(file.getInputStream(), md)) {
                Files.copy(in, target, StandardCopyOption.REPLACE_EXISTING);
            }
            String sha = toHex(md.digest());

            AppPackage p = new AppPackage();
            p.setTenantId(tenantId == null ? 0L : tenantId);
            p.setPlatform(pf);
            p.setVersion(version == null ? "" : version.trim());
            p.setFileName(original.length() > 200 ? original.substring(0, 200) : original);
            p.setStoredName(stored);
            p.setFileSize(file.getSize());
            p.setFileSha256(sha);
            p.setStatus(1);
            p.setRemark(remark);
            p.setUploaderId(userId);
            p.setUploaderRole(role);
            p.setUploaderName(userName);
            p.setDownloadCount(0);
            p.setDeleted(0);
            p.setCreateTime(LocalDateTime.now());
            p.setUpdateTime(LocalDateTime.now());
            appPackageMapper.insert(p);

            Map<String, Object> data = new HashMap<>();
            data.put("id", p.getId());
            data.put("fileName", p.getFileName());
            data.put("fileSize", p.getFileSize());
            data.put("sha256", sha);
            data.put("platform", pf);
            return Result.success(data, "安装包已上传");
        } catch (Exception e) {
            log.error("课堂 App 安装包上传失败：{}", e.getMessage(), e);
            return Result.fail(500, "安装包上传失败：" + e.getMessage());
        }
    }

    /* ══════════════════ 上下架 / 下载计数 ══════════════════ */

    /** 上架/下架（不做物理删除：审计追溯需要保留记录）。返回受影响行数 */
    public int updateStatus(Long id, Integer status, Long tenantId, boolean platformAdmin) {
        if (id == null || status == null) return 0;
        UpdateWrapper<AppPackage> u = new UpdateWrapper<>();
        u.eq("id", id).eq("deleted", 0).set("status", status).set("update_time", LocalDateTime.now());
        if (!platformAdmin) {
            // 租户管理员只能改本租户的包，平台包归平台管
            u.eq("tenant_id", tenantId == null ? -1L : tenantId);
        }
        return appPackageMapper.update(null, u);
    }

    /** 下载计数 +1（失败不影响下载本身） */
    public void incrDownload(Long id) {
        try {
            appPackageMapper.update(null, new UpdateWrapper<AppPackage>()
                    .eq("id", id).setSql("download_count = download_count + 1"));
        } catch (Exception e) {
            log.warn("下载计数 +1 失败（忽略）：{}", e.getMessage());
        }
    }

    /** 解析出磁盘文件（越界即返回 null，由调用方回 404） */
    public File resolveFile(AppPackage p) {
        if (p == null || p.getStoredName() == null || p.getStoredName().isBlank()) return null;
        Path base = Paths.get(packageDir).toAbsolutePath().normalize();
        Path target = base.resolve(p.getStoredName()).normalize();
        if (!target.startsWith(base)) return null;
        File f = target.toFile();
        return f.isFile() ? f : null;
    }

    /** 存储目录（排障/运维用） */
    public String storageDir() {
        return Paths.get(packageDir).toAbsolutePath().normalize().toString();
    }

    private static String toHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(Character.forDigit((b >> 4) & 0xF, 16)).append(Character.forDigit(b & 0xF, 16));
        }
        return sb.toString();
    }
}
