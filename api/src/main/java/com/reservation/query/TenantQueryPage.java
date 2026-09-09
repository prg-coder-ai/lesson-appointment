package com.reservation.query;

import com.reservation.common.PageQuery;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

/**
 * 租户分页查询入参
 */
@Data
@EqualsAndHashCode(callSuper = true)
public class TenantQueryPage extends PageQuery {

    /** 关键字（机构名称 / 租户编码 / 联系人 模糊匹配） */
    private String keyword;

    /** 状态：1正常 2停用 3已退租 */
    private Integer status;

    /** 软删除标记：0正常 1回收站（仅平台管理员可查回收站） */
    private Integer deleted;

    /** 到期时间区间起 */
    private LocalDateTime expireStart;

    /** 到期时间区间止 */
    private LocalDateTime expireEnd;

    /**
     * 内部使用：强制限定为指定租户。
     * 非平台管理员只能查看自己所属租户，由控制器设置该值，避免越权翻看他人租户
     */
    private Long tenantIdFilter;
}
