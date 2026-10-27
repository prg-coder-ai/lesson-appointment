package com.classroom.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("classroom_session_record")
public class SessionRecord {
    @TableId(type = IdType.INPUT)
    private String scheduleId;
    private LocalDateTime startTime;
    private LocalDateTime endTime;
    private Integer actualMinutes;
    private String eventLog;
    private String whiteboardSnapshot;
}