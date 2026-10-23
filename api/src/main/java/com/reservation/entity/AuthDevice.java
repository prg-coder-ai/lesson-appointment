package com.reservation.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 登录风控·设备档案（对应表 {@code auth_device}，2026-10-22 P0 新增，P1 启用评分）。
 *
 * <p><b>这张表解决什么</b>：真机农场的特征是「一台设备上出现很多个不同身份」。
 * 只按 IP 限流抓不住它（分布式 IP 池），只按 openid 限流也抓不住（每个身份都很干净），
 * 唯一能抓住的是 {@code identity_cnt} —— 同一 {@code device_id} 上累计出现过几个不同身份。
 *
 * <p><b>为什么 device_id 只能降权、不能当判定依据</b>：小程序 {@code wx.getStorageSync}
 * 与浏览器 {@code localStorage} 都能被用户清空，改机工具还能伪造整组环境字段。
 * 因此它进入评分（+20 ~ +40）而不是进黑名单。
 *
 * <p><b>为什么必须登记 IGNORE_TABLES</b>：无 {@code tenant_id} 列，登录前无租户上下文。
 */
@Data
@TableName("auth_device")
public class AuthDevice implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 设备标识（端上由服务端 seed + 环境字段派生后上报）。uk_device 唯一。 */
    private String deviceId;

    /** 该设备首次出现的身份（账号 HMAC 或 openid）。 */
    private String firstSubject;

    /**
     * 该设备最近一次登录的身份。
     *
     * <p>它的作用是让 {@code identity_cnt} 有确定语义：只有"这次的身份与上次不同"时 +1。
     * 只看 {@code first_subject} 会漏掉 A→B→A 这种来回切的情况，
     * 而每登录一次就 +1 又会让计数退化成"登录次数"、彻底失去"换身份"的含义。
     */
    private String lastSubject;

    /** 该设备上发生过几次"换身份"—— 真机农场的核心信号（一台设备反复换号登录）。 */
    private Integer identityCnt;

    /** 最近一次来源 IP（审计用，不做相等性强制：NAT/移动网络下同一设备出口 IP 会变）。 */
    private String lastIp;

    /** 环境异常标记：1=模拟器 / root / hook / 调试开启。 */
    private Integer emuFlag;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
