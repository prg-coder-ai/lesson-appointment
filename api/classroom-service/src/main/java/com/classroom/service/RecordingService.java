package com.classroom.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.classroom.entity.Recording;
import com.classroom.mapper.RecordingMapper;
import com.classroom.recording.RecordingBackend;
import com.classroom.recording.RecordingBackendRegistry;
import com.classroom.recording.RecordingProperties;
import com.classroom.storage.StorageService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 录制管理（F6-01 ~ F6-05）。
 *
 * <p>修复前这套方法零调用者：{@code startRecording/stopRecording} 没人调，
 * {@code classroom_recording} 永远是空表，「回放」自然也无从谈起。
 *
 * <p>现在的闭环：
 * <ol>
 *   <li>教师点录制 → {@link #start} 落一条 RECORDING 记录 + 交后端开始（本地录制由浏览器执行）；</li>
 *   <li>教师停止 → 客户端把录制文件分片上传到对象存储 → {@link #finish} 登记 ossKey 并算出过期时间；</li>
 *   <li>学生/教师回放 → {@link #getPlaybackUrl} 给 2h 签名 URL，支持 Range 拖动；</li>
 *   <li>过期 → {@link #purgeExpired} <b>先删对象再删记录</b>（只删记录会留下永远没人认领的文件，
 *       磁盘只涨不降，这是这类系统最常见的隐性泄漏）。</li>
 * </ol>
 */
@Slf4j
@Service
public class RecordingService {

    private final RecordingMapper recordingMapper;
    private final StorageService storageService;
    private final RecordingBackendRegistry backendRegistry;
    private final RecordingProperties props;

    public RecordingService(RecordingMapper recordingMapper,
                            StorageService storageService,
                            RecordingBackendRegistry backendRegistry,
                            RecordingProperties props) {
        this.recordingMapper = recordingMapper;
        this.storageService = storageService;
        this.backendRegistry = backendRegistry;
        this.props = props;
    }

    /**
     * 开始录制（幂等：本课堂已有 RECORDING 记录时直接返回那条）。
     *
     * <p>幂等很重要——教师手抖点两次、网络重试都会打到这里，重复插入会产生
     * 两条都无法完成的「幽灵录制」。
     */
    public Recording start(String scheduleId, String operatorId) {
        Recording running = findRunning(scheduleId);
        if (running != null) {
            log.info("录制已在进行中，复用记录: scheduleId={}, recordingId={}", scheduleId, running.getRecordingId());
            return withUrl(running);
        }
        Recording r = new Recording();
        r.setScheduleId(scheduleId);
        r.setStartTime(LocalDateTime.now());
        r.setStatus("RECORDING");
        r.setRetentionDays(props.getRetentionDays());
        recordingMapper.insert(r);

        RecordingBackend backend = backendRegistry.active();
        String taskId = backend.start(scheduleId, r.getRecordingId(), operatorId);
        log.info("录制开始: scheduleId={}, recordingId={}, mode={}, taskId={}",
                scheduleId, r.getRecordingId(), backend.mode(), taskId);
        return withUrl(r);
    }

    /** 录制完成：登记 ossKey 并计算过期时间；重复调用幂等 */
    public Recording finish(String scheduleId, Long recordingId, String ossKey) {
        Recording r = recordingMapper.selectById(recordingId);
        if (r == null || !r.getScheduleId().equals(scheduleId)) {
            throw new IllegalArgumentException("录制记录不存在：" + recordingId);
        }
        if ("READY".equals(r.getStatus())) {
            return withUrl(r);
        }
        if (ossKey == null || ossKey.isBlank()) {
            throw new IllegalArgumentException("缺少录制文件 ossKey");
        }
        if (!storageService.exists(ossKey)) {
            throw new IllegalArgumentException("录制文件尚未上传完成：" + ossKey);
        }
        r.setEndTime(LocalDateTime.now());
        r.setOssKey(ossKey);
        r.setStatus("READY");
        int days = r.getRetentionDays() == null ? props.getRetentionDays() : r.getRetentionDays();
        r.setExpireAt(LocalDateTime.now().plusDays(days));
        recordingMapper.updateById(r);
        backendRegistry.active().stop(scheduleId, recordingId, ossKey);
        log.info("录制完成: scheduleId={}, recordingId={}, ossKey={}, 保留 {} 天", scheduleId, recordingId, ossKey, days);
        return withUrl(r);
    }

    /** 下课收尾：仍在 RECORDING 的记录标 FAILED（教师直接关页面/断网时会发生） */
    public void markOrphansFailed(String scheduleId) {
        Recording r = findRunning(scheduleId);
        if (r == null) return;
        r.setStatus("FAILED");
        r.setEndTime(LocalDateTime.now());
        recordingMapper.updateById(r);
        log.warn("课堂结束时录制仍未完成，标记 FAILED: scheduleId={}, recordingId={}", scheduleId, r.getRecordingId());
    }

    public Recording findRunning(String scheduleId) {
        LambdaQueryWrapper<Recording> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Recording::getScheduleId, scheduleId)
               .eq(Recording::getStatus, "RECORDING")
               .orderByDesc(Recording::getCreatedAt)
               .last("LIMIT 1");
        return recordingMapper.selectOne(wrapper);
    }

    public Recording getById(String scheduleId, Long recordingId) {
        Recording r = recordingMapper.selectById(recordingId);
        if (r == null || !r.getScheduleId().equals(scheduleId)) return null;
        return withUrl(r);
    }

    public String getPlaybackUrl(String scheduleId) {
        Recording r = latestReady(scheduleId);
        if (r == null || r.getOssKey() == null) return null;
        return storageService.signedUrl(r.getOssKey());
    }

    public String playbackUrlById(Long recordingId) {
        Recording r = recordingMapper.selectById(recordingId);
        if (r == null || r.getOssKey() == null) return null;
        return storageService.signedUrl(r.getOssKey());
    }

    public List<Recording> listBySchedule(String scheduleId) {
        LambdaQueryWrapper<Recording> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Recording::getScheduleId, scheduleId)
               .orderByDesc(Recording::getCreatedAt);
        List<Recording> list = recordingMapper.selectList(wrapper);
        list.forEach(this::withUrl);
        return list;
    }

    /**
     * 过期清理：先删对象文件，再删数据库记录。
     *
     * <p>顺序不能反——先删记录就再也找不到 ossKey 去删文件了，那些文件会一直占着磁盘。
     *
     * @return 清理条数
     */
    public int purgeExpired() {
        LocalDateTime now = LocalDateTime.now();
        LambdaQueryWrapper<Recording> wrapper = new LambdaQueryWrapper<>();
        wrapper.and(w -> w.lt(Recording::getExpireAt, now)
                .or(x -> x.isNull(Recording::getExpireAt)
                        .lt(Recording::getCreatedAt, now.minusDays(props.getRetentionDays()))));
        List<Recording> expired = recordingMapper.selectList(wrapper);
        int removed = 0;
        for (Recording r : expired) {
            try {
                if (r.getOssKey() != null && !r.getOssKey().isBlank()) {
                    storageService.delete(r.getOssKey());
                }
                recordingMapper.deleteById(r.getRecordingId());
                removed++;
            } catch (Exception e) {
                log.error("清理录制失败: recordingId={}, ossKey={}", r.getRecordingId(), r.getOssKey(), e);
            }
        }
        if (removed > 0) {
            log.info("[录制清理] 删除 {} 条过期录制（含对象文件）", removed);
        }
        return removed;
    }

    private Recording latestReady(String scheduleId) {
        LambdaQueryWrapper<Recording> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Recording::getScheduleId, scheduleId)
               .eq(Recording::getStatus, "READY")
               .orderByDesc(Recording::getCreatedAt)
               .last("LIMIT 1");
        return recordingMapper.selectOne(wrapper);
    }

    private Recording withUrl(Recording r) {
        if (r != null && r.getOssKey() != null && !r.getOssKey().isBlank()) {
            r.setUrl(storageService.signedUrl(r.getOssKey()));
        }
        return r;
    }
}
