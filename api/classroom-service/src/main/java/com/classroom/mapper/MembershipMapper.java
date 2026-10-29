package com.classroom.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.classroom.entity.Membership;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

import java.util.List;

/**
 * 课堂成员 Mapper。
 *
 * <p>同 {@link AttendanceMapper}：{@code (schedule_id,user_id)} 复合主键、实体无
 * {@code @TableId}，MyBatis-Plus 不生成 {@code updateById}，必须显式按业务键更新。
 *
 * <p>显式全字段更新还解决了另一个语义问题：{@code join} 重入时要把
 * {@code leave_time}/{@code leave_reason} 清回 NULL，而 MyBatis-Plus 的默认更新策略
 * 会忽略 null 字段，用 updateById 永远清不掉。
 */
@Mapper
public interface MembershipMapper extends BaseMapper<Membership> {

    @Update("UPDATE classroom_membership SET "
            + "role = #{m.role}, "
            + "display_name = #{m.displayName}, "
            + "join_time = #{m.joinTime}, "
            + "leave_time = #{m.leaveTime}, "
            + "leave_reason = #{m.leaveReason}, "
            + "online_state = #{m.onlineState}, "
            + "kicked = #{m.kicked} "
            + "WHERE schedule_id = #{m.scheduleId} AND user_id = #{m.userId}")
    int updateByKey(@Param("m") Membership m);

    /** 取某课堂下处于指定在线状态的成员（掉线判定扫描用） */
    default List<Membership> listByScheduleAndOnline(String scheduleId, String onlineState) {
        LambdaQueryWrapper<Membership> w = new LambdaQueryWrapper<>();
        w.eq(Membership::getScheduleId, scheduleId).eq(Membership::getOnlineState, onlineState);
        return selectList(w);
    }

    /** 取某课堂的教师成员（掉线结课扫描用；教师唯一） */
    default Membership selectTeacher(String scheduleId) {
        LambdaQueryWrapper<Membership> w = new LambdaQueryWrapper<>();
        w.eq(Membership::getScheduleId, scheduleId).eq(Membership::getRole, "teacher");
        return selectOne(w);
    }
}
