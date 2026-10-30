package com.reservation.service;
//
import com.reservation.common.*;
import com.reservation.query.UserQueryPage;
 
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;

import com.reservation.entity.Tenant;
import com.reservation.entity.WxUserid;
import com.reservation.entity.User;  
import com.reservation.exception.BusinessException;
import com.reservation.exception.ConflictException;
import com.reservation.exception.ResourceNotFoundException;
import com.reservation.exception.UserNotFoundException;
import com.reservation.mapper.UserMapper;
import com.reservation.mapper.BookingMapper;
import com.reservation.utils.JwtUtil;
import com.reservation.utils.TenantContext;
import com.reservation.utils.ClientIpResolver;
import com.reservation.utils.TenantCodeGenerator;
import lombok.extern.slf4j.Slf4j;
import com.reservation.utils.CryptoUtil;


// 原因可能有以下几种：
// 1. 你的项目中没有 UserMapper 这个类，或者它的包名不是 com.reservation.mapper。
// 请确保 src/main/java/com/reservation/mapper/UserMapper.java 文件存在且包声明正确。
// 2. 你的 IDE 没有识别或者刷新工程。可以尝试重新加载/刷新项目，让 IDE 检测到新创建的文件。
// 3. UserMapper 生成的位置不在源码目录下（如生成在 test 或 build 文件夹等），导致主工程无法识别。
// 4. IDEA/Maven 的编译配置问题，比如未将相关目录标记为 Source Root。
// 5. 代码中包名拼写错误，与实际包名不符。请检查 import 路径、包声明大小写和文件夹结构一致。
// 解决办法：确认 com.reservation.mapper.UserMapper 类文件在项目对应目录下，并且包名、文件名拼写无误，之后点击IDE“Invalidate Caches”或重启。
 
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 用户注册与认证服务，对应设计2.2.1 所有接口的业务逻辑
 */
@Slf4j
@Service
public class UserService {

    @Autowired
    private UserMapper userMapper;
    @Autowired
    private BCryptPasswordEncoder passwordEncoder;
    @Autowired
    private JwtUtil jwtUtil;
    @Autowired
    private CryptoUtil cryptoUtil;

    @Autowired
    private RefreshTokenService refreshTokenService;
    @Autowired
    private TenantService tenantService;
    @Autowired
    private TenantQuotaService tenantQuotaService;
    @Autowired
    private BookingMapper bookingMapper;
    @Autowired
    private UserSessionService userSessionService;

    // 微信 openid 关联（wx_userid 表）。user 表零改动：不再走「ALTER TABLE user 加 wx_openid 列」的老路。
    @Autowired
    private WxUseridService wxUseridService;

    /**
     * 登录失败统一文案（2026-10-22 P0.5）。
     *
     * <p>改造前是两套：账号不存在回 {@code 404 "账号不存在"}、密码错误回 {@code 400 "密码错误"}。
     * 前端 {@code auth.js:181} 确实把 404 遮成了"账号或密码不正确"，但那层遮罩**只骗得过
     * 浏览器里的用户**——攻击者直接 POST 接口看 code 是 404 还是 400，就知道账号存不存在，
     * 零成本枚举。防护写在看得见的地方，等于没写。
     */
    private static final String LOGIN_FAIL_MESSAGE = "账号或密码不正确";

    /**
     * 假校验哈希：账号不存在时也跑一次 bcrypt，抹平时序差。
     *
     * <p>为什么必须做：统一了 code 还不够。若"账号不存在"直接 return（约 1ms），
     * 而"密码错误"要先跑 bcrypt（约 80ms），攻击者用响应耗时就能区分两者，
     * 枚举能力原封不动地保留了下来。这是典型的时序侧信道。
     *
     * <p>为什么在启动时用随机 UUID 现算、而不是硬编码一个常量串：
     * <ul>
     *   <li>硬编码有"恰好等于某个真实密码的哈希"的风险，且无法审计它从哪里来；</li>
     *   <li>随便编一个格式不合法的串更糟：{@code matches()} 对非法 hashCode 会**快速返回 false**，
     *       耗时不到 1ms，等于完全没做时序对齐，还给人"已经防了"的错觉。</li>
     * </ul>
     */
    private String dummyPasswordHash;

    @jakarta.annotation.PostConstruct
    void initDummyPasswordHash() {
        this.dummyPasswordHash = passwordEncoder.encode(UUID.randomUUID().toString());
    }

    // ===================== 字段加密/解密辅助方法 =====================
    // 对 phone/email/name 字段做 AES-GCM 加密并附加 HMAC 搜索索引（复合格式 hmac:ciphertext）
    // 注意：account 已决定不再加密，按明文存储与匹配
    private void encryptUserFields(User user) {
        if (user == null) return;
       // user.setAccount(cryptoUtil.encryptWithIndex(user.getAccount()));
        user.setPhone(cryptoUtil.encryptWithIndex(user.getPhone()));
        user.setEmail(cryptoUtil.encryptWithIndex(user.getEmail()));
        user.setName(cryptoUtil.encryptWithIndex(user.getName()));
    }

    // 解密 phone/email/name 字段（兼容未加密的旧数据；account 不再加密，原样返回）
    private void decryptUserFields(User user) {
        if (user == null) return;
     //   user.setAccount(cryptoUtil.decrypt(user.getAccount()));
        user.setPhone(cryptoUtil.decrypt(user.getPhone()));
        user.setEmail(cryptoUtil.decrypt(user.getEmail()));
        user.setName(cryptoUtil.decrypt(user.getName()));
    }

    private void decryptUserList(List<User> list) {
        if (list == null) return;
        for (User u : list) {
            decryptUserFields(u);
        }
    }

    // 判断是否存在加密字段的模糊查询条件
    private boolean hasFuzzyCondition(UserQueryPage q) {
        return (q.getName() != null && !q.getName().isEmpty())
                //|| (q.getAccount() != null && !q.getAccount().isEmpty())
                || (q.getEmail() != null && !q.getEmail().isEmpty())
                || (q.getPhone() != null && !q.getPhone().isEmpty());
    }

    // 内存模糊匹配（解密后 contains）
    private boolean matchFuzzy(User u, UserQueryPage q) {
        if (q.getName() != null && !q.getName().isEmpty()) {
            if (u.getName() == null || !u.getName().contains(q.getName())) return false;
        }
      //  if (q.getAccount() != null && !q.getAccount().isEmpty()) {
     //       if (u.getAccount() == null || !u.getAccount().contains(q.getAccount())) return false;
     //   }
        if (q.getEmail() != null && !q.getEmail().isEmpty()) {
            if (u.getEmail() == null || !u.getEmail().contains(q.getEmail())) return false;
        }
        if (q.getPhone() != null && !q.getPhone().isEmpty()) {
            if (u.getPhone() == null || !u.getPhone().contains(q.getPhone())) return false;
        }
        return true;
    }

    /**
     * 按租户编码解析有效租户；编码为空、租户不存在、已删除或已停用均返回 null
     */
    private Tenant resolveTenantByCode(String tenantCode) {
        if (tenantCode == null || tenantCode.isBlank()) {
            return null;
        }
        Tenant tenant = tenantService.getByCode(tenantCode.trim());
        if (tenant == null
                || (tenant.getDeleted() != null && tenant.getDeleted() == 1)
                || !Integer.valueOf(1).equals(tenant.getStatus())) {
            return null;
        }
        return tenant;
    }

    /** 保留字租户编码被用于注册时的统一文案（与登录分支 authController 的措辞保持一致）。 */
    private static final String RESERVED_TENANT_CODE_MESSAGE =
            "该租户编码为系统保留，不能用于注册或登录，请使用管理员提供的注册链接";

    /**
     * 保留字租户编码校验（方案 B 收口①，2026-10-24）。
     *
     * <p><b>为什么必须在 resolveTenantByCode 之前拦</b>：{@code sys_tenant} 里**确实存在**
     * {@code tenant_code='platform'} 那一行（平台自身的展示行，{@code fillOrgName} 靠它回显机构名），
     * 所以 {@code resolveTenantByCode("platform")} 是**能成功解析**的。若不在查库之前拦，
     * "保留"就会退化成"查得到但故意不用"，任何绕过该判断的调用点都会立刻恢复那条提权链：
     * {@code role=admin} + {@code tenantCode=platform} → 该"租户"无 admin → 命中
     * {@link #applyRoleAdmission} 的首管理员 bootstrap → 直接 active。
     *
     * <p><b>为什么这两个码安全无害却不能放开</b>：{@code platform} 是全系统唯一**可猜到**的租户码，
     * 其余都是 29^8 量级的随机码。放开它等于给"平台自身"开一个公开可抢的管理员席位；
     * 而首管理员判定只计数 role、不看 status（有意保留的语义，见 applyRoleAdmission 注释），
     * 抢到即永久占位，只能改库或由平台管理员清掉。
     *
     * @return true 表示该编码为系统保留，调用方应直接拒绝注册
     */
    private boolean isReservedTenantCode(String tenantCode) {
        return TenantCodeGenerator.isReserved(tenantCode == null ? null : tenantCode.trim());
    }

