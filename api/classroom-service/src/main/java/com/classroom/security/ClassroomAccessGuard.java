package com.classroom.security;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.classroom.common.ClassroomKey;
import com.classroom.common.ErrorCodes;
import com.classroom.common.RoleConst;
import com.classroom.entity.Classroom;
import com.classroom.entity.Membership;
import com.classroom.exception.ClassroomBizException;
import com.classroom.mapper.BookingRosterMapper;
import com.classroom.mapper.ClassroomMapper;
import com.classroom.mapper.MembershipMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * 课堂访问守卫：所有「按 scheduleId 读写课堂数据」的入口都必须先过这里。
 *
 * <p>补的是一个**真实存在过的越权口子**：修复前 {@code GET /classrooms/{sid}/status}、
 * {@code POST /classrooms/{sid}/enter}、{@code GET /recordings/{sid}} 等接口只校验「是不是登录用户」，
 * 不校验「是不是这堂课的人」。任何租户的任何登录用户只要猜到/拿到一个 scheduleId，
 * 就能读课堂信息、并且 {@code enter} 还会给他在 membership 里**新建一行**、替他签到。
 *
 * <p>判定顺序（先便宜后昂贵）：
 * <ol>
 *   <li>课堂不存在 → 40401（不泄露"存在但你没权限"）</li>
 *   <li>平台管理员 / 管理员 → 放行（运营巡课、远程结束要用）</li>
 *   <li>system（服务间调用） → 放行</li>
 *   <li>教师 → 必须是本堂课的 teacherId（或名单里 role=teacher 的那位）</li>
 *   <li>学生 → 在名单里（且未被移出）**或**主库有该排期的有效预约</li>
 * </ol>
 *
 * <p><b>2026-11-13 安全口径调整（用户拍板）</b>：名单是排期 created 事件按当时
 * booking 快照预建的，之后新下的预约不会回补；而 enter 刻意不给名单外的人建行
 * （防越权）。结果「课堂先建 → 学生后预约 → 永远进不去课堂」。现在允许「有有效预约」
 * 成为第二真相源：仍按 {@code (scheduleId, studentId, tenant_id)} 精确匹配、仍排除
 * 候补/取消/删除态，查询失败一律 fail-closed 拒绝，跨租户与被移出校验保持在前。
 * 名单不再是唯一真相源，但「随便一个登录用户猜到 sid 就能进」的口子没有被重新打开。
 *
 * <p><b>租户维度</b>：课堂归属由排期事件下发 tenantId；只在「课堂已带租户且 token 也带租户」
 * 时才比对，避免平台态 token 被误拒。
 */
@Component
public class ClassroomAccessGuard {

    private static final Logger log = LoggerFactory.getLogger(ClassroomAccessGuard.class);

    private final ClassroomMapper classroomMapper;
    private final MembershipMapper membershipMapper;
    private final BookingRosterMapper bookingRosterMapper;

    public ClassroomAccessGuard(ClassroomMapper classroomMapper, MembershipMapper membershipMapper,
                                BookingRosterMapper bookingRosterMapper) {
        this.classroomMapper = classroomMapper;
        this.membershipMapper = membershipMapper;
        this.bookingRosterMapper = bookingRosterMapper;
    }

