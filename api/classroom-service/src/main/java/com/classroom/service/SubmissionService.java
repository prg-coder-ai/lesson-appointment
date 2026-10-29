package com.classroom.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.classroom.entity.Submission;
import com.classroom.mapper.SubmissionMapper;
import com.classroom.storage.StorageService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 学生作品管理（F5-01）。
 *
 * <p>作品文件真的进对象存储（语音/图片/文件），列表回填 2h 签名 URL——
 * 教师点评时能直接点开听/看，而不是只看到一个 ossKey 字符串。
 */
@Slf4j
@Service
public class SubmissionService {

    private final SubmissionMapper submissionMapper;
    private final StorageService storageService;

    public SubmissionService(SubmissionMapper submissionMapper, StorageService storageService) {
        this.submissionMapper = submissionMapper;
        this.storageService = storageService;
    }

    public Submission submit(String scheduleId, String userId, String type, String content, String ossKey, Integer durationSec) {
        Submission s = new Submission();
        s.setScheduleId(scheduleId);
        s.setUserId(userId);
        s.setSubmissionType(type);
        s.setContent(content);
        s.setOssKey(ossKey);
        s.setDurationSec(durationSec);
        s.setStatus("SUBMITTED");
        submissionMapper.insert(s);
        log.info("学生作品提交: scheduleId={}, submissionId={}, userId={}, type={}",
                scheduleId, s.getSubmissionId(), userId, type);
        return withUrl(s);
    }

    /** 直传落存储 + 登记（语音/图片/文件 ≤100MB） */
    public Submission submitFile(String scheduleId, String userId, String type, String content,
                                 String fileName, byte[] data, Integer durationSec) {
        String key = storageService.putDirect("SUBMISSION", scheduleId, fileName, data);
        return submit(scheduleId, userId, type, content, key, durationSec);
    }

    public List<Submission> listBySchedule(String scheduleId) {
        LambdaQueryWrapper<Submission> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Submission::getScheduleId, scheduleId)
               .orderByDesc(Submission::getCreatedAt);
        List<Submission> list = submissionMapper.selectList(wrapper);
        list.forEach(this::withUrl);
        return list;
    }

    public void review(Long submissionId, String teacherComment, java.math.BigDecimal score) {
        Submission s = submissionMapper.selectById(submissionId);
        if (s == null) return;
        s.setStatus("REVIEWED");
        s.setTeacherComment(teacherComment);
        s.setScore(score);
        submissionMapper.updateById(s);
        log.info("作品批阅: submissionId={}, score={}", submissionId, score);
    }

    private Submission withUrl(Submission s) {
        if (s != null && s.getOssKey() != null && !s.getOssKey().isBlank()) {
            s.setUrl(storageService.signedUrl(s.getOssKey()));
        }
        return s;
    }
}