package com.reservation.controller;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.reservation.common.Result;
import com.reservation.entity.Appointment;
import com.reservation.entity.Booking;
import com.reservation.entity.Course;
import com.reservation.entity.CourseSchedule;
import com.reservation.entity.Tenant;
import com.reservation.entity.TenantPackage;
import com.reservation.entity.User;
import com.reservation.entity.UserSession;
import com.reservation.mapper.AppointmentMapper;
import com.reservation.mapper.BookingMapper;
import com.reservation.mapper.CourseMapper;
import com.reservation.mapper.CourseScheduleMapper;
import com.reservation.mapper.CourseTemplateMapper;
import com.reservation.mapper.RefreshTokenMapper;
import com.reservation.mapper.TenantMapper;
import com.reservation.mapper.TenantPackageMapper;
import com.reservation.mapper.UserMapper;
import com.reservation.mapper.UserSessionMapper;
import com.reservation.utils.PermissionCheck;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * 平台管理端「数据维护」页的**回收站物理清理**接口（2026-10-24）。
 *
 * <h3>与 {@link DataMaintainController} 的分工</h3>
 * <p>那个类管的是**租户内业务数据**（模板/课程/排期/预订/课次），入口角色是
 * {@code PLATFORM_OR_TENANT_ADMIN}；本类管的是**平台级对象**（租户 / 用户），
 * 入口角色必须是 {@code PLATFORM_ONLY}——租户管理员无权物理删除另一个租户，
 * 也无权物理删除别家账号。两类清理绝不能共用一个鉴权口径，故独立成类。
 *
 * <h3>「回收站」在本项目里到底是什么</h3>
 * <ul>
 *   <li><b>租户</b>：软删标记是 {@code sys_tenant.deleted = 1}（见 {@code TenantService.deleteById}），
 *       所以回收站 = {@code deleted=1} 的行。</li>
 *   <li><b>用户</b>：软删标记是 {@code user.status = 'frozen'}（与「教师管理-禁用」同一个状态），
 *       所以回收站 = {@code status='frozen'} 的行。</li>
 *   <li><b>租户套餐</b>：{@code sys_tenant_package} <b>没有状态列</b>，
 *       它的删除本来就是物理的（{@code TenantPackageService.deletePackage} 直接 deleteById），
 *       因此**没有回收站**。这是表结构决定的事实，不是漏做——前端的清空按钮在套餐 Tab 上
 *       置灰并说明原因，而不是假装能清空。</li>
 * </ul>
 *
 * <h3>两条不可让的边界</h3>
 * <ol>
 *   <li><b>保留字租户永不清空</b>：{@code platform} / {@code default} 是系统自用的展示行
 *       （{@code fillOrgName} 依赖它回显机构名），误删会让平台账号的「所属公司」集体变空。</li>
 *   <li><b>调用者自己永不被清空</b>：按 {@code user_id} 排除当前 token 的持有人。
 *       否则平台管理员在回收站里「全清」时顺手把自己物理删掉，且不可恢复。</li>
 * </ol>
 *
 * <h3>为什么租户清理能按 tenant_id 批量删而不逐条走 CascadeRules</h3>
 * <p>{@link com.reservation.common.CascadeRules} 的场景是按**父键**（courseId / bookingId）
 * 展开的，用于「删一门课」这类单点操作。本方法的语义是「整个租户一起消失」，
 * 按 {@code tenant_id} 在**依赖顺序**上批量删（课次 → 预订 → 排期 → 课程 → 模板 →
 * 账号/会话/套餐 → 租户行）已经覆盖了全部下游，不存在"删了父留了子"的窗口。
 * 逐条走级联只会把一次 DELETE 放大成 N 次往返，且中途失败的回滚成本更高。
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/data-maintain/platform")
public class PlatformDataMaintainController {

    /** 保留字租户编码：系统自用，永不被回收站清理（与 {@code TenantCodeGenerator.isReserved} 同口径）。 */
    private static final List<String> RESERVED_TENANT_CODES = Collections.unmodifiableList(
            Arrays.asList("platform", "default"));

    /** 用户「已软删」的状态值（与教师管理里的「禁用」同值，见 {@code UserService.updateStatus}）。 */
    private static final String USER_DEAD_STATUS = "frozen";

