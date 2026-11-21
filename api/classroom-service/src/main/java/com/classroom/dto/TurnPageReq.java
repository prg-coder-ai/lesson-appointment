package com.classroom.dto;

import lombok.Data;

/**
 * 讲稿翻页请求（F4-05）。前端以 JSON body 传入，与 {@code turnPage(scheduleId, materialId, {page})} 对齐。
 */
@Data
public class TurnPageReq {
    private Integer page;
}
