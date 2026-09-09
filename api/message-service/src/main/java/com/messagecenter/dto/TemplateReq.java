package com.messagecenter.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/** 消息模板新增/更新 */
@Data
public class TemplateReq {
    private Long templateId;
    @NotBlank(message = "模板编码不能为空")
    private String templateCode;
    @NotBlank(message = "模板名称不能为空")
    private String templateName;
    private String categoryCode;
    /** 标题模板（支持 {name} 占位） */
    private String titleTemplate;
    /** 内容模板（支持 {name} 占位，后端 AES 加密存储） */
    private String contentTemplate;
    private String senderType = "admin";
    private String priority = "MEDIUM";
    private Integer isEnabled = 1;
}
