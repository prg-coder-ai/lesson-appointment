package com.classroom.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.classroom.entity.Submission;
import com.classroom.mapper.SubmissionMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 学生作品管理。
 */
@Slf4j
@Service
public class SubmissionService {

    private final SubmissionMapper submissionMapper;

    public SubmissionService(SubmissionMapper submissionMapper) {
        this.submissionMapper = submissionMapper;
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
        return s;
    }

    public List<Submission> listBySchedule(String scheduleId) {
        LambdaQueryWrapper<Submission> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Submission::getScheduleId, scheduleId)
               .orderByDesc(Submission::getCreatedAt);
        return submissionMapper.selectList(wrapper);
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
}