package com.reservation.service;

import com.reservation.mapper.RefreshTokenMapper;
import com.reservation.dto.RefreshTokenPO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;

@Slf4j
@Service
@RequiredArgsConstructor
public class RefreshTokenService {

    private final RefreshTokenMapper refreshTokenMapper;

    /**
     * 保存新刷新Token，删除该用户旧凭证（单设备登录）
     */
    @Transactional(rollbackFor = Exception.class)
    public void saveNewToken(String userId, String refreshToken, LocalDateTime expireTime) {
        // 可选：实现单设备登录，登录时删除该用户全部旧刷新Token
        refreshTokenMapper.deleteByUserId(userId);

        RefreshTokenPO po = new RefreshTokenPO();
        po.setUserId(userId);
        po.setRefreshToken(refreshToken);
        po.setExpireTime(expireTime);
        refreshTokenMapper.insert(po);
    }

    /**
     * 校验刷新Token是否有效（存在+未过期）
     */
    public RefreshTokenPO checkValidToken(String refreshToken) {
        RefreshTokenPO po = refreshTokenMapper.selectByToken(refreshToken);
        if (po == null) return null;
        // 判断是否过期
        if (po.getExpireTime().isBefore(LocalDateTime.now())) {
            // 过期直接删除脏数据
            refreshTokenMapper.deleteSingleToken(refreshToken);
            return null;
        }
        return po;
    }

    /**
     * 刷新成功后删除旧token
     */
    public void removeOldToken(String oldRefreshToken) {
        log.info("删除旧刷新Token开始, token={}", oldRefreshToken);
        refreshTokenMapper.deleteSingleToken(oldRefreshToken);
        log.info("删除旧刷新Token结束, token={}", oldRefreshToken);
    }

    /**
     * 踢出指定用户：删除该用户所有刷新凭证
     */
    @Transactional(rollbackFor = Exception.class)
    public int kickUser(String userId) {
        log.info("踢出用户开始, userId={}", userId);
        int rows = refreshTokenMapper.deleteByUserId(userId);
        log.info("踢出用户结束, userId={}, 删除Token数={}", userId, rows);
        return rows;
    }

    /**
     * 用户主动登出，删除当前刷新凭证
     */
    public void logout(String refreshToken) {
        log.info("用户登出，删除刷新Token开始, token={}", refreshToken);
        refreshTokenMapper.deleteSingleToken(refreshToken);
        log.info("用户登出，删除刷新Token结束, token={}", refreshToken);
    }

    /**
     * 定时清理过期Token
     */
    @Transactional
    public void clearExpiredToken() {
        refreshTokenMapper.clearExpired(LocalDateTime.now());
    }
}