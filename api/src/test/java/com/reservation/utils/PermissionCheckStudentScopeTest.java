package com.reservation.utils;

import com.reservation.common.RoleConst;
import com.reservation.entity.User;
import com.reservation.exception.BusinessException;
import com.reservation.exception.NoPermissionException;
import com.reservation.mapper.UserMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 学生维度归属校验的边界回归（2026-11-19 H-1）。
 *
 * <p>被校验的是三条安全边界，写错的后果都是「越权但不报错」：
 * <ol>
 *   <li>{@code checkStudentSelf}：学生只能碰自己的行；<b>只收学生维度</b>，
 *       教师/管理员必须原样放行（否则会重演 2026-10-10 把学生自助操作收紧致 403 的误伤）；</li>
 *   <li>{@code isStudent}：控制器据此决定是否强制改写查询条件，判错就等于没收窄；</li>
 *   <li>{@code assertSameTenantUser}：管理员代订时的同租户闸门，fail closed 才有意义。</li>
 * </ol>
 */
class PermissionCheckStudentScopeTest {

    private static final String TOKEN = "Bearer x";
    private static final String CALLER = "stu-self";

    private PermissionCheck pc;
    private JwtUtil jwtUtil;
    private UserMapper userMapper;

    @BeforeEach
    void setUp() throws Exception {
        pc = new PermissionCheck();
        jwtUtil = mock(JwtUtil.class);
        userMapper = mock(UserMapper.class);
        inject("jwtUtil", jwtUtil);
        inject("userMapper", userMapper);
    }

    private void inject(String field, Object value) throws Exception {
        Field f = PermissionCheck.class.getDeclaredField(field);
        f.setAccessible(true);
        f.set(pc, value);
    }

    private void givenRole(String role) {
        when(jwtUtil.getRoleFromToken(TOKEN)).thenReturn(role);
        when(jwtUtil.getUserIdFromToken(TOKEN)).thenReturn(CALLER);
    }

    // ---------------- isStudent ----------------

    @Test
    @DisplayName("isStudent 只对学生为真（教师/管理员用于共用端点的分支判断）")
    void isStudentOnlyForStudent() {
        givenRole(RoleConst.STUDENT);
        assertTrue(pc.isStudent(TOKEN));

        givenRole(RoleConst.TEACHER);
        assertFalse(pc.isStudent(TOKEN));

        givenRole(RoleConst.ADMIN);
        assertFalse(pc.isStudent(TOKEN));

        givenRole(RoleConst.PLATFORM_ADMIN);
        assertFalse(pc.isStudent(TOKEN));
    }

    // ---------------- checkStudentSelf ----------------

    @Test
    @DisplayName("学生访问自己的行：放行")
    void studentOwnRowAllowed() {
        givenRole(RoleConst.STUDENT);
        assertDoesNotThrow(() -> pc.checkStudentSelf(TOKEN, CALLER));
    }

    @Test
    @DisplayName("学生访问他人的行：拒绝")
    void studentOtherRowDenied() {
        givenRole(RoleConst.STUDENT);
        assertThrows(NoPermissionException.class, () -> pc.checkStudentSelf(TOKEN, "stu-other"));
    }

    @Test
    @DisplayName("行的 student_id 为空：拒绝（判不了归属时必须按不许处理）")
    void studentNullOwnerDenied() {
        givenRole(RoleConst.STUDENT);
        assertThrows(NoPermissionException.class, () -> pc.checkStudentSelf(TOKEN, null));
        assertThrows(NoPermissionException.class, () -> pc.checkStudentSelf(TOKEN, ""));
    }

    @Test
    @DisplayName("教师/管理员访问他人行：放行（本批只收学生维度，教师维度另行处理）")
    void nonStudentUnaffected() {
        givenRole(RoleConst.TEACHER);
        assertDoesNotThrow(() -> pc.checkStudentSelf(TOKEN, "stu-other"));

        givenRole(RoleConst.ADMIN);
        assertDoesNotThrow(() -> pc.checkStudentSelf(TOKEN, "stu-other"));

        givenRole(RoleConst.PLATFORM_ADMIN);
        assertDoesNotThrow(() -> pc.checkStudentSelf(TOKEN, "stu-other"));
    }

    // ---------------- assertSameTenantUser ----------------

    @Test
    @DisplayName("代订未指定学生：拒绝并提示")
    void sameTenantUserBlankDenied() {
        assertThrows(BusinessException.class, () -> pc.assertSameTenantUser(null, "学生"));
        assertThrows(BusinessException.class, () -> pc.assertSameTenantUser("   ", "学生"));
    }

    @Test
    @DisplayName("目标账号查不到（=不在本租户）：拒绝")
    void sameTenantUserMissingDenied() {
        when(userMapper.selectById(anyString())).thenReturn(null);
        BusinessException e = assertThrows(BusinessException.class,
                () -> pc.assertSameTenantUser("stu-x", "学生"));
        assertTrue(e.getMessage().contains("不属于当前机构"), e.getMessage());
    }

    @Test
    @DisplayName("目标账号存在：放行（同租户由租户插件保证，平台管理员短路查全量）")
    void sameTenantUserFoundAllowed() {
        User u = new User();
        u.setUserId("stu-x");
        when(userMapper.selectById(anyString())).thenReturn(u);
        assertDoesNotThrow(() -> pc.assertSameTenantUser("stu-x", "学生"));
    }
}