    // 学生注册（对应设计2.2.1 学生注册接口）
    // 注册（对应设计2.2.1 注册接口）
    //
    // @param user 用户数据
    // @param approvedByAdmin true = 由已鉴权的管理员在后台创建（/user/add）。
    //        管理员的创建动作本身就是审批，故新账号直接 active，不再走 bootstrap 待审。
    //        false = 匿名自助注册（/user/register），初始状态由 {@link #applyRoleAdmission} 判定。
    @Transactional
    public Result< Object> Register(User user, boolean approvedByAdmin) {
        // 校验手机号/邮箱是否已注册（对应业务异常校验）
         log.debug("UserService Register：" + user);
        // ① 先解析租户归属：优先取租户上下文（已登录的租户内添加用户）；
        //    自助注册、平台代建场景拿不到上下文，按请求中的租户编码解析
        //    注册接口在白名单内没有租户上下文，这里显式设置，
        //    否则租户插件按兜底值拼接条件，账号查重与额度统计都会失效 
        Long regTenantId = TenantContext.getTenantId();
        String regRole = user.getRole() == null ? "student" : user.getRole();
        if (RoleConst.PLATFORM_ADMIN.equals(regRole)) {
            // 方案A：平台管理员租户编码固定为 "platform"，与登录分支 authController 一致解析为 tenantId=0。
            // 注册时显式对齐，避免注册落库的 tenant_id 与登录解析的 tenant_id 不一致导致登录 404。
            // 注意（2026-10-24 按真库校正）：sys_tenant 里**确实存在** tenant_code='platform' 的记录
            // （本机实测 id=11、status=1），它是平台自身的展示行（PlatformService/前端靠它取机构名）。
            // 所以「resolveTenantByCode 会返回 null」这个旧说法是错的 —— 它**能**解析到 tenantId=11。
            // 而 platform_admin 的 tenant_id 语义是 0L（租户插件在 0 时不拼 tenant_id 条件），
            // 若落到 11，平台管理员会被当成"租户 11 的管理员"：既看不到全平台数据，
            // 又会在 quota acquire 时因租户 11 无 sys_tenant_package 直接 403。
            // 因此平台管理员必须走本分支硬置 0L，不能进下面的真实租户解析。
            //
            // ★ 已收口（2026-10-24，方案 B 收口①）：role=admin + tenantCode=platform 的自助注册
            //   现在会在下面的 else 分支入口被 isReservedTenantCode 显式拒绝，
            //   不再依赖"该租户没有 sys_tenant_package → quota acquire 403"这种碰巧的偶然拦截。
            //   设计取舍见 doc-develop/技术方案-保留字platform的租户语义.md
            regTenantId = 0L;
        } else if (regTenantId == null || regTenantId <= 0) {
            // 保留字（platform / default）一律拒绝：这两个码是系统自用，
            // 一旦允许自助注册就会被"猜码 → 抢首管理员 → 永久占位"（详见 isReservedTenantCode 注释）。
            // 必须放在 resolveTenantByCode 之前 —— 那一行是能解析成功的。
            if (isReservedTenantCode(user.getTenantCode())) {
                log.warn("注册被拒(租户编码为系统保留), 编码={}, 角色={}",
                        user.getTenantCode(), user.getRole());
                return Result.fail(403, RESERVED_TENANT_CODE_MESSAGE);
            }
            Tenant tenant = resolveTenantByCode(user.getTenantCode());
            log.debug("UserService Register：" + tenant);
            if (tenant == null) {
                return Result.fail(403, "租户编码无效或已停用，请检查注册链接");
            }
            regTenantId = tenant.getId();
        }
        user.setTenantId(regTenantId);
        log.debug("UserService Register：" + user);
        // ② 注册接口在白名单内没有租户上下文，这里显式设置，
        //    否则租户插件按兜底值拼接条件，账号查重与额度统计都会失效
        TenantContext.setTenantId(regTenantId);
        try {
            // ③ 账号查重（租户内唯一，不同租户的账号互不冲突）
            if (existAccount(user.getAccount(), regTenantId)) {
                return Result.fail(400, "该账号已注册，请登录或重置密码");
            }
            // ④ 角色准入判定：必须在**写库之前**完成，
            //    且判定与写入同处一个事务（外层 @Transactional + mapper 的 FOR UPDATE 锁定读），
            //    否则并发自注册会双双通过"本租户尚无管理员"的判定。
            //    白名单外的角色直接拒绝，不进入落库流程。
            Result<Object> roleGuard = applyRoleAdmission(user, regTenantId, approvedByAdmin);
            if (roleGuard != null) {
                return roleGuard;
            }
            // 密码加密（对应设计2.3 安全设计-密码加密）
            user.setPassword(passwordEncoder.encode(user.getPassword()));
            // 生成唯一userId（对应通用校验规则-ID类参数）
            user.setUserId(UUID.randomUUID().toString().replace("-", ""));
            return doRegister(user, regTenantId);
        } finally {
            TenantContext.clear();
        }
    }

    /**
     * 角色准入判定（P0-1 提权链收口）：决定新用户的 role 与初始 status。
     *
     * <p>规则（两个入口共用，因此判定逻辑只写这一处）：
     * <ul>
     *   <li>白名单：只接受 {@code student} / {@code teacher} / {@code admin} / {@code platform_admin}，
     *       其余值一律 400 拒绝 —— 角色取自请求体，不设白名单等于把提权口直接敞开。</li>
     *   <li>{@code student} / {@code teacher}：一律 {@code pending}，须管理员审批（沿用原语义）。</li>
     *   <li>{@code admin}：**仅当本租户尚无 admin 用户时**置 {@code active}（首管理员 bootstrap）；
     *       否则 {@code pending}。判定按 tenant_id 限定，不是"全局第一个 admin"。</li>
     *   <li>{@code platform_admin}：**仅当全系统尚无 platform_admin 时**置 {@code active}；
     *       否则一律 {@code pending}。平台管理员全局唯一且不可再生。</li>
     * </ul>
     *
     * <p>为什么 tenant_admin 的判定要按 tenant_id：若写成全局判定，租户 B 的攻击者会因为
     * "租户 A 已经有 admin 了"而永远拿不到自己租户的 admin（可用性事故）；
     * 反之若漏了 tenant_id 条件，则会跨租户误判、把别人租户的存在当成自己的。
     *
     * <p><b>并发</b>：判据由 {@code UserMapper.countByTenantAndRoleForUpdate /
     * countByRoleGlobalForUpdate} 的 FOR UPDATE 锁定读提供，与本方法的 INSERT 同处一个事务，
     * 因此"判定为 0 → 激活"不会被并发请求同时成立。
     *
     * <p><b>计数只看 role、不看 status（2026-10-24 明确保留，勿"优化"成只数 active）</b>：
     * 两条判据的 SQL 都没有 status 条件，被冻结/待审的管理员同样算"已有管理员"。这是有意的 ——
     * 若只数 active，一个被禁用的管理员会让"尚无管理员"重新成立，任何拿到租户码的人
     * 都能自助注册把它的位置顶掉，"禁用"就变成了"可抢座"。
     * 代价是某租户/平台的管理员被全部禁用后，自助注册永远只能产出 pending、只剩改库一条救路；
     * 因此配套在写入侧加了 {@link #assertNoAdminSelfLock}：**管理员不得修改自己的状态**，
     * 把"最后一个可用管理员自锁"这条路径封死。两者必须成对存在，删任一半都会留下缺口。
     *
     * @param approvedByAdmin 由已鉴权管理员创建时为 true：跳过 bootstrap，角色合法即 active。
     *        管理员的创建动作本身即审批，若此处也套用"非首账号 pending"，
     *        会让平台后台刚建好的管理员账号当场无法使用（可用性事故）。
     * @return null 表示放行（user 的 role/status 已被就地设置）；非 null 表示拒绝，直接返回给调用方
     */
    private Result<Object> applyRoleAdmission(User user, Long regTenantId, boolean approvedByAdmin) {
        String role = user.getRole() == null || user.getRole().isEmpty() ? RoleConst.STUDENT : user.getRole().trim();

        if (!RoleConst.STUDENT.equals(role) && !RoleConst.TEACHER.equals(role)
                && !RoleConst.ADMIN.equals(role) && !RoleConst.PLATFORM_ADMIN.equals(role)) {
            log.warn("创建用户的角色不在白名单内，已拒绝, role={}, tenantId={}", role, regTenantId);
            return Result.fail(400, "角色不合法，仅支持学生、教师或管理员");
        }
        user.setRole(role);

        // 管理员在后台创建：创建即审批，直接可用
        if (approvedByAdmin) {
            user.setStatus("active");
            return null;
        }

        if (RoleConst.STUDENT.equals(role) || RoleConst.TEACHER.equals(role)) {
            user.setStatus("pending"); // 需要管理员审核
            return null;
        }

        boolean first;
        if (RoleConst.PLATFORM_ADMIN.equals(role)) {
            // 平台管理员：全系统唯一，不可再生
            first = userMapper.countByRoleGlobalForUpdate(RoleConst.PLATFORM_ADMIN) == 0;
        } else {
            // 租户管理员：按 tenant_id 判定本租户是否尚无 admin（regTenantId 必为真实租户 id）
            first = regTenantId != null && regTenantId > 0
                    && userMapper.countByTenantAndRoleForUpdate(regTenantId, RoleConst.ADMIN) == 0;
        }

        if (first) {
            log.warn("首管理员自助激活: role={}, tenantId={}", role, regTenantId);
            user.setStatus("active");
        } else {
            log.warn("非首管理员自注册，转待审批: role={}, tenantId={}", role, regTenantId);
            user.setStatus("pending");
        }
        return null;
    }

    /**
     * 注册主体：额度校验、加密、入库、签发 Token。
     * 调用前必须已确定租户归属、设置 TenantContext，并完成账号查重。
     */
    private Result<Object> doRegister(User user, Long regTenantId) {
        // 校验租户注册名额：用户总数 + 按角色的教师/学生名额（原子占用，超限直接返回）
        try {
            // 平台管理员（tenantId=0）不归属任何真实租户、没有套餐记录，跳过配额占用，
            // 否则 tenantPackageService.tryAcquire(0,...) 找不到记录会返回 false 而误报“已达上限”。
            if (regTenantId != null && regTenantId > 0) {
                tenantQuotaService.acquire(regTenantId, TenantQuotaService.USER);
                // 按角色配额只对 teacher/student 生效：QuotaType 里没有 ADMIN 项，
                // 若沿用三元表达式的 else 分支，建管理员会白占一个「注册学生」名额 ——
                // 管理员只应计入注册用户总数，不该挤占学生配额。
                String role = user.getRole() == null ? RoleConst.STUDENT : user.getRole();
                if (RoleConst.TEACHER.equals(role)) {
                    tenantQuotaService.acquire(regTenantId, TenantQuotaService.TEACHER);
                } else if (RoleConst.STUDENT.equals(role)) {
                    tenantQuotaService.acquire(regTenantId, TenantQuotaService.STUDENT);
                }
            }
        } catch (BusinessException e) {
            return Result.fail(403, e.getMessage());
        }
        // 对敏感字段做 AES-GCM 加密 + HMAC 搜索索引后入库
        encryptUserFields(user);
        // 插入数据库
        int result = userMapper.insert(user);
        log.debug("output：" + result);

         Map<String, String> resultMap = new HashMap<>();
         resultMap.put("userId", user.getUserId());
         // account 不再加密，直接返回入库的明文值
         resultMap.put("account", user.getAccount());
         // ★ 2026-10-24：非 active 账号**不下发 token**。
         //   原实现无条件签发 token，等于在注册口开了个侧门：自助注册得到 pending，
         //   响应里却带着可用 token（web 注册页还会把它写进 localStorage），
         //   pending 用户拿它直接调业务接口，把"待审核"绕得一干二净。
         //   因此"禁止 pending 登录"必须同时在**发券的地方**收口，只堵 login 是不够的。
         //   前端据 status/token 是否为空判断"注册成功但要等审核"，见 login.html 注册分支。
         resultMap.put("status", user.getStatus());
         boolean accountUsable = "active".equals(user.getStatus());
         if (accountUsable) {
             //计算token（租户归属已在插入前确定）
             String token = jwtUtil.generateToken(regTenantId, user.getUserId(), user.getRole());
             resultMap.put("token", token);
         }
         resultMap.put("role", user.getRole());
         //?? tenantCode 也返回给前端，便于后续登录时传入
         resultMap.put("tenantCode", user.getTenantCode());
         //data,message
         Result< Object> rslt = Result.success(resultMap   ,
                 accountUsable ? "注册成功，请登录" : "注册成功，请等待管理员审核");
         log.debug("output rslt：" + rslt);
        return rslt;
    }
 
