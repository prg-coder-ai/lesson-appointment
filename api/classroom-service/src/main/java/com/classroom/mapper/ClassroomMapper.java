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

    /**
     * 就绪提醒扫描：仍为 SCHEDULED、且上课时间落在「现在 ~ 现在+minutes」窗口内的课堂。
     *
     * <p>不设置下界（不写 {@code start_time > NOW()}）：已开始但卡在 SCHEDULED 的课堂（例如
     * 自动开课被关、教师没点开始）也该翻成 READY，让 UI 显示「可进入」并触发自动开课自愈。
     */
    @Select("SELECT * FROM classroom WHERE status = 'SCHEDULED' "
            + "AND start_time <= DATE_ADD(NOW(), INTERVAL #{minutes} MINUTE) "
            + "ORDER BY start_time")
    List<Classroom> listReadyToRemind(@Param("minutes") int minutes);

    /**
     * 自动开课扫描：SCHEDULED/READY、且已到开课时间、且未过结束时间（不启动「已结束」的课堂）的课堂。
     * 全局开关与单课堂 {@code auto_start=false} 的过滤在 Java 侧完成。
     */
    @Select("SELECT * FROM classroom WHERE status IN ('SCHEDULED','READY') "
            + "AND start_time <= NOW() "
            + "AND (end_time IS NULL OR end_time >= NOW()) "
            + "ORDER BY start_time")
    List<Classroom> listDueToStart();

    /**
     * 自动下课扫描：仍 LIVE、且计划结束时间已过去 grace 分钟的课堂。
     */
    @Select("SELECT * FROM classroom WHERE status = 'LIVE' "
            + "AND end_time IS NOT NULL "
            + "AND end_time <= DATE_SUB(NOW(), INTERVAL #{grace} MINUTE) "
            + "ORDER BY end_time")
    List<Classroom> listOverdueLive(@Param("grace") int graceMinutes);
}