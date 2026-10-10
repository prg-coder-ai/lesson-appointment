package com.reservation.config;

import com.reservation.common.RoleConst;
import org.springframework.http.HttpMethod;

import java.util.ArrayList;
import java.util.List;

/**
 * 声明式授权规则表 —— 根因 A（授权模型缺失）的单一权威源。
 *
 * <h3>为什么存在</h3>
 * 修复前 {@code SecurityConfig} 的授权策略是 {@code .anyRequest().authenticated()}，
 * 只回答"你有没有登录"，从不回答"你能不能做这件事"；具体权限靠每个 Controller 方法体里
 * 手写 {@code permissionCheck.checkXxx(token)}。全仓 120 处调用、分布不均，遗漏即放行
 * （实测 7 个 Controller 共 40+ 端点零检查，含 {@code /user/updateStatus}、
 * {@code /data-maintain/purge/*}、{@code /logs/*}）。
 *
 * <h3>本类解决什么、不解决什么</h3>
 * <ul>
 *   <li><b>解决</b>：把"某类接口需要什么角色"从方法体里的散落代码，上移为**集中的、可审阅的、
 *       可被工具校验的声明**。新增接口若不声明角色，会被守卫脚本判红（见
 *       {@code tools/check-authz-declarative.mjs}），而不是静默放行。</li>
 *   <li><b>不解决</b>：数据级/所有权级授权（"只能改自己的课次"）。那需要查库比对归属，
 *       SpEL 表达不了，仍由 {@code PermissionCheck} 承担。<b>两层并存，不是替换关系。</b></li>
 * </ul>
 *
 * <h3>关键取舍：分两步切到 denyAll 默认拒绝（已两步走完）</h3>
 * 171 个生效端点里，学生端与教师端共用的读接口（如 {@code /course/booking/page}、
 * {@code /schedule/selectByCourseId/*}）真实存在，但角色归属只能从前端调用链反推；
 * 一旦有一处推断错误，{@code denyAll} 会立刻把它变成线上 403 故障。
 * 因此策略是<b>分两步</b>：
 * <ol>
 *   <li><b>第一批</b>：把已核实的端点全部显式声明（{@link #RULES}），
 *       兜底暂为 {@code authenticated()}。规则表已完整，规则外的路径数量为 0。</li>
 *   <li><b>第二批（2026-10-10 落地）</b>：守卫实测 182 个端点全部声明、无陈旧规则后，
 *       SecurityConfig 兜底已切为 {@code denyAll()}——"漏声明 = 403"真正生效；
 *       构建期仍由 check:authz 守卫先行拦截。</li>
 * </ol>
 * 规则表与兜底的关系由守卫脚本强制：{@link #RULES} 未覆盖的 {@code /api/v1/**} 端点会被判红。
 *
 * <h3>角色语义（与 {@link RoleConst} 一致）</h3>
 * <ul>
 *   <li>{@code platform_admin}：平台管理员，全局唯一，可跨租户。</li>
 *   <li>{@code admin}：租户管理员，只能管理本租户数据（跨租户隔离由 MyBatis-Plus
 *       TenantLineInnerInterceptor 保证，本类只管"能不能进这个接口"）。</li>
 *   <li>{@code teacher} / {@code student}：普通业务角色。</li>
 * </ul>
 *
 * <h3>路径匹配说明</h3>
 * Spring Security 的 {@code requestMatchers(String)} 使用 {@code MvcRequestMatcher}，
 * 支持 {@code {name}} 占位符与 {@code *}/{@code **} 通配。本表的 {@link #path} 一律用
 * {@code /api/v1/...} 完整路径（不含尾斜杠），占位符段写 {@code {id}} 形式。
 * 同时刻意<b>不</b>配置裸路径（无 {@code /api/v1} 前缀）——WebMvcConfig 已统一加前缀，
 * 旧裸路径只在 permitAll 白名单里保留兼容。
 */
public final class AuthzRules {

    private AuthzRules() {
    }

