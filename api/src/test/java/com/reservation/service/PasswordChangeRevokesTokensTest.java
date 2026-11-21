package com.reservation.service;

import com.reservation.common.Result;
import com.reservation.entity.User;
import com.reservation.mapper.UserMapper;
import com.reservation.utils.CryptoUtil;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.lang.reflect.Field;
import java.util.HashMap;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 改密 / 重置密码必须撤销该用户全部 refresh 凭证（2026-11-20 N10 D1）。
 *
 * <p>为什么这条值得单测：refresh token 每次轮换都会重签满 7 天（滑动续期、无绝对上限），
 * 只要旧票还在，密码怎么改都能一直换新票 —— 「重置密码」这个动作会变成纯装饰。
 * 而它又是个「删一行代码也照样编译、照样跑通」的隐性约束，没有断言就必然在某次重构里丢掉。
 *
 * <p>顺带钉住第二个约束：清凭证失败不能把改密本身变成失败（密码已经改成功了）。
 */
class PasswordChangeRevokesTokensTest {

    private UserService svc;
    private UserMapper userMapper;
    private BCryptPasswordEncoder encoder;
    private RefreshTokenService refreshTokenService;

    @BeforeEach
    void setUp() throws Exception {
        svc = new UserService();
        userMapper = mock(UserMapper.class);
        encoder = mock(BCryptPasswordEncoder.class);
        refreshTokenService = mock(RefreshTokenService.class);
        inject("userMapper", userMapper);
        inject("passwordEncoder", encoder);
        inject("refreshTokenService", refreshTokenService);
        // decryptUserFields 会摸 phone/email/name；mock 默认返回 null，正好跳过
        inject("cryptoUtil", mock(CryptoUtil.class));
    }

    private void inject(String name, Object value) throws Exception {
        Field f = UserService.class.getDeclaredField(name);
        f.setAccessible(true);
        f.set(svc, value);
    }

    @Test
    @DisplayName("本人改密：撤销全部 refresh 凭证")
    void changePasswordRevokesTokens() {
        User db = new User();
        db.setUserId("u1");
        db.setPassword("OLD-HASH");
        when(userMapper.selectById("u1")).thenReturn(db);
        when(encoder.matches("old-pwd", "OLD-HASH")).thenReturn(true);
        when(encoder.encode("new-pwd")).thenReturn("NEW-HASH");
        when(userMapper.updatePassword("u1", "NEW-HASH")).thenReturn(1);

        svc.changePassword("u1", "new-pwd", "u1", "student", 1L, "old-pwd");

        verify(userMapper).updatePassword("u1", "NEW-HASH");
        verify(refreshTokenService).kickUser("u1");
    }

    @Test
    @DisplayName("管理员重置密码：撤销全部 refresh 凭证")
    void resetPasswordRevokesTokens() {
        User u = new User();
        u.setUserId("u2");
        when(userMapper.getUserByAccount("acc-u2", 1L)).thenReturn(u);
        when(encoder.encode("12345678")).thenReturn("RESET-HASH");
        when(userMapper.updatePassword("u2", "RESET-HASH")).thenReturn(1);

        Result<HashMap<String, Object>> rs = svc.resetPassword("acc-u2", 1L);

        assertEquals(200, rs.getCode(), rs.getMessage());
        verify(refreshTokenService).kickUser("u2");
    }

    @Test
    @DisplayName("清凭证失败不影响改密成功（密码已落库就不该回滚/报错）")
    void revokeFailureDoesNotBreakPasswordChange() {
        User db = new User();
        db.setUserId("u3");
        db.setPassword("OLD-HASH");
        when(userMapper.selectById("u3")).thenReturn(db);
        when(encoder.matches("old", "OLD-HASH")).thenReturn(true);
        when(encoder.encode("new")).thenReturn("NEW-HASH");
        when(userMapper.updatePassword("u3", "NEW-HASH")).thenReturn(1);
        when(refreshTokenService.kickUser("u3")).thenThrow(new RuntimeException("db down"));

        assertDoesNotThrow(() -> svc.changePassword("u3", "new", "u3", "student", 1L, "old"));
        verify(userMapper).updatePassword("u3", "NEW-HASH");
    }

    @Test
    @DisplayName("原密码错误：不落库、也不清凭证")
    void wrongOldPasswordDoesNotTouchTokens() {
        User db = new User();
        db.setUserId("u4");
        db.setPassword("OLD-HASH");
        when(userMapper.selectById("u4")).thenReturn(db);
        when(encoder.matches("bad", "OLD-HASH")).thenReturn(false);

        Result<?> rs = svc.changePassword("u4", "new", "u4", "student", 1L, "bad");

        assertEquals(400, rs.getCode(), rs.getMessage());
        verify(userMapper, never()).updatePassword(any(), any());
        verify(refreshTokenService, never()).kickUser(any());
    }
}
