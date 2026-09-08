package com.reservation.audit;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.reservation.entity.AuditLog;
import com.reservation.mapper.AuditLogMapper;
import com.reservation.utils.JwtUtil;
import com.reservation.utils.TenantContext;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.lang.reflect.Field;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 审计日志AOP切面，拦截@Audit注解的方法，自动记录业务操作
 */
@Aspect
@Component
@Slf4j
public class AuditAspect {

    private final AuditLogMapper auditLogMapper;
    private final ObjectMapper objectMapper;
    private final JwtUtil jwtUtil;

    private final ExecutorService auditExecutor = Executors.newFixedThreadPool(2, r -> {
        Thread t = new Thread(r, "audit-log-writer");
        t.setDaemon(true);
        return t;
    });

    public AuditAspect(AuditLogMapper auditLogMapper,
                       ObjectMapper objectMapper, JwtUtil jwtUtil) {
        this.auditLogMapper = auditLogMapper;
        this.objectMapper = objectMapper;
        this.jwtUtil = jwtUtil;
    }

    @Around("@annotation(audit)")
    public Object around(ProceedingJoinPoint joinPoint, Audit audit) throws Throwable {
        long start = System.currentTimeMillis();

        HttpServletRequest request = getRequest();
        AuditLog record = buildBaseLog(request);

        MethodSignature sig = (MethodSignature) joinPoint.getSignature();
        record.setAction(audit.action().name());
        record.setResourceType(audit.resourceType());
        record.setResourceId(resolveParam(audit.resourceId(), joinPoint, sig));
        record.setResourceName(resolveParam(audit.resourceName(), joinPoint, sig));
        record.setMethod(sig.getDeclaringTypeName() + "." + sig.getName());

        if (audit.logParams()) {
            record.setRequestParams(serializeArgs(joinPoint, sig));
        }

        Object result;
        try {
            result = joinPoint.proceed();
            record.setResultStatus("success");
        } catch (Throwable e) {
            record.setResultStatus("fail");
            record.setErrorMsg(truncate(e.getMessage(), 500));
            throw e;
        } finally {
            record.setCostMs((int) (System.currentTimeMillis() - start));
            saveAsync(record);
        }
        return result;
    }

    private AuditLog buildBaseLog(HttpServletRequest request) {
        AuditLog record = new AuditLog();
        record.setLogId(UUID.randomUUID().toString());
        // 原 XML 的 insert 用 NOW() 写入创建时间，改用 BaseMapper.insert 后需在此赋值
        record.setCreatedAt(new Date());
        // 租户维度兜底：注册、公开接口等无登录态场景记为 0（平台/历史数据约定），
        // 必须给默认值，否则 BaseMapper.insert 会显式插入 NULL 触发 NOT NULL 约束报错
        record.setTenantId(resolveTenantId(request));
        if (request != null) {
            record.setRequestUrl(request.getRequestURI());
            record.setHttpMethod(request.getMethod());
            record.setIp(extractIp(request));
            record.setUserAgent(request.getHeader("User-Agent"));
            String token = extractToken(request);
            if (token != null) {
                try {
                    record.setUserId(jwtUtil.getUserIdFromToken(token));
                    record.setUserRole(jwtUtil.getRoleFromToken(token));
                } catch (Exception ignored) { }
            }
        }
        return record;
    }

    /**
     * 解析租户ID：优先取 Token，其次取租户上下文，都没有则归为 0。
     * 必须在主线程调用（saveAsync 在异步线程，ThreadLocal 取不到）
     */
    private Long resolveTenantId(HttpServletRequest request) {
        if (request != null) {
            String token = extractToken(request);
            if (token != null) {
                try {
                    Long tenantId = jwtUtil.getTenantId(token);
                    if (tenantId != null) {
                        return tenantId;
                    }
                } catch (Exception ignored) { }
            }
        }
        Long contextTenantId = TenantContext.getTenantId();
        return contextTenantId == null ? 0L : contextTenantId;
    }

    private void saveAsync(AuditLog record) {
        auditExecutor.submit(() -> {
            try {
                auditLogMapper.insert(record);
            } catch (Exception e) {
                log.error("审计日志保存失败: {}", e.getMessage());
            }
        });
    }

    // --- 工具方法 ---

    private HttpServletRequest getRequest() {
        ServletRequestAttributes attrs =
            (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        return attrs != null ? attrs.getRequest() : null;
    }

    private String extractToken(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            return header.substring(7);
        }
        return null;
    }

    private String extractIp(HttpServletRequest request) {
        String ip = request.getHeader("X-Forwarded-For");
        if (ip == null || ip.isEmpty()) {
            ip = request.getHeader("X-Real-IP");
        }
        if (ip == null || ip.isEmpty()) {
            ip = request.getRemoteAddr();
        }
        return ip;
    }

    private String serializeArgs(ProceedingJoinPoint joinPoint, MethodSignature sig) {
        try {
            String[] paramNames = sig.getParameterNames();
            Object[] args = joinPoint.getArgs();
            Map<String, Object> paramMap = new HashMap<>();
            for (int i = 0; i < args.length; i++) {
                if (paramNames != null && i < paramNames.length) {
                    paramMap.put(paramNames[i], maskSensitive(args[i]));
                }
            }
            return truncate(objectMapper.writeValueAsString(paramMap), 2000);
        } catch (Exception e) {
            return null;
        }
    }

    /** 脱敏：屏蔽密码、Token等敏感字段值 */
    private Object maskSensitive(Object obj) {
        if (obj == null) return null;
        String json;
        try {
            json = objectMapper.writeValueAsString(obj);
        } catch (Exception e) {
            return obj.toString();
        }
        json = json.replaceAll(
            "(\"(?:password|token|secret|oldPassword|newPassword)\"\\s*:\\s*)\"[^\"]*\"",
            "$1\"***\"");
        return json;
    }

    /** 从方法参数中解析 resourceId/resourceName */
    private String resolveParam(String expr, ProceedingJoinPoint joinPoint, MethodSignature sig) {
        if (expr == null || expr.isEmpty()) return null;
        String[] paramNames = sig.getParameterNames();
        Object[] args = joinPoint.getArgs();

        // 支持 "paramName" 或 "paramName.field" 格式
        int dotIdx = expr.indexOf('.');
        String paramName = dotIdx > 0 ? expr.substring(0, dotIdx) : expr;
        String fieldName = dotIdx > 0 ? expr.substring(dotIdx + 1) : null;

        for (int i = 0; paramNames != null && i < paramNames.length; i++) {
            if (paramNames[i].equals(paramName)) {
                Object value = args[i];
                if (fieldName == null) return String.valueOf(value);
                try {
                    Field f = value.getClass().getDeclaredField(fieldName);
                    f.setAccessible(true);
                    Object fieldVal = f.get(value);
                    return fieldVal != null ? String.valueOf(fieldVal) : null;
                } catch (Exception e) {
                    return null;
                }
            }
        }
        return null;
    }

    private String truncate(String s, int maxLen) {
        if (s == null) return null;
        return s.length() > maxLen ? s.substring(0, maxLen) : s;
    }
}