    /** 租户「已软删」的标记值。 */
    private static final int TENANT_DELETED = 1;

    @Autowired
    private TenantMapper tenantMapper;
    @Autowired
    private TenantPackageMapper tenantPackageMapper;
    @Autowired
    private UserMapper userMapper;
    @Autowired
    private UserSessionMapper userSessionMapper;
    @Autowired
    private RefreshTokenMapper refreshTokenMapper;
    @Autowired
    private CourseMapper courseMapper;
    @Autowired
    private CourseTemplateMapper courseTemplateMapper;
    @Autowired
    private CourseScheduleMapper courseScheduleMapper;
    @Autowired
    private BookingMapper bookingMapper;
    @Autowired
    private AppointmentMapper appointmentMapper;
    @Autowired
    private PermissionCheck permissionCheck;

    /**
     * 清空「租户回收站」：物理删除所有 {@code deleted=1} 的租户及其名下数据。
     *
     * <p>删除顺序即依赖顺序，见类注释。返回的是**总影响行数**（含级联删掉的下游行），
     * 这样前端能告诉用户"清掉了多少行"，而不是含糊的"成功"。
     *
     * @return 受影响总行数
     */
    @PostMapping("/purge/tenant")
    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public Result<Integer> purgeTenant(@RequestHeader("Authorization") String token,
                                       @RequestParam(value = "tenantId", required = false) Long tenantId) {
        // 声明式（AuthzRules PLATFORM_ONLY）+ 方法级双闸：物理删除必须两道都过
        permissionCheck.checkPlatformAdmin(token);

        QueryWrapper<Tenant> wrapper = new QueryWrapper<Tenant>()
                .eq("deleted", TENANT_DELETED)
                .notIn("tenant_code", RESERVED_TENANT_CODES);
        // 传了 tenantId 就是"清这一条"（回收站表格的行内按钮）；
        // 不传就是"清空回收站"。两者共用同一段实现，避免行内清理与批量清理的口径漂移。
        if (tenantId != null) {
            wrapper.eq("id", tenantId);
        }
        List<Tenant> dead = tenantMapper.selectList(wrapper);
        if (dead == null || dead.isEmpty()) {
            return Result.success(0, "回收站为空，无需清理");
        }

        int rows = 0;
        for (Tenant t : dead) {
            Long tid = t.getId();
            if (tid == null) {
                continue;
            }
            // 这里是"整个租户一起消失"，不是"删一门课/一条预订"。CascadeRules 的场景按父键
            // （courseId / bookingId）单点展开，逐条走会把一次 DELETE 放大成 N 次往返；
            // 而下面按 tenant_id 在**依赖顺序**上批删已覆盖全部下游（课次 → 预订 → 排期 →
            // 课程 → 模板 → 凭证 → 会话 → 账号 → 套餐实例 → 租户行），
            // 不存在"删了父留了子"的窗口，故每一处都显式声明"不需要再级联"。
            // cascade: none 课次无外键指向 booking，按 tenant_id 显式删全
            rows += appointmentMapper.delete(new QueryWrapper<Appointment>().eq("tenant_id", tid));
            // cascade: none 其课次已在上一步按 tenant_id 删净
            rows += bookingMapper.delete(new QueryWrapper<Booking>().eq("tenant_id", tid));
            // cascade: none 其预订与课次已在上两步删净
            rows += courseScheduleMapper.delete(new QueryWrapper<CourseSchedule>().eq("tenant_id", tid));
            // cascade: none 其排期链已在上面按 tenant_id 删净
            rows += courseMapper.delete(new QueryWrapper<Course>().eq("tenant_id", tid));
            // cascade: none 模板是链尾，无下游
            rows += courseTemplateMapper.deleteByTenantId(tid);
            // ⑥ 账号（会话与刷新令牌先于账号清，避免"凭证还在但人不在了"的窗口）
            List<User> users = userMapper.selectList(new QueryWrapper<User>().eq("tenant_id", tid));
            if (users != null) {
                for (User u : users) {
                    if (u == null || u.getUserId() == null) {
                        continue;
                    }
                    // cascade: none 刷新令牌是叶子表，按 user_id 直接清
                    rows += refreshTokenMapper.deleteByUserId(u.getUserId());
                }
            }
            // cascade: none 会话是叶子表，按 tenant_id 直接清
            rows += userSessionMapper.delete(new QueryWrapper<UserSession>().eq("tenant_id", tid));
            // cascade: none 账号的业务下游已在上面按依赖顺序删净；审计/消息流水刻意保留
            rows += userMapper.delete(new QueryWrapper<User>().eq("tenant_id", tid));
            // cascade: none 套餐实例是叶子表（被 sys_tenant.package_id 单向引用）
            rows += tenantPackageMapper.delete(new QueryWrapper<TenantPackage>().eq("tenant_id", tid));
            // cascade: none 租户行是最后一步，下游已清空，此时已无任何行指向它
            rows += tenantMapper.deleteById(tid);

            log.info("平台数据维护·清空租户, tenantId={}, tenantCode={}, orgName={}",
                    tid, t.getTenantCode(), t.getOrgName());
        }
        log.info("平台数据维护·清空租户完成, 租户数={}, 影响行数={}", dead.size(), rows);
        return Result.success(rows, "成功清理 " + dead.size() + " 个租户，共 " + rows + " 行");
    }