    /**
     * 仅对"尚未归属租户的存量用户"（tenant_id 为 NULL）在首次登录时自动归属到当前请求租户，
     * 使存量账号不必停机刷数据即可完成迁移。
     * 逻辑边界（与平台管理员区分清楚）：
     *   - tenant_id = NULL → 真正未归属，自动绑定到本次请求的 tenantId；
     *   - tenant_id = 0    → 平台管理员（合法的特殊租户，见 authController.PLATFORM_TENANT_CODE），不做自动归属；
     *   - tenant_id > 0    → 普通租户用户，必须与实际所属租户一致。
     */
    private void bindUserToTenant(User user, Long tenantId) {
        if (tenantId == null || tenantId <= 0) {
            return; // tenantId=0 为平台管理员、或请求未带租户，均不做自动归属
        }
        user.setTenantId(tenantId);
        userMapper.bindTenant(user.getUserId(), tenantId);
        log.warn("存量用户自动归属租户, userId={}, tenantId={}", user.getUserId(), tenantId);
    }

    // 用户登录（对应设计2.2.1 登录接口）
    public Result<HashMap<String, Object>> login( String account, String password, Long tenantId) {
        // 查找用户（账号可为手机号/邮箱，对应设计2.2.1 登录接口请求参数）
       //  log.debug("userService login：" + account+"   "+password);
        User user = userMapper.getUserByAccount( account,tenantId);
        log.debug("userService login：" + user);
        HashMap<String, Object> resultMap = new HashMap<>();
        if (user == null) {
            // P0.5：账号不存在时也跑一次同等代价的 bcrypt，让"不存在"与"密码错"耗时一致。
            // 不加这一行，即便 code 统一成 400，攻击者用响应时间（1ms vs 80ms）照样能枚举。
            safeDummyMatch(password);
            log.warn("登录失败(账号不存在), tenantId={}, accountHmac={}", tenantId, accountHmacForLog(account));
            return Result.fail(400, LOGIN_FAIL_MESSAGE);
        }
        // 校验账号归属：账号必须属于当前请求租户。
        // 归属不符时返回与"账号不存在"一致的响应，避免据此枚举其他租户的账号。
        //
        // ★ P0.5 把"存量用户自动归属"的写操作挪到了密码校验之后（原来是先写后校验）：
        //   否则错误密码也会触发一次 bindUserToTenant 写库，攻击者用错误密码就能把
        //   tenant_id IS NULL 的存量账号绑到自己的租户下（等于抢号）。
        //   调整后对正常用户行为完全一致（密码正确才绑），只是把写操作放到了"确定是本人"之后。
        Long userTenantId = user.getTenantId();
        boolean needBindToTenant = (userTenantId == null);
        if (!needBindToTenant && !userTenantId.equals(tenantId)) {
            // 不入库、不区分文案：跨租户与"账号不存在"对客户端必须无法区分
            safeDummyMatch(password);
            log.warn("跨租户登录被拒绝, accountHmac={}, 用户所属租户={}, 请求租户={}",
                    accountHmacForLog(account), userTenantId, tenantId);
            return Result.fail(400, LOGIN_FAIL_MESSAGE);
        }
        // 解密敏感字段
        decryptUserFields(user);
        // 校验密码,把password加密后与user.getPassword()比较
       // String encodedPassword = passwordEncoder.encode(password); 
       if(! passwordEncoder.matches(password,user.getPassword()))
        {
           log.warn("登录失败(密码不正确), accountHmac={}, tenantId={}",
                   accountHmacForLog(account), tenantId);
           return Result.fail(400, LOGIN_FAIL_MESSAGE);
        }
        // 密码已验证通过，此时才允许写库：存量用户首次登录自动归属当前租户
        if (needBindToTenant) {
            // 仅 tenant_id 为 NULL 才视为"尚未归属租户的存量用户"。
            // 注意：tenant_id = 0 是平台管理员（合法的特殊租户），不是未归属哨兵，绝不能在此自动重绑；
            //       平台管理员必须用 tenantCode=platform 登录，否则在上面分支因 0 != 请求租户
            //       被判为登录失败，从而无法被任何真实租户冒领。
            bindUserToTenant(user, tenantId);
        }
        // 校验账号状态：**只有 active 能登录**（frozen 禁用 / pending 待审核 / inactive 停用 一律拦）。
        //
        // ★ 2026-10-24 变更：pending 由「放行」改为「拦截」，与 wechatLogin 的 `!"active"` 口径统一。
        //   变更前"只拦 frozen/inactive、pending 放行"造成三个问题：
        //   ① 审核形同装饰 —— JwtAuthenticationFilter 只验签、业务接口也不查 status，
        //      pending 用户拿到 token 后建课程、改排期、看学生名单全都畅通；
        //   ② 与 wechatLogin 口径相反 —— 同一个 pending 用户密码能进、微信进不去；
        //   ③ 与前端文案冲突 —— promo.js 承诺"审批通过后即可登录"、login.html 注释写着"注册需审核"。
        //
        //   写成白名单（失败关闭）而不是"显式列出拦截值"：已核库确认 user 表状态取值只有
        //   active/frozen/pending（0 条空值），不存在"白名单会误锁存量空状态账号"的顾虑；
        //   白名单同时兜住将来新增的未知状态值 —— 未知状态默认不可登录，方向才是安全的。
        //   文案仍按状态区分，不合并成一句：用户被冻结和待审核的下一步动作完全不同。
        String accountStatus = user.getStatus();
        if (!"active".equals(accountStatus)) {
            String statusMsg;
            if ("frozen".equals(accountStatus)) {
                statusMsg = "账号已冻结，请联系管理员";
            } else if ("pending".equals(accountStatus)) {
                statusMsg = "账号待管理员审核，审核通过后即可登录";
            } else {
                statusMsg = "账号未审核或已停用，请联系管理员";
            }
            log.warn("登录被拒(状态不可用), accountHmac={}, tenantId={}, status={}",
                    accountHmacForLog(account), tenantId, accountStatus);
            return Result.fail(400, statusMsg);
        }
        // 生成Token（tenantId 由 controller 根据租户编码解析后传入）
        String token = jwtUtil.generateToken(tenantId, user.getUserId(), user.getRole());
        // 组装返回数据（对应设计2.2.1 登录返回数据）
        resultMap.put("userId", user.getUserId());
        resultMap.put("account", user.getAccount());
        resultMap.put("name", user.getName());
        resultMap.put("role", user.getRole());
        resultMap.put("token", token);
       //?? tenantCode 也返回给前端，便于后续登录时传入
       resultMap.put("tenantCode", user.getTenantCode());
    // 2. 生成双Token
       // String accessToken = jwtUtil.generateAccessToken(account);
        String refreshToken = jwtUtil.generateRefreshToken(tenantId, user.getUserId());
          resultMap.put("refreshToken", refreshToken);

          resultMap.put("code", 200);
       
       // 3. 持久化刷新Token到数据库
        refreshTokenService.saveNewToken(user.getUserId(), refreshToken, jwtUtil.getRefreshExpireTime());

        // 4. 记录登录会话（在线统计数据来源）
        userSessionService.onLogin(token, tenantId, user.getUserId(), user.getRole(),
                currentRequestIp(), currentRequestUserAgent());

      // log.debug("login ok with account：" +user.getAccount()); 
        return Result.success(resultMap   ,"登陆成功");
    }

    /**
     * 执行一次与真实密码校验**等价代价**的 bcrypt 比对，用于抹平"账号不存在"路径的时序差。
     *
     * <p>返回值必然为 false，调用方不需要也不应该使用它——它的唯一作用是消耗相同的时间。
     * 异常一律吞掉：这里已经在失败分支上，不能因为假校验出错而改变响应。
     */
    private void safeDummyMatch(String rawPassword) {
        try {
            passwordEncoder.matches(rawPassword == null ? "" : rawPassword, dummyPasswordHash);
        } catch (Exception e) {
            log.debug("登录失败路径的假校验异常（忽略，不影响响应）", e);
        }
    }

    /**
     * 日志用账号标识：盲索引前 12 位。
     *
     * <p><b>绝不能在日志里打明文账号</b>——它是手机号/邮箱，属个人敏感信息，
     * 而登录失败日志恰恰是最容易被翻看、导出、贴进工单的一段。
     * 改造前这里直接打了 {@code account} 明文（跨租户拒绝分支），P0.5 一并改掉。
     */
    private String accountHmacForLog(String account) {
        if (account == null || account.isBlank()) {
            return "-";
        }
        try {
            String h = cryptoUtil.searchIndex(account.trim());
            if (h == null || h.isEmpty()) {
                return "-";
            }
            return h.length() > 12 ? h.substring(0, 12) : h;
        } catch (Exception e) {
            return "-";
        }
    }


