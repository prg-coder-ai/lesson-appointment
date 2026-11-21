package com.classroom.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.classroom.entity.TenantEclassroom;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * 租户课堂关系 Mapper（跨 schema 只读）。
 *
 * <p>查询主系统 {@code lesson_appointment.sys_tenant_eclassroom} 表，
 * 判断某租户是否已启用课堂。使用 {@code @InterceptorIgnore} 避免多租户插件干扰（若有）。
 */
@Mapper
@InterceptorIgnore(tenantLine = "true")
public interface TenantEclassroomMapper {

    /**
     * 查询租户的课堂绑定记录。
     */
    @Select("SELECT * FROM lesson_appointment.sys_tenant_eclassroom WHERE tenant_id = #{tenantId} LIMIT 1")
    TenantEclassroom selectByTenantId(@Param("tenantId") Long tenantId);

    /**
     * 查询租户是否启用了课堂（enabled=1）。
     * 返回 1=启用，0=未启用或无记录。
     */
    @Select("SELECT COUNT(1) FROM lesson_appointment.sys_tenant_eclassroom WHERE tenant_id = #{tenantId} AND enabled = 1")
    int countEnabled(@Param("tenantId") Long tenantId);
}