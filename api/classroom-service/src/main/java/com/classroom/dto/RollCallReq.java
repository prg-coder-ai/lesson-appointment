package com.classroom.dto;

import lombok.Data;

/**
 * 点名请求。
 */
@Data
public class RollCallReq {
    private String targetUserId;
}