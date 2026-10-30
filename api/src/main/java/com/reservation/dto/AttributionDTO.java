package com.reservation.dto;

import lombok.Data;

/**
 * 归因上报入参（{@code POST /user/attribution}）。
 *
 * <p>契约（方案 §8.2）：推广链接同时带 {@code ref}（推广码）与 {@code inviter}（推广者 userId），
 * 两端都认。三个字段全部可选，但全为空时后端不计业绩。
 *
 * <pre>
 * { "ref":"Kx7mP9qR", "inviter":"uuid-xxx", "source":"share",
 *   "role":"student", "tenantCode":"Ab3dEf7h" }
 * </pre>
 *
 * <p>{@code role} / {@code tenantCode} 仅作记录用（当前不落库，保留字段便于后续审计扩展）。
 */
@Data
public class AttributionDTO {

    /** 推广码（优先级高于 inviter）。 */
    private String ref;

    /** 推广者 userId（ref 缺失时按默认码定位）。 */
    private String inviter;

    /** 来源：share / landing / qrcode / we / direct。 */
    private String source;

    /** 上报时用户的角色（记录用）。 */
    private String role;

    /** 上报时用户的租户编码（记录用）。 */
    private String tenantCode;
}
