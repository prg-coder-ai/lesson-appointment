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
    private Integer retentionDays;
    private LocalDateTime expireAt;
    private LocalDateTime createdAt;

    /** 签名回放地址（不入库）：READY 状态才有值，2h 有效 */
    @TableField(exist = false)
    private String url;
}