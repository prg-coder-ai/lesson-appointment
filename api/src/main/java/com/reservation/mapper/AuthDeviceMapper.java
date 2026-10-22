package com.reservation.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.reservation.entity.AuthDevice;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/**
 * 登录风控·设备档案表。
 *
 * <p><b>已在 {@code MyBatisPlusConfig.IGNORE_TABLES} 登记</b>：无 tenant_id 列，
 * 且读写发生在免登录端点（无租户上下文）。
 */
@Mapper
public interface AuthDeviceMapper extends BaseMapper<AuthDevice> {

    /** 按设备标识查档案；不存在返回 null（调用方据此判"新设备"）。 */
    @Select("SELECT * FROM auth_device WHERE device_id = #{deviceId} LIMIT 1")
    AuthDevice selectByDeviceId(@Param("deviceId") String deviceId);

    /**
     * 记录一次「该设备上出现了这个身份」。
     *
     * <p>只在身份确实是**首次出现在该设备**时调用（调用方先用 {@link #selectByDeviceId} 比对
     * {@code first_subject}，不一致才 +1），否则正常用户每登一次就 +1，会把
     * {@code identity_cnt} 变成"登录次数"，彻底失去"设备上出现几个身份"的语义。
     *
     * <p>{@code first_subject} 为 NOT NULL DEFAULT ''，故新设备先写空串再由调用方补，
     * 这里不改它——它只在建档那一刻确定，是"这台设备最初属于谁"的历史事实。
     */
    @Update("UPDATE auth_device SET identity_cnt = identity_cnt + 1, last_ip = #{lastIp}, "
            + "update_time = NOW() WHERE device_id = #{deviceId}")
    int incrIdentity(@Param("deviceId") String deviceId, @Param("lastIp") String lastIp);

    /** 更新最近来源 IP 与环境异常标记（每次登录都刷，不累加）。 */
    @Update("UPDATE auth_device SET last_ip = #{lastIp}, emu_flag = #{emuFlag}, update_time = NOW() "
            + "WHERE device_id = #{deviceId}")
    int touch(@Param("deviceId") String deviceId,
              @Param("lastIp") String lastIp,
              @Param("emuFlag") Integer emuFlag);
}
