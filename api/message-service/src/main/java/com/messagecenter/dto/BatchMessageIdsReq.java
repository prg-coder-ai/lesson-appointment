package com.messagecenter.dto;

import lombok.Data;

import java.util.List;

/** 批量状态操作 / 批量删除 请求体 */
@Data
public class BatchMessageIdsReq {
    private List<Long> messageIds;
}