    /** 规则条目：HTTP 方法 + 路径模式 + 允许的角色。 */
    public record Rule(HttpMethod method, String path, String[] roles, String note) {
    }

    // —— 角色组合常量：避免每条规则重复拼数组，语义也更清楚 ——
    public static final String[] PLATFORM_ONLY = {RoleConst.PLATFORM_ADMIN};
    public static final String[] PLATFORM_OR_TENANT_ADMIN = {RoleConst.PLATFORM_ADMIN, RoleConst.ADMIN};
    public static final String[] TEACHER_OR_ADMIN = {RoleConst.TEACHER, RoleConst.ADMIN, RoleConst.PLATFORM_ADMIN};
    public static final String[] ALL_ROLES = {RoleConst.STUDENT, RoleConst.TEACHER, RoleConst.ADMIN, RoleConst.PLATFORM_ADMIN};

    /**
     * 全部授权规则。顺序即匹配优先级，Spring Security 采用"首个命中即生效"。
     *
     * <p>角色来源标注：
     * <ul>
     *   <li>{@code ≡checkXxx} —— 该端点方法体里已有对应 {@code PermissionCheck} 调用，
     *       本规则只是把既有隐式约束<b>上移显式化</b>，不放宽也不收紧。</li>
     *   <li>{@code 新增} —— 原本零检查，本批新增声明，依据是端点业务语义 + 前端真实调用角色。</li>
     * </ul>
     */
    public static final List<Rule> RULES = buildRules();

