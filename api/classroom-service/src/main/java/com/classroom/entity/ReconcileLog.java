package com.classroom.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("classroom_reconcile_log")
public class ReconcileLog {
    @TableId(type = IdType.INPUT)
    private String eventId;
    private String eventType;
    private String scheduleId;
    private String result;
    private String skipReason;
    private String failReason;
    private Integer retryCount;
    private LocalDateTime receivedAt;
}