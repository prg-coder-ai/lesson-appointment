package com.reservation.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

/**
 * 教师可预约时间段实体（与 admin-schedule.js 的 ScheduleCreateDTO 保持同构）
 * repeat_type: none(不重复) / day(每天) / week(每周) / month(每月)
 * repeat_days: 逗号分隔的数字。week 时为 1..7(周一..周日)，month 时为 1..31
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

    /** 重复类型：none/day/week/month */
    private String repeatType;

    /** 重复间隔 N，默认 1 */
    private Integer repeatInterval;

    /** 逗号分隔的日期数字：week→1..7(周一..周日)，month→1..31 */
    private String repeatDays;

    /** 开始日期 YYYY-MM-DD */
    private String startDate;

    /** 结束日期 YYYY-MM-DD（可为空） */
    private String endDate;

    /** 时段开始 如 09:00:00 或 09:00 */
    private String startTime;

    /** 时段结束 如 17:00:00 或 17:00 */
    private String endTime;

    /** active/frozen */
    private String status;

    /** 创建时间 */
    private String createTime;

    private Integer optioned;

    private String scheduleId;
    
}
