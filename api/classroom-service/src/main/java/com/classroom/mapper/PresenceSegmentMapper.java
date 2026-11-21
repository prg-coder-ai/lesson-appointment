package com.classroom.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.classroom.entity.PresenceSegment;
import org.apache.ibatis.annotations.Mapper;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface PresenceSegmentMapper extends BaseMapper<PresenceSegment> {

    /** 某课堂某人的全部区间，按进入时间升序（有效时长累加的顺序前提） */
    default List<PresenceSegment> listByScheduleUser(String scheduleId, String userId) {
        LambdaQueryWrapper<PresenceSegment> w = new LambdaQueryWrapper<>();
        w.eq(PresenceSegment::getScheduleId, scheduleId)
                .eq(PresenceSegment::getUserId, userId)
                .orderByAsc(PresenceSegment::getJoinAt)
                .orderByAsc(PresenceSegment::getId);
        return selectList(w);
    }

    /** 某课堂某人的未闭合区间（正常至多一条；多余的是异常残留，需一并闭合） */
    default List<PresenceSegment> listOpen(String scheduleId, String userId) {
        LambdaQueryWrapper<PresenceSegment> w = new LambdaQueryWrapper<>();
        w.eq(PresenceSegment::getScheduleId, scheduleId)
                .eq(PresenceSegment::getUserId, userId)
                .isNull(PresenceSegment::getLeaveAt)
                .orderByAsc(PresenceSegment::getJoinAt);
        return selectList(w);
    }

    /** 某课堂全部未闭合区间（下课收尾用） */
    default List<PresenceSegment> listAllOpen(String scheduleId) {
        LambdaQueryWrapper<PresenceSegment> w = new LambdaQueryWrapper<>();
        w.eq(PresenceSegment::getScheduleId, scheduleId)
                .isNull(PresenceSegment::getLeaveAt);
        return selectList(w);
    }

    /** 过期清理：删除 created_at 早于 before 的在线区间（课堂已结课、出勤已核算，仅留审计价值） */
    default int deleteBefore(LocalDateTime before) {
        LambdaQueryWrapper<PresenceSegment> w = new LambdaQueryWrapper<>();
        w.le(PresenceSegment::getCreatedAt, before);
        return delete(w);
    }
}
