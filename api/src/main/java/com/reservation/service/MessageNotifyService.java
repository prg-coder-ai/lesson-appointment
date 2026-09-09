package com.reservation.service;

import com.reservation.common.RoleConst;
import com.reservation.entity.Booking;
import com.reservation.entity.User;
import com.reservation.mapper.BookingMapper;
import com.reservation.utils.JwtUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import jakarta.annotation.PostConstruct;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 消息中心自动发送（业务钩子调用）。
 *
 * 通过 HTTP 调用 message-service(默认 http://localhost:8090)，发送方身份用与 message-service
 * 共享的 jwt.secret 现签一个令牌（sub=发送者userId, role, tenantId），message-service 校验通过后
 * 据此落库并投递。所有发送均为 best-effort：失败仅记录日志，不影响主业务流程。
 */
@Slf4j
@Service
public class MessageNotifyService {

    @Value("${message.service.base-url:http://localhost:8090}")
    private String baseUrl;

    private final JwtUtil jwtUtil;
    private final UserService userService;
    private final BookingMapper bookingMapper;
    private RestTemplate restTemplate;

    public MessageNotifyService(JwtUtil jwtUtil, UserService userService, BookingMapper bookingMapper) {
        this.jwtUtil = jwtUtil;
        this.userService = userService;
        this.bookingMapper = bookingMapper;
    }

    @PostConstruct
    private void init() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(2000);
        factory.setReadTimeout(3000);
        this.restTemplate = new RestTemplate(factory);
    }

    // ============ 业务钩子入口 ============

    /** 学生预订课程 → 通知教师 + 本租户管理员（发送者=学生） */
    public void notifyBookingCreated(String bookingId) {
        Booking b = bookingMapper.selectByIdIgnoreTenant(bookingId);
        if (b == null || b.getStudentId() == null || b.getTeacherId() == null) return;
        notifyTeacherAndAdmin(b.getStudentId(), b.getTeacherId(), b.getTenantId(),
                "新的课程预约", "您有一笔新的课程预约待处理。", "BOOKING_CREATED");
    }

    /** 学生请假（appointment）→ 通知教师 + 本租户管理员（发送者=学生） */
    public void notifyLeaveCreated(String bookingId) {
        if (bookingId == null) return;
        Booking b = bookingMapper.selectByIdIgnoreTenant(bookingId);
        if (b == null || b.getStudentId() == null || b.getTeacherId() == null) return;
        notifyTeacherAndAdmin(b.getStudentId(), b.getTeacherId(), b.getTenantId(),
                "学生请假申请", "学生提交了请假申请，请及时处理。", "LEAVE_CREATED");
    }

    /** 管理员确认预订/请假 → 通知学生（发送者=当前登录管理员） */
    public void notifyStudentConfirmed(String bookingId, String actionLabel) {
        Booking b = bookingMapper.selectByIdIgnoreTenant(bookingId);
        if (b == null || b.getStudentId() == null) return;
        AuthInfo ai = currentAuthFromRequest();
        if (ai == null) return;
        send(ai.userId, ai.role, ai.tenantId, Collections.singletonList(b.getStudentId()),
                "预约已确认", "您的" + (actionLabel == null ? "预约" : actionLabel) + "已被管理员确认。",
                "MEDIUM", "BOOKING_CONFIRMED");
    }

    /** 平台管理员修改租户套餐配额 → 通知该租户管理员（发送者=当前平台管理员） */
    public void notifyTenantPackageChanged(Long tenantId, String actionLabel) {
        if (tenantId == null) return;
        AuthInfo ai = currentAuthFromRequest();
        if (ai == null) return;
        List<User> admins = userService.resolveMessageRecipients("tenant_admin", null, null, tenantId, null);
        List<String> ids = new ArrayList<>();
        if (admins != null) for (User u : admins) if (u.getUserId() != null) ids.add(u.getUserId());
        if (ids.isEmpty()) return;
        send(ai.userId, ai.role, ai.tenantId, ids,
                "套餐配额已更新", "您的租户套餐配额已被平台管理员" + (actionLabel == null ? "更新" : actionLabel) + "。",
                "MEDIUM", "TENANT_PACKAGE_CHANGED");
    }

    // ============ 内部工具 ============

    /** 学生 → 教师 + 本租户管理员（合并为一条群发） */
    private void notifyTeacherAndAdmin(String studentId, String teacherId, Long tenantId,
                                       String title, String content, String category) {
        List<String> ids = new ArrayList<>();
        ids.add(teacherId);
        List<User> admins = userService.resolveMessageRecipients("tenant_admin", null, null, tenantId, null);
        if (admins != null) for (User u : admins) if (u.getUserId() != null) ids.add(u.getUserId());
        send(studentId, RoleConst.STUDENT, tenantId, ids, title, content, "MEDIUM", category);
    }

    /** 从当前 HTTP 请求头解析发送者身份（供管理员/平台管理员钩子使用） */
    private AuthInfo currentAuthFromRequest() {
        try {
            ServletRequestAttributes attrs = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            if (attrs == null) return null;
            String auth = attrs.getRequest().getHeader("Authorization");
            return parseToken(auth);
        } catch (Exception e) {
            return null;
        }
    }

    private AuthInfo parseToken(String token) {
        if (token == null) return null;
        String t = token.startsWith("Bearer ") ? token.substring(7) : token;
        try {
            if (!jwtUtil.verifyAccessToken(t)) return null;
            return new AuthInfo(jwtUtil.getUserIdFromToken(t), jwtUtil.getRoleFromToken(t), jwtUtil.getTenantId(t));
        } catch (Exception e) {
            return null;
        }
    }

    /** 生成发送者令牌并调用 message-service /send（best-effort） */
    private void send(String senderUserId, String senderRole, Long senderTenantId, List<String> recipientIds,
                      String title, String content, String priority, String categoryCode) {
        if (recipientIds == null || recipientIds.isEmpty() || senderUserId == null) return;
        try {
            String token = jwtUtil.generateToken(senderTenantId, senderUserId, senderRole);
            Map<String, Object> body = new HashMap<>();
            body.put("title", title);
            body.put("content", content == null ? "" : content);
            body.put("priority", priority == null ? "MEDIUM" : priority);
            if (categoryCode != null) body.put("categoryCode", categoryCode);
            body.put("recipientUserIds", recipientIds);
            body.put("broadcast", Boolean.FALSE);
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(token);
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
            restTemplate.postForEntity(baseUrl + "/api/v1/messages/send", entity, Object.class);
            log.info("消息自动发送成功 -> 接收人{}, 场景{}", recipientIds, categoryCode);
        } catch (Exception e) {
            log.warn("消息自动发送失败(已忽略): {} | 接收人={}, 场景={}", e.getMessage(), recipientIds, categoryCode);
        }
    }

    private static class AuthInfo {
        String userId;
        String role;
        Long tenantId;

        AuthInfo(String userId, String role, Long tenantId) {
            this.userId = userId;
            this.role = role;
            this.tenantId = tenantId;
        }
    }
}
