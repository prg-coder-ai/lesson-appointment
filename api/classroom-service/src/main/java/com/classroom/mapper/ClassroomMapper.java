package com.classroom.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.classroom.entity.Classroom;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface ClassroomMapper extends BaseMapper<Classroom> {
    int updateStatus(@Param("scheduleId") String scheduleId,
                     @Param("fromStatus") String fromStatus,
                     @Param("toStatus") String toStatus);
}