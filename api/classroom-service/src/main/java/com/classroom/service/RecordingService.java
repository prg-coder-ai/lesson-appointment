package com.classroom.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.classroom.entity.Recording;
import com.classroom.mapper.RecordingMapper;
import com.classroom.util.OssClient;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 录制管理。
 */
@Slf4j
@Service
public class RecordingService {

    private final RecordingMapper recordingMapper;
    private final OssClient ossClient;

    public RecordingService(RecordingMapper recordingMapper, OssClient ossClient) {
        this.recordingMapper = recordingMapper;
        this.ossClient = ossClient;
    }

    public Recording startRecording(String scheduleId) {
        Recording r = new Recording();
        r.setScheduleId(scheduleId);
        r.setStartTime(LocalDateTime.now());
        r.setStatus("RECORDING");
        r.setRetentionDays(90);
        recordingMapper.insert(r);
        log.info("录制开始: scheduleId={}, recordingId={}", scheduleId, r.getRecordingId());
        return r;
    }

    public void stopRecording(String scheduleId, Long recordingId, String ossKey) {
        Recording r = recordingMapper.selectById(recordingId);
        if (r != null && r.getScheduleId().equals(scheduleId)) {
            r.setEndTime(LocalDateTime.now());
            r.setOssKey(ossKey);
            r.setStatus("READY");
            r.setExpireAt(LocalDateTime.now().plusDays(r.getRetentionDays()));
            recordingMapper.updateById(r);
            log.info("录制结束: recordingId={}", recordingId);
        }
    }

    public String getPlaybackUrl(String scheduleId) {
        LambdaQueryWrapper<Recording> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Recording::getScheduleId, scheduleId)
               .eq(Recording::getStatus, "READY")
               .orderByDesc(Recording::getCreatedAt)
               .last("LIMIT 1");
        Recording r = recordingMapper.selectOne(wrapper);
        if (r == null || r.getOssKey() == null) {
            return null;
        }
        return ossClient.generateSignedUrl(r.getOssKey());
    }

    public List<Recording> listBySchedule(String scheduleId) {
        LambdaQueryWrapper<Recording> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Recording::getScheduleId, scheduleId)
               .orderByDesc(Recording::getCreatedAt);
        return recordingMapper.selectList(wrapper);
    }
}