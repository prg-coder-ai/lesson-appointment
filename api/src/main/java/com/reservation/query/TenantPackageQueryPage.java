package com.reservation.query;

import com.reservation.common.PageQuery;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 套餐（规格）分页查询入参
 * 继承通用分页基类；套餐为规格定义，不按租户筛选
 */
@Data
@EqualsAndHashCode(callSuper = false)
public class TenantPackageQueryPage extends PageQuery {
}
