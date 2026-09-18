package com.reservation.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 通知发送流水 —— 幂等键所在。
 *
 * <p>唯一键 {@code uk_dispatch_once (appointment_id, seq, receiver_user_id, dedup_key)}：
 * <ul>
 *   <li><b>自动发送</b> {@code dedupKey = 'AUTO'} —— 同一课次、同一档位、同一收件人只发一次，
 *       第二次插入直接撞唯一键，天然幂等。不要用「先查有没有、没有再插」的写法：
 *       定时任务每分钟扫一次，查后插之间天然有并发窗口，只有 DB 唯一键才拦得住。</li>
 *   <li><b>管理员手动发送</b> {@code dedupKey = 'MANUAL#20260918213000'} —— 每次唯一，
 *       可以反复发，但照常入库以便审计。</li>
 * </ul>
 *
 * <p>幂等粒度是<b>收件人级</b>而非事件级：教师那条推送失败，不该让学生那条也被判为「已发」。
 *
 * <p>一行落库即代表「这条通知的发送权已被本进程抢到」，因此插入成功之后才真正调用推送。
 * 也正因如此，插流水<b>不能</b>和推送放在同一个事务里——推送失败要把该行标成 FAILED 而不是回滚，
 * 否则下一次扫描会重复推送。
 */
@Data
@TableName("notification_dispatch_log")
public class NotificationDispatchLog implements Serializable {

    private static final long serialVersionUID = 1L;

    /** 自动发送：同一课次同档同人仅一次 */
    public static final String DEDUP_AUTO = "AUTO";
    /** 手动发送：dedupKey 前缀，后面接时间戳 */
    public static final String DEDUP_MANUAL_PREFIX = "MANUAL#";

    public static final String TRIGGER_AUTO = "AUTO";
    public static final String TRIGGER_MANUAL = "MANUAL";

    public static final String STATUS_SENT = "SENT";
    public static final String STATUS_FAILED = "FAILED";

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 租户ID（冗余，便于按租户审计） */
    private Long tenantId;

    /** 课次ID appointment.id */
    private Integer appointmentId;

    /** 订单ID（冗余，便于查询） */
    private String bookingId;

    /** 发送时所用规则头ID（审计快照） */
    private Long ruleId;

    /** 本次发送的档位序号 */
    private Integer seq;

    /** 本次发送的档位码（审计快照） */
    private String stage;

    /** 发送时该档的提前量（审计快照，规则之后可能被改） */
    private Integer offsetMinutes;

    /** 应发时刻 = 上课时刻 - offsetMinutes */
    private LocalDateTime expectTime;

    /** 收件人用户ID */
    private String receiverUserId;

    /** 收件人角色（审计快照） */
    private String receiverRole;

    /** 触发方式 AUTO / MANUAL */
    private String triggerType;

    /** 手动发送时的操作管理员ID */
    private String operatorId;

    /** 幂等键：AUTO=自动仅一次；MANUAL#时间戳=手动可重复 */
    private String dedupKey;

    /** 实际发送时刻 */
    private LocalDateTime sentAt;

    /** 发送结果 SENT / FAILED */
    private String status;

    /** 失败原因 */
    private String errorMsg;
}
