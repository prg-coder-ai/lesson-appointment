package com.messagecenter.dto;

import lombok.Data;

import java.util.Map;

/** 基于模板 + 占位参数 + 接收人发送 */
@Data
public class TemplateSendReq {
    private Long templateId;
    /** 占位参数，如 {name:张三} 将替换标题/内容模板中的 {name} */
    private Map<String, Object> params;
    /** 指定接收用户 */
    private java.util.List<String> recipientUserIds;
    /** 广播 */
    private Boolean broadcast = false;
    private String targetRole;
    private Long targetTenantId;
}
