package com.classroom.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.classroom.entity.RollCallRecord;
import com.classroom.mapper.RollCallRecordMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 点名逻辑。
 */
@Slf4j
@Service
public class RollCallService {

    private final RollCallRecordMapper rollCallRecordMapper;

    public RollCallService(RollCallRecordMapper rollCallRecordMapper) {
        this.rollCallRecordMapper = rollCallRecordMapper;
    }

    public RollCallRecord initiate(String scheduleId, String targetUserId) {
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
}