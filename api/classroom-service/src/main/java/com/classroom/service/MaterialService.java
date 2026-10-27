package com.classroom.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.classroom.entity.Material;
import com.classroom.mapper.MaterialMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 讲稿存储与分发。
 */
@Slf4j
@Service
public class MaterialService {

    private final MaterialMapper materialMapper;

    public MaterialService(MaterialMapper materialMapper) {
        this.materialMapper = materialMapper;
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
        log.info("讲稿上传: scheduleId={}, materialId={}, fileName={}", scheduleId, m.getMaterialId(), fileName);
        return m;
    }

    public List<Material> listBySchedule(String scheduleId) {
        LambdaQueryWrapper<Material> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Material::getScheduleId, scheduleId)
               .orderByDesc(Material::getCreatedAt);
        return materialMapper.selectList(wrapper);
    }

    public void turnPage(String scheduleId, Long materialId, int page) {
        Material m = materialMapper.selectById(materialId);
        if (m != null && m.getScheduleId().equals(scheduleId)) {
            m.setCurrentPage(page);
            materialMapper.updateById(m);
        }
    }
}