    /**
     * 微信静默登录：按 openid 找已绑定账号，直接发 token（返回结构与密码登录完全一致）。
     *
     * <p><b>为什么不能用 {@code userMapper.selectById}</b>：本接口是 permitAll、不带 Bearer，
     * {@code TenantInterceptor} 不会设置租户上下文，租户插件会拼出 {@code tenant_id = -1} 而恒不命中。
     * 与密码登录的 {@code getUserByAccount} 同一处理——用 {@code @InterceptorIgnore} 的
     * {@code getByUserIdNoTenant} 取用户，归属校验由本方法显式完成。
     *
     * <p>未绑定 → {@code code=1001}，前端据此静默降级走账号密码登录，不弹错误。
     * （必须用 1001 而非 401：401 会触发小程序 request.js 的 onAuthFail 把用户踢回登录页。）
     *
     * <p><b>P1</b>：入参加 {@code unionid}，匹配走 {@code findByIdentity}（unionid → openid），
     * PC 网站应用/H5 与小程序因此可登录同一账号。
     */
    public Result<HashMap<String, Object>> wechatLogin(String openid, String unionid) {
        WxUserid binding = wxUseridService.findByIdentity(openid, unionid);
        if (binding == null) {
            return Result.fail(1001, "微信尚未绑定，请使用账号密码登录或直接注册");
        }
        User user = userMapper.getByUserIdNoTenant(binding.getUserId());
        if (user == null) {
            return Result.fail(1001, "关联账号不存在");
        }
        if ("frozen".equals(user.getStatus())) {
            return Result.fail(400, "账号已冻结，请联系管理员");
        }
        // pending 单独给文案：它与"未审核(inactive)"是同一个业务结论（不许登录），
        // 但处罚来源不同——pending 是注册后等审批，inactive 是被停用。
        // 2026-10-24 与 login() 的拦截口径对齐：两者都拦，文案各自准确。
        if ("pending".equals(user.getStatus())) {
            return Result.fail(400, "账号待管理员审核，审核通过后即可登录");
        }
        if (!"active".equals(user.getStatus())) {
            return Result.fail(400, "账号未审核，请等待管理员审核");
        }
        decryptUserFields(user);   // name 入库加密，返回前必须解密
        Long tenantId = user.getTenantId() == null ? 0L : user.getTenantId();
        String token = jwtUtil.generateToken(tenantId, user.getUserId(), user.getRole());
        String refreshToken = jwtUtil.generateRefreshToken(tenantId, user.getUserId());
        HashMap<String, Object> resultMap = new HashMap<>();
        resultMap.put("userId", user.getUserId());
        resultMap.put("account", user.getAccount());
        resultMap.put("name", user.getName());
        resultMap.put("role", user.getRole());
        resultMap.put("token", token);
        resultMap.put("tenantCode", user.getTenantCode());
        resultMap.put("refreshToken", refreshToken);
        resultMap.put("code", 200);
        refreshTokenService.saveNewToken(user.getUserId(), refreshToken, jwtUtil.getRefreshExpireTime());
        userSessionService.onLogin(token, tenantId, user.getUserId(), user.getRole(),
                currentRequestIp(), currentRequestUserAgent());
        return Result.success(resultMap, "登录成功");
    }

    /**
     * 绑定微信 openid 到当前账号（密码登录成功后调用）。
     *
     * <p>本接口需登录，{@code TenantInterceptor} 已设好租户上下文，可直接用 {@code selectById}。
     * 唯一性由 {@code wx_userid.uk_wx_openid} / {@code uk_wx_unionid} 保证：该微信已绑到别的账号时返回 409，
     * 不做静默改绑（否则等同于账号接管）。
     *
     * <p><b>P1</b>：{@code unionid} 一并落库，后续 PC/H5 端登录同一开放平台账号即可命中本绑定。
     */
    public Result<Boolean> bindWechat(String userId, String openid, String unionid) {
        User user = userMapper.selectById(userId);
        if (user == null) {
            return Result.fail(404, "用户不存在");
        }
        wxUseridService.bind(openid, unionid, userId, user.getTenantId(), "manual");
        return Result.success(true, "微信绑定成功");
    }

    /**
     * PC 扫码绑定（P2，{@code /auth/wechat/pc-callback} 的 bind 分支）。
     *
     * <p>与 {@link #bindWechat} 的差别：回调端点是 permitAll、无 TenantContext，
     * 必须用 {@code getByUserIdNoTenant} 取用户——{@code selectById} 会被租户插件拼上
     * {@code tenant_id = -1} 而恒查不到（与 {@link #wechatLogin} 同一处理）。
     * userId 来自扫码时生成的 state（qr 端点已从令牌解析），不信客户端参数。
     *
     * <p>冲突（该微信已绑别的账号）返回 409 文案，由回调置 state=failed 透给前端，
     * 不静默改绑（否则等同于账号接管）。
     */
    public Result<Boolean> wechatPcBind(String userId, String openid, String unionid) {
        User user = userMapper.getByUserIdNoTenant(userId);
        if (user == null) {
            return Result.fail(404, "用户不存在");
        }
        try {
            wxUseridService.bind(openid, unionid, userId, user.getTenantId(), "manual");
        } catch (ConflictException e) {
            return Result.fail(409, e.getMessage());
        }
        return Result.success(true, "微信绑定成功");
    }

    /**
     * 按账号全局查用户（忽略租户隔离），取 tenant_id 最小的匹配。
     *
     * <p>仅 {@code GET /tenant/code-by-account} 的平台管理员代查分支可达
     * （控制器已收敛 {@code self || platform_admin}，普通用户走本人令牌分支）。
     * 同账号可跨租户重名（查重只在租户内做），"取首个"是支持场景的近似解；
     * 需要精确定位时，调用方应改走带 tenantId 的 {@code getUserByAccount}。
     */
    public User getFirstUserByAccountIgnoreTenant(String account) {
        if (account == null || account.isBlank()) {
            return null;
        }
        List<User> users = userMapper.listByAccountIgnoreTenant(account.trim());
        return users.isEmpty() ? null : users.get(0);
    }

    /**
     * 按 user_id 批量全局查用户（忽略租户隔离）。
     *
     * <p>推广统计解析「推广人/被邀请者姓名」用：promo 三表是平台级数据，
     * 业绩行里的 user_id 可能属于任意租户，走租户插件会拼
     * {@code tenant_id = 当前租户} 而查不到人。ids 为空直接返回空列表
     * （避免拼出 {@code IN ()} 的非法 SQL）。
     */
    public List<User> listByIdsIgnoreTenant(java.util.Collection<String> ids) {
        if (ids == null || ids.isEmpty()) {
            return new ArrayList<>();
        }
        return userMapper.listByIdsIgnoreTenant(ids);
    }

    /**
     * 微信直接注册（场景 C）：以 openid 为账号创建用户并建立绑定，返回 token。
     *
     * <p><b>租户上下文必须自己设置并清理</b>：本接口是 permitAll，{@code TenantInterceptor} 不跑，
     * 而 {@code userMapper.insert} 依赖租户插件写入正确的 {@code tenant_id}（否则会填 -1）。
     * 由于 TenantInterceptor 没跑，它的 {@code afterCompletion} 也不会来清理，
     * 因此必须在本方法内 try/finally 清理，避免污染 Tomcat 线程池里的下一个请求。
     *
     * <p>账号 = openid、密码 = 随机 UUID 密文（用户无从得知）→ <b>该账号只能走微信登录，不能密码登录</b>。
     * 这也是 {@link #unbindWechat} 必须拒绝 {@code auto_register} 解绑的原因。
     *
     * <p><b>P1</b>：入参加 {@code unionid}；判重与绑定均走 {@code findByIdentity}
     * （unionid → openid），避免「小程序已注册、PC 端同一人再注册」产生双账号。
     */
    @Transactional(rollbackFor = Exception.class)
    public Result<HashMap<String, Object>> wechatRegister(String openid, String unionid, String tenantCode, String role) {
        if (wxUseridService.findByIdentity(openid, unionid) != null) {
            return Result.fail(409, "该微信已注册，请直接登录");
        }
        // 方案 B 收口①：保留字同样挡在解析之前。
        // 本方法的角色白名单只允许 student/teacher，造不出管理员，所以没有"抢首管理员"的路径；
        // 但平台自身的展示行不该成为扫码注册的落脚点 —— 否则平台内部会出现一批
        // 混在"平台"名下的学生/教师账号，既不属于任何经营租户，也没有套餐与行业。
        if (isReservedTenantCode(tenantCode)) {
            log.warn("微信注册被拒(租户编码为系统保留), 编码={}", tenantCode);
            return Result.fail(403, RESERVED_TENANT_CODE_MESSAGE);
        }
        Tenant tenant = tenantService.getByCode(tenantCode);
        if (tenant == null || !Integer.valueOf(1).equals(tenant.getStatus())) {
            return Result.fail(403, "租户不存在或已停用");
        }
        // 管理员不能靠扫码产生：否则任何人拿一个推广码就能给自己造一个租户管理员
        String resolvedRole = (role != null && !role.isBlank()
                && (RoleConst.STUDENT.equals(role) || RoleConst.TEACHER.equals(role)))
                ? role : RoleConst.STUDENT;
        Long tenantId = tenant.getId();
        try {
            TenantContext.setTenantId(tenantId);
            tenantQuotaService.acquire(tenantId, TenantQuotaService.USER);
            if (RoleConst.STUDENT.equals(resolvedRole)) {
                tenantQuotaService.acquire(tenantId, TenantQuotaService.STUDENT);
            }
            String userId = UUID.randomUUID().toString().replace("-", "");
            User user = new User();
            user.setUserId(userId);
            user.setTenantId(tenantId);
            user.setTenantCode(tenant.getTenantCode());
            user.setAccount(openid);
            user.setPassword(passwordEncoder.encode(UUID.randomUUID().toString()));
            user.setRole(resolvedRole);
            user.setStatus("pending");
            userMapper.insert(user);
            wxUseridService.bind(openid, unionid, userId, tenantId, "auto_register");

            // ★ 2026-10-24：pending 账号**不签发 token、不落 refreshToken**。
            //   原实现这里直接发 token，而小程序 auth.js 拿到 token 就 setSession 进首页 ——
            //   相当于"注册即登录"，审核被完全绕过；且下次静默登录走 wechatLogin 又被 pending 拦下，
            //   同一用户表现为"第一次能进、第二次被告知未审核"。现在统一为"注册成功但不可登录"，
            //   前端据缺省的 token 判定待审核态（提示等待，不落会话），见 miniprogram/core/auth.js。
            HashMap<String, Object> resultMap = new HashMap<>();
            resultMap.put("userId", userId);
            resultMap.put("account", openid);
            resultMap.put("name", null);
            resultMap.put("role", resolvedRole);
            resultMap.put("tenantCode", tenant.getTenantCode());
            resultMap.put("status", "pending");
            resultMap.put("code", 200);
            return Result.success(resultMap, "注册成功，请等待管理员审核");
        } finally {
            TenantContext.clear();
        }
    }

    /**
     * 解除微信绑定。
     *
     * <p><b>{@code auto_register} 一律拒绝</b>：这类账号 account=openid、password=随机密文，
     * 解绑后用户既没有密码也失去了微信入口 —— 账号<b>永久无法登录</b>，变成僵尸数据。
     * 需要解绑的场景应先让用户设置登录密码，再放行。
     */
    /**
     * 查询当前账号的微信绑定状态（web 端「微信绑定」菜单用）。
     *
     * <p>只回 {@code bound} 与 {@code bindSource} —— <b>不回 openid</b>：
     * openid 属于凭证级信息，前端拿到也没有用途，没必要暴露。
     */
    public Result<HashMap<String, Object>> wechatStatus(String userId) {
        WxUserid binding = wxUseridService.findByUserId(userId);
        HashMap<String, Object> map = new HashMap<>();
        map.put("bound", binding != null);
        map.put("bindSource", binding == null ? null : binding.getBindSource());
        return Result.success(map, "查询成功");
    }

