package com.classroom.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.classroom.common.ErrorCodes;
import com.classroom.entity.Membership;
import com.classroom.exception.ClassroomBizException;
import com.classroom.mapper.MembershipMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 成员管理（在线状态机）。
 */
@Slf4j
@Service
public class MembershipService {

    private final MembershipMapper membershipMapper;

    public MembershipService(MembershipMapper membershipMapper) {
        this.membershipMapper = membershipMapper;
    }

    public void join(String scheduleId, String userId, String role, String displayName) {
        Membership existing = getOne(scheduleId, userId);
        if (existing != null) {
            if (Boolean.TRUE.equals(existing.getKicked())) {
                throw new ClassroomBizException(ErrorCodes.MEMBER_KICKED, "已被移出课堂，不可重入");
            }
            existing.setOnlineState("ONLINE");
            existing.setLeaveTime(null);
            existing.setLeaveReason(null);
            membershipMapper.updateById(existing);
            log.info("成员重新加入: scheduleId={}, userId={}", scheduleId, userId);
            return;
        }
        Membership m = new Membership();
        m.setScheduleId(scheduleId);
        m.setUserId(userId);
        m.setRole(role);
        m.setDisplayName(displayName);
        m.setJoinTime(LocalDateTime.now());
        m.setOnlineState("ONLINE");
        m.setKicked(false);
        membershipMapper.insert(m);
        log.info("成员首次加入: scheduleId={}, userId={}, role={}", scheduleId, userId, role);
    }

    public void leave(String scheduleId, String userId, String reason) {
        Membership m = getOne(scheduleId, userId);
        if (m == null) return;
        m.setOnlineState("OFFLINE");
        m.setLeaveTime(LocalDateTime.now());
        m.setLeaveReason(reason);
        membershipMapper.updateById(m);
        log.info("成员离开: scheduleId={}, userId={}, reason={}", scheduleId, userId, reason);
    }

    public void kick(String scheduleId, String userId) {
        Membership m = getOne(scheduleId, userId);
        if (m == null) return;
        m.setKicked(true);
        m.setOnlineState("OFFLINE");
        m.setLeaveTime(LocalDateTime.now());
        m.setLeaveReason("kicked");
        membershipMapper.updateById(m);
        log.info("成员被移出: scheduleId={}, userId={}", scheduleId, userId);
    }

    public Membership getOne(String scheduleId, String userId) {
        LambdaQueryWrapper<Membership> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Membership::getScheduleId, scheduleId)
               .eq(Membership::getUserId, userId);
        return membershipMapper.selectOne(wrapper);
    }

    public List<Membership> listBySchedule(String scheduleId) {
        LambdaQueryWrapper<Membership> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Membership::getScheduleId, scheduleId);
        return membershipMapper.selectList(wrapper);
    }
}