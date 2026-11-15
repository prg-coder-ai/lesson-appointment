package com.classroom.service;

import com.classroom.common.RoleConst;
import com.classroom.entity.Classroom;
import com.classroom.mapper.ClassroomMapper;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 课堂发布门禁（2026-11-14）：课堂不在「进行中」时，不允许课堂页面对外发布内容。
 *
 * <p><b>口径（与需求逐条对应）</b>
 * <table border="1">
 *   <tr><th>状态</th><th>学生</th><th>教师/管理员</th></tr>
 *   <tr><td>LIVE</td><td>可发布</td><td>可发布</td></tr>
 *   <tr><td>PAUSED</td><td>禁</td><td><b>禁</b>（补充要求：暂停期间教师端也不发送）</td></tr>
 *   <tr><td>SCHEDULED / READY / CLOSED / CANCELLED</td><td>禁</td><td>可发布</td></tr>
 * </table>
 *
 * <p><b>控制类消息例外</b>：开课/暂停/恢复/下课、全员禁言、举手批准、白板授权与保存、
 * 移出成员、点名等属于「课堂控制」而非课堂内容信息，且只认教师/管理员/system 身份。
 * 若连它们一起拦，教师暂停后将无法点「进行中」恢复课堂 —— 这是本门禁最关键的例外。
 *
 * <p><b>状态缓存</b>：WS 是高频通道，不能每条消息查一次库。按 scheduleId 缓存 1.5s，
 * 状态流转（{@code ClassroomService.transitionStatus}）会主动 {@link #invalidate}；
 * 调度器自动流转则靠短 TTL 兜底。查库失败一律按「非 LIVE」处理（fail-closed）。
 *
 * <p>本判定是<b>服务端权威</b>：前端禁用控件只负责体验，绕过前端直发 WS 也会在这里被丢弃。
 */
@Component
public class ClassroomPublishGuard {

    private static final long TTL_MS = 1500L;

    /** 课堂控制类消息：暂停/未开课时仍须放行，但仅教师、管理员、system 可发 */
    private static final Set<String> CONTROL_TYPES = Set.of(
            "class-start", "class-end", "class-pause", "class-resume", "class:state",
            "mute-all", "hand:approve", "wb:grant", "wb:save", "member-kicked",
            "rollcall:start", "rollcall:stop"
    );

    private final ClassroomMapper classroomMapper;
    private final Map<String, Cached> cache = new ConcurrentHashMap<>();

    public ClassroomPublishGuard(ClassroomMapper classroomMapper) {
        this.classroomMapper = classroomMapper;
    }

    /** 当前课堂状态；课堂不存在或查询异常返回 null（按非 LIVE 处理） */
    public String statusOf(String scheduleId) {
        if (scheduleId == null || scheduleId.isEmpty()) return null;
        long now = System.currentTimeMillis();
        Cached c = cache.get(scheduleId);
        if (c != null && c.expiresAt > now) return c.status;
        String status = null;
        try {
            Classroom room = classroomMapper.selectById(scheduleId);
            if (room != null) status = room.getStatus();
        } catch (Exception e) {
            status = null; // fail-closed：主库抖动时不给学生开内容发布口子
        }
        cache.put(scheduleId, new Cached(status, now + TTL_MS));
        return status;
    }

    /** 状态流转后立刻失效，避免缓存窗口内仍按旧状态放行 */
    public void invalidate(String scheduleId) {
        if (scheduleId != null) cache.remove(scheduleId);
    }

    /**
     * 是否允许该 WS 消息对外发布。
     *
     * @param type 消息 type / 白板 op；控制类消息按 CONTROL_TYPES 例外处理
     */
    public boolean allows(String scheduleId, String role, String type) {
        String t = (type == null) ? "" : type;
        boolean staff = isStaff(role);
        if (CONTROL_TYPES.contains(t)) return staff;
        String status = statusOf(scheduleId);
        if ("PAUSED".equals(status)) return false;      // 暂停：师生都不发
        if ("LIVE".equals(status)) return true;         // 进行中：全员可发
        return staff;                                   // 其余状态：仅教师/管理员可发
    }

    public boolean isStaff(String role) {
        return RoleConst.isTeacher(role) || RoleConst.isManager(role) || RoleConst.SYSTEM.equals(role);
    }

    private static final class Cached {
        final String status;
        final long expiresAt;

        Cached(String status, long expiresAt) {
            this.status = status;
            this.expiresAt = expiresAt;
        }
    }
}
