package com.classroom.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.classroom.entity.Membership;
import com.classroom.entity.RollCallRecord;
import com.classroom.mapper.RollCallRecordMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;
import java.util.stream.Collectors;

/**
 * 点名逻辑。
 *
 * <p>P1 改造（F4-11）：{@code targetUserId} 为空时从课堂名单中随机挑选一名学生（仅学生、未移出），
 * 解决「随机选人」服务端缺失的问题。发起后由 {@code RollCallController} 负责 WS 广播强提示（F4-12）。</p>
 */
@Slf4j
@Service
public class RollCallService {

    private final RollCallRecordMapper rollCallRecordMapper;
    private final MembershipService membershipService;

    public RollCallService(RollCallRecordMapper rollCallRecordMapper, MembershipService membershipService) {
        this.rollCallRecordMapper = rollCallRecordMapper;
        this.membershipService = membershipService;
    }

    public RollCallRecord initiate(String scheduleId, String targetUserId) {
        if (targetUserId == null || targetUserId.isBlank()) {
            targetUserId = pickRandomStudent(scheduleId);
        }
        RollCallRecord r = new RollCallRecord();
        r.setScheduleId(scheduleId);
        r.setTargetUserId(targetUserId);
        r.setStatus("PENDING");
        r.setInitiatedAt(LocalDateTime.now());
        rollCallRecordMapper.insert(r);
        log.info("点名发起: scheduleId={}, rollcallId={}, target={}", scheduleId, r.getRollcallId(), targetUserId);
        return r;
    }

    public void answer(String scheduleId, Long rollcallId) {
        RollCallRecord r = rollCallRecordMapper.selectById(rollcallId);
        if (r != null && r.getScheduleId().equals(scheduleId)) {
            r.setStatus("ANSWERED");
            r.setAnsweredAt(LocalDateTime.now());
            rollCallRecordMapper.updateById(r);
        }
    }

    public void timeout(String scheduleId, Long rollcallId) {
        RollCallRecord r = rollCallRecordMapper.selectById(rollcallId);
        if (r != null && r.getScheduleId().equals(scheduleId) && "PENDING".equals(r.getStatus())) {
            r.setStatus("TIMEOUT");
            rollCallRecordMapper.updateById(r);
        }
    }

    public List<RollCallRecord> listBySchedule(String scheduleId) {
        LambdaQueryWrapper<RollCallRecord> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(RollCallRecord::getScheduleId, scheduleId)
               .orderByDesc(RollCallRecord::getInitiatedAt);
        return rollCallRecordMapper.selectList(wrapper);
    }

    /** 从课堂名单随机挑一名未移出的学生；无学生时退化为任意成员；都无则返回 null */
    private String pickRandomStudent(String scheduleId) {
        List<Membership> members = membershipService.listBySchedule(scheduleId);
        List<Membership> students = members.stream()
                .filter(m -> "student".equals(m.getRole()) && !Boolean.TRUE.equals(m.getKicked()))
                .collect(Collectors.toList());
        if (students.isEmpty()) {
            students = members.stream()
                    .filter(m -> !Boolean.TRUE.equals(m.getKicked()))
                    .collect(Collectors.toList());
        }
        if (students.isEmpty()) return null;
        return students.get(ThreadLocalRandom.current().nextInt(students.size())).getUserId();
    }
}
