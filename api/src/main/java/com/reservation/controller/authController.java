package  com.reservation.controller;

import com.reservation.dto.LoginDTO;
import  com.reservation.dto.RefreshDTO;
import com.reservation.dto.RefreshTokenPO;
import com.reservation.dto.TokenDTO;
import com.reservation.dto.WeChatCodeDTO;
import com.reservation.dto.WeChatRegisterDTO;
import com.reservation.dto.WeChatSession;

import com.reservation.common.Result;
import com.reservation.common.RoleConst;
import com.reservation.common.GuardVerdict;
import com.reservation.entity.User;
import com.reservation.mapper.UserMapper;
import com.reservation.service.LoginGuardService;
import com.reservation.service.LoginChallengeService;
import com.reservation.service.UserService;
import com.reservation.service.RefreshTokenService;
import com.reservation.service.UserSessionService;
import com.reservation.service.WeChatService;

 import com.reservation.utils.ClientIpResolver;
import com.reservation.utils.JwtUtil;
import com.reservation.utils.PermissionCheck;
import com.reservation.audit.Audit;
import com.reservation.audit.AuditAction;

import com.reservation.entity.Tenant;
import com.reservation.service.TenantService;
import com.reservation.utils.TenantContext;

 import jakarta.validation.constraints.NotBlank;
import org.springframework.beans.factory.annotation.Autowired;
 import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
 import org.springframework.security.core.authority.SimpleGrantedAuthority;
 import org.springframework.security.core.context.SecurityContextHolder;
 import org.springframework.validation.annotation.Validated;
// 核心导入：RequestMethod 所在包
 import org.springframework.web.bind.annotation.*; 
 import jakarta.validation.constraints.Pattern;
 import java.util.Collections;
import java.util.HashMap; 
import lombok.extern.slf4j.Slf4j;
 /**
     * 用户登录接口，对应设计2.2.1 接口：/api/v1/user/login
     * TBD：在线状态online：yes/no 
          * 功能说明：
          * 1. 用户登录接口，接收用户提交的账号(account)和密码(password)信息。
          * 2. 调用 UserService.login(account, password) 完成账户密码校验、用户状态检查（冻结/未审核）、Token/refreshToken 生成、Token 持久化等核心登录流程。
          * 3. 登录成功后，封装 Spring Security 所需 UsernamePasswordAuthenticationToken，对认证信息（角色权限等）进行安全上下文设置，实现后续接口的身份感知和权限控制。
          * 4. controller 至此已将核心安全信息写入 Spring Security 上下文，实现与前端登录流程的状态同步。
          *
          * 原理解析：
          * - 前后端分离应用采用 Token 鉴权，登录接口返回 accessToken 和 refreshToken，accessToken 短时用于资源访问，refreshToken 支持免登刷新。
          * - 控制层主动生成 Spring Security 认证对象（含角色/权限），写入全局安全上下文，解决 token 场景下无 session/用户态的问题，为后续接口自动注入当前用户凭据。
          * - 支持多端、token机制下的灵活身份自动识别和权限管控，是现代前后端分离项目的安全核心做法。
          */

 @RestController
@RequestMapping("/api/v1/auth")
@Validated
@Slf4j
public class authController {

    /**
     * 平台管理员登录时使用的固定租户编码。
     *
     * <p><b>它是登录标识词，不是真实租户的 tenant_code</b>（2026-10-24 按真库校正）：
     * {@code sys_tenant} 里**确实存在** {@code tenant_code='platform'} 那一行 ——
     * 但它是平台自身的**展示行**（{@code UserService.fillOrgName} 靠它给平台账号回显"所属公司"），
     * 不是经营租户。两者同名不同义，混用就会让"平台"变成一行可被注册、可被停用、
     * 可被抢首管理员的数据。故本常量只参与"角色配对判定 + 强制 tenantId=0"，
     * 绝不用它去 {@code tenantService.getByCode} 解析租户（见下方 else 分支的显式拒绝）。
     * 设计取舍见 doc-develop/技术方案-保留字platform的租户语义.md
     */
    private static final String PLATFORM_TENANT_CODE = "platform";