    public Result<Boolean> unbindWechat(String userId) {
        WxUserid binding = wxUseridService.findByUserId(userId);
        if (binding == null) {
            return Result.fail(404, "未绑定微信");
        }
        if ("auto_register".equals(binding.getBindSource())) {
            return Result.fail(400, "微信注册的账号需先设置登录密码，方可解绑");
        }
        wxUseridService.unbind(userId);
        return Result.success(true, "已解绑");
    }


    /**
     * 取当前请求IP（会话记录用，取不到返回null不影响主流程）。
     *
     * <p><b>2026-10-22 P0 修正</b>：原先只读 {@code getRemoteAddr()}，部署在 nginx 之后时
     * 记录到的是代理地址（127.0.0.1 / 内网 IP），与 {@code promo_conversion.register_ip}
     * 走 XFF 得到的真实 IP 口径不一致 —— 同一用户在两张表里对不上，
     * 于是"按 IP 的风控/审计"从一开始就没有可用数据。现统一委托
     * {@link ClientIpResolver}（XFF 从右往左取、只信任可信代理跳）。
     */
    private String currentRequestIp() {
        return ClientIpResolver.resolveCurrent();
    }

    private String currentRequestUserAgent() {
        try {
            org.springframework.web.context.request.ServletRequestAttributes attrs =
                    (org.springframework.web.context.request.ServletRequestAttributes)
                            org.springframework.web.context.request.RequestContextHolder.getRequestAttributes();
            if (attrs == null) {
                return null;
            }
            return attrs.getRequest().getHeader("User-Agent");
        } catch (Exception e) {
            return null;
        }
    }
    public void logout() {
            // 解析Token获取用户信息（对应设计2.3 安全设计-Token）
            String userId = jwtUtil.getCurrentUserId();
            // Token失效（在缓存中删除对应用户的Token）
            jwtUtil.invalidateToken(userId); 
        }
  

    // 密码重置，对应设计2.2.1 密码重置接口 "12345678"
    @Transactional
    public Result<HashMap<String, Object>> resetPassword(String account, Long tenantId) {
        // 查找用户
        User user = userMapper.getUserByAccount(account, tenantId);
        HashMap<String, Object> resultMap = new HashMap<>();
        if (user != null) {
            // 解密敏感字段（如需回显）
            decryptUserFields(user);
            // 加密新密码并更新--重置为固定码，用户自行更改
            user.setPassword(passwordEncoder.encode("12345678"));
            updatePassword(user);
            return Result.success(resultMap, "密码重置成功");
            // userMapper.updatePassword(user.getUserId(),user.getPassword());
        } else {
           // throw new BusinessException("账号 【" + account + "】对应的用户不存在");
           return Result.fail(404, "账号 【" + account + "】对应的用户不存在");
        }   

    } 

 /**
     * 修改密码（P0-2）。
     *
     * <p>原实现只凭请求里的 userId 就改密码，既不校验调用者是谁、也不校验原密码，
     * 任何登录用户都能把任意 userId 的密码改成自己知道的值（拿老师/同学的账号去登录）。
     *
     * <p>现按两条合法路径区分：
     * <ul>
     *   <li><b>管理员代管</b>：{@code operatorRole} 为 admin/platform_admin，且目标用户与操作者同租户
     *       （平台管理员 tenantId=0 可跨租户）。这是后台"重置密码"按钮的既有语义，
     *       管理员本就持有重置权，不应要求他知道用户的原密码。</li>
     *   <li><b>本人改密</b>：{@code targetUserId} 等于调用者自己，必须提供正确的原密码。</li>
     * </ul>
     * 两者都不满足则拒绝 —— 尤其是"普通用户改他人密码"这条路被彻底关闭。
     *
     * @param userId         目标用户 id
     * @param password       新密码
     * @param callerUserId   调用者 userId（来自 token）
     * @param callerRole     调用者角色（来自 token）
     * @param callerTenantId 调用者租户 id（来自 token）
     * @param oldPassword    原密码；本人改密时必填，管理员代管时忽略
     * @return null 表示成功，非 null 为可直接回给调用方的失败结果
     */
    @Transactional
    public Result<Object> changePassword(String userId, String password,
                                          String callerUserId, String callerRole,
                                          Long callerTenantId, String oldPassword) {
        if (userId == null || userId.trim().isEmpty()) {
            return Result.fail(400, "用户Id不能为空");
        }
        if (password == null || password.isEmpty()) {
            return Result.fail(400, "新密码不能为空");
        }
        String targetId = userId.trim();

        boolean isAdminCaller = RoleConst.ADMIN.equals(callerRole) || RoleConst.PLATFORM_ADMIN.equals(callerRole);
        boolean isSelf = callerUserId != null && callerUserId.equals(targetId);

        if (!isSelf && !isAdminCaller) {
            log.warn("非管理员尝试改他人密码，已拒绝, caller={}, target={}", callerUserId, targetId);
            return Result.fail(403, "只能修改本人密码");
        }

        User target = userMapper.selectById(targetId);
        if (target == null) {
            return Result.fail(404, "用户不存在");
        }

        if (isAdminCaller && !isSelf) {
            // 租户管理员只能管本租户；平台管理员（tenantId=0）跨租户放行
            boolean platformCaller = RoleConst.PLATFORM_ADMIN.equals(callerRole);
            Long targetTenant = target.getTenantId();
            if (!platformCaller && callerTenantId != null && targetTenant != null
                    && !callerTenantId.equals(targetTenant)) {
                log.warn("跨租户改密被拒, callerTenant={}, targetTenant={}", callerTenantId, targetTenant);
                return Result.fail(403, "只能重置本租户用户的密码");
            }
        } else if (isSelf) {
            // 本人改密必须验原密码，否则 token 被窃取即可改密、账号彻底失守
            if (oldPassword == null || oldPassword.isEmpty()) {
                return Result.fail(400, "修改本人密码需提供原密码");
            }
            User db = userMapper.selectById(targetId);
            if (db == null || db.getPassword() == null
                    || !passwordEncoder.matches(oldPassword, db.getPassword())) {
                log.warn("原密码校验失败, userId={}", targetId);
                return Result.fail(400, "原密码不正确");
            }
        }

        User upd = new User();
        upd.setUserId(targetId);
        upd.setPassword(passwordEncoder.encode(password));
        updatePassword(upd);
        log.warn("密码已修改, 操作者={}, 目标用户={}, 是否本人={}", callerUserId, targetId, isSelf);
        return null;
    } 
    public List<User> selectByPhone(String phone) {
        List<User> users = userMapper.selectByPhone(cryptoUtil.searchIndex(phone), phone);
        if (users == null || users.isEmpty()) {
            // throw new UserNotFoundException("手机号【" + phone + "】对应的用户不存在");
            return new java.util.ArrayList<>();
        }
        decryptUserList(users);
        return users;
    }
 public List<User> selectByEmail(String email) {
      // return userMapper.selectByEmail(email)
      //       .orElseThrow(() -> new UserNotFoundException("email" + email + "】对应的用户不存在"));
      List<User> users = userMapper.selectByEmail(cryptoUtil.searchIndex(email), email);
      if(users == null || users.isEmpty()) {
          log.debug("email 【" + email + "】对应的用户不存在");
          return new java.util.ArrayList<>();
      }
      decryptUserList(users);
      return users;
     }
  
public User selectById(String userId) {
      //  return userMapper.selectById(userId)
      //       .orElseThrow(() -> new UserNotFoundException("userId" + userId + "】对应的用户不存在"));
     User user= userMapper.selectById(userId);
     if(user==null)
         log.debug("userId 【" + userId + "】对应的用户不存在");
     else
         decryptUserFields(user);
     return user;
     }
 /**
     * 根据手机号/邮箱查询用户（登录专用）
     */
    public List<User> selectByPhoneOrEmail(String account) {
        List<User> users = userMapper.selectByPhoneOrEmail(cryptoUtil.searchIndex(account), account);
        if (users == null || users.isEmpty()) {
           log.debug("账号【" + account + "】不存在");
           return new java.util.ArrayList<>();
        }
        decryptUserList(users);
        return users;
    } 
    /**
     * 根据账号查询用户（登录/重置密码专用，入参为明文，内部转 HMAC）
     */
    public User getUserByAccount(String account, Long tenantId) {
        User user = userMapper.getUserByAccount(account, tenantId);
        if (user != null) {
            decryptUserFields(user);
        }
        return user;
    }

    private int updatePassword(User user)
    {
        // 更新密码--已经hash变换
          String useid = user.getUserId();
          String password= user.getPassword();
          int ret = userMapper.updatePassword(useid,password);
        return ret;
    }
    
    /**
     * 更新用户状态。
     *
     * <p>★ 2026-10-24：新增入参 callerId / callerRole（由控制器从 Token 解析后传入），
     * 用于在写库前拦住「管理员把自己停用」的自锁动作，见 {@link #assertNoAdminSelfLock}。
     * 判定必须放在 Service 且与 updateUserInfo 共用，否则两个改状态的入口各判一次必然漂移。
     */
     public int updateStatus(User user, String callerId, String callerRole)
    {     String useid = user.getUserId();
          String status= user.getStatus();
          assertNoAdminSelfLock(callerId, callerRole, useid, status);
           return  userMapper.updateStatus(useid,status);
       
    }

