package com.messagecenter.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import lombok.Data;

import java.util.List;
import java.util.Map;

/**
 * 发送消息请求。
 * sender 来自 JWT（token），不在请求体里。
 *  - 指定用户：recipientUserIds 非空
 *  - 广播(角色/全体)：broadcast=true + 可选 targetRole
 */
@Data
public class SendMessageReq {
    /** 一级来源维度编码（教师/管理员=可选，后端按 sender 角色自动映射；也可显式） */
    private String senderDimCode;
    /** 消息分类编码（业务场景，如 HOMEWORK_NOTICE） */
    private String categoryCode;
    /** 优先级 HIGH/MEDIUM/LOW */
    private String priority = "MEDIUM";
    @NotBlank(message = "消息标题不能为空")
    private String title;
    private String content;
    /** 附加元数据（如跳转地址） */
    private Map<String, Object> payload;
    /** 指定接收用户（单发/群发列表） */
    private List<String> recipientUserIds;
    /** 是否广播（全体/角色投递） */
    private Boolean broadcast = false;
    /** 广播目标角色（teacher/student/admin/all） */
    private String targetRole;
    /** 广播目标租户（默认当前租户；平台管理员可指定） */
    private Long targetTenantId;

    // 校验用
    @NotEmpty(groups = Single.class, message = "接收用户不能为空")
    public List<String> getRecipientUserIds() { return recipientUserIds; }

    public interface Single {}
}
