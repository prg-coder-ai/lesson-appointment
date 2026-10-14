package com.reservation.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.reservation.entity.WxLoginState;
import org.apache.ibatis.annotations.Mapper;

/**
 * 微信 PC 扫码一次性 state 表。
 *
 * <p><b>已在 {@code MyBatisPlusConfig.IGNORE_TABLES} 登记</b>：本表无 tenant_id 列，
 * 所有方法（含 BaseMapper 自带 CRUD）都不会被拼上租户条件。读写统一走
 * {@link com.reservation.service.WxLoginStateService}。
 */
@Mapper
public interface WxLoginStateMapper extends BaseMapper<WxLoginState> {
    // 自带 CRUD 足够；业务语义（过期判定、一次性消费）在 Service 层。
}
