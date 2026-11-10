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
     *
     * <p>仅用于**登录**路径：用户重新登录时删掉所有旧 token，确保同一用户只有一份有效
     * refresh token（单设备登录语义）。
     *
     * <p><b>不要在 refreshToken 轮换路径调用此方法</b> —— 它内部的 {@code deleteByUserId}
     * 会删掉该用户的全部 refresh token，跨设备并发刷新时会把其他设备的 refresh token 一并
     * 删除。轮换请用 {@link #rotateToken}。
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
     * 轮换刷新Token：只删旧 token、存新 token（不影响其他设备）
     *
     * <p>用于 {@code /auth/refreshToken} 轮换路径。与 {@link #saveNewToken} 的区别：
     * 不调用 {@code deleteByUserId}，只删除本次轮换的那一条旧 token，保留同一用户在其他
     * 设备上的 refresh token。
     *
     * <p>【P1 修复 2026-11-04】原轮换路径调 {@code removeOldToken + saveNewToken}，
     * 后者内部的 {@code deleteByUserId} 会把该用户全部 refresh token 删掉。跨设备场景下
     * （PC + 手机同时在线），PC 刷新后手机的 refresh token 立即失效，手机下次 401 被踢回
     * 登录页，用户不知原因。
     */
    @Transactional(rollbackFor = Exception.class)
    public void rotateToken(String oldRefreshToken, String userId, String newRefreshToken, LocalDateTime expireTime) {
        refreshTokenMapper.deleteSingleToken(oldRefreshToken);
        RefreshTokenPO po = new RefreshTokenPO();
        po.setUserId(userId);
        po.setRefreshToken(newRefreshToken);
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