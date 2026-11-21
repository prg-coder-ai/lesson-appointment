package com.classroom.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.classroom.entity.Material;
import com.classroom.mapper.MaterialMapper;
import com.classroom.storage.StorageService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 讲稿存储与分发（F4-04 / F4-05 / F4-06）。
 *
 * <p>与包3之前的差别：以前只接一个客户端传来的 {@code ossKey}，服务端既不存文件也不校验；
 * 现在文件真的进对象存储（{@link StorageService}），列表回填 2h 签名 URL，
 * 翻页状态落库并由控制器广播 {@code page:state} 让学生跟随。
 */
@Slf4j
@Service
public class MaterialService {

    private final MaterialMapper materialMapper;
    private final StorageService storageService;
    private final TeachingSessionService teachingSession;

    public MaterialService(MaterialMapper materialMapper, StorageService storageService,
                           TeachingSessionService teachingSession) {
        this.materialMapper = materialMapper;
        this.storageService = storageService;
        this.teachingSession = teachingSession;
    }

    public Material upload(String scheduleId, String fileName, String fileType, Long fileSize, String ossKey) {
        Material m = new Material();
        m.setScheduleId(scheduleId);
        m.setFileName(fileName);
        m.setFileType(fileType);
        m.setFileSize(fileSize);
        m.setOssKey(ossKey);
        m.setStatus("READY");
        m.setCurrentPage(0);
        materialMapper.insert(m);
        // 新上传的讲稿即为当前展示稿：同步写 material:current，
        // 否则切过稿后再上传，current() 仍指向旧稿（在线广播了新稿、刷新却回旧稿）
        teachingSession.appendEvent(scheduleId, "material:current", Map.of("materialId", m.getMaterialId()));
        log.info("讲稿登记: scheduleId={}, materialId={}, fileName={}, size={}",
                scheduleId, m.getMaterialId(), fileName, fileSize);
        return withUrl(m);
    }

    /** 直传落存储 + 登记（≤100MB 一次性上传；更大的走 /uploads 分片接口） */
    public Material uploadBytes(String scheduleId, String fileName, byte[] data) {
        String key = storageService.putDirect("MATERIAL", scheduleId, fileName, data);
        return upload(scheduleId, fileName, detectType(fileName), (long) data.length, key);
    }

    /** 引用的 ossKey 已由分片上传落盘，这里只登记 */
    public Material registerUploaded(String scheduleId, String fileName, String ossKey) {
        long size = storageService.size(ossKey);
        return upload(scheduleId, fileName, detectType(fileName), size > 0 ? size : 0L, ossKey);
    }

    public List<Material> listBySchedule(String scheduleId) {
        LambdaQueryWrapper<Material> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Material::getScheduleId, scheduleId)
               .orderByDesc(Material::getCreatedAt);
        List<Material> list = materialMapper.selectList(wrapper);
        list.forEach(this::withUrl);
        return list;
    }

    /**
     * 当前生效讲稿：优先取教师课堂内指定的那一份（事件流 material:current），
     * 否则回退到最近一份 READY。写事件而非改表，避免 DDL 变更；刷新/迟到者也能定位到同一份。
     */
    public Material current(String scheduleId) {
        Map<String, Object> chosen = teachingSession.lastEventData(scheduleId, "material:current");
        if (chosen != null && chosen.get("materialId") != null) {
            try {
                Long id = Long.valueOf(String.valueOf(chosen.get("materialId")));
                Material picked = materialMapper.selectById(id);
                if (picked != null && scheduleId.equals(picked.getScheduleId())
                        && "READY".equals(picked.getStatus())) {
                    return withUrl(picked);
                }
            } catch (NumberFormatException ignore) {
                // 脏事件：忽略并回退默认口径
            }
        }
        LambdaQueryWrapper<Material> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Material::getScheduleId, scheduleId)
               .eq(Material::getStatus, "READY")
               .orderByDesc(Material::getCreatedAt)
               .last("LIMIT 1");
        return withUrl(materialMapper.selectOne(wrapper));
    }

    /** 教师指定当前展示的讲稿：写事件流（刷新/迟到者据此定位），返回讲稿供广播 */
    public Material setCurrent(String scheduleId, Long materialId) {
        Material m = materialMapper.selectById(materialId);
        if (m == null || !scheduleId.equals(m.getScheduleId()) || !"READY".equals(m.getStatus())) return null;
        teachingSession.appendEvent(scheduleId, "material:current", Map.of("materialId", materialId));
        log.info("讲稿切换: scheduleId={}, materialId={}, fileName={}", scheduleId, materialId, m.getFileName());
        return withUrl(m);
    }

    /**
     * 删除讲稿：同步删对象存储文件 + 数据库行。若删的正是当前展示稿，
     * 覆写 material:current 事件为 0（无效 id），让 current() 自动回退到下一份。
     * @return 被删的讲稿（供控制器决定是否需要广播切换），不存在或非本课次返回 null
     */
    public Material delete(String scheduleId, Long materialId) {
        Material m = materialMapper.selectById(materialId);
        if (m == null || !scheduleId.equals(m.getScheduleId())) return null;
        Map<String, Object> chosen = teachingSession.lastEventData(scheduleId, "material:current");
        boolean wasCurrent = chosen != null && String.valueOf(materialId).equals(String.valueOf(chosen.get("materialId")));

        if (m.getOssKey() != null && !m.getOssKey().isBlank()) {
            try {
                storageService.delete(m.getOssKey());
            } catch (Exception e) {
                // 文件删不掉也要删库记录，否则列表永远挂着一份打不开的资料
                log.warn("讲稿文件删除失败: scheduleId={}, ossKey={}", scheduleId, m.getOssKey(), e);
            }
        }
        materialMapper.deleteById(materialId);
        if (wasCurrent) {
            teachingSession.appendEvent(scheduleId, "material:current", Map.of("materialId", 0L));
        }
        log.info("讲稿删除: scheduleId={}, materialId={}, fileName={}", scheduleId, materialId, m.getFileName());
        return m;
    }

    public Material getById(String scheduleId, Long materialId) {
        Material m = materialMapper.selectById(materialId);
        if (m == null || !m.getScheduleId().equals(scheduleId)) return null;
        return withUrl(m);
    }

    public boolean turnPage(String scheduleId, Long materialId, int page) {
        Material m = materialMapper.selectById(materialId);
        if (m == null || !m.getScheduleId().equals(scheduleId)) return false;
        if (m.getCurrentPage() != null && m.getCurrentPage() == page) return true; // 同页不重复写
        m.setCurrentPage(page);
        materialMapper.updateById(m);
        log.debug("讲稿翻页: scheduleId={}, materialId={}, page={}", scheduleId, materialId, page);
        return true;
    }

    private Material withUrl(Material m) {
        if (m != null && m.getOssKey() != null && !m.getOssKey().isBlank()) {
            m.setUrl(storageService.signedUrl(m.getOssKey()));
        }
        return m;
    }

    /** 讲稿类型决定前端容器怎么渲染：PDF 用 iframe 带 #page，IMAGE 用 img，其余给下载 */
    private String detectType(String fileName) {
        String n = fileName == null ? "" : fileName.toLowerCase(Locale.ROOT);
        if (n.endsWith(".pdf")) return "PDF";
        if (n.endsWith(".ppt") || n.endsWith(".pptx")) return "PPT";
        if (n.endsWith(".png") || n.endsWith(".jpg") || n.endsWith(".jpeg")
                || n.endsWith(".gif") || n.endsWith(".webp")) return "IMAGE";
        return "OTHER";
    }
}
