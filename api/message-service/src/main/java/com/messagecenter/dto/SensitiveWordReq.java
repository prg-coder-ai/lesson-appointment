package com.messagecenter.dto;

import lombok.Data;

/** 敏感词 新建/修改请求。 */
@Data
public class SensitiveWordReq {
    /** 修改时必填 */
    private Long wordId;
    /** 所属分组（新建必填） */
    private Long groupId;
    /** 敏感词原文（新建必填） */
    private String word;
    /** 处理动作：REJECT / MASK；空=继承分组默认 */
    private String action;
}
