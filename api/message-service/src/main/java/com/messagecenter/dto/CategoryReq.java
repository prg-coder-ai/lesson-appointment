package com.messagecenter.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/** 消息分类新增/更新 */
@Data
public class CategoryReq {
    private Long categoryId;
    /** 编码（更新时若空则沿用原值） */
    private String categoryCode;
    @NotBlank(message = "分类名称不能为空")
    private String categoryName;
    /** 层级 1/2；默认自动：有 parentId 则为2，否则为1 */
    private Integer categoryLevel;
    private Long parentId;
    private Integer sort;
}
