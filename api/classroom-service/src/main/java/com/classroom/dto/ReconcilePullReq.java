package com.classroom.dto;

import lombok.Data;

/**
 * 对账拉取请求（增量/全量）。
 */
@Data
public class ReconcilePullReq {
    private String scope;
    private LocalDateTime since;
    private Boolean fullSync;
}