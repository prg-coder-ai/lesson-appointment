package com.reservation.mapper;


import com.reservation.entity.RefreshTokenPO;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import java.time.LocalDateTime;

public interface RefreshTokenMapper {

    // 根据refreshToken查询记录
    @Select("SELECT * FROM user_refresh_token WHERE refresh_token = #{refreshToken}")
    RefreshTokenPO selectByToken(@Param("refreshToken") String refreshToken);

    // 根据用户ID删除所有记录（踢下线）
    @Delete("DELETE FROM user_refresh_token WHERE user_id = #{userId}")
    int deleteByUserId(@Param("userId") String userId);

    // 删除单条旧刷新token（刷新后失效旧凭证）
    @Delete("DELETE FROM user_refresh_token WHERE refresh_token = #{refreshToken}")
    int deleteSingleToken(@Param("refreshToken") String refreshToken);

    // 插入新刷新Token
    @Insert("INSERT INTO user_refresh_token(user_id, refresh_token, expire_time) VALUES(#{userId}, #{refreshToken}, #{expireTime})")
    int insert(RefreshTokenPO po);

    // 清理过期Token（定时任务调用）
    @Delete("DELETE FROM user_refresh_token WHERE expire_time < #{now}")
    int clearExpired(@Param("now") LocalDateTime now);
}