     @Autowired
    private TenantService tenantService;
    @Autowired
    private UserService userService;
    @Autowired
    private UserMapper userMapper;   // ← 新增：refreshToken 查 role 时用（忽略租户插件）
     @Autowired
     private RefreshTokenService refreshTokenService;
     @Autowired
     private UserSessionService userSessionService;
    @Autowired
    private JwtUtil jwtUtil;
    @Autowired
    private PermissionCheck permissionCheck;
    @Autowired
    private WeChatService weChatService;
    @Autowired
    private LoginGuardService loginGuardService;
    @Autowired
    private LoginChallengeService loginChallengeService;
      @PostMapping("/login")
    @Audit(action = AuditAction.USER_LOGIN, resourceType = "user")
    @ResponseBody
    public Result  <HashMap<String, Object>>  toLogin( @Validated @RequestBody LoginDTO userdto,
                                                      jakarta.servlet.http.HttpServletRequest request){
             String account = userdto.getAccount();
             String password = userdto.getPassword(); 
             String tenantCode = userdto.getTenantCode();
             String role = userdto.getRole();
             Long tenantId;

            // ================= 登录风控：频率闸 + 风险评分 + 人机挑战（P0/P1） =================
            // 放在最前面，连"租户编码是否存在"的查询都不做——那本身就是一次 DB 往返，
            // 被批量打时先省掉它。
            //
            // 三态处理：
            //   ① 判定通过 → 正常登录
            //   ② 判定要挑战，且本次带了有效挑战答案 → 视为通过（人已证明自己是人），继续登录
            //   ③ 判定要挑战，未带或答案无效 → 下发题目，返回 code=1002（HTTP 200）
            // 超限绝不用 403：两端拦截器都把 403 当"权限不足"，历史上踩过 403 触发刷新无限循环。
            GuardVerdict guard = loginGuardService.evaluate(request, account, tenantCode,
                    userdto.getDeviceId(), Boolean.TRUE.equals(userdto.getEmuFlag()));

            // ★ 挑战票据「无条件先验」（2026-10-24 方案 A）
            //
            // 改前这一整段套在 if (guard.blocked()) 里面：只要守卫在这一跳没命中，答案就根本不看。
            // 而守卫在"带答案的那一跳"天然容易不命中——旧版评分顺手刷了设备档案
            // （见 LoginGuardService#scoreOnly 的说明），于是"滑块拖歪 → 重试 → 守卫放过 → 直接登录"，
            // 挑战形同装饰。库里 10 张票据 used=0 且 fail_count=0（校验一次都没跑过）就是这个形状。
            //
            // 现在的判据改为「请求带了票据就必须验过」：票据是上一次 code=1002 下发的一次性凭证，
            // 客户端只在收到 1002 后才会带它，所以对正常登录零影响。
            // 顺序也刻意是"先验票据、再看守卫"：票据是确定的事实，守卫是推断。
            boolean challengeOk = false;
            boolean hasTicket = userdto.getChallengeId() != null && !userdto.getChallengeId().isBlank();
            if (hasTicket) {
                challengeOk = loginChallengeService.verify(
                        userdto.getChallengeId(),
                        loginGuardService.subjectOf(account),
                        userdto.getMoveX(), userdto.getTrackPoints(), userdto.getCostMs());
                if (!challengeOk) {
                    HashMap<String, Object> reissued =
                            buildChallengeData(loginGuardService.subjectOf(account));
                    if (reissued == null) {
                        // 可用性优先：票据验不过又给不出新题，只能放行——
                        // 否则用户会因为"验证组件自己坏了"被永久挡在门外。
                        log.warn("挑战校验未通过但出题失败，本次降级放行, guard={}", guard.reason());
                        challengeOk = true;
                    } else {
                        return Result.fail(Result.CODE_NEED_CHALLENGE,
                                "验证未通过，请重新完成安全验证", reissued);
                    }
                }
            }

            // 守卫命中且本次没有通过挑战 → 出题
            if (guard.blocked() && !challengeOk) {
                HashMap<String, Object> challengeData =
                        buildChallengeData(loginGuardService.subjectOf(account));
                if (challengeData == null) {
                    // ★ 出题失败（图片生成/落库异常）→ 降级放行。
                    // 要求验证却给不出题目，等于把用户永久挡在门外，比"少验一次"严重得多。
                    log.warn("登录风控要求挑战但出题失败，本次降级放行, guard={}", guard.reason());
                } else {
                    return Result.fail(Result.CODE_NEED_CHALLENGE, "请完成安全验证", challengeData);
                }
            }

            // 平台管理员登录：tenantCode 传固定值 "platform"，角色用 RoleConst.PLATFORM_ADMIN
        if (PLATFORM_TENANT_CODE.equals(tenantCode)) {
            if (RoleConst.PLATFORM_ADMIN.equals(role)) {
                tenantId = 0L;
            } else {
                // ★ 方案 B 收口②（2026-10-24）：platform 是保留字，只能与 platform_admin 配对。
                //   改前这里会静默落到 else 分支，用 tenantService.getByCode("platform") 解析到
                //   平台自身的展示行，再拿那个 id 去 login：只要库里有账号能匹配上，
                //   token 就签出来了；但前端 guardEntryPage → isRoleTenantCodeMatch 会因
                //   "非 platform_admin 的 tCode 不得为 platform" 把人踢回登录页 ——
                //   形成"能拿到 token、任何页面都进不去"的幽灵态，比直接报错难排查得多。
                //   措辞不复用"账号或密码不正确"：此处拒绝的是**租户编码本身**，
                //   与账号是否存在无关，不存在账号枚举风险。
                log.warn("登录被拒(保留字租户编码配了非平台角色), 编码={}, 角色={}", tenantCode, role);
                return Result.fail(403, "该租户编码为系统保留，仅平台管理员可用");
            }
        } else {
            // 租户端登录：先校验租户状态。
            // 必须同时校验软删除与停用，否则已删除的租户仍能登录；
            // status 为 Integer 与字面量比较有 NPE 风险，改用 Integer.valueOf 判空
            Tenant tenant = tenantService.getByCode(tenantCode);
            boolean invalid = tenant == null
                    || (tenant.getDeleted() != null && tenant.getDeleted() == 1)
                    || !Integer.valueOf(1).equals(tenant.getStatus());
            if (invalid) {
                return Result.fail(403, "租户编码无效或已停用");
            }
            // 校验租户端用户状态

            tenantId = tenant.getId();
          }

        // 调用服务层实现登录逻辑，返回userId、name，role、account、Token,freshToken（对应设计2.2.1 登录返回数据）
        Result<HashMap<String, Object>> rst= userService.login( account, password, tenantId); //setOnline(false)
        // 3. 登录成功：设置安全状态（核心步骤） ?token?
        // 封装用户认证信息（角色需和数据库一致，如teacher/student）
        UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken( 
            account, // 用户名（可用邮箱/手机号）
            password, // 密码（可传null，不影响验证）
            Collections.singletonList(new SimpleGrantedAuthority("ROLE_" + role)) // 角色（必须加ROLE_前缀）
        );//TBD :tenantid 是否需要传入

        // 将认证信息存入安全上下文（自动维护会话，无需手动管理）
        SecurityContextHolder.getContext().setAuthentication(authentication); 
        // ★ 设备档案只在登录成功后落痕（2026-10-24 方案 C）
        //   ① 评分链路保持只读，重放请求才会拿到同样的风险分、挑战才会真的被执行；
        //   ② 密码错误的请求不再污染档案（改前用错密码也会把 last_subject 刷成被尝试的账号，
        //      等于替攻击者抹掉"这台设备换过身份"的痕迹）。
        //   本方法内部整段吞异常：此时登录已经成功，档案写失败最多让下次多弹一次滑块，
        //   绝不能反过来把成功改成失败。
        if (rst != null && rst.getCode() == 200) {
            loginGuardService.recordDeviceAfterLogin(
                    loginGuardService.subjectOf(account),
                    userdto.getDeviceId(),
                    ClientIpResolver.resolve(request),
                    Boolean.TRUE.equals(userdto.getEmuFlag()));
        }
        // 4. 返回登录成功结果（包含token）
        return rst;//Result.success(resultMap, "登录成功");
    }