    /**
     * 管理员自锁防护：禁止管理员把**自己**的状态改成非 active。
     *
     * <p><b>为什么必须有这条</b>：管理员/平台管理员的"是否已有管理员"判据
     * （{@link #applyRoleAdmission} 里的 countByTenantAndRoleForUpdate 与
     * countByRoleGlobalForUpdate）**只计数、不看状态**，这是刻意选择 —— 若只数 active，
     * 一个被禁用的管理员会让"已有管理员"不成立，任何知道租户码的人都能自助注册顶替他的位置。
     * 代价是：某租户/平台的 admin 一旦全部被禁用，自助注册通道就永远只能产出 pending，
     * 系统只剩改库一条救路。也就是"最后一个可用管理员把自己锁死"。
     * 因此在这条写入路径上补反向约束：**自己只能保持 active**。
     *
     * <p><b>为什么按"非 active"拦，而不是只拦 pending/frozen 两个字面值</b>：
     * status 还有 inactive（历史上当"未审核"用）。只拦两个字面值的话，
     * 把自锁改写成 status=inactive 照样能绕过；而这几个值对本人而言语义完全一样 ——
     * 改完就登不进去（登录侧已是"只有 active 能登"）。
     *
     * <p><b>不拦"改别人"</b>：管理员冻结同租户另一个管理员是正常运维，
     * 此时操作者自己仍是 active，不会出现零可用管理员。
     *
     * <p>操作者身份一律取自 Token（由控制器解析后传入），不看请求体 —— 请求体里的
     * userId 是"被改谁"，两者混淆就等于把绕过口留在参数里。
     *
     * @param callerId     操作者 userId（来自 Token）
     * @param callerRole   操作者角色（来自 Token）
     * @param targetUserId 被修改状态的 userId
     * @param targetStatus 目标状态；null/空表示本次不改状态，直接放行
     */
    private void assertNoAdminSelfLock(String callerId, String callerRole,
                                       String targetUserId, String targetStatus) {
        if (targetStatus == null || targetStatus.trim().isEmpty()) {
            return;
        }
        if (callerId == null || targetUserId == null || !callerId.equals(targetUserId.trim())) {
            return; // 改的不是自己，放行
        }
        if (!RoleConst.ADMIN.equals(callerRole) && !RoleConst.PLATFORM_ADMIN.equals(callerRole)) {
            return; // 非管理员（理论上到不了这里，授权层已限定）不做额外限制
        }
        if ("active".equals(targetStatus.trim())) {
            return;
        }
        log.warn("管理员自锁已被拒绝: userId={}, role={}, targetStatus={}", callerId, callerRole, targetStatus);
        throw new BusinessException("不能停用自己的账号状态。管理员一旦把自己置为非启用，"
                + "本租户（或平台）将没有可用管理员审批，只能由数据库修复，请交由其他管理员操作。");
    }

    /**
     * 更新用户基本资料：姓名 / 手机号 / 电子邮箱 / 状态。
     * 账号（account）是登录标识，不在可改范围内。
     *
     * 两个容易踩的坑，这里都显式处理了：
     *
     * 1) phone/email/name 在库里是 AES-GCM 密文（见 encryptUserFields）。若把前端传来的
     *    明文直接落库，会造成：列表查询 decrypt 得到乱码、HMAC 搜索索引丢失导致
     *    按手机号/邮箱再也检索不到该用户。因此必须与注册路径一样先 encryptWithIndex 再入库。
     *
     * 2) 支持局部更新（未传的字段保持原值），所以不能拿"本次请求里的 phone/email"
     *    直接判断"至少留一项联系方式"——要先取出原记录合并后再校验，
     *    否则"只改姓名"这种合法请求会被误拒。
     *
     * @param user 含 userId，以及待更新的 name/phone/email/status（null 表示不更新）
     * @param callerId   操作者 userId（来自 Token，用于管理员自锁防护）
     * @param callerRole 操作者角色（来自 Token）
     * @return 影响行数；0 表示用户不存在或不属于当前租户（租户插件会自动追加 tenant_id 条件）
     */
    @Transactional
    public int updateUserInfo(User user, String callerId, String callerRole) {
        if (user == null || user.getUserId() == null || user.getUserId().trim().isEmpty()) {
            throw new BusinessException("用户Id不能为空");
        }
        String userId = user.getUserId().trim();

        // 取出原记录：既用于校验归属，也用于合并未传字段
        User exist = userMapper.selectById(userId);
        if (exist == null) {
            return 0;
        }
        decryptUserFields(exist);

        String name  = user.getName()  != null ? user.getName().trim()  : exist.getName();
        String phone = user.getPhone() != null ? user.getPhone().trim() : exist.getPhone();
        String email = user.getEmail() != null ? user.getEmail().trim() : exist.getEmail();

        // 合并后再校验，避免"只改姓名"被误拒
        if ((phone == null || phone.isEmpty()) && (email == null || email.isEmpty())) {
            throw new BusinessException("手机号和电子邮箱至少填写一项");
        }

        String status = (user.getStatus() == null || user.getStatus().trim().isEmpty())
                ? null : user.getStatus().trim();

        // 本接口同样能写 status（前端编辑弹窗的下拉就走这里），
        // 自锁防护必须与 updateStatus 同口径，否则"改资料"就是绕过口。
        assertNoAdminSelfLock(callerId, callerRole, userId, status);

        // encryptWithIndex(null) 返回 null，Mapper 的 <if> 会跳过对应字段
        return userMapper.updateUserInfo(
                userId,
                cryptoUtil.encryptWithIndex(name),
                cryptoUtil.encryptWithIndex(phone),
                cryptoUtil.encryptWithIndex(email),
                status);
    }

    /**
     * 拉取本人资料（解密后），password 置空避免下发。
     * 仅按 Token 的 userId 查询，与租户插件自动拼接的 tenant_id 协同，不存在越权读取他人。
     */
    public User getSelfProfile(String callerId) {
        if (callerId == null || callerId.trim().isEmpty()) return null;
        User u = userMapper.selectById(callerId.trim());
        if (u == null) return null;
        decryptUserFields(u);
        // password 是哈希值，绝不随资料下发（前端也无权改密码，走独立改密端点）
        u.setPassword(null);
        return u;
    }

    /**
     * 本人自助修改资料：account / name / phone / email + 学员·教师专属字段。
     *
     * <p>★ 安全边界：userId 取自 Token（callerId），<b>绝不取请求体</b>；status / role /
     * password / tenantId 一律忽略（不在 Mapper 写入列中），从根本上杜绝"改别人资料 /
     * 改自己角色提权 / 改自己状态绕过审批"等越权。
     *
     * <p>开放字段依据（2026-10-27 与用户对齐）：排除 userId/tenantId/status/role/password。
     * account 保持按 userId 修改——同租户内不可撞（{@code uk_user_account_tenant}），跨租户可重名；
     * phone/email 不再全局唯一（多租户模型允许同人跨租户注册、同租户多用户共用同一手机/邮箱），
     * 故本方法<b>不</b>对 phone/email 做唯一性校验，仅保留"至少填一项"的业务约束。
     */
    @Transactional
    public int updateSelfInfo(User user, String callerId, String callerRole) {
        if (user == null || callerId == null || callerId.trim().isEmpty()) {
            throw new BusinessException("用户未登录或请求无效");
        }
        String userId = callerId.trim();
        User exist = userMapper.selectById(userId);
        if (exist == null) {
            return 0;
        }
        decryptUserFields(exist);

        String account = (user.getAccount() != null) ? user.getAccount().trim() : exist.getAccount();
        String name  = (user.getName()  != null) ? user.getName().trim()  : exist.getName();
        String phone = (user.getPhone() != null) ? user.getPhone().trim() : exist.getPhone();
        String email = (user.getEmail() != null) ? user.getEmail().trim() : exist.getEmail();

        // 手机/邮箱至少一项（与注册、管理面 updateInfo 同约束；合并后再校验，避免"只改姓名"被误拒）
        if ((phone == null || phone.isEmpty()) && (email == null || email.isEmpty())) {
            throw new BusinessException("手机号和电子邮箱至少填写一项");
        }

        // 账号：同值视为未改，跳过；异值须同租户内（排除自己）不重复。
        // account 是明文存储，uk_user_account_tenant(account,tenant_id) 仅按租户唯一；
        // 此处再做一次"排除自己"的二次校验防并发重复，DB 唯一索引作最后兜底。
        Long tenantId = exist.getTenantId();
        if (!account.equalsIgnoreCase(exist.getAccount())) {
            User clash = userMapper.getUserByAccount(account, tenantId);
            if (clash != null && !clash.getUserId().equals(userId)) {
                throw new BusinessException("该账号已被同租户其他用户占用");
            }
        }

        // 学员/教师专属字段：未传则保留原值（role/status/password/tenantId 不在此处处理）
        String learnGoal     = (user.getLearnGoal()     != null) ? user.getLearnGoal()     : exist.getLearnGoal();
        String languageLevel = (user.getLanguageLevel() != null) ? user.getLanguageLevel() : exist.getLanguageLevel();
        String qualification = (user.getQualification() != null) ? user.getQualification() : exist.getQualification();
        String languageType  = (user.getLanguageType()  != null) ? user.getLanguageType()  : exist.getLanguageType();

        return userMapper.updateSelfInfo(
                userId,
                account,
                cryptoUtil.encryptWithIndex(name),
                cryptoUtil.encryptWithIndex(phone),
                cryptoUtil.encryptWithIndex(email),
                learnGoal,
                languageLevel,
                qualification,
                languageType);
    }
   //TBD: test
    public List<User>   listByCondition(Map<String, Object> condition)
    {
        // 将 Map 条件转换为 UserQueryPage，复用 listByConditionAll + 内存模糊过滤
        UserQueryPage query = new UserQueryPage();
        if (condition.get("role") != null) query.setRole(String.valueOf(condition.get("role")));
        if (condition.get("status") != null) query.setStatus(String.valueOf(condition.get("status")));
        if (condition.get("userId") != null) query.setUserId(String.valueOf(condition.get("userId")));
        if (condition.get("name") != null) query.setName(String.valueOf(condition.get("name")));
        if (condition.get("account") != null) query.setAccount(String.valueOf(condition.get("account")));
        if (condition.get("email") != null) query.setEmail(String.valueOf(condition.get("email")));
        if (condition.get("phone") != null) query.setPhone(String.valueOf(condition.get("phone")));
        if (condition.get("tenantId") != null) query.setTenantId(Long.valueOf(String.valueOf(condition.get("tenantId"))));

        List<User> all = userMapper.listByConditionAll(query);
        decryptUserList(all);

        if (hasFuzzyCondition(query)) {
            List<User> filtered = new java.util.ArrayList<>();
            if (all != null) {
                for (User u : all) {
                    if (u != null && matchFuzzy(u, query)) {
                        filtered.add(u);
                    }
                }
            }
            return filtered;
        }
        return all;
    };
 
 
     public PageResult<User>   listByConditionPage(UserQueryPage query)
    {
        List <User> retList;
        int total;

        if (hasFuzzyCondition(query)) {
            // 含加密字段模糊条件：全量查询（仅按 role/status/userId），内存解密 + contains 过滤 + 手动分页
            List<User> all = userMapper.listByConditionAll(query);
            decryptUserList(all);
            List<User> filtered = new java.util.ArrayList<>();
            if (all != null) {
                for (User u : all) {
                    if (u != null && matchFuzzy(u, query)) {
                        filtered.add(u);
                    }
                }
            }
            total = filtered.size();
            int pageNum = query.getPageNum() == null ? 1 : query.getPageNum();
            int pageSize = query.getPageSize() == null ? 10 : query.getPageSize();
            int from = (pageNum - 1) * pageSize;
            int to = Math.min(from + pageSize, total);
            retList = (from < total) ? filtered.subList(from, to) : new java.util.ArrayList<>();
        } else {
            // 无加密字段模糊条件：SQL 层分页查询
            retList = userMapper.listByConditionPage(query); 
            decryptUserList(retList);
            total = userMapper.selectCountByContion(query);
        }

        // 删除密码字段 
        if (retList != null) {
            for (User user : retList) {
                if (user != null) {
                    user.setPassword(null); // 删除password
                }
            }
        }
 
        Page<User> page = new Page<>(query.getPageNum(), query.getPageSize());
        page.setRecords(retList);
        page.setTotal(total);
        PageResult<User> result = PageResult.of(page);
        return result;
    };

