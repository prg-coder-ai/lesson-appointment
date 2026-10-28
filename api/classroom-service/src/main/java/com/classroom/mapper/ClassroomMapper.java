package com.classroom.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.classroom.entity.Classroom;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface ClassroomMapper extends BaseMapper<Classroom> {
    int updateStatus(@Param("scheduleId") String scheduleId,
                     @Param("fromStatus") String fromStatus,
                     @Param("toStatus") String toStatus);

    /**
     * 取某排期下的**全部课次课堂**（含第 1 课次的裸 id 与 {@code sid~N} 编码）。
     *
     * <p>用 {@code = sid OR LIKE 'sid~%'} 而不是只 LIKE：第 1 课次刻意存裸 id（历史兼容），
     * 只按前缀查会漏掉它。排期 id 是 32 位 UUID（无 {@code %}、{@code _}），LIKE 无需转义。
     *
     * <p>用于「整排期取消」与「课次数变少后清理孤儿课堂」——这两件事都必须看到全部课次，
     * 只按单个编码 id 操作必然漏。
     */
    @Select("SELECT * FROM classroom WHERE schedule_id = #{scheduleId}"
            + " OR schedule_id LIKE CONCAT(#{scheduleId}, '~%') ORDER BY schedule_id")
    List<Classroom> listByScheduleGroup(@Param("scheduleId") String scheduleId);
}