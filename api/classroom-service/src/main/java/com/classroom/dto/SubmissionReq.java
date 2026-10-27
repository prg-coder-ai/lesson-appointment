package com.classroom.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 学生作品上传请求。
 */
@Data
public class SubmissionReq {

    @NotBlank
    private String submissionType;

    private String content;

    private String ossKey;

    private Integer durationSec;
}