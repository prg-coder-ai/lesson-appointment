// 课程模板实体（对应设计2.2.2 课程模板相关接口）
package com.reservation.entity;

import lombok.Data;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Date;
import java.io.Serializable;
import java.util.List;

// 课程排期实体（对应设计2.2.2 排期相关接口）
@Data
public class CourseSchedule implements Serializable {
    private static final long serialVersionUID = 1L;

    private String scheduleId;
    @NotBlank(message = "课程ID不能为空")
    private String courseId;
    @NotBlank(message = "开始时间不能为空")
    private Date startTime;  // 格式YYYY-MM-DD HH:mm:ss（对应通用校验规则-时间）
    @NotBlank(message = "结束时间不能为空")
    private Date endTime;
    @NotNull(message = "重复标识不能为空")   
    private int repeatType;//重复类型：0=不重复，1=每天，2=每周，3=每月
    private int repeatInterval;//重复间隔（如每2周一次=2）
    private String repeatDays;//重复的星期几：1=周一，2=周二...7=周日，逗号分隔（仅repeat_type=2时有效），type=3时为1-31,当月的那几天，如（1，3，5，7） ，（1，11，21）
    private Date repeatEnd_date;  //重复结束时间（精确到秒）
    private int availableSites;//可预定数量，缺省为1，可填写，
    private String status;  // 枚举值：pending/active/inactive/frozen
}
//简化版本：每个排期只包含1次课（repeate_type=0),只允许available_sites个人参与预定，available_sites可以编辑（将来可从模板、课程中带入）。
