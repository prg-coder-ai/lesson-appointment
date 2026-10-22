package com.reservation.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.reservation.entity.AuthRateCounter;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDateTime;

/**
 * 登录风控·频率窗口计数表。
 *
 * <p><b>已在 {@code MyBatisPlusConfig.IGNORE_TABLES} 登记</b>：本表无 tenant_id 列，
 * 且调用发生在免登录端点（无租户上下文），不排除会被拼出 {@code tenant_id = ?} 撞 Unknown column。
 *
 * <p>计数读写刻意用两条极简单的 SQL，而不是 {@code count(*)}：
 * 前者命中 {@code uk_dim_window} 唯一键（一行），后者在登录高峰会退化成窗口扫表。
 */
@Mapper
public interface AuthRateCounterMapper extends BaseMapper<AuthRateCounter> {

    /**
     * 原子自增：不存在则插入 1，存在则 +1。
     *
     * <p>用 {@code ON DUPLICATE KEY UPDATE} 而不是「先查再写」：后者在并发下会丢计数
     * （两个请求同时读到 9，都写成 10），而限流恰恰要在并发下才算得准。
     *
     * @return 影响行数（1=新插入，2=命中唯一键并更新），仅用于确认写入成功，不承载计数语义
     */
    @Insert("INSERT INTO auth_rate_counter (dim, dim_key, window_start, cnt, create_time, update_time) "
            + "VALUES (#{dim}, #{dimKey}, #{windowStart}, 1, NOW(), NOW()) "
            + "ON DUPLICATE KEY UPDATE cnt = cnt + 1, update_time = NOW()")
    int incr(@Param("dim") String dim,
             @Param("dimKey") String dimKey,
             @Param("windowStart") LocalDateTime windowStart);

    /**
     * 读当前窗口计数；无记录返回 0（调用方按 0 处理，不要用 null 判空）。
     *
     * <p>刻意在 SQL 里做 {@code IFNULL}：把「没有记录」与「计数为 0」在数据层合并成同一个值，
     * 避免调用方写出两套判空分支。
     */
    @Select("SELECT IFNULL(MAX(cnt), 0) FROM auth_rate_counter "
            + "WHERE dim = #{dim} AND dim_key = #{dimKey} AND window_start = #{windowStart}")
    int countOfWindow(@Param("dim") String dim,
                      @Param("dimKey") String dimKey,
                      @Param("windowStart") LocalDateTime windowStart);

    /**
     * 清理过期窗口。
     *
     * <p>不清也能用（计数天然按窗口分桶，旧窗口不会再被读到），只是白占索引空间；
     * 因此这一步是"运维卫生"而不是"正确性必需"，即使定时任务没接上也不影响限流结果。
     */
    @Delete("DELETE FROM auth_rate_counter WHERE window_start < #{before}")
    int purgeBefore(@Param("before") LocalDateTime before);
}