    /**
     * 清空「用户回收站」：物理删除所有 {@code status='frozen'} 的账号。
     *
     * <p><b>顺手清掉登录凭证</b>：{@code user_refresh_token} 与 {@code sys_user_session}
     * 都按 {@code user_id} 指向账号。只删账号行会让这两张表留下指向不存在用户的凭据，
     * 而 {@code refreshToken} 的校验只看表里有没有这条记录——理论上就存在
     * "账号已物理删除、但 refreshToken 仍能换出新 accessToken" 的窗口。
     * 这在软删（frozen）时不成问题（{@code UserService.login} 会拒），
     * 但物理删除后连"拒绝"的主体都不存在了，必须先删凭证。
     *
     * <p><b>刻意不动 {@code audit_log}</b>：审计记录的价值就在于"人没了记录还在"，
     * 跟着账号一起删等于给后门（谁删的、何时删的都查不到）。它的 {@code user_id}
     * 留作历史引用，不影响任何业务查询。
     *
     * @return 受影响总行数（账号 + 凭证）
     */
    @PostMapping("/purge/user")
    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public Result<Integer> purgeUser(@RequestHeader("Authorization") String token,
                                     @RequestParam(value = "userId", required = false) String userId) {
        permissionCheck.checkPlatformAdmin(token);
        String callerId = permissionCheck.getUserIdFromToken(token);

        QueryWrapper<User> deadWrapper = new QueryWrapper<User>().eq("status", USER_DEAD_STATUS);
        if (callerId != null && !callerId.isBlank()) {
            // 绝不允许把自己清掉：清空回收站是"全量"动作，很容易在测试环境里顺手点掉
            deadWrapper.ne("user_id", callerId);
        }
        // 传了 userId 就是"清这一条"（行内按钮），不传就是"清空回收站"
        if (userId != null && !userId.isBlank()) {
            deadWrapper.eq("user_id", userId);
        }
        List<User> dead = userMapper.selectList(deadWrapper);
        if (dead == null || dead.isEmpty()) {
            return Result.success(0, "回收站为空，无需清理");
        }

        int rows = 0;
        for (User u : dead) {
            if (u == null || u.getUserId() == null) {
                continue;
            }
            // cascade: none 刷新令牌是叶子表；账号被物理删除后，凭据必须先没，否则能换出新 token
            rows += refreshTokenMapper.deleteByUserId(u.getUserId());
            // cascade: none 会话是叶子表，同上
            rows += userSessionMapper.delete(new QueryWrapper<UserSession>().eq("user_id", u.getUserId()));
        }
        // cascade: none 账号的其余下游（审计日志、消息流水）刻意保留：审计链要能追溯"这个人删过什么"，
        // 跟着物理删除等于销毁证据；会话与刷新令牌已在上面显式清理（它们才是"安全面"上的下游）。
        rows += userMapper.delete(deadWrapper);

        log.info("平台数据维护·清空冻结用户完成, 账号数={}, 影响行数={}, 调用者={}",
                dead.size(), rows, callerId);
        return Result.success(rows, "成功清理 " + dead.size() + " 个账号，共 " + rows + " 行");
    }
}
