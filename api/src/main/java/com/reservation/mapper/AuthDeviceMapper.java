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
     * 记录一次「该设备换了身份」：{@code identity_cnt + 1} 并刷新 {@code last_subject}。
     *
     * <p>只在"本次身份 ≠ {@code last_subject}"时调用。这样：
     * <ul>
     *   <li>同一账号反复登录 → 不计数（正常用户不该被积累风险分）；</li>
     *   <li>A→B→A → 计 2 次（这正是真机农场的形状：一台设备反复换号）。</li>
     * </ul>
     *
     * <p>{@code first_subject} 只在建档那一刻写，是"这台设备最初属于谁"的历史事实，之后不再改。
     */
    @Update("UPDATE auth_device SET identity_cnt = identity_cnt + 1, last_subject = #{subject}, "
            + "last_ip = #{lastIp}, update_time = NOW() WHERE device_id = #{deviceId}")
    int incrIdentity(@Param("deviceId") String deviceId,
                     @Param("subject") String subject,
                     @Param("lastIp") String lastIp);

    /** 同一身份再次登录：只刷新来源 IP 与环境标记，不累加风险。 */
    @Update("UPDATE auth_device SET last_ip = #{lastIp}, emu_flag = #{emuFlag}, update_time = NOW() "
            + "WHERE device_id = #{deviceId}")
    int touch(@Param("deviceId") String deviceId,
              @Param("lastIp") String lastIp,
              @Param("emuFlag") Integer emuFlag);
}
