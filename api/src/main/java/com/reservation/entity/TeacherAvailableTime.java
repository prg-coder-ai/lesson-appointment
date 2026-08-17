package com.reservation.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

/**
 * 教师可预约时间段实体（周模板 + 按日覆盖）
 * 对应 notes §1.3 teacher_available_time 表
 * time_type:
 *   weekly    每周模板，按 day_of_week(1=周一..7=周日) 生效
 *   override  具体日期覆盖，按 specific_date 生效
 *   holiday   假日关闭，按 specific_date 生效
 */
@Data
@TableName("teacher_available_time")
public class TeacherAvailableTime implements Serializable {
    private static final long serialVersionUID = 1L;

    /** 主键UUID */
    @TableId(type = IdType.ASSIGN_UUID)
    private String availableId;

    /** 关联教师user_id */
    private String teacherId;

    /** weekly(每周模板) / override(具体日期覆盖) / holiday(假日) */
    private String timeType;

    /** 每周模板时生效：1=周一..7=周日 */
    private Integer dayOfWeek;

    /** override/holiday时生效：具体日期 */
    private String specificDate;

    /** 时段开始 如 09:00:00 */
    private String startTime;

    /** 时段结束 如 17:00:00 */
    private String endTime;

    /** active/frozen */
    private String status;

    /** 创建时间 */
    private String createTime;
}
