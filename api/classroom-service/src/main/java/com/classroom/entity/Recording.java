package com.classroom.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("classroom_recording")
public class Recording {
    @TableId(type = IdType.ASSIGN_ID)
    private Long recordingId;
    private String scheduleId;
    private LocalDateTime startTime;
    private LocalDateTime endTime;
    private String ossKey;
    private String status;
    /** 录制模式：video=人像录制 / screen=教学区域录制（2026-11-17 P2） */
    private String recordMode;
    private Integer retentionDays;
    private LocalDateTime expireAt;
    private LocalDateTime createdAt;

    /** 签名回放地址（不入库）：READY 状态才有值，2h 有效 */
    @TableField(exist = false)
    private String url;
}