    /**
     * 出题并打包成前端可直接渲染的 data（2026-10-22 P1）。
     *
     * <p>这里刻意**不新增 {@code /auth/challenge} 出题端点**：题目直接内嵌在
     * {@code code=1002} 的 data 里返回。
     * 少一个免登录端点 = 少一个攻击面，也少一处"四处白名单同步"（SecurityConfig /
     * JwtAuthenticationFilter / TenantInterceptor / check-authz），后者漏一处就是线上 401。
     *
     * @return 出题成功返回可下发的 data；失败返回 {@code null}，调用方必须降级放行
     */
    private HashMap<String, Object> buildChallengeData(String subject) {
        com.reservation.dto.ChallengeVO vo = loginChallengeService.issueOrNull(subject, "login");
        if (vo == null) {
            return null;
        }
        HashMap<String, Object> data = new HashMap<>();
        data.put("challengeId", vo.getChallengeId());
        data.put("scene", vo.getScene());
        data.put("bgImage", vo.getBgImage());
        data.put("pieceImage", vo.getPieceImage());
        // ★ 只给 Y：横坐标留在服务端票据里，下发就等于把答案抄给前端
        data.put("pieceY", vo.getPieceY());
        data.put("pieceSize", vo.getPieceSize());
        data.put("bgWidth", vo.getBgWidth());
        data.put("bgHeight", vo.getBgHeight());
        data.put("expireIn", vo.getExpireIn());
        data.put("tolerance", vo.getTolerance());
        return data;
    }
 /**
     * 无感刷新AccessToken核心接口
     *
     * 【2026-10-28 安全加固】修了三个 P0 问题：
     *
     *   ① NPE：原来 tenantId = jwtUtil.getCurrentTenantId() 从 SecurityContext 取，
     *          但 refreshToken 在白名单里不走 Spring Security 拦截 → SecurityContext 空 → NPE。
     *          修复：直接从 refresh token 的 JWT claims 里解 tenantId。
     *
     *   ② 提权漏洞：原来 role 来自前端 RefreshDTO.role，攻击者传 platform_admin 就直接拿到
     *          平台管理员 access token。修复：**完全忽略前端传的 account/role**，
     *          role 从 user 表按 userId 实时查（用户被提权/降级/冻结即时生效）。
     *
     *   ③ token 类型混淆：原来不校验传入的 token 是不是真 refresh token。修复：
     *          JWT claims 里加 type: refresh，refreshToken 接口校验 type === "refresh"，
     *          access token 即使在 DB 表里碰巧有记录也会被拒。
     */
    @PostMapping("/refreshToken")
    public Result<TokenDTO> refreshToken(@RequestBody RefreshDTO refreshDTO) {
        String oldRefreshToken = refreshDTO.getRefreshToken();
        if (oldRefreshToken == null || oldRefreshToken.isBlank()) {
            return Result.fail(401, "刷新凭证为空");
        }

        // ── ③ 校验 JWT type claim = "refresh" ──────────────────────────────────
        if (!jwtUtil.isTokenOfType(oldRefreshToken, "refresh")) {
            log.warn("[refreshToken] 传入的 token type 不是 refresh（可能是 access token 或伪造）");
            return Result.fail(401, "刷新凭证无效");
        }

        // ── ① 从 refresh token 自己解 userId + tenantId ────────────────────────
        String userId;
        Long tenantId;
        try {
            userId = jwtUtil.getUserIdFromToken(oldRefreshToken);
            tenantId = jwtUtil.getTenantId(oldRefreshToken);
        } catch (Exception e) {
            log.warn("[refreshToken] refresh token 解析失败: {}", e.getMessage());
            return Result.fail(401, "刷新凭证无效，请重新登录");
        }

        // ── 校验 DB 里凭证确实存在、未过期 ──────────────────────────────────────
        RefreshTokenPO tokenPo = refreshTokenService.checkValidToken(oldRefreshToken);
        if (tokenPo == null) {
            log.info("[refreshToken] DB 中找不到有效 refresh token, userId={}", userId);
            return Result.fail(401, "刷新凭证已失效，请重新登录");
        }

        // 二次一致性校验：JWT 里解出来的 userId 必须和 DB 存的对得上
        if (!userId.equals(tokenPo.getUserId())) {
            log.warn("[refreshToken] JWT userId 与 DB 不一致，可能被篡改");
            return Result.fail(401, "刷新凭证无效");
        }

        // ── ② 从 user 表实时查 role，完全忽略前端传的 role/account ──────────────
        String role;
        try {
            // 必须用 mapper 的 NoTenant 版本——selectById 会被租户插件拼 tenant_id 条件
            User u = userMapper.getByUserIdNoTenant(userId);
            if (u == null) {
                log.warn("[refreshToken] userId={} 在 user 表已不存在", userId);
                return Result.fail(401, "账号已被删除，请重新注册");
            }
            if ("frozen".equals(u.getStatus())) {
                log.info("[refreshToken] userId={} 已冻结，拒绝刷新", userId);
                return Result.fail(401, "账号已被冻结，请联系管理员");
            }
            role = u.getRole();
        } catch (Exception e) {
            log.error("[refreshToken] 查询用户 role 失败, userId={}", userId, e);
            return Result.fail(500, "服务异常，请稍后重试");
        }

        // ── 生成新双 Token ───────────────────────────────────────────────────────
        String newAccess = jwtUtil.generateToken(tenantId, userId, role);
        String newRefresh = jwtUtil.generateRefreshToken(tenantId, userId);

        // ── 轮换：删旧、存新（旧 refresh token 立即失效） ──────────────────────
        refreshTokenService.removeOldToken(oldRefreshToken);
        refreshTokenService.saveNewToken(userId, newRefresh, jwtUtil.getRefreshExpireTime());

        // ── 写入 Spring Security 上下文（给本次请求链路其他组件用） ──────────────
        UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                userId,
                null,
                Collections.singletonList(new SimpleGrantedAuthority("ROLE_" + role))
        );
        SecurityContextHolder.getContext().setAuthentication(authentication);

