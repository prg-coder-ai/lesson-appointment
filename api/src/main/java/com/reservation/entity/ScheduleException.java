// 课程模板实体（对应设计2.2.2 课程模板相关接口）
package com.reservation.entity;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Date;
import java.util.List;

// 课程排期实体（对应设计2.2.2 排期相关接口） 
@Data
public class ScheduleException {
    private Long id;
    private Long scheduleId;
    private LocalDate originalDate;
    private Integer exceptionType; // 0=取消，1=调课
    private LocalDateTime newStartTime;
    private LocalDateTime newEndTime;
    private LocalDateTime createTime;
}
 