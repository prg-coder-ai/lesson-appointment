package com.classroom.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("classroom_membership")
public class Membership {
    private String scheduleId;
    private String userId;
    private String role;
    private String displayName;
    private LocalDateTime joinTime;
    private LocalDateTime leaveTime;
    private String leaveReason;
    private String onlineState;
    private Boolean kicked;
}