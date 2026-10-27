package com.classroom.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("classroom_submission")
public class Submission {
    @TableId(type = IdType.ASSIGN_ID)
    private Long submissionId;
    private String scheduleId;
    private String userId;
    private String submissionType;
    private String content;
    private String ossKey;
    private Integer durationSec;
    private String status;
    private String teacherComment;
    private BigDecimal score;
    private LocalDateTime createdAt;
}