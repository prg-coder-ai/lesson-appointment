package com.classroom.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.classroom.entity.Recording;
import org.apache.ibatis.annotations.Mapper;

import java.time.LocalDateTime;

@Mapper
public interface RecordingMapper extends BaseMapper<Recording> {

    /** 过期清理：删除 created_at 早于 before 的录制记录（文件本身由对象存储生命周期策略回收） */
    default int deleteByCreatedAtBefore(LocalDateTime before) {
        LambdaQueryWrapper<Recording> w = new LambdaQueryWrapper<>();
        w.le(Recording::getCreatedAt, before);
        return delete(w);
    }
}