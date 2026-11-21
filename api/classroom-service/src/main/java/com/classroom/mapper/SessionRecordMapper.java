package com.classroom.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.classroom.entity.SessionRecord;
import org.apache.ibatis.annotations.Mapper;

import java.time.LocalDateTime;

@Mapper
public interface SessionRecordMapper extends BaseMapper<SessionRecord> {

    /** 过期清理：删除已结束且 end_time 早于 before 的会话记录；end_time 为空则按 start_time 兜底 */
    default int deleteByEndTimeBefore(LocalDateTime before) {
        LambdaQueryWrapper<SessionRecord> w = new LambdaQueryWrapper<>();
        w.and(x -> x.le(SessionRecord::getEndTime, before)
                .or().isNull(SessionRecord::getEndTime).le(SessionRecord::getStartTime, before));
        return delete(w);
    }
}