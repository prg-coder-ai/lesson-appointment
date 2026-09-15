package com.messagecenter.dto;

import lombok.Data;

/** 敏感词分组 新建/修改请求。 */
@Data
public class SensitiveGroupReq {
    /** 修改时必填 */
    private Long groupId;
    /** 平台管理员可指定目标租户；其余角色忽略（固定为本租户） */
    private Long tenantId;
    /** 分组名称（新建必填） */
    private String groupName;
    /** 默认处理：REJECT / MASK；缺省 REJECT */
    private String defaultAction;
}
