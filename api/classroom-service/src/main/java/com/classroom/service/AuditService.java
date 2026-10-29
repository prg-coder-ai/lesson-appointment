package com.classroom.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.classroom.entity.AuditLog;
import com.classroom.entity.Submission;
import com.classroom.mapper.AuditLogMapper;
import com.classroom.mapper.SubmissionMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 内容审核与查阅留痕（F8-03）。
 *
 * <p>三件事：
 * <ol>
 *   <li><b>抽查作品</b>：运营按课堂/状态拉作品列表（带签名 URL，能直接看）；</li>
 *   <li><b>标记违规</b>：{@code status=FLAGGED} 与留痕同时落，先留痕再改状态——反过来一旦改状态失败，
 *       就变成「标记了但查不到谁标的」；</li>
 *   <li><b>查阅留痕</b>：聊天本身不落库（设计如此：不做即时通讯归档），
 *       但「管理员查阅了某课堂聊天」这件事必须留痕，否则「有没有人偷看聊天」无法追溯。</li>
 * </ol>
 */
@Slf4j
@Service
public class AuditService {

    private final AuditLogMapper auditLogMapper;
    private final SubmissionMapper submissionMapper;

    public AuditService(AuditLogMapper auditLogMapper, SubmissionMapper submissionMapper) {
        this.auditLogMapper = auditLogMapper;
        this.submissionMapper = submissionMapper;
    }

    /** 抽查：按课堂/状态查作品（status 可空=全部） */
    public List<Submission> listSubmissions(String scheduleId, String status, int limit) {
        LambdaQueryWrapper<Submission> w = new LambdaQueryWrapper<>();
        if (scheduleId != null && !scheduleId.isBlank()) {
            w.eq(Submission::getScheduleId, scheduleId);
        }
        if (status != null && !status.isBlank()) {
            w.eq(Submission::getStatus, status.toUpperCase());
        }
        w.orderByDesc(Submission::getCreatedAt).last("LIMIT " + Math.min(Math.max(limit, 1), 200));
        return submissionMapper.selectList(w);
    }

    public Submission getSubmission(Long submissionId) {
        return submissionMapper.selectById(submissionId);
    }

    /** 标记违规：先留痕，再改状态 */
    public boolean flagSubmission(Long submissionId, String operatorId, String note) {
        Submission s = submissionMapper.selectById(submissionId);
        if (s == null) return false;
        write("SUBMISSION", String.valueOf(submissionId), s.getScheduleId(), "FLAG", operatorId, note);
        s.setStatus("FLAGGED");
        submissionMapper.updateById(s);
        log.warn("作品被标记违规: submissionId={}, operator={}, note={}", submissionId, operatorId, note);
        return true;
    }

    /** 审核通过（不改业务状态，只留痕） */
    public boolean passSubmission(Long submissionId, String operatorId, String note) {
        Submission s = submissionMapper.selectById(submissionId);
        if (s == null) return false;
        write("SUBMISSION", String.valueOf(submissionId), s.getScheduleId(), "PASS", operatorId, note);
        return true;
    }

    /** 查阅聊天留痕（聊天不落库，只能记录查阅行为本身） */
    public void logChatView(String scheduleId, String operatorId, String note) {
        write("CHAT", null, scheduleId, "VIEW", operatorId, note);
        log.info("管理员查阅课堂聊天: scheduleId={}, operator={}", scheduleId, operatorId);
    }

    public List<AuditLog> listLogs(int days, String scheduleId) {
        LambdaQueryWrapper<AuditLog> w = new LambdaQueryWrapper<>();
        w.ge(AuditLog::getCreatedAt, LocalDateTime.now().minusDays(Math.max(1, days)));
        if (scheduleId != null && !scheduleId.isBlank()) {
            w.eq(AuditLog::getScheduleId, scheduleId);
        }
        w.orderByDesc(AuditLog::getCreatedAt).last("LIMIT 500");
        return auditLogMapper.selectList(w);
    }

    private void write(String targetType, String targetId, String scheduleId,
                       String action, String operatorId, String note) {
        AuditLog row = new AuditLog();
        row.setTargetType(targetType);
        row.setTargetId(targetId);
        row.setScheduleId(scheduleId);
        row.setAction(action);
        row.setOperatorId(operatorId);
        row.setNote(note == null ? null : (note.length() > 255 ? note.substring(0, 255) : note));
        row.setCreatedAt(LocalDateTime.now());
        auditLogMapper.insert(row);
    }
}
