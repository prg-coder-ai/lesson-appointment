package com.reservation.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 微信 openid 与系统用户的关联（对应表 {@code wx_userid}）。
 *
 * <p><b>为什么是独立表而不是给 user 加列</b>：早前的方案打算 {@code ALTER TABLE user ADD wx_openid}，
 * 已于 2026-09-20 屏蔽（见 {@code authController} / {@code UserService} 的块注释）。独立表的好处是
 * <b>user 表零改动</b>：加密字段、租户隔离、既有注册链路都不必为此让路。
 *
 * <p><b>租户隔离必须显式跳过</b>：本表虽然有 {@code tenant_id} 列，但它的语义是「冗余，便于按租户统计」，
 * 真正的隔离语义是「一个微信全局只绑定一个账号」（{@code uk_wx_openid} 全局唯一）。
 * 若走全局租户插件，平台管理员视角会被拼上 {@code tenant_id = 当前租户} 而<b>查不到绑定、静默失败</b>。
 * 因此本表已登记进 {@code MyBatisPlusConfig.IGNORE_TABLES}（集中式跳过）。
 *
 * <p>为什么不用 {@code @InterceptorIgnore} 方法级注解：项目里既有用法都是<b>方法级</b>
 * （见 {@code BookingMapper} / {@code CascadeMapper}），覆盖不到 {@code BaseMapper} 自带的
 * {@code insert} / {@code selectById} —— 那才是最常用的几个。集中登记才能一次性生效。
 */
@Data
@TableName("wx_userid")
public class WxUserid implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 微信 openid，全局唯一（uk_wx_openid）。不随租户隔离。 */
    private String wxOpenid;

    /** 关联的系统用户 user.user_id。 */
    private String userId;

    /** 用户所属租户（冗余，便于按租户统计；不用于隔离）。 */
    private Long tenantId;

    /** 关联来源：manual=已有账号绑定 / auto_register=微信直接注册。 */
    private String bindSource;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
