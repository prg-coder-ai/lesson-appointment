package com.classroom.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

/**
 * 学生作品上传请求。
 *
 * <p>F4-15 补强：补「类型枚举 + 时长范围」校验（此前无任何约束）。</p>
 */
@Data
public class SubmissionReq {

    @NotBlank
    @Pattern(regexp = "AUDIO|TEXT|IMAGE|FILE", message = "submissionType 必须是 AUDIO/TEXT/IMAGE/FILE")
    private String submissionType;

    private String content;

    private String ossKey;

    @Min(0)
    @Max(86400)
    private Integer durationSec;
}