package com.classroom.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("classroom")
public class Classroom {
    @TableId(type = IdType.INPUT)
    private String scheduleId;
    private String courseId;
    private String courseName;
    private String teacherId;
    private String teacherName;
    private LocalDateTime startTime;
    private LocalDateTime endTime;
    private Integer duration;
    private String status;
    private Boolean autoStart;
    private Integer version;
    /** 课时消耗版本号：每次下课收尾 +1，随出勤回调下发，供预约侧丢弃过期报文 */
    private Integer consumptionVersion;
    private LocalDateTime actualStart;
    private LocalDateTime actualEnd;
    private Long tenantId;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}