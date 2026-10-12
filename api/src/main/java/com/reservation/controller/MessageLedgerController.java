package com.reservation.controller;

import com.reservation.common.PageResult;
import com.reservation.common.Result;
import com.reservation.service.MessageLedgerService;
import com.reservation.utils.PermissionCheck;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 接收台账接口（管理端「消息中心 → 消息管理 → 接收台账」）。
 *
 * <p>与 {@code /api/v1/messages}（message-service，发送方视角的发送台账）的区别：
 * 这里是**接收方视角** —— 平台方发出的消息，进了本租户哪些用户、谁读谁没读。
 * 因此数据来源必须是主库的 {@code user.tenant_id}（消息库里没有"接收方租户"这一列），
 * 详见 {@link MessageLedgerService} 的类注释。
 *
 * <p>前缀 {@code /api/v1/msg-ledger}（刻意避开 {@code /api/v1/message*} —— 该前缀被授权守卫
 * {@code tools/check-authz-declarative.mjs} 整段视为 message-service(8090) 的端点而跳过检查；
 * 本接口由主系统自己提供，必须纳入声明式授权检查）：
 * <ul>
 *   <li>{@code GET /inbound} —— 平台方消息在本租户的接收台账（分页，含本租户接收/已读人数）；</li>
 *   <li>{@code GET /inbound/{messageId}/recipients} —— 某条消息在本租户的接收人明细（姓名/账号/已读/时间）。</li>
 * </ul>
 *
 * <p>权限：{@code checkAdmin}（平台管理员 + 租户管理员）。租户管理员**只能**看本租户
 * —— 作用域在服务层强制，入参 tenantId 对其无效；平台管理员可传 tenantId 指定租户，
 * 不传则看全平台接收情况。
 */
@RestController
@RequestMapping("/api/v1/msg-ledger")
public class MessageLedgerController {

    @Autowired
    private MessageLedgerService messageLedgerService;

    @Autowired
    private PermissionCheck permissionCheck;

    /**
     * 平台方消息 → 本租户用户的接收台账。
     *
     * @param readState all（默认/null）/ unread（只看"还有本租户用户没读"的消息）/ read
     * @param messageId  传了则只返回这一条（小程序接收台账详情复用本端点取消息头，不另开路由）
     */
    @GetMapping("/inbound")
    public Result<PageResult<Map<String, Object>>> inbound(@RequestParam(defaultValue = "1") int pageNum,
                                                          @RequestParam(defaultValue = "10") int pageSize,
                                                          @RequestParam(required = false) String readState,
                                                          @RequestParam(required = false) Long messageId,
                                                          @RequestParam(required = false) Long tenantId,
                                                          @RequestHeader("Authorization") String token) {
        permissionCheck.checkAdmin(token);
        return messageLedgerService.platformInbound(pageNum, pageSize, readState, messageId, tenantId,
                permissionCheck.isPlatformAdmin(token));
    }

    /** 某条平台方消息在本租户的接收人明细（未读优先） */
    @GetMapping("/inbound/{messageId}/recipients")
    public Result<PageResult<Map<String, Object>>> inboundRecipients(@PathVariable Long messageId,
                                                                    @RequestParam(defaultValue = "1") int pageNum,
                                                                    @RequestParam(defaultValue = "20") int pageSize,
                                                                    @RequestParam(required = false) String readState,
                                                                    @RequestParam(required = false) Long tenantId,
                                                                    @RequestHeader("Authorization") String token) {
        permissionCheck.checkAdmin(token);
        return messageLedgerService.inboundRecipients(messageId, pageNum, pageSize, readState, tenantId,
                permissionCheck.isPlatformAdmin(token));
    }
}