    /**
     * 平台管理员「用户管理」分页：跨租户查看 role=platform_admin/admin 两类账号。
     * 前提：调用方必须已是平台管理员（tenantId=0），此时 TenantLineInnerInterceptor.ignoreTable
     * 全表返回 true，本方法取到的是【全平台】user 数据，不含租户条件。
     *
     * 与通用 listByConditionPage 的区别：
     *  1) 只返回 platform_admin / admin 两种角色（列表需同时展示"平台管理员"与"租户管理员"）；
     *  2) 返回每行的 orgName（admin 所属租户机构名；platform_admin 无 sys_tenant，置空由前端显示「平台」）；
     *  3) account 由 SQL LIKE、name/email/phone 由内存解密后模糊匹配（沿用现有加密字段策略）。
     *
     * 分页在内存中完成（管理员账号数量级小，跨租户总量可控）。
     */
    public PageResult<User> platformAdminPage(UserQueryPage query) {
        // 请求体可能为空，给默认分页
        UserQueryPage sqlQ = new UserQueryPage();
        if (query != null) {
            sqlQ.setStatus(query.getStatus());
            sqlQ.setAccount(query.getAccount());
            sqlQ.setUserId(query.getUserId());
        }
        // SQL 层取全量候选（role 留给内存 IN 过滤，因为要同时命中 admin + platform_admin）
        List<User> all = userMapper.listByConditionAll(sqlQ);
        decryptUserList(all);

        List<User> filtered = new java.util.ArrayList<>();
        if (all != null) {
            for (User u : all) {
                if (u == null) continue;
                String r = u.getRole();
                if (!RoleConst.ADMIN.equals(r) && !RoleConst.PLATFORM_ADMIN.equals(r)) {
                    continue; // 只管理这两类管理员
                }
                if (query != null && matchAdminQuery(u, query)) {
                    filtered.add(u);
                }
            }
        }
        int total = filtered.size();
        int pageNum = (query == null || query.getPageNum() == null) ? 1 : query.getPageNum();
        int pageSize = (query == null || query.getPageSize() == null) ? 10 : query.getPageSize();
        int from = (pageNum - 1) * pageSize;
        int to = Math.min(from + pageSize, total);
        List<User> pageList = (from < total)
                ? new java.util.ArrayList<>(filtered.subList(from, to))
                : new java.util.ArrayList<>();

        // 删除密码 + 补公司名称
        for (User u : pageList) {
            if (u != null) u.setPassword(null);
        }
        fillOrgName(pageList);

        Page<User> page = new Page<>(pageNum, pageSize);
        page.setRecords(pageList);
        page.setTotal(total);
        return PageResult.of(page);
    }

    // admin 查询条件匹配：account 已在 SQL LIKE，这里补齐 name/email/phone 的内存模糊；status/userId 已在 SQL。
    // role：仅当请求方显式指定（全部/平台管理员/租户管理员）时收窄到该单角色。
    private boolean matchAdminQuery(User u, UserQueryPage q) {
        if (q.getRole() != null && !q.getRole().isEmpty()
                && !q.getRole().equals(u.getRole())) {
            return false;
        }
        if (q.getName() != null && !q.getName().isEmpty()) {
            if (u.getName() == null || !u.getName().contains(q.getName())) return false;
        }
        if (q.getEmail() != null && !q.getEmail().isEmpty()) {
            if (u.getEmail() == null || !u.getEmail().contains(q.getEmail())) return false;
        }
        if (q.getPhone() != null && !q.getPhone().isEmpty()) {
            if (u.getPhone() == null || !u.getPhone().contains(q.getPhone())) return false;
        }
        return true;
    }
    // 按 tenant_id 批量补 orgName：
    //   - tenantId>0            → sys_tenant.org_name（租户管理员所属机构）
    //   - tenantId==0(平台管理员) → 平台自身行的 org_name（tenant_code='platform'，公司名可在用户管理里编辑）
    private void fillOrgName(List<User> users) {
        if (users == null || users.isEmpty()) return;
        Tenant platformTenant = null;
        java.util.Map<Long, Tenant> tenantMap = new java.util.HashMap<>();
        try {
            for (Tenant t : tenantService.listAll()) {
                if (t == null || t.getId() == null) continue;
                tenantMap.put(t.getId(), t);
                if ("platform".equals(t.getTenantCode())) platformTenant = t;
            }
        } catch (Exception e) {
            log.warn("平台用户列表补机构名失败(忽略,仅影响公司列): {}", e.getMessage());
            return;
        }
        for (User u : users) {
            if (u == null) continue;
            Long tid = u.getTenantId();
            if (tid != null && tid > 0) {
                Tenant t = tenantMap.get(tid);
                if (t != null) u.setOrgName(t.getOrgName());
            } else {
                // tenant_id=0 平台管理员：映射到 tenant_code='platform' 的平台自身行
                if (platformTenant != null) u.setOrgName(platformTenant.getOrgName());
            }
        }
    }

    /**
     * 平台管理员「用户管理」修改某用户所属公司名称。
     *  - admin(tenant_id>0)：写入其所属 sys_tenant.org_name（会同步影响该租户全体用户与租户管理页展示的公司名）
     *  - platform_admin(tenant_id=0)：写入 tenant_code='platform' 平台自身行的 org_name
     * @return null 表示成功；否则为错误提示字符串
     */
    public String updateCompanyName(String userId, String companyName) {
        if (userId == null || userId.isBlank()) return "用户Id不能为空";
        if (companyName == null || companyName.isBlank()) return "公司名称不能为空";
        User user = userMapper.selectById(userId);
        if (user == null) return "用户不存在";
        Long tid = user.getTenantId();
        try {
            // 仅携带 id + orgName，updateTenant 内部走 tenantMapper.updateById（null 字段被 MyBatis-Plus 跳过），
            // 因此只更新 org_name，不触碰该租户的编码/状态/联系人等其它字段。
            Tenant patch = new Tenant();
            patch.setOrgName(companyName.trim());
            if (tid != null && tid > 0) {
                Tenant exist = tenantService.getById(tid);
                if (exist == null) return "该用户所属租户不存在";
                patch.setId(tid);
            } else {
                // tenant_id=0 平台管理员：公司名写入 tenant_code='platform' 的平台自身行
                Tenant platform = tenantService.getByCode("platform");
                if (platform == null) return "平台自身行不存在，请先初始化";
                patch.setId(platform.getId());
            }
            tenantService.updateTenant(patch);
            return null;
        } catch (Exception e) {
            log.warn("修改用户公司名失败: {}", e.getMessage(), e);
            return "保存失败：" + e.getMessage();
        }
    }
 

    public List<User> listByRole(String role) {
        List<User> users = userMapper.listByRole(role);
        if (users == null || users.isEmpty()) {
            log.debug("不存在【" + role + "】的用户");
        } else {
            decryptUserList(users);
        }
        return users;
    }

    /**
     * 消息中心「接收人解析」：根据 scope 返回可发送的目标用户列表（不含密码）。
     *  - tenant_admin   : 本租户(或平台管理员指定 tenantId)的租户管理员
     *  - platform_admin : 全部平台管理员
     *  - teachers       : 本租户(或指定租户)教师
     *  - students       : 本租户(或指定租户)学生
     *  - my_teachers    : 当前学生已约课的教师
     *  - my_students    : 当前教师已约课的学生
     * 调用方身份与租户均从 JWT 解析（不信任前端参数）；仅平台管理员可指定 tenantId 跨租户查询。
     */
    public Result<List<User>> messageRecipients(String scope, Long tenantId, String token) {
        if (scope == null || scope.trim().isEmpty()) return Result.fail(400, "scope 不能为空");
        String raw = (token != null && token.startsWith("Bearer ")) ? token.substring(7) : token;
        if (raw == null || raw.isEmpty() || !jwtUtil.verifyAccessToken(raw)) {
            return Result.fail(401, "未登录或令牌无效");
        }
        String curRole = jwtUtil.getRoleFromToken(raw);
        Long curTenant = jwtUtil.getTenantId(raw);
        String curUserId = jwtUtil.getUserIdFromToken(raw);
        List<User> result = resolveMessageRecipients(scope, tenantId, curRole, curTenant, curUserId);
        if (result == null) return Result.fail(400, "不支持的 scope: " + scope);
        return Result.success(result, "查询成功");
    }

