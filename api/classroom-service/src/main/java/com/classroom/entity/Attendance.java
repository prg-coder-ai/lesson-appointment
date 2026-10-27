package com.classroom.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("classroom_attendance")
public class Attendance {
    private String scheduleId;
    private String userId;
    private String attendanceStatus;
    private LocalDateTime checkInAt;
    private LocalDateTime checkOutAt;
    private Integer effectiveMinutes;
    private Boolean late;
    private Boolean manualAdjust;
    private String adjustReason;
}