        TokenDTO dto = new TokenDTO();
        dto.setToken(newAccess);
        dto.setRefreshToken(newRefresh);
        log.info("[refreshToken] 刷新成功, userId={}, tenantId={}, role={}", userId, tenantId, role);
        return Result.success(dto, "刷新成功");
    } 

  /**
     * 用户主动登出，销毁当前刷新凭证
     */
    @PostMapping("/logout")
    @Audit(action = AuditAction.USER_LOGOUT, resourceType = "user")
    public Result<Boolean> logout(@RequestBody RefreshDTO refreshDTO,
                                  @RequestHeader(value = "Authorization", required = false) String token) {
      // 1. 清空认证
    SecurityContextHolder.clearContext();
/*
    // 2. 清除 Cookie（真正登出）
    Cookie cookie = new Cookie("token", null);
    cookie.setPath("/");
    cookie.setHttpOnly(true);
    cookie.setMaxAge(0);
    response.addCookie(cookie);*/
        refreshTokenService.logout(refreshDTO.getRefreshToken());
        // 结束登录会话（在线统计，会话ID由访问Token派生，非刷新Token）
        userSessionService.onLogout(token);
        return Result.success(true,"ok" );
    }

    /**
     * 后台管理：强制踢出指定用户（删除该用户全部刷新凭证）
     * 调用后该用户所有页面401自动跳转登录
     */
    @DeleteMapping("/kick/{userId}")
    @Audit(action = AuditAction.ADMIN_FORCE_LOGOUT, resourceType = "user", resourceId = "userId")
    public Result <Object> kickUser(@PathVariable String userId) {
        int count = refreshTokenService.kickUser(userId);
        // 3. 刷新页面提示
        log.debug("controller kick: "+count) ;
        if(count  !=0 )
        return Result.success( true,"ok"     );
        else  return  Result.success( false,"kick failed"     );
    }


    /**
     * 微信静默登录（免登录公开接口，不带 Bearer）。
     *
     * <p>小程序 {@code wx.login()} 拿 code → 后端 {@code code2Session} 换 openid →
     * 按 openid 找已绑定账号发 token。返回结构与 {@code /login} 完全一致。
     *
     * <p><b>2026-10-13 解除屏蔽</b>：原实现按 {@code user.wx_openid} 列查，而该列并不存在
     * （老方案 {@code ALTER TABLE user ADD wx_openid} 从未执行，故于 2026-09-20 屏蔽）。
     * 现改为独立的 {@code wx_userid} 表，<b>user 表零改动</b>。
     */
    @PostMapping("/wechat-login")
    @ResponseBody
    public Result<HashMap<String, Object>> wechatLogin(@Validated @RequestBody WeChatCodeDTO dto,
                                                       jakarta.servlet.http.HttpServletRequest request) {
        // ============ 频率闸（2026-10-24 Phase A：只限流，不出题） ============
        // ★ 位置必须在 code2Session 之前：那是一次**对外 HTTPS 调用**（打到微信服务器），
        //   是全链路里最贵的一步。批量请求若先换 openid 再限流，攻击者已经消耗掉了服务端资源。
        // ★ subject 传 null（只用 IP 维度），原因：openid 要 code2Session 之后才知道，
        //   而这里恰恰是为了"在换 openid 之前"拦住。openid 维度的边际价值也很低 ——
        //   机器人会轮流用不同微信，真正卡住批量的是 IP 与租户维度。
        // ★ 只做限流、不做评分、不下发 challenge：本端点由小程序静默调用
        //   （core/auth.js 用 customErrorMsg:false + try/catch），没有任何 UI 能承载滑块。
        //   若这里返回 code=1002，小程序只会当成失败并降级到密码表单，等于把静默登录打断。
        //   滑块方案见 Phase B（待办：需同时改 core/auth.js 与 pages/login/login.js）。
        GuardVerdict wxGuard = loginGuardService.evaluateRateOnly(request, null, null);
        if (wxGuard.needChallenge()) {
            // 用 1001 而非 400/403：1001 是本端点既有的"微信侧不可用，请静默降级"语义，
            // 小程序据此继续显示密码登录表单；403 会被两端拦截器当权限不足处理（历史踩过刷新死循环）。
            return Result.fail(1001, "微信登录请求过于频繁，请稍后再试或使用账号密码登录");
        }

        WeChatSession session = weChatService.code2Session(dto.getCode());
        if (session.getOpenid() == null) {
            // 用 1001（而非 401）返回：避免触发小程序 request.js 的 onAuthFail 重定向把用户踢回登录页；
            // 此处只是"微信不可用/未配置"，应静默降级走账号密码登录。
            return Result.fail(1001, "微信登录失败：" + (session.getErrmsg() == null ? "未知错误" : session.getErrmsg()));
        }
        return userService.wechatLogin(session.getOpenid(), session.getUnionid());
    }

    /**
     * 绑定微信（需登录：带当前会话 Bearer）。
     * 密码登录成功后调用，把当前账号与微信 openid 绑定，下次即可静默登录。
     */
    @PostMapping("/bind-wechat")
    @ResponseBody
    public Result<Boolean> bindWechat(@Validated @RequestBody WeChatCodeDTO dto,
                                      @RequestHeader(value = "Authorization", required = false) String token) {
        if (token == null || !token.startsWith("Bearer ")) {
            return Result.unauthorized("请先登录");
        }
        String userId;
        try {
            userId = jwtUtil.getUserIdFromToken(token);
        } catch (Exception e) {
            return Result.unauthorized("登录已过期，请重新登录");
        }
        WeChatSession session = weChatService.code2Session(dto.getCode());
        if (session.getOpenid() == null) {
            // 用 400（而非 401）返回：绑定是已登录态操作，401 会让小程序触发刷新/踢登录页，反而把已登录用户踢出。
            return Result.fail(400, "微信授权失败：" + (session.getErrmsg() == null ? "未知错误" : session.getErrmsg()));
        }
        return userService.bindWechat(userId, session.getOpenid(), session.getUnionid());
    }

    /**
     * 微信直接注册（场景 C，免登录公开接口）：新用户扫码即注册，无需填写任何信息。
     *
     * <p>入参带 {@code tenantCode}（来自推广/分享链接的 tcode），角色限 student / teacher，
     * 注册后 {@code status=pending} 需租户管理员审批。
     */
    @PostMapping("/wechat-register")
    @ResponseBody
    public Result<HashMap<String, Object>> wechatRegister(@Validated @RequestBody WeChatRegisterDTO dto,
                                                          jakarta.servlet.http.HttpServletRequest request) {
        // ============ 频率闸（2026-10-24 Phase A：只限流，不出题） ============
        // 同为写操作 + 对外调微信接口，闸门放在 code2Session 之前，理由见 wechatLogin。
        // 带 tenantCode 维度：扫码注册必须携带租户码，多一个维度就多一层批量建号的门槛。
        // （tenantCode 由客户端提供、可轮换，因此它不是可靠维度，IP 维度才是主力；
        //   同一微信重复注册已在 UserService.wechatRegister 用 findByIdentity 判 409 挡住。）
        GuardVerdict regGuard = loginGuardService.evaluateRateOnly(request, null, dto.getTenantCode());
        if (regGuard.needChallenge()) {
            return Result.fail(1001, "注册请求过于频繁，请稍后再试");
        }

        WeChatSession session = weChatService.code2Session(dto.getCode());
        if (session.getOpenid() == null) {
            // 同 /wechat-login：用 1001 而非 401，让前端静默降级而不是被踢回登录页
            return Result.fail(1001, "微信授权失败：" + (session.getErrmsg() == null ? "未知错误" : session.getErrmsg()));
        }
        return userService.wechatRegister(session.getOpenid(), session.getUnionid(), dto.getTenantCode(), dto.getRole());
    }

    /**
     * 查询当前账号的微信绑定状态（需登录，web 端「微信绑定」菜单用）。
     * 只回 bound / bindSource，不回 openid。
     */
    @GetMapping("/wechat-status")
    @ResponseBody
    public Result<HashMap<String, Object>> wechatStatus(@RequestHeader(value = "Authorization", required = false) String token) {
        if (token == null || !token.startsWith("Bearer ")) {
            return Result.unauthorized("请先登录");
        }
        String userId;
        try {
            userId = jwtUtil.getUserIdFromToken(token);
        } catch (Exception e) {
            return Result.unauthorized("登录已过期，请重新登录");
        }
        return userService.wechatStatus(userId);
    }

    /**
     * 解绑微信（需登录）。
     * {@code auto_register}（微信直接注册）的账号会被拒绝 —— 详见 UserService#unbindWechat 的说明。
     */
    @PostMapping("/unbind-wechat")
    @ResponseBody
    public Result<Boolean> unbindWechat(@RequestHeader(value = "Authorization", required = false) String token) {
        if (token == null || !token.startsWith("Bearer ")) {
            return Result.unauthorized("请先登录");
        }
        String userId;
        try {
            userId = jwtUtil.getUserIdFromToken(token);
        } catch (Exception e) {
            return Result.unauthorized("登录已过期，请重新登录");
        }
        return userService.unbindWechat(userId);
    }

    /**
     * 密码找回（验证码验证），对应设计2.2.1 接口：/api/v1/user/password/forgot
     * ---》用户密码忘记后，通过管理员重置该用户的密码，然后用户登录后自行修改密码
     */
    /*@PostMapping("/password/forgot")
      @ResponseBody
    public Result <Object>   forgotPassword(
            @NotBlank(message = "账号不能为空") String account,
            @NotBlank(message = "验证码不能为空")
            @Pattern(regexp = "^\\d{6}$", message = "验证码格式错误") String verifyCode) {
        // 调用服务层验证验证码（对应设计2.2.1 密码找回功能说明）
        userService.verifyForgotCode(account, verifyCode);
        return Result.success(null, "验证码验证成功，请重置密码");
    }
*/
/**
     * 密码重置，对应设计2.2.1 接口：/api/v1/user/password/reset
     *
     * <p>P0-2 收窄：本接口重置为固定默认密码，不要求原密码，因此**不能凭登录身份任意使用**。
     * 改造前只要带着任意合法 token 就能重置本租户任意账号 —— 学生登录后重置管理员密码、
     * 再登录管理员账号即可完成提权。现限定为平台管理员与租户管理员。
     *
     * <p>注：本接口在两端前端均无调用点（已 grep 全仓确认），收窄不破坏任何现有流程；
     * "忘记密码"的自助流程仍是被注释掉的状态（见上方 /password/forgot 注释块），
     * 若将来要开放自助找回，必须另做验证码/短信校验，不能直接放开本接口。
     */
      @PostMapping("/password/reset")
      @Audit(action = AuditAction.USER_RESET_PASSWORD, resourceType = "user")
    @ResponseBody
    public Result <Object>  resetPassword(
            @NotBlank(message = "账号不能为空") String account,
            @RequestHeader("Authorization") String token)
            {
        permissionCheck.checkAdmin(token);
        // 调用服务层重置密码（对应设计2.2.1 密码重置功能说明）
        // 租户上下文由 TenantInterceptor 从 token 解析，租户管理员只能重置本租户账号；
        // 平台管理员 tenantId=0，此时 getUserByAccount(account, 0) 匹配不到行 —— 
        // 平台侧跨租户重置请走 /user/account/changePassword。
        userService.resetPassword(account, TenantContext.getTenantId());
        return Result.success(null, "密码重置成功");
    }
}
/**
 
CREATE TABLE `user_refresh_token` (
  id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
  user_id  varchar(36) NOT NULL COMMENT '登录用户ID',
  refresh_token VARCHAR(512) NOT NULL COMMENT '刷新凭证',
  expire_time DATETIME NOT NULL COMMENT '过期时间',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id),
  INDEX idx_refresh_token (refresh_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT '用户刷新Token持久化表'; 
 */