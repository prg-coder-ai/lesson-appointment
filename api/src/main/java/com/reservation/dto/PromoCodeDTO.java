package com.reservation.dto;

import lombok.Data;

/**
 * 生成/获取推广码入参（{@code POST /promo/referral/code}）。
 *
 * <pre>{ "pathType": 1 }                // 路径1：自助建租户码（targetTenantId 留空）
 * { "pathType": 2, "targetTenantId": 3 } // 路径2：指定租户拉新码（必填目标租户）</pre>
 */
@Data
public class PromoCodeDTO {

    /** 1=自助建租户 2=指定租户注册；缺省 1。 */
    private Integer pathType;

    /** 路径2 必填：目标租户 id。 */
    private Long targetTenantId;
}
