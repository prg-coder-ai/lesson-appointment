package com.classroom.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.classroom.entity.RollCallRecord;
import org.apache.ibatis.annotations.Mapper;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface RollCallRecordMapper extends BaseMapper<RollCallRecord> {

    /** 点名超时扫描：仍 PENDING 且发起时间早于 before 的记录 */
    default List<RollCallRecord> listExpiredPending(LocalDateTime before) {
        LambdaQueryWrapper<RollCallRecord> w = new LambdaQueryWrapper<>();
        w.eq(RollCallRecord::getStatus, "PENDING").lt(RollCallRecord::getInitiatedAt, before);
        return selectList(w);
    }

    /** 过期数据清理：删除发起时间早于 before 的全部点名记录（不论状态） */
    default int deleteByInitiatedAtBefore(LocalDateTime before) {
        LambdaQueryWrapper<RollCallRecord> w = new LambdaQueryWrapper<>();
        w.lt(RollCallRecord::getInitiatedAt, before);
        return delete(w);
    }
}