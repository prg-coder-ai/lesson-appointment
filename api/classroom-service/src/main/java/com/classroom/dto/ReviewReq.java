package com.classroom.dto;

import lombok.Data;

import java.math.BigDecimal;

/**
 * 作品批阅请求（F4-16）。前端以 JSON body 传入，与 {@code review(scheduleId, submissionId, {comment, score})} 对齐。
 */
@Data
public class ReviewReq {
    private String comment;
    private BigDecimal score;
}
