package com.reservation.query;

import com.reservation.common.PageQuery;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 套餐模板分页查询入参
 */
@Data
@EqualsAndHashCode(callSuper = false)
public class PackageTemplateQueryPage extends PageQuery {

    /** 模板名称/编码 模糊匹配 */
    private String keyword;

    /** 状态：1启用 2停用（null=全部） */
    private Integer status;
}
