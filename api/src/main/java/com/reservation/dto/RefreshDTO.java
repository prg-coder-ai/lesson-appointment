package com.reservation.dto;
import lombok.Data;
/**
 * 刷新令牌请求体。
 *
 * 【P2 修复 2026-11-04】删除了原 account / role 字段：
 *   后端 authController.refreshToken 注释明确"完全忽略前端传的 account/role"，
 *   role 从 user 表按 userId 实时查（防提权漏洞）。account 可能是手机号/邮箱
 *   （敏感信息），多余传输。前端与小程序端已同步删除这两个字段的发送。
 */
@Data
public class RefreshDTO {
    private String refreshToken;
}