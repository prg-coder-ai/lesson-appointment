package com.classroom.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.classroom.entity.ReconcileLog;
import org.apache.ibatis.annotations.Mapper;

import java.time.LocalDateTime;

@Mapper
public interface ReconcileLogMapper extends BaseMapper<ReconcileLog> {

    /** 过期清理：删除 received_at 早于 before 的对账日志 */
    default int deleteByReceivedAtBefore(LocalDateTime before) {
        LambdaQueryWrapper<ReconcileLog> w = new LambdaQueryWrapper<>();
        w.le(ReconcileLog::getReceivedAt, before);
        return delete(w);
    }
}