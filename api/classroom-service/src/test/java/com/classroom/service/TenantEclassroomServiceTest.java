package com.classroom.service;

import com.classroom.entity.EclassroomInstance;
import com.classroom.entity.TenantEclassroom;
import com.classroom.mapper.EclassroomInstanceMapper;
import com.classroom.mapper.TenantEclassroomMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * TenantEclassroomService 单元测试。
 *
 * <p>验证课堂开关守卫逻辑：
 * <ul>
 *   <li>平台管理员/无效租户 → false</li>
 *   <li>租户未绑定课堂 → false</li>
 *   <li>租户已绑定且实例正常 → true</li>
 *   <li>租户已绑定但实例停用 → false</li>
 *   <li>缓存命中时不查库</li>
 * </ul>
 */
class TenantEclassroomServiceTest {

    private TenantEclassroomService service;
    private TenantEclassroomMapper tenantEclassroomMapper;
    private EclassroomInstanceMapper eclassroomInstanceMapper;

    @BeforeEach
    void setUp() throws Exception {
        service = new TenantEclassroomService();
        tenantEclassroomMapper = mock(TenantEclassroomMapper.class);
        eclassroomInstanceMapper = mock(EclassroomInstanceMapper.class);

        Field f1 = TenantEclassroomService.class.getDeclaredField("tenantEclassroomMapper");
        f1.setAccessible(true);
        f1.set(service, tenantEclassroomMapper);

        Field f2 = TenantEclassroomService.class.getDeclaredField("eclassroomInstanceMapper");
        f2.setAccessible(true);
        f2.set(service, eclassroomInstanceMapper);
    }

    @Test
    @DisplayName("平台管理员 tenantId=0 返回 false")
    void should_return_false_for_platform_admin() {
        assertFalse(service.hasClassroomEnabled(0L));
        verifyNoInteractions(tenantEclassroomMapper);
    }

    @Test
    @DisplayName("null tenantId 返回 false")
    void should_return_false_for_null_tenant() {
        assertFalse(service.hasClassroomEnabled(null));
        verifyNoInteractions(tenantEclassroomMapper);
    }

    @Test
    @DisplayName("tenantId=-1（无租户上下文）返回 false")
    void should_return_false_for_no_tenant_context() {
        assertFalse(service.hasClassroomEnabled(-1L));
        verifyNoInteractions(tenantEclassroomMapper);
    }

    @Test
    @DisplayName("租户未绑定课堂（无记录）返回 false")
    void should_return_false_when_no_binding() {
        when(tenantEclassroomMapper.selectByTenantId(1001L)).thenReturn(null);
        assertFalse(service.hasClassroomEnabled(1001L));
    }

    @Test
    @DisplayName("租户课堂已禁用（enabled=0）返回 false")
    void should_return_false_when_disabled() {
        TenantEclassroom te = new TenantEclassroom();
        te.setTenantId(1001L);
        te.setEnabled(0);
        when(tenantEclassroomMapper.selectByTenantId(1001L)).thenReturn(te);
        assertFalse(service.hasClassroomEnabled(1001L));
    }

    @Test
    @DisplayName("租户课堂已启用且实例正常 返回 true")
    void should_return_true_when_enabled_and_instance_ok() {
        TenantEclassroom te = new TenantEclassroom();
        te.setTenantId(1001L);
        te.setInstanceId(1L);
        te.setEnabled(1);
        when(tenantEclassroomMapper.selectByTenantId(1001L)).thenReturn(te);

        EclassroomInstance instance = new EclassroomInstance();
        instance.setId(1L);
        instance.setStatus(1);
        instance.setDeleted(0);
        when(eclassroomInstanceMapper.selectByIdNotDeleted(1L)).thenReturn(instance);

        assertTrue(service.hasClassroomEnabled(1001L));
    }

    @Test
    @DisplayName("租户课堂已启用但实例停用 返回 false")
    void should_return_false_when_instance_stopped() {
        TenantEclassroom te = new TenantEclassroom();
        te.setTenantId(1001L);
        te.setInstanceId(1L);
        te.setEnabled(1);
        when(tenantEclassroomMapper.selectByTenantId(1001L)).thenReturn(te);

        EclassroomInstance instance = new EclassroomInstance();
        instance.setId(1L);
        instance.setStatus(0);
        when(eclassroomInstanceMapper.selectByIdNotDeleted(1L)).thenReturn(instance);

        assertFalse(service.hasClassroomEnabled(1001L));
    }

    @Test
    @DisplayName("缓存命中时不查库")
    void should_use_cache_on_second_call() {
        when(tenantEclassroomMapper.selectByTenantId(1001L)).thenReturn(null);

        service.hasClassroomEnabled(1001L);
        service.hasClassroomEnabled(1001L);

        verify(tenantEclassroomMapper, times(1)).selectByTenantId(1001L);
    }

    @Test
    @DisplayName("evictCache 后重新查库")
    void should_query_db_after_evict() {
        when(tenantEclassroomMapper.selectByTenantId(1001L)).thenReturn(null);

        service.hasClassroomEnabled(1001L);
        service.evictCache(1001L);
        service.hasClassroomEnabled(1001L);

        verify(tenantEclassroomMapper, times(2)).selectByTenantId(1001L);
    }
}