package com.classroom.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.classroom.entity.Material;
import com.classroom.mapper.MaterialMapper;
import com.classroom.storage.StorageService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Locale;

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

    public MaterialService(MaterialMapper materialMapper, StorageService storageService) {
        this.materialMapper = materialMapper;
        this.storageService = storageService;
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

    /** 当前生效讲稿（最近一份 READY），学生进房时据此直接定位画面 */
    public Material current(String scheduleId) {
        LambdaQueryWrapper<Material> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Material::getScheduleId, scheduleId)
               .eq(Material::getStatus, "READY")
               .orderByDesc(Material::getCreatedAt)
               .last("LIMIT 1");
        return withUrl(materialMapper.selectOne(wrapper));
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
