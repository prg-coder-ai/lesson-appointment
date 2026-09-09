package com.reservation.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.reservation.entity.UserSession;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Mapper
public interface UserSessionMapper extends BaseMapper<UserSession> {

    /**
     * 各租户在线人数（联表 sys_tenant 取机构名）。
     * 平台运营统计必须查全平台，故显式忽略租户拦截器 tenantLine，
     * 避免插件给 sys_user_session / sys_tenant 追加 tenant_id 条件导致统计失真。
     * 返回每行的 Map 含：tenantId(Long)、tenantName(String|null)、onlineCount(Long)。
     */
    @InterceptorIgnore(tenantLine = "true")
    @Select("SELECT us.tenant_id AS tenantId, t.org_name AS tenantName, COUNT(*) AS onlineCount "
            + "FROM sys_user_session us LEFT JOIN sys_tenant t ON us.tenant_id = t.id "
            + "WHERE us.status = 1 AND us.last_active >= #{since} "
            + "GROUP BY us.tenant_id, t.org_name ORDER BY onlineCount DESC, tenantId ASC")
    List<Map<String, Object>> countOnlineByTenantSql(@Param("since") LocalDateTime since);
}
