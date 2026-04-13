package com.reservation.mapper;
import com.reservation.entity.ScheduleException;
import org.apache.ibatis.annotations.Mapper;
@Mapper
public interface ScheduleExceptionMapper {
    String insert(ScheduleException exception);
}

 