    private static List<Rule> buildRules() {
        List<Rule> r = new ArrayList<>();

        // ==================== 一、免认证（permitAll）====================
        // 说明：permitAll 不写进本表，集中在 SecurityConfig 的 PUBLIC_RULES 里。
        // 本表只管"已认证用户之间的角色划分"。

        // ==================== 二、平台级（platform_admin）====================
        // 依据：这些端点方法体里已有 checkPlatformAdmin / isPlatformAdmin 调用（≡）。
        r.add(new Rule(HttpMethod.GET, "/api/v1/dashboard/overview", PLATFORM_ONLY, "≡checkPlatformAdmin 运营总览"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/dashboard/tenant/trend", PLATFORM_ONLY, "≡checkPlatformAdmin 租户趋势"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/dashboard/online", PLATFORM_ONLY, "≡checkPlatformAdmin 在线统计"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/dashboard/expire-warning", PLATFORM_ONLY, "≡checkPlatformAdmin 租期预警"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/dashboard/tenant/usage/page", PLATFORM_ONLY, "≡isPlatformAdmin 套餐用量分页"));
        // dashboard/tenant/{tenantId}/usage 是 checkTenantRead：平台管理员可看任意租户，
        // 租户管理员只看本租户 —— 路径层无法表达"按 tenantId 逐个比对"，故按全角色放行，
        // 归属校验仍由 PermissionCheck.checkTenantRead 承担（此处不构成绕过）。
        r.add(new Rule(HttpMethod.GET, "/api/v1/dashboard/tenant/{tenantId}/usage", ALL_ROLES, "≡checkTenantRead（归属在方法体）"));

        r.add(new Rule(HttpMethod.GET, "/api/v1/industry/list", PLATFORM_ONLY, "≡checkPlatformAdmin 行业列表"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/industry/insert", PLATFORM_ONLY, "≡checkPlatformAdmin 新增行业"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/industry/update", PLATFORM_ONLY, "≡checkPlatformAdmin 改行业"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/industry/{id}/status", PLATFORM_ONLY, "≡checkPlatformAdmin 行业启停"));
        r.add(new Rule(HttpMethod.DELETE, "/api/v1/industry/{id}", PLATFORM_ONLY, "≡checkPlatformAdmin 删行业"));

        r.add(new Rule(HttpMethod.GET, "/api/v1/monitor/overview", PLATFORM_ONLY, "≡checkPlatformAdmin"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/monitor/trend", PLATFORM_ONLY, "≡checkPlatformAdmin"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/monitor/hourly", PLATFORM_ONLY, "≡checkPlatformAdmin"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/monitor/api-health", PLATFORM_ONLY, "≡checkPlatformAdmin"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/monitor/sample", PLATFORM_ONLY, "≡checkPlatformAdmin 采样"));

        r.add(new Rule(HttpMethod.POST, "/api/v1/sys/config/update", PLATFORM_ONLY, "≡checkPlatformAdmin 改配置"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/sys/config/{key}/reset", PLATFORM_ONLY, "≡checkPlatformAdmin 重置配置"));

        r.add(new Rule(HttpMethod.GET, "/api/v1/tenant/list", PLATFORM_ONLY, "≡checkPlatformAdmin 租户列表"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/tenant/page", PLATFORM_ONLY, "≡isPlatformAdmin 租户分页"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/tenant/industry", PLATFORM_ONLY, "≡isPlatformAdmin 租户行业（平台可查任意租户）"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/tenant/insert", PLATFORM_ONLY, "≡checkPlatformAdmin 开租户"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/tenant/update", PLATFORM_ONLY, "≡checkPlatformAdmin 改租户"));
        r.add(new Rule(HttpMethod.DELETE, "/api/v1/tenant/{id}", PLATFORM_ONLY, "≡checkPlatformAdmin 删租户"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/tenant/{id}/restore", PLATFORM_ONLY, "≡checkPlatformAdmin 恢复租户"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/tenant/{id}/status", PLATFORM_ONLY, "≡checkPlatformAdmin 租户启停"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/tenant/{id}/renew", PLATFORM_ONLY, "≡checkPlatformAdmin 租期续费"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/tenant/{id}/package", PLATFORM_ONLY, "≡checkPlatformAdmin 配套餐"));
        // GET /api/v1/tenant/{id} 是 checkTenantRead，同上按全角色放行 + 归属在方法体
        r.add(new Rule(HttpMethod.GET, "/api/v1/tenant/{id}", ALL_ROLES, "≡checkTenantRead（归属在方法体）"));

        r.add(new Rule(HttpMethod.POST, "/api/v1/tenant/package/insert", PLATFORM_ONLY, "≡checkPlatformAdmin"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/tenant/package/update", PLATFORM_ONLY, "≡checkPlatformAdmin"));
        r.add(new Rule(HttpMethod.DELETE, "/api/v1/tenant/package/{id}", PLATFORM_ONLY, "≡checkPlatformAdmin"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/tenant/package/create-from-template", PLATFORM_ONLY, "≡checkPlatformAdmin"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/tenant/package/{tenantId}/switch-template", PLATFORM_ONLY, "≡checkPlatformAdmin"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/tenant/package/reconcile/{tenantId}", PLATFORM_ONLY, "≡checkPlatformAdmin 对账"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/tenant/package/reconcile-all", PLATFORM_ONLY, "≡checkPlatformAdmin 全量对账"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/tenant/package/list", PLATFORM_ONLY, "≡checkPlatformAdmin"));

        r.add(new Rule(HttpMethod.POST, "/api/v1/package/template/insert", PLATFORM_ONLY, "≡checkPlatformAdmin"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/package/template/update", PLATFORM_ONLY, "≡checkPlatformAdmin"));
        r.add(new Rule(HttpMethod.DELETE, "/api/v1/package/template/{id}", PLATFORM_ONLY, "≡checkPlatformAdmin"));

        r.add(new Rule(HttpMethod.GET, "/api/v1/term/list", PLATFORM_ONLY, "≡checkPlatformAdmin 全量词表"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/term/update", PLATFORM_ONLY, "≡isPlatformAdmin"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/term/{id}/status", PLATFORM_ONLY, "≡isPlatformAdmin"));
        r.add(new Rule(HttpMethod.DELETE, "/api/v1/term/{id}", PLATFORM_ONLY, "≡isPlatformAdmin"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/term/copy", PLATFORM_ONLY, "≡checkPlatformAdmin 词表复制"));

        r.add(new Rule(HttpMethod.GET, "/api/v1/user/platformPage", PLATFORM_ONLY, "≡isPlatformAdmin 跨租户用户分页"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/user/updateCompany", PLATFORM_ONLY, "≡isPlatformAdmin"));

        // ==================== 三、平台或租户管理员 ====================
        // 依据：方法体已有 checkAdmin（≡）——注意 checkAdmin 本身就同时放行 admin 与
        // platform_admin（见 PermissionCheck#checkAdmin），所以这里是"上移"而非"收紧"。

        r.add(new Rule(HttpMethod.GET, "/api/v1/notify-rule/list", PLATFORM_OR_TENANT_ADMIN, "≡checkAdmin 上课通知规则"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/notify-rule/detail", PLATFORM_OR_TENANT_ADMIN, "≡checkAdmin"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/notify-rule/save", PLATFORM_OR_TENANT_ADMIN, "≡checkAdmin"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/notify-rule/delete", PLATFORM_OR_TENANT_ADMIN, "≡checkAdmin"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/notify-rule/course-options", PLATFORM_OR_TENANT_ADMIN, "≡checkAdmin"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/notify-rule/options", PLATFORM_OR_TENANT_ADMIN, "≡checkAdmin"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/notify-rule/preview", PLATFORM_OR_TENANT_ADMIN, "≡checkAdmin"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/notify-rule/manual-send", PLATFORM_OR_TENANT_ADMIN, "≡checkAdmin"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/notify-rule/dispatch-log", PLATFORM_OR_TENANT_ADMIN, "≡checkAdmin"));

        r.add(new Rule(HttpMethod.GET, "/api/v1/package/template/{id}", PLATFORM_OR_TENANT_ADMIN, "≡checkAdmin"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/package/template/page", PLATFORM_OR_TENANT_ADMIN, "≡checkAdmin"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/package/template/list", PLATFORM_OR_TENANT_ADMIN, "≡checkAdmin"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/package/template/list-enabled", PLATFORM_OR_TENANT_ADMIN, "≡checkAdmin"));

        r.add(new Rule(HttpMethod.GET, "/api/v1/refund-rule/list", PLATFORM_OR_TENANT_ADMIN, "≡checkAdmin 退改规则"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/refund-rule/course-options", PLATFORM_OR_TENANT_ADMIN, "≡checkAdmin"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/refund-rule/save", PLATFORM_OR_TENANT_ADMIN, "≡checkAdmin"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/refund-rule/delete", PLATFORM_OR_TENANT_ADMIN, "≡checkAdmin"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/refund-rule/preview", PLATFORM_OR_TENANT_ADMIN, "≡checkAdmin"));
        // GET /api/v1/refund-rule/hint 原本零检查：它是"按课程+时间算可退金额"的只读提示，
        // 学生端下单前要用来看退改条件，不属于管理面 —— 故对全部已登录角色开放。
        r.add(new Rule(HttpMethod.GET, "/api/v1/refund-rule/hint", ALL_ROLES, "新增：退改提示只读，学生端下单前需用"));

        r.add(new Rule(HttpMethod.GET, "/api/v1/sys/config/list", PLATFORM_OR_TENANT_ADMIN, "≡checkAdmin"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/sys/config/group/{group}", PLATFORM_OR_TENANT_ADMIN, "≡checkAdmin"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/sys/config/{key}", PLATFORM_OR_TENANT_ADMIN, "≡checkAdmin"));

        r.add(new Rule(HttpMethod.GET, "/api/v1/teacher/published/list", PLATFORM_OR_TENANT_ADMIN, "≡checkAdmin 教师发布列表"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/teacher/published/get", PLATFORM_OR_TENANT_ADMIN, "≡checkAdmin"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/teacher/published/update", PLATFORM_OR_TENANT_ADMIN, "≡checkAdmin"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/teacher/published/delete", PLATFORM_OR_TENANT_ADMIN, "≡checkAdmin"));

        r.add(new Rule(HttpMethod.DELETE, "/api/v1/course/template/{id}", PLATFORM_OR_TENANT_ADMIN, "≡checkAdmin 删课程模板"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/term/tenant/list", PLATFORM_OR_TENANT_ADMIN, "≡checkAdmin 本租户词表"));
        // POST /term/insert 同时有 isPlatformAdmin + checkAdmin 分支，两者都放行这两类角色
        r.add(new Rule(HttpMethod.POST, "/api/v1/term/insert", PLATFORM_OR_TENANT_ADMIN, "≡isPlatformAdmin+checkAdmin 新增词条"));

        r.add(new Rule(HttpMethod.POST, "/api/v1/auth/password/reset", PLATFORM_OR_TENANT_ADMIN, "第1批：仅管理员可重置密码"));
        r.add(new Rule(HttpMethod.DELETE, "/api/v1/auth/kick/{userId}", PLATFORM_OR_TENANT_ADMIN, "新增：踢下线属管理动作"));
        // 注：/auth/bind-wechat 与 /auth/wechat-login 当前整体位于 authController 的块注释内
        // （微信登录已于 2026-09-20 屏蔽），故不为其声明规则 —— 屏蔽解除时须同步补回。

        r.add(new Rule(HttpMethod.GET, "/api/v1/user/list", PLATFORM_OR_TENANT_ADMIN, "新增：用户列表（管理面）"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/user/page", PLATFORM_OR_TENANT_ADMIN, "新增：用户分页（管理面）"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/user/student/list", PLATFORM_OR_TENANT_ADMIN, "新增：学生列表（管理面）"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/user/teacher/list", PLATFORM_OR_TENANT_ADMIN, "新增：教师列表（管理面）"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/user/statistical/byMonth", PLATFORM_OR_TENANT_ADMIN, "新增：注册统计（管理面）"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/user/add", PLATFORM_OR_TENANT_ADMIN, "第1批：仅管理员可建号（可建角色由方法体裁定）"));
        // 审批/改状态：pending 用户能登录（第1批实测：登录只拦 frozen/inactive），
        // 本端点原本零检查 —— 自注册 pending 的 admin 可自行改 active 绕过审批（提权链）。
        // 声明式授权在此直接断链。
        r.add(new Rule(HttpMethod.POST, "/api/v1/user/updateStatus", PLATFORM_OR_TENANT_ADMIN, "新增·关键：原零检查，pending 用户可自审通过"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/user/updateInfo", PLATFORM_OR_TENANT_ADMIN, "新增：改他人资料属管理面（改自己资料走 account/* ）"));

        r.add(new Rule(HttpMethod.GET, "/api/v1/audit-logs", PLATFORM_OR_TENANT_ADMIN, "新增：审计日志（管理面）"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/audit-logs/{logId}", PLATFORM_OR_TENANT_ADMIN, "新增：审计日志详情"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/audit-logs/actions", PLATFORM_OR_TENANT_ADMIN, "新增：审计动作枚举（渲染筛选项）"));

        // 物理清理：原零检查，任何登录用户（含学生）都能触发不可逆删除
        r.add(new Rule(HttpMethod.POST, "/api/v1/data-maintain/purge/template", PLATFORM_OR_TENANT_ADMIN, "新增·关键：原零检查，物理删除"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/data-maintain/purge/course", PLATFORM_OR_TENANT_ADMIN, "新增·关键：原零检查，物理删除"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/data-maintain/purge/schedule", PLATFORM_OR_TENANT_ADMIN, "新增·关键：原零检查，物理删除"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/data-maintain/purge/booking", PLATFORM_OR_TENANT_ADMIN, "新增·关键：原零检查，物理删除"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/data-maintain/purge/appointment", PLATFORM_OR_TENANT_ADMIN, "新增·关键：原零检查，物理删除"));

        // 服务器日志读取：含 SQL/路径/异常栈，属敏感运维面
        r.add(new Rule(HttpMethod.GET, "/api/v1/logs/tail", PLATFORM_OR_TENANT_ADMIN, "新增·关键：原零检查，可读服务器日志"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/logs/date", PLATFORM_OR_TENANT_ADMIN, "新增·关键：原零检查，可读归档日志"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/logs/search", PLATFORM_OR_TENANT_ADMIN, "新增·关键：原零检查，可全文搜日志"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/logs/dates", PLATFORM_OR_TENANT_ADMIN, "新增：日志日期枚举"));

        // ==================== 四、教师或管理员 ====================
        // 依据：方法体已有 checkTeacherOrAdmin（≡）。

        r.add(new Rule(HttpMethod.POST, "/api/v1/course/insert", TEACHER_OR_ADMIN, "≡checkTeacherOrAdmin"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/course/update", TEACHER_OR_ADMIN, "≡checkTeacherOrAdmin"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/course/updateStatus", TEACHER_OR_ADMIN, "≡checkTeacherOrAdmin"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/course/updateStatusByLastId/{id}", TEACHER_OR_ADMIN, "≡checkTeacherOrAdmin"));
        r.add(new Rule(HttpMethod.DELETE, "/api/v1/course/deleteById/{id}", TEACHER_OR_ADMIN, "≡checkTeacherOrAdmin"));
        r.add(new Rule(HttpMethod.DELETE, "/api/v1/course/deleteByTemplateId/{id}", TEACHER_OR_ADMIN, "≡checkTeacherOrAdmin"));
        // GET /course/list、/page、/{id} 三端已于 2026-10-10（P1-4）方法级统一：
        //   · /list 原 checkTeacherOrAdmin 会把学生挡成 403（既存缺陷，实测
        //     student token → {"code":403}，而 student-bookingBrowserCards.js 走它）；
        //   · 三端现统一 permissionCheck.checkAnyLogin(token)——对齐作者注释本意
        //     （"教师或管理员、学生均可操作"）与本处 ALL_ROLES 声明。
        r.add(new Rule(HttpMethod.GET, "/api/v1/course/list", ALL_ROLES, "≡checkAnyLogin（2026-10-10 方法级统一）"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/course/page", ALL_ROLES, "≡checkAnyLogin（2026-10-10 方法级统一）"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/course/{courseid}", ALL_ROLES, "≡checkAnyLogin（2026-10-10 方法级统一）"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/course/classform", TEACHER_OR_ADMIN, "新增：班级表单（建课辅助）"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/course/statistical/byMonth", TEACHER_OR_ADMIN, "新增：课程统计（管理面）"));

        r.add(new Rule(HttpMethod.POST, "/api/v1/schedule/create", TEACHER_OR_ADMIN, "≡checkTeacherOrAdmin"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/schedule/update", TEACHER_OR_ADMIN, "≡checkTeacherOrAdmin ×7"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/schedule/incSite", TEACHER_OR_ADMIN, "≡checkTeacherOrAdmin"));
        r.add(new Rule(HttpMethod.DELETE, "/api/v1/schedule/delete/{id}", TEACHER_OR_ADMIN, "≡checkTeacherOrAdmin"));
        r.add(new Rule(HttpMethod.DELETE, "/api/v1/schedule/deleteByCourseId/{courseId}", TEACHER_OR_ADMIN, "≡checkTeacherOrAdmin"));
        // updateStatus 方法体无 check（已被注释掉的 generate 同理），但改排期状态=改课次，
        // 属管理/教师动作
        r.add(new Rule(HttpMethod.POST, "/api/v1/schedule/updateStatus", TEACHER_OR_ADMIN, "新增：改排期状态（课次连带变更）"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/schedule/generate", ALL_ROLES, "新增·关键：批量生成排期，获取排期课次时间，校验被注释"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/schedule/checkConflict", TEACHER_OR_ADMIN, "新增：排期冲突检测"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/schedule/assign-student", TEACHER_OR_ADMIN, "新增·关键：指派学生到排期，校验被注释"));

        r.add(new Rule(HttpMethod.GET, "/api/v1/schedule/detail/{id}", ALL_ROLES, "新增：排期详情（学生选排期时读）"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/schedule/list", ALL_ROLES, "新增：排期列表（学生/教师/管理端共用）"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/schedule/page", ALL_ROLES, "新增：排期分页（三端共用）"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/schedule/selectByCourseId/{courseId}", ALL_ROLES, "新增：按课程查排期（学生约课链路）"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/schedule/listByTeacher", ALL_ROLES, "新增：按教师查排期（学生浏览教师）"));

        r.add(new Rule(HttpMethod.POST, "/api/v1/course/template/insert", TEACHER_OR_ADMIN, "新增：建课程模板"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/course/template/update", TEACHER_OR_ADMIN, "新增：改课程模板"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/course/template/updateStatus", TEACHER_OR_ADMIN, "新增：模板启停"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/course/template/list", ALL_ROLES, "新增：模板列表（学生浏览课程需读）"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/course/template/page", ALL_ROLES, "新增：模板分页（学生浏览课程需读）"));

        r.add(new Rule(HttpMethod.POST, "/api/v1/teacher/published/save", TEACHER_OR_ADMIN, "≡checkTeacherSelfOrAdmin（归属在方法体）"));

        // 教师职业信息：本人可维护自己的，管理员可看全部；归属校验待方法级补（见第3批）
        r.add(new Rule(HttpMethod.POST, "/api/v1/teacher/professional/addTeacherProfessionalInfo", TEACHER_OR_ADMIN, "新增：教师职业信息（教师本人/管理员）"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/teacher/professional/updateTeacherProfessionalInfo", TEACHER_OR_ADMIN, "新增：同上"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/teacher/professional/deleteTeacherProfessionalInfo", TEACHER_OR_ADMIN, "新增：同上"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/teacher/professional/queryTeacherProfessionalInfo", ALL_ROLES, "新增：只读（学生浏览教师资料）"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/teacher/professional/listByPage", ALL_ROLES, "新增：只读（学生浏览教师资料）"));

        // ==================== 五、全部已登录角色 ====================
        // 业务读接口或"改自己的数据"接口：任何登录角色都可用。

        // —— 预订（booking）——
        // create/page/list/waitlist 等是学生约课链路，必须对 student 开放。
        r.add(new Rule(HttpMethod.POST, "/api/v1/course/booking/create", ALL_ROLES, "新增：学生约课/候补入口"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/course/booking/list", ALL_ROLES, "新增：预订列表"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/course/booking/page", ALL_ROLES, "新增：预订分页"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/course/booking/{id}", ALL_ROLES, "新增：预订详情（归属待方法级补）"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/course/booking/waitlist/{scheduleId}", ALL_ROLES, "新增：候补队列（学生看自己排队位次）"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/course/booking/ListByScheduleId/{scheduleId}", ALL_ROLES, "新增：按排期查预订"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/course/booking/countByScheduleId/{scheduleId}", ALL_ROLES, "新增：按排期计数"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/course/booking/statistical/byMonth", PLATFORM_OR_TENANT_ADMIN, "新增：预订统计（管理面）"));
        // 改状态 = 管理员确认/驳回；候补→正式 = 管理员递补。学生自己只走
        // appointment/updateStatusById（课次级请假），不碰这里。
        r.add(new Rule(HttpMethod.POST, "/api/v1/course/booking/updateStatus", PLATFORM_OR_TENANT_ADMIN, "新增·关键：原零检查，确认/驳回预订"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/course/booking/waitlist/promote", PLATFORM_OR_TENANT_ADMIN, "新增·关键：原零检查，候补递补（占名额）"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/course/booking/update/{id}", PLATFORM_OR_TENANT_ADMIN, "新增：改预订（管理面）"));
        r.add(new Rule(HttpMethod.DELETE, "/api/v1/course/booking/delete/{id}", PLATFORM_OR_TENANT_ADMIN, "新增·关键：原零检查，删预订"));
        r.add(new Rule(HttpMethod.DELETE, "/api/v1/course/booking/deleteByScheduleId/{id}", PLATFORM_OR_TENANT_ADMIN, "新增·关键：原零检查，级联删预订"));

        // —— 课次（appointment）——
        r.add(new Rule(HttpMethod.GET, "/api/v1/course/appointment/list", ALL_ROLES, "新增：课次列表（学生看自己的课次）"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/course/appointment/listByPage", ALL_ROLES, "新增：课次分页"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/course/appointment/get/{id}", ALL_ROLES, "新增：课次详情"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/course/appointment/getByBookingId", ALL_ROLES, "新增：按预订查课次（学生看自己的）"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/course/appointment/getByStatus", ALL_ROLES, "新增：按状态查课次"));
        // 学生端"延期/请假"走这里（课次级动作）—— 必须对 student 开放，
        // 归属（只能改自己的课次）由方法体 operatorId 逻辑 + 后续方法级补齐。
        r.add(new Rule(HttpMethod.PUT, "/api/v1/course/appointment/updateStatusById", ALL_ROLES, "新增：课次级请假/取消延期（学生本人链路）"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/course/appointment/statistical/byMonth", PLATFORM_OR_TENANT_ADMIN, "新增：课次统计（管理面）"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/course/appointment/statistical/listByDays", PLATFORM_OR_TENANT_ADMIN, "新增：课次统计（管理面）"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/course/appointment/statistical/listByDaysByPage", ALL_ROLES, "新增：课次统计列表"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/course/appointment/statistical/onDays", PLATFORM_OR_TENANT_ADMIN, "新增：课次统计（管理面）"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/course/appointment/add", TEACHER_OR_ADMIN, "新增：加课次（管理/教师）"));
        r.add(new Rule(HttpMethod.PUT, "/api/v1/course/appointment/update", TEACHER_OR_ADMIN, "新增：改课次（管理/教师）"));
        r.add(new Rule(HttpMethod.PUT, "/api/v1/course/appointment/updateStatusByBookingId", PLATFORM_OR_TENANT_ADMIN, "新增·关键：按预订批量改课次状态（级联影响）"));
        r.add(new Rule(HttpMethod.DELETE, "/api/v1/course/appointment/delete/{id}", PLATFORM_OR_TENANT_ADMIN, "新增·关键：原零检查，删课次"));
        r.add(new Rule(HttpMethod.DELETE, "/api/v1/course/appointment/deleteByBookingId", PLATFORM_OR_TENANT_ADMIN, "新增·关键：原零检查，级联删课次"));

        // —— 租户只读（各角色都要看自己的租户信息）——
        r.add(new Rule(HttpMethod.GET, "/api/v1/tenant/current", ALL_ROLES, "新增：当前租户只读信息"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/tenant/package/tenant/{tenantId}", ALL_ROLES, "新增：租户套餐只读（各角色展示限额）"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/tenant/package/{id}", ALL_ROLES, "新增：套餐详情只读"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/tenant/package/page", ALL_ROLES, "新增：套餐分页只读"));

        // —— 用户只读 / 自身数据 ——
        r.add(new Rule(HttpMethod.GET, "/api/v1/user/name/{userId}", ALL_ROLES, "新增：查用户名（「今日课程」渲染人名用）"));
        r.add(new Rule(HttpMethod.GET, "/api/v1/user/message-recipients", ALL_ROLES, "新增：站内信收件人候选（各角色发消息用）"));
        r.add(new Rule(HttpMethod.POST, "/api/v1/user/account/changePassword", ALL_ROLES, "第1批：本人改密需原密码，管理员代管免原密码"));

        // —— 其他 ——
        r.add(new Rule(HttpMethod.POST, "/api/v1/tz/switch", ALL_ROLES, "新增：时区换算纯计算（各端表单都要用）"));

        return List.copyOf(r);
    }
}
