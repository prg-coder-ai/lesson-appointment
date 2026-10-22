package com.reservation.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.reservation.entity.AuthChallenge;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;

/**
 * 登录风控·人机挑战票据表（P0 建表，P1 启用出题/校验）。
 *
 * <p><b>已在 {@code MyBatisPlusConfig.IGNORE_TABLES} 登记</b>：无 tenant_id 列，
 * 出题与校验都发生在免登录端点上。
 */
@Mapper
public interface AuthChallengeMapper extends BaseMapper<AuthChallenge> {

    /**
     * 一次性消费：{@code used=0 → 1}，**条件更新 + 返回影响行数**。
     *
     * <p>这是整道闸成立与否的关键一行。并发下两个请求同时校验同一票据时，
     * 只有一条能拿到 {@code 1}，另一条拿到 {@code 0} 即视为校验失败——
     * 与 {@code TenantQuotaService.tryAcquire} 的额度占用同一手法。
     *
     * <p>若写成 {@code UPDATE ... SET used=1 WHERE id=?} 不带 {@code used=0} 条件，
     * 就等于允许多次消费，缺口坐标可被反复试错穷举。
     */
    @Update("UPDATE auth_challenge SET used = 1 WHERE id = #{id} AND used = 0")
    int markUsed(@Param("id") String id);

    /** 记一次失败；达到上限由调用方 {@link #invalidate} 作废。 */
    @Update("UPDATE auth_challenge SET fail_count = fail_count + 1 WHERE id = #{id}")
    int incrFail(@Param("id") String id);

    /** 作废票据（失败超限）：置为已消费，与"用过"共用同一个终态，无需额外状态位。 */
    @Update("UPDATE auth_challenge SET used = 1 WHERE id = #{id}")
    int invalidate(@Param("id") String id);

    /** 清理过期票据（运维卫生，不影响正确性：过期票据在校验时按 expire_at 拦掉）。 */
    @Delete("DELETE FROM auth_challenge WHERE expire_at < #{before}")
    int purgeBefore(@Param("before") LocalDateTime before);
}