    /**
     * 取课堂并断言当前用户可访问。
     *
     * @return 课堂实体（调用方可直接复用，避免二次查询）
     */
    public Classroom assertAccess(String scheduleId, String userId, String role) {
        Classroom classroom = classroomMapper.selectById(scheduleId);
        if (classroom == null) {
            throw new ClassroomBizException(ErrorCodes.CLASSROOM_NOT_FOUND, "课堂不存在：" + scheduleId);
        }
        if (RoleConst.SYSTEM.equals(role) || RoleConst.isManager(role)) {
            return classroom;
        }
        if (userId == null || userId.isBlank()) {
            throw new ClassroomBizException(ErrorCodes.NOT_TEACHER, "未识别到用户身份");
        }

        Long classroomTenant = classroom.getTenantId();
        Long currentTenant = AuthContext.currentTenantId();
        if (classroomTenant != null && classroomTenant > 0 && currentTenant != null
                && currentTenant > 0 && !classroomTenant.equals(currentTenant)) {
            log.warn("跨租户访问课堂被拒: scheduleId={}, classroomTenant={}, currentTenant={}, userId={}",
                    scheduleId, classroomTenant, currentTenant, userId);
            throw new ClassroomBizException(ErrorCodes.MEMBER_NOT_IN_CLASSROOM, "无权访问该课堂");
        }

        Membership membership = findMembership(scheduleId, userId);
        if (membership != null && Boolean.TRUE.equals(membership.getKicked())) {
            throw new ClassroomBizException(ErrorCodes.MEMBER_KICKED, "已被移出课堂，不可访问");
        }

        if (RoleConst.isTeacher(role)) {
            boolean isOwner = userId.equals(classroom.getTeacherId());
            boolean isRosterTeacher = membership != null && RoleConst.TEACHER.equals(membership.getRole());
            if (!isOwner && !isRosterTeacher) {
                log.warn("教师访问非本人课堂被拒: scheduleId={}, userId={}, owner={}",
                        scheduleId, userId, classroom.getTeacherId());
                throw new ClassroomBizException(ErrorCodes.NOT_TEACHER, "仅本堂课教师可操作");
            }
            return classroom;
        }

        // 学生（含其他未定义角色）：名单或主库有效预约，二者有一即可
        if (membership == null) {
            if (hasValidBooking(scheduleId, userId)) {
                // 这里只判定、不写库：enter 的 membershipService.join() 会补建名单行，
                // 让「首次进入」自然完成名单收敛；status / materials 等只读端点不受影响。
                log.info("名单外学生按有效预约放行: scheduleId={}, userId={}, role={}", scheduleId, userId, role);
                return classroom;
            }
            log.warn("非名单成员访问课堂被拒: scheduleId={}, userId={}, role={}", scheduleId, userId, role);
            throw new ClassroomBizException(ErrorCodes.MEMBER_NOT_IN_CLASSROOM, "你不在本课堂名单内");
        }
        return classroom;
    }

    /**
     * 名单缺失时按主库真实预约兜底判定（见类注释的 2026-11-13 口径调整）。
     *
     * <p>三个不能省的细节：
     * <ul>
     *   <li>课次级课堂 id 是 {@code "<scheduleId>~N"}，必须还原成裸排期 id 才能匹配 booking；</li>
     *   <li>带租户时把 tenant_id 一起作为条件，避免跨租户预约被拿去放行；</li>
     *   <li>查询异常一律 fail-closed（拒绝），不能因为主库抖动就打开口子。</li>
     * </ul>
     */
    private boolean hasValidBooking(String classroomId, String userId) {
        String scheduleId = ClassroomKey.scheduleIdOf(classroomId);
        Long tenantId = AuthContext.currentTenantId();
        try {
            int count = (tenantId != null && tenantId > 0)
                    ? bookingRosterMapper.countActiveBookingInTenant(scheduleId, userId, tenantId)
                    : bookingRosterMapper.countActiveBookingAnyTenant(scheduleId, userId);
            return count > 0;
        } catch (Exception e) {
            log.warn("按有效预约放行查询失败，回退拒绝: scheduleId={}, userId={}, err={}",
                    scheduleId, userId, e.getMessage());
            return false;
        }
    }

    /**
     * 判断是否在名单内（不抛异常）。用于「进课堂」这种需要区分
     * 「名单外」与「被移出」两种提示的场景。
     */
    public boolean isRosterMember(String scheduleId, String userId) {
        return findMembership(scheduleId, userId) != null;
    }

    private Membership findMembership(String scheduleId, String userId) {
        LambdaQueryWrapper<Membership> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Membership::getScheduleId, scheduleId)
               .eq(Membership::getUserId, userId);
        return membershipMapper.selectOne(wrapper);
    }
}