    /**
     * 批量取用户摘要（userId → name[/account]），供消息中心「接收人列表」一次拿一页姓名。
     *
     * <p>存在的理由：消息中心存的是 userId（message-service 是独立库，拿不到主库用户），
     * 而既有能力只有单条的 {@code /user/name/{id}} 与只认单值的 {@code /user/list?userId=}，
     * 一页 20 个接收人就得 20 次请求。这里一次 IN 查询解决。
     *
     * <p>字段按角色收敛（与 /user/name 的口径一致）：管理员（admin / platform_admin）额外返回 account；
     * 学生 / 教师只返回 name —— 「按 userId 批量拿账号」若对普通角色开放，等于允许拿 userId 枚举他人登录账号。
     *
     * <p><b>orgName（所属公司）不按角色门控，一律返回</b>：它服务于「已发」详情的接收人列表——
     * 让发送方看清消息发到了哪家公司（平台管理员跨租户发信时尤其需要）。租户内发信时该值就是自己
     * 租户，不产生额外信息暴露；{@code tenant_id <= 0}（平台自身）无 sys_tenant 行，按既有约定
     * 返回固定文案「平台」。租户已删时返回空串，由前端省略不显示。
     *
     * <p>ids：逗号分隔，去空去重、上限 200（超出截断，避免被当成全量导出用）。
     * 查不到的用户**不回占位**，由前端按 userId 兜底展示。
     */
    public Result<List<Map<String, Object>>> userBriefs(String ids, String token) {
        String raw = (token != null && token.startsWith("Bearer ")) ? token.substring(7) : token;
        if (raw == null || raw.isEmpty() || !jwtUtil.verifyAccessToken(raw)) {
            return Result.fail(401, "未登录或令牌无效");
        }
        String curRole = jwtUtil.getRoleFromToken(raw);
        boolean withAccount = RoleConst.ADMIN.equals(curRole) || RoleConst.PLATFORM_ADMIN.equals(curRole);

        List<String> idList = new java.util.ArrayList<>();
        if (ids != null) {
            for (String s : ids.split(",")) {
                String v = s.trim();
                if (!v.isEmpty() && !idList.contains(v)) idList.add(v);
                if (idList.size() >= 200) break;
            }
        }
        List<Map<String, Object>> out = new java.util.ArrayList<>();
        if (idList.isEmpty()) return Result.success(out, "查询成功");

        // 租户拦截器会自动追加 tenant_id（平台管理员 tenantId=0 时短路为全量），无需手工隔离
        List<User> users = userMapper.selectBatchIds(idList);
        if (users != null) {
            // 补机构名：tenant_id>0 → sys_tenant.org_name（租户已删则为 null → 出空串）。
            // fillOrgName 对 tenant_id<=0 会填 platform 行的 org_name，但简报口径要的是固定「平台」，
            // 故下面按 tenant_id 判、不走它填的值（详见下方 orgName 的赋值）。
            fillOrgName(users);
            for (User u : users) {
                if (u == null) continue;
                decryptUserFields(u);   // name 入库加密，必须解密
                Map<String, Object> brief = new java.util.HashMap<>();
                brief.put("userId", u.getUserId());
                brief.put("name", u.getName());
                if (withAccount) brief.put("account", cryptoUtil.decrypt(u.getAccount()));
                // 公司名一律回（不按角色门控）：它用于「已发」详情的接收人列表，
                // 让发送方看清这条消息发到了哪家公司；租户内发信时公司名就是自己，不构成额外暴露。
                Long tid = u.getTenantId();
                brief.put("orgName", (tid != null && tid > 0)
                        ? (u.getOrgName() == null ? "" : u.getOrgName())
                        : "平台");   // 平台自身无对应 sys_tenant 行，按既有约定显示「平台」
                out.add(brief);
            }
        }
        return Result.success(out, "查询成功");
    }

    /**
     * 内部「接收人解析」（不走 HTTP、不校验令牌），供消息自动发送复用。
     * 身份参数由调用方显式传入：curRole/curTenant/curUserId 为「当前操作者」，
     * tenantId 仅在平台管理员跨租户查询时生效（effectiveTenant=tenantId）。
     * 返回不含密码的用户列表；不支持的 scope 返回 null。
     */
    public List<User> resolveMessageRecipients(String scope, Long tenantId, String curRole, Long curTenant, String curUserId) {
        if (scope == null || scope.trim().isEmpty()) return null;
        boolean isPlatform = RoleConst.PLATFORM_ADMIN.equals(curRole);
        Long effectiveTenant = (isPlatform && tenantId != null) ? tenantId : curTenant;
        List<User> result = new java.util.ArrayList<>();
        switch (scope) {
            case "platform_admin":
                result = userMapper.listByRoleIgnoreTenant(RoleConst.PLATFORM_ADMIN);
                break;
            case "tenant_admin":
                for (User u : userMapper.listByRoleIgnoreTenant(RoleConst.ADMIN)) {
                    if (effectiveTenant == null || (u.getTenantId() != null && u.getTenantId().equals(effectiveTenant))) result.add(u);
                }
                break;
            case "teachers":
                for (User u : userMapper.listByRoleIgnoreTenant(RoleConst.TEACHER)) {
                    if (effectiveTenant == null || (u.getTenantId() != null && u.getTenantId().equals(effectiveTenant))) result.add(u);
                }
                break;
            case "students":
                for (User u : userMapper.listByRoleIgnoreTenant(RoleConst.STUDENT)) {
                    if (effectiveTenant == null || (u.getTenantId() != null && u.getTenantId().equals(effectiveTenant))) result.add(u);
                }
                break;
            case "my_teachers":
                if (RoleConst.STUDENT.equals(curRole) && curUserId != null) {
                    result = resolveByIds(bookingMapper.selectTeacherIdsByStudent(curUserId, curTenant));
                }
                break;
            case "my_students":
                if (RoleConst.TEACHER.equals(curRole) && curUserId != null) {
                    result = resolveByIds(bookingMapper.selectStudentIdsByTeacher(curUserId, curTenant));
                }
                break;
            default:
                return null;
        }
        if (result == null) result = new java.util.ArrayList<>();
        // 接收人列表须解密敏感字段（name 入库时加密；account 虽明文存储，decrypt 容错降级不影响）
        for (User u : result) {
            u.setPassword(null);
            decryptUserFields(u);
            u.setAccount(cryptoUtil.decrypt(u.getAccount()));
        }
        return result;
    }

    private List<User> resolveByIds(List<String> ids) {
        List<User> us = new java.util.ArrayList<>();
        if (ids == null || ids.isEmpty()) return us;
        for (String id : ids) {
            if (id == null || id.isBlank()) continue;
            User u = userMapper.selectById(id);
            if (u != null) us.add(u);
        }
        return us;
    }


    /**
     * 检查账号（手机号或邮箱）是否已注册
     * @param account 用户账号（手机号或邮箱）
     * @return 是否已存在
     */
    public boolean existAccount(String account, Long tenantId) {
        if (account == null || account.trim().isEmpty()) {
            return false;
        }
        User user = userMapper.getUserByAccount(account, tenantId);
        // 判断账号是手机号还是邮箱
        // 预留：按联系方式查重时，同一手机号/邮箱可对应多个账号（一对多，见 List<User> 返回约定），
        // 故以下取首个匹配即可；当前 existAccount 仍按 account 精确查重，本分支暂未启用。
      /*   List<User> matched;
        if (account.contains("@")) {
            matched = selectByEmail(account);
        } else {
            matched = selectByPhone(account);
        }
        user = (matched == null || matched.isEmpty()) ? null : matched.get(0); 
        */
        return user != null;
    }
    /**
     * 统计截至某一天指定角色的用户数量
     * @param role 用户角色（如 "teacher", "student"）
     * @param dateTime 截止时间（含，LocalDateTime）
     * @return 截止该时间点的累计指定角色用户数
     */
    public  Integer   countByRoleAtDate(String role, java.time.LocalDateTime dateTime) {
        if (role == null || dateTime == null) {
            return 0;
        }
        // 由于数据库类型、时间字段名不确定，这里假设有create_time字段记录注册时间
        // Mapper 需提供 countByRoleAtDate(role, datetime)
        // 将 LocalDateTime 转换为 java.util.Date 以兼容常用 MyBatis Mapper
        java.util.Date until = java.sql.Timestamp.valueOf(dateTime);
        return userMapper.countByRoleAtDate(role, until);
    }

} 
/*
只检查login的问题，数据库中没有账号，却没有捕捉到异常
2 、注册没有成功
错误分析：
异常 `org.apache.ibatis.binding.BindingException: Invalid bound statement (not found): com.reservation.mapper.UserMapper.selectByPhone` 表示 MyBatis 在运行时没有找到 `UserMapper` 接口的 `selectByPhone` 方法在 XML 中的 SQL 映射。原因可能如下：

1. XML 映射文件（UserMapper.xml）中未正确声明或注册该方法。须检查 `<select id="selectByPhone"` ...> 标签。
2. Mapper 接口和 XML 中方法名字、参数、namespace是否完全匹配。namespace 必须为 `com.reservation.mapper.UserMapper`，方法 id 必须为 `selectByPhone`。
3. XML 文件位置和命名需与 MyBatis 配置一致，确保已被正确扫描。
4. 某些 MyBatis 配置或拼写错误导致 XML 文件未加载。

解决方法：
- 确认 `UserMapper.xml` 文件内容无误且已在 resource 路径下（通常为 `src/main/resources/mybatis/mapper/UserMapper.xml`）。
- `<mapper namespace="com.reservation.mapper.UserMapper">` 正确。
- 有如下内容：
    <select id="selectByPhone" parameterType="String" resultMap="userResultMap">
        SELECT * FROM `user` WHERE phone = #{phone}
    </select>
- 若注解和 XML 同时配置，推荐优先用其中之一（避免混用）。
- 检查配置文件（如 application.yml/properties）的 mybatis.mapper-locations 路径是否正确指向 mapper 文件夹。

结论：
此错误通常是 XML 路径、namespace、方法名未匹配或 XML 未加载导致的。
*/
/**
 * 使用 MyBatis 时，既可以只用 Mapper 的 Java 接口+注解（直接在接口方法上用 @Select、@Insert 等注解编写 SQL），
 * 也可以只用 Java 接口 + XML（把 SQL 写到 XML 配置文件里），
 * 但推荐写 XML，便于维护和复杂 SQL。
 * 
 * 一般情况下：
 * - 如果在 Java 接口方法中使用注解（如 @Select），可以不用对应的 XML 文件。
 * - 如果在 XML 文件中写了 SQL（如 <select>），Java 接口方法只需要声明，无需注解，必须要有与 XML 对应的方法名和参数。
 * 
 * 不能单独只有 Java 接口而无任何 SQL 来源（注解或 XML），也不能只有 XML 而没有 Java 接口。
 * 
 * 生产中建议分离 SQL 和代码逻辑，把 SQL 都写在 XML 文件里，Java 方法和 XML 方法保持一致。
 * 
 * 结论：只要有注解SQL或XML SQL其一即可。但都需有 Java Mapper 接口类。
 */
/**
 * MyBatis 的 Java Mapper 接口（如 UserMapper.java）通常放在 `src/main/java/` 下对应的包中，
 * 推荐的目录结构为：
 *   src/main/java/com/yourcompany/project/mapper/
 * 
 * 也就是和 entity（实体）、service、controller 等并列，比如：
 *   com.reservation.mapper.UserMapper (即 /src/main/java/com/reservation/mapper/UserMapper.java)
 * 
 * 保证和 XML Mapper 文件的 namespace 属性 (`namespace="com.reservation.mapper.UserMapper"`) 保持一致。
 * 
 * XML 文件则一般放在：
 *   src/main/resources/mybatis/mapper/UserMapper.xml
 */