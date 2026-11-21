package com.classroom.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("classroom_rollcall")
public class RollCallRecord {
    @TableId(type = IdType.ASSIGN_ID)
    private Long rollcallId;
    private String scheduleId;
    private String targetUserId;
    private String status;
    private LocalDateTime initiatedAt;
    private LocalDateTime answeredAt;
}