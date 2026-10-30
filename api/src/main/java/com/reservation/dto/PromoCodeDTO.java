package com.reservation.dto;

import lombok.Data;

/**
 * 生成/获取推广码入参（{@code POST /promo/referral/code}）。
 *
 * <pre>{ "pathType": 1 }  // 路径1：平台推广码（自助建租户）
 * { "pathType": 2 }  // 路径2：租户推广码（加入推广者所属租户）</pre>
 *
 * <p><b>不含 targetTenantId</b>：租户码的目标租户一律由服务端从令牌派生
 * （推广者自己的租户）。曾经接受客户端传值 → 可给任意租户生成码、
 * 把别人的拉新业绩记在自己头上（2026-10-13 端到端测试抓出，P0）。
 */
@Data
public class PromoCodeDTO {

    /** 1=平台推广码（自助建租户） 2=租户推广码（加入本租户）；缺省 1。 */
    private Integer pathType;
}
