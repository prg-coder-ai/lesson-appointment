package com.reservation.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.reservation.entity.WxUserid;
import org.apache.ibatis.annotations.Mapper;

/**
 * 微信 openid 关联表。
 *
 * <p><b>本表已在 {@code MyBatisPlusConfig.IGNORE_TABLES} 中登记</b>，所有方法（含 {@code BaseMapper}
 * 自带的 {@code insert} / {@code selectById}）都不会被拼上 {@code tenant_id} 条件。
 * 不要在本表上依赖租户插件做隔离 —— 隔离语义是「一个微信全局只绑一个账号」，由
 * {@code uk_wx_openid} 保证。详见 {@link WxUserid} 的类注释。
 */
@Mapper
public interface WxUseridMapper extends BaseMapper<WxUserid> {
    // 自带 CRUD 足够；查询统一由 WxUseridService 用 LambdaQueryWrapper 组装。
}
