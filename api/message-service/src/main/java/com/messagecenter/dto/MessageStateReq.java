package com.messagecenter.dto;

import lombok.Data;

import java.util.Map;

/** 通用状态操作（已读/未读/收藏/取消收藏）请求体 */
@Data
public class MessageStateReq {
    private Long messageId;
}
