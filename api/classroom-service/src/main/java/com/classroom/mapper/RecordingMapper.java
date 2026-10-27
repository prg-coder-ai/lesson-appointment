package com.classroom.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.classroom.entity.Recording;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface RecordingMapper extends BaseMapper<Recording> {
}