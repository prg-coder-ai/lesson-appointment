package com.classroom.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.classroom.entity.SessionRecord;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface SessionRecordMapper extends BaseMapper<SessionRecord> {
}