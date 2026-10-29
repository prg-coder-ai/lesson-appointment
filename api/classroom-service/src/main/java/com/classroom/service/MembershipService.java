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
            membershipMapper.updateByKey(existing);
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
        membershipMapper.updateByKey(m);
        log.info("成员离开: scheduleId={}, userId={}, reason={}", scheduleId, userId, reason);
    }

    public void kick(String scheduleId, String userId) {
        Membership m = getOne(scheduleId, userId);
        if (m == null) return;
        m.setKicked(true);
        m.setOnlineState("OFFLINE");
        m.setLeaveTime(LocalDateTime.now());
        m.setLeaveReason("kicked");
        membershipMapper.updateByKey(m);
        log.info("成员被移出: scheduleId={}, userId={}", scheduleId, userId);
    }

    /**
     * 下课收尾：把所有仍在线（或状态残留 ONLINE）的成员置为 OFFLINE。
     *
     * <p>不做这一步，课堂 CLOSED 后监控台仍会显示「X 人在线」，
     * 且下次同 scheduleId 复用时 {@code join} 会以为人还在，跳过 joinTime 更新。
     *
     * @return 被置离线的成员数
     */
    public int closeAllOnline(String scheduleId) {
        LambdaQueryWrapper<Membership> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Membership::getScheduleId, scheduleId)
               .ne(Membership::getOnlineState, "OFFLINE");
        List<Membership> online = membershipMapper.selectList(wrapper);
        LocalDateTime now = LocalDateTime.now();
        for (Membership m : online) {
            m.setOnlineState("OFFLINE");
            m.setLeaveTime(now);
            m.setLeaveReason("closed");
            membershipMapper.updateByKey(m);
        }
        return online.size();
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

    /** 取某课堂下所有仍在线（onlineState=ONLINE）的成员——掉线判定扫描用 */
    public List<Membership> listOnline(String scheduleId) {
        return membershipMapper.listByScheduleAndOnline(scheduleId, "ONLINE");
    }

    /** 取某课堂的教师成员——教师掉线结课扫描用 */
    public Membership getTeacher(String scheduleId) {
        return membershipMapper.selectTeacher(scheduleId);
    }
}