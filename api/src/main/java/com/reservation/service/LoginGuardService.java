package com.reservation.service;

import com.reservation.common.GuardVerdict;
import com.reservation.entity.AuthDevice;
import com.reservation.mapper.AuthDeviceMapper;
import com.reservation.mapper.AuthRateCounterMapper;
import com.reservation.utils.ClientIpResolver;
import com.reservation.utils.CryptoUtil;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

/**
 * 登录风控闸门（2026-10-22 P0）。**全部免登录入口的唯一频率控制点**。
 *
 * <h3>为什么只在这里做，不在前端做</h3>
 * <p>Web 端 {@code auth.js:34} 与小程序端 {@code login.js:131} 打的是**同一个**
 * {@code POST /api/v1/auth/login}，参数结构完全一致。守卫做在服务端这一处，
 * 两端天然共享；做在端上则是两套逻辑必然漂移，且抓包直接绕过。
 *
 * <h3>三道设计底线</h3>
 * <ol>
 *   <li><b>故障降级放行</b>：任何内部异常（表没建、SQL 报错、COUNT 超时）都必须放行登录。
 *       风控组件挂了拖死全站登录，是比"没防住机器人"严重得多的故障——
 *       与 {@code WeChatService} 在 secret 占位时回 1001 静默降级是同一姿态。</li>
 *   <li><b>超限只升级、不静默拒绝</b>：返回 {@code code=1002}（HTTP 200），
 *       前端按 body.code 分支提示，不触发 401 刷新/踢登录链路。
 *       用 403 是危险的——两端拦截器都把 403 当"权限不足"，历史上已经踩过
 *       "403 触发刷新 → 无限循环"。</li>
 *   <li><b>阈值全部来自配置</b>：不写死在代码里。上线后第一个月一定需要调，
 *       写死等于把调参变成发版。</li>
 * </ol>
 *
 * <h3>阈值为什么这么宽</h3>
 * <p>IP 维度默认 60 次/小时，看起来松，但这是必要的：一间培训学校 20 个老师共用
 * 一个公网出口 IP，IP 闸一旦收到个位数，第一个被封的是客户。真正能收紧的是
 * <b>账号维度</b>（20 次/小时，正常用户不可能一小时输错 20 次密码）——
 * 也就是 P0.5 的 per-account 撞库防御。
 *
 * <h3>P0 的范围与 P1 的接口预留</h3>
 * <p>P0 只做频率闸（实测数据：改造前全仓 {@code grep "RateLimit|throttle|429"} 零命中）。
 * {@link com.reservation.entity.AuthDevice} 与 {@link com.reservation.entity.AuthChallenge}
 * 两张表同期建好，P1 接入评分与滑块时不需要再改表结构。
 */
@Slf4j
@Service
public class LoginGuardService {

    /** 维度常量（写入 auth_rate_counter.dim）。 */
    public static final String DIM_IP = "ip";
    public static final String DIM_ACCOUNT = "account";
    public static final String DIM_TENANT = "tenant";
    public static final String DIM_EXIST = "exist";

    /**
     * 同一 IP 窗口内「新建设备档案」的计数维度（2026-10-24 方案 D）。
     *
     * <p><b>它不是限流维度，只喂风险评分</b>：每台新设备成功登录建档时 +1，
     * 评分侧据此判断"这个出口在批量制造新设备"。不把它做成限流维度，
     * 是因为共用出口的培训学校会一次装十几台电脑，直接限流会误伤客户。
     */
    public static final String DIM_NEW_DEVICE = "newdev";

    /** dim_key 上限（与表定义 varchar(128) 对齐，超长直接截断，避免 SQL 报错）。 */
    private static final int DIM_KEY_MAX = 128;

    private final AuthRateCounterMapper counterMapper;
    private final AuthDeviceMapper deviceMapper;
    private final CryptoUtil cryptoUtil;

    /** 窗口分钟数（默认 60：整点对齐，便于人读；改小则更灵敏）。 */
    @Value("${login.guard.rate.window.minutes:60}")
    private int windowMinutes;

    /** 同一 IP 窗口内允许的登录尝试次数。 */
    @Value("${login.guard.rate.ip.limit:60}")
    private int ipLimit;

    /** 同一账号（HMAC）窗口内允许的登录尝试次数 —— 撞库防御的核心维度。 */
    @Value("${login.guard.rate.account.limit:20}")
    private int accountLimit;

    /** 同一租户窗口内允许的登录尝试次数。 */
    @Value("${login.guard.rate.tenant.limit:200}")
    private int tenantLimit;

    /** 账号存在性探测（/user/account/exist）窗口内允许次数，比登录更严。 */
    @Value("${login.guard.rate.exist.limit:30}")
    private int existLimit;

    /** 是否启用人机挑战（P1）。false 时退化为纯频率闸（P0 行为），作为线上应急开关。 */
    @Value("${login.guard.challenge.enabled:true}")
    private boolean challengeEnabled;

    /** 风险分达到该值即要求挑战。40 分的含义：至少"新设备 + 换过身份"或"新设备 + 环境异常"。 */
    @Value("${login.guard.challenge.score-threshold:40}")
    private int scoreThreshold;

    /**
     * 同一 IP 同一窗口内允许"无档案新设备"成功建档的数量（2026-10-24 方案 D）。
     *
     * <p>取 10 是"一间教室/一个办公室一次装机"的量级；超过之后再来新设备就按可疑加分。
     * 只在<b>新建设备档案</b>时计数，所以正常家庭/小机构永远碰不到。
     */
    @Value("${login.guard.score.new-device-per-ip-limit:10}")
    private int newDevicePerIpLimit;

    /**
     * 该 IP 新建设备数已达上限后，再来一台"新设备"追加的风险分。
     *
     * <p>取 30 是为了让 {@code 20(新设备) + 30(拥挤) = 50 ≥ 阈值 40} 必然触发挑战，
     * 同时让 {@code 30(环境异常) 单独命中} 时仍只有 30 分——不给"单凭无插件浏览器"
     * 就弹滑块的机会，避免误伤。
     */
    @Value("${login.guard.score.new-device-crowd:30}")
    private int newDeviceCrowdScore;

    public LoginGuardService(AuthRateCounterMapper counterMapper,
                             AuthDeviceMapper deviceMapper,
                             CryptoUtil cryptoUtil) {
        this.counterMapper = counterMapper;
        this.deviceMapper = deviceMapper;
        this.cryptoUtil = cryptoUtil;
    }

    /**
     * 登录入口总闸：频率闸（P0）+ 风险评分（P1）。
     *
     * <p>顺序刻意是"先频率、后评分"：频率是硬事实（数了多少次就是多少次），
     * 评分是推断。先用确定的东西下判断，评分的误判不会被频率的误判放大。
     *
     * @param request    当前请求（取真实 IP）
     * @param account    登录账号（内部转 HMAC，不落明文）
     * @param tenantCode 租户编码（可空）
     * @param deviceId   端上上报的设备标识（可空；空本身也计分，见 {@link #scoreOnly}）
     * @param emuFlag    端上判定的环境异常（模拟器/root/hook/调试）
     * @return 判定结果，永不为 null
     */
    public GuardVerdict evaluate(HttpServletRequest request, String account, String tenantCode,
                                 String deviceId, boolean emuFlag) {
        try {
            String ip = ClientIpResolver.resolve(request);
            String accountHmac = (account == null || account.isBlank()) ? null : hmac(account);

            GuardVerdict rateHit = firstRateHit(ip, accountHmac, tenantCode);
            if (rateHit != null) {
                return rateHit;
            }

            // P1：风险评分（只在挑战功能开启时参与判定）
            if (challengeEnabled) {
                int score = scoreOnly(accountHmac, deviceId, ip, emuFlag);
                if (score >= scoreThreshold) {
                    log.warn("登录风险评分达阈, score={}, threshold={}, ip={}, deviceId={}, accountHmac={}",
                            score, scoreThreshold, ip, deviceId, accountHmac);
                    return GuardVerdict.risk(score);
                }
            }

            return GuardVerdict.pass("rate:ok");
        } catch (Exception e) {
            // ★ 风控故障必须放行：宁可漏一次，也不能让全站登不上
            log.warn("登录频率闸异常，降级放行（本次不做限流）", e);
            return GuardVerdict.pass("rate:degraded");
        }
    }

    /**
     * 纯频率闸（2026-10-24，微信免登录端点 Phase A）。
     *
     * <p><b>为什么微信端点不用 {@link #evaluate} 而单独开一个入口</b>：
     * {@code evaluate} 含 P1 风险评分，评分命中会**要求人机挑战**。
     * 而小程序端只有 {@code /auth/login} 接了滑块（登录页），
     * {@code /auth/wechat-login} 与 {@code /auth/wechat-register} 都是**静默调用**：
     * 它们在 {@code core/auth.js} 里以 {@code customErrorMsg:false} + try/catch 包装，
     * 任何失败都返回 null 并降级到密码表单。此时下发 challenge 没人能答，
     * 等于把"微信静默登录/注册"整条链路打断 —— 比不防还糟。
     *
     * <p>所以这里**只做限流、只返回 pass/challenge 两种语义的判定**，由调用方决定怎么拒；
     * 且判定结果里的 {@code challenge} 在此仅表示"超限"，不表示"要出题"。
     *
     * <p>subject 用 openid 的 HMAC（微信登录/注册都已拿到 openid，无需额外采集设备信息）。
     * 微信 openid 按用户唯一，所以 account 维度是"同一个微信一小时最多试 N 次"，
     * 真正起作用的是 IP 维度（批量注册/登录都是同出口）。
     *
     * @param subject    身份值（openid），内部转 HMAC 后计数，不落明文
     * @param tenantCode 租户编码（可空）
     * @return 永不为 null；{@code needChallenge()==true} 表示已超限
     */
    public GuardVerdict evaluateRateOnly(HttpServletRequest request, String subject, String tenantCode) {
        try {
            String ip = ClientIpResolver.resolve(request);
            String subjectHmac = (subject == null || subject.isBlank()) ? null : hmac(subject);
            GuardVerdict rateHit = firstRateHit(ip, subjectHmac, tenantCode);
            return rateHit != null ? rateHit : GuardVerdict.pass("rate:ok");
        } catch (Exception e) {
            // 同 evaluate：风控故障一律放行，不让限流组件拖死微信登录
            log.warn("微信端点频率闸异常，降级放行（本次不做限流）", e);
            return GuardVerdict.pass("rate:degraded");
        }
    }

    /**
     * 三个维度（IP / 身份 / 租户）依次计数，返回第一个超限的判定；全未超限返回 null。
     *
     * <p>★ <b>必须全部计数完再判</b>：若第一个维度超限就提前 return，
     * 攻击者被 IP 闸拦住之后身份维度的计数就停止增长，换 IP 继续打时
     * 会发现身份维度"很干净"——等于自己关掉一层防线。
     *
     * <p>抽成独立方法是为了让 {@link #evaluate}（登录：限流+评分）与
     * {@link #evaluateRateOnly}（微信：仅限流）**共用同一份维度口径**，
     * 避免两处各写一遍后阈值/维度漂移。
     */
    private GuardVerdict firstRateHit(String ip, String subjectHmac, String tenantCode) {
        List<GuardVerdict> hits = new ArrayList<>();
        hits.add(hit(DIM_IP, ip, ipLimit));
        hits.add(hit(DIM_ACCOUNT, subjectHmac, accountLimit));
        if (tenantCode != null && !tenantCode.isBlank()) {
            hits.add(hit(DIM_TENANT, tenantCode.trim(), tenantLimit));
        }

        for (GuardVerdict v : hits) {
            if (v != null && v.needChallenge()) {
                log.warn("登录频率闸触发, dim={}, count={}, limit={}, ip={}, subjectHmac={}",
                        v.dim(), v.count(), v.limit(), ip, subjectHmac);
                return v;
            }
        }
        return null;
    }

    /**
     * 兼容 P0 旧签名的入口（无设备信息）。
     *
     * <p>保留它是为了让"只想用频率闸"的调用点不必编造 deviceId；
     * 但注意：走这个入口时评分里"无设备标识 +10"恒定生效，
     * 因此新代码应尽量用带 deviceId 的重载。
     */
    public GuardVerdict evaluate(HttpServletRequest request, String account, String tenantCode) {
        return evaluate(request, account, tenantCode, null, false);
    }

    /**
     * 风险评分（P1，**只读**；2026-10-24 方案 C 改造）。
     *
     * <h3>为什么评分而不是直接拦</h3>
     * <p>真机农场的每一台设备、每一个身份看起来都"合法"（真微信 + 真手机），
     * 单看任何一个请求都挑不出毛病。能挑出毛病的是**关系**：
     * 这台设备上换过几个身份、这台设备之前属于谁。评分就是把这些关系折算成一个数。
     *
     * <h3>为什么阈值定在 40 且老用户恒 0 分</h3>
     * <p>老用户（同一设备 + 同一身份）恒为 0 分直接放行——**陌生人的攻击不应该让老客户
     * 付出体验代价**，这是体验与安全唯一的平衡点。而"新设备 + 换过身份"正好 20+40=60、
     * "新设备 + 环境异常"20+30=50，都跨过 40，即"可疑但可能无辜"的那类才需要拖一次滑块。
     *
     * <h3>★ 为什么必须只读（这是 2026-10-24 修掉的致命缺陷）</h3>
     * <p>改造前本方法名叫 {@code scoreAndTouchDevice}，<b>在评分的同时顺手写档案</b>
     * （新设备 insert、换身份 incrIdentity 刷新 {@code last_subject}、同身份 touch）。
     * 后果是：一次登录要发两次请求（第一次拿 {@code code=1002} 出题、第二次带答案重试），
     * 而<b>第一次请求的写操作把第二次请求的评分抹平了</b>——
     * 换身份得到的 40 分在第二跳变成 0 分、新设备 20 分在第二跳变成"老设备"，
     * 于是 {@code guard.blocked()} 在带答案的那一跳恒为 false，
     * {@code authController} 里包在 {@code if (guard.blocked())} 内的挑战校验<b>根本没有执行</b>。
     * 表现为"滑块拖不到位也能登录"，实测库里 10 张票据 {@code used=0} 且 {@code fail_count=0}
     * （校验一次都没跑过）而用户登录却是成功的。
     *
     * <p>所以现在拆成两步：<b>评分只读</b>（本方法），写档案挪到
     * {@link #recordDeviceAfterLogin}，且只在登录<b>成功之后</b>调用。
     * 这样重放请求仍会拿到同样的 40 分，挑战才会真的被执行。
     *
     * @return 风险分 0~100；任何异常返回 0（等价放行，且不阻塞登录）
     */
    public int scoreOnly(String accountHmac, String deviceId, String ip, boolean emuFlag) {
        try {
            int score = 0;
            // 没有设备标识：可能是老客户端、可能被清了缓存、也可能是脚本懒得伪装
            if (deviceId == null || deviceId.isBlank()) {
                score += 10;
            } else {
                String dev = deviceId.length() > 64 ? deviceId.substring(0, 64) : deviceId;
                AuthDevice exist = deviceMapper.selectByDeviceId(dev);
                if (exist == null) {
                    score += 20;                 // 新设备
                    // 方案 D：这个出口正在批量制造新设备 → 再加一档，让"每次换 deviceId"
                    // 的脚本在第 N 次之后必须过滑块（否则它永远是 20 分，滑块一次都不弹）
                    if (newDeviceCrowded(ip)) {
                        score += newDeviceCrowdScore;
                        log.debug("同 IP 新建设备过多，追加风险分, ip={}, add={}", ip, newDeviceCrowdScore);
                    }
                } else if (accountHmac != null && !accountHmac.isBlank()
                        && exist.getLastSubject() != null && !exist.getLastSubject().isBlank()
                        && !exist.getLastSubject().equals(accountHmac)) {
                    // ★ 这台设备在换身份 —— 真机农场的核心形状。只加分，不改档案
                    score += 40;
                }
                // 同一身份再次登录：0 分，不积累风险（也不需要写库，touch 挪到登录成功后）
            }
            if (emuFlag) {
                score += 30;
            }
            return Math.min(score, 100);
        } catch (Exception e) {
            log.warn("登录风险评分异常，本次按 0 分处理（放行）", e);
            return 0;
        }
    }

    /**
     * 该 IP 在窗口内是否已经建了太多设备档案（方案 D）。
     *
     * <p>只读不写；计数由 {@link #recordDeviceAfterLogin} 在登录成功后累加。
     * 任何异常都返回 false —— 这条只影响"是否多加 30 分"，不值得为它抛异常。
     */
    private boolean newDeviceCrowded(String ip) {
        if (ip == null || ip.isBlank() || newDevicePerIpLimit <= 0) {
            return false;
        }
        try {
            int cnt = counterMapper.countOfWindow(DIM_NEW_DEVICE, truncate(ip), windowStart());
            return cnt >= newDevicePerIpLimit;
        } catch (Exception e) {
            log.debug("新设备计数读取失败，本次不追加风险分", e);
            return false;
        }
    }

    /**
     * 登录**成功之后**写设备档案（2026-10-24 方案 C 的第二半）。
     *
     * <h3>为什么必须等登录成功才写</h3>
     * <p>评分链路一旦带写副作用，就会出现"同一次登录的第二次请求把第一次的判定条件改掉"
     * 这种自相矛盾的时序（详见 {@link #scoreOnly} 的注释）。把写操作整体后移到登录成功之后，
     * 换来两个直接好处：
     * <ol>
     *   <li>本方法执行时判定已经做完，写什么都没有副作用；</li>
     *   <li>密码错误的请求不再污染档案 —— 以前用错密码也会把 {@code last_subject} 刷成
     *       被尝试的账号，等于替攻击者"洗净"了换身份痕迹。</li>
     * </ol>
     *
     * <h3>为什么整段吞异常</h3>
     * <p>本方法在 {@code userService.login} 已经成功之后调用，此时任何异常都不能反悔
     * 把成功改成失败（用户已经拿到 token 了）。最坏情况是这台设备下次仍按"新设备"计分，
     * 代价是多弹一次滑块，而不是登录报错。
     */
    public void recordDeviceAfterLogin(String accountHmac, String deviceId, String ip, boolean emuFlag) {
        if (deviceId == null || deviceId.isBlank()) {
            return;
        }
        try {
            String dev = deviceId.length() > 64 ? deviceId.substring(0, 64) : deviceId;
            String subject = accountHmac == null ? "" : accountHmac;
            AuthDevice exist = deviceMapper.selectByDeviceId(dev);
            if (exist == null) {
                AuthDevice row = new AuthDevice();
                row.setDeviceId(dev);
                row.setFirstSubject(subject);
                row.setLastSubject(subject);
                row.setIdentityCnt(0);
                row.setLastIp(ip);
                row.setEmuFlag(emuFlag ? 1 : 0);
                try {
                    deviceMapper.insert(row);
                    // ★ 只有"真的新建了一行"才计入该 IP 的新设备数，
                    //   并发撞 uk_device 的那次不算（否则同一台设备会被重复计数）
                    if (ip != null && !ip.isBlank()) {
                        counterMapper.incr(DIM_NEW_DEVICE, truncate(ip), windowStart());
                    }
                } catch (Exception dup) {
                    // 并发下同一台新设备两条请求同时建档会撞 uk_device：
                    // 按"已存在"处理，不能因为这条异常把登录打成 500
                    log.debug("设备档案并发建档冲突，按已存在处理, deviceId={}", dev);
                }
            } else if (!subject.isBlank()
                    && exist.getLastSubject() != null && !exist.getLastSubject().isBlank()
                    && !exist.getLastSubject().equals(subject)) {
                // 登录成功确认了"这台设备确实换了身份"，此时才落痕
                deviceMapper.incrIdentity(dev, subject, ip);
            } else {
                // 同一身份再次登录：只刷 IP 与异常标记，不积累风险
                deviceMapper.touch(dev, ip, emuFlag ? 1 : 0);
            }
        } catch (Exception e) {
            log.warn("登录成功后的设备档案写入失败（不影响本次登录结果）, deviceId={}", deviceId, e);
        }
    }

    /**
     * 账号存在性探测的闸门（{@code GET /user/account/exist}）。
     *
     * <p>这个端点是 **permitAll 免登录**的（SecurityConfig / JwtFilter 四处白名单都登记了），
     * 前端用它做"注册时账号是否被占用"的提示。问题在于它对任何人、无限次开放，
     * 等于官方提供一台账号枚举器 —— 配合 {@code /auth/login} 区分"账号不存在/密码错误"，
     * 枚举成本为零。P0 先给它上频率闸（比登录侧更严），下线该接口属于产品决策，不在本次改动范围。
     *
     * <p>它是 GET 且无租户上下文，所以只按 IP 一个维度计。
     */
    public GuardVerdict evaluateAccountProbe(HttpServletRequest request) {
        try {
            String ip = ClientIpResolver.resolve(request);
            GuardVerdict v = hit(DIM_EXIST, ip, existLimit);
            if (v != null && v.needChallenge()) {
                log.warn("账号存在性探测频率闸触发, count={}, limit={}, ip={}",
                        v.count(), v.limit(), ip);
                return v;
            }
            return GuardVerdict.pass("exist:ok");
        } catch (Exception e) {
            log.warn("账号存在性探测频率闸异常，降级放行", e);
            return GuardVerdict.pass("exist:degraded");
        }
    }

    /**
     * 单维度计数并判定。
     *
     * @return 判定结果；维度值缺失或计数失败时返回 {@code null}（表示"这一维不参与判定"，
     *         调用方跳过即可，不要当成放行结论）
     */
    private GuardVerdict hit(String dim, String rawKey, int limit) {
        if (rawKey == null || rawKey.isBlank() || limit <= 0) {
            return null;
        }
        String key = truncate(rawKey);
        LocalDateTime windowStart = windowStart();
        // 先原子自增，再读回：顺序不能反。先读后写会在并发下丢计数（两个请求同时读到 9 都写 10）。
        counterMapper.incr(dim, key, windowStart);
        int cnt = counterMapper.countOfWindow(dim, key, windowStart);
        if (cnt > limit) {
            return GuardVerdict.challenge(dim, cnt, limit);
        }
        return null;
    }

    /**
     * 窗口起点：按 {@code windowMinutes} 向下取整到整点/整刻。
     *
     * <p>固定窗口而非滑动窗口：固定窗口只需"一行唯一键 + 原子自增"，
     * 而滑动窗口要么维护多桶、要么扫表，在登录这种低 QPS 场景里不值得。
     * 代价是窗口边界附近可能瞬时限流到 2 倍，对"防批量"这个目的完全够用。
     */
    private LocalDateTime windowStart() {
        int step = Math.max(1, windowMinutes);
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime hourStart = now.truncatedTo(ChronoUnit.HOURS);
        int offsetMinutes = (now.getMinute() / step) * step;
        return hourStart.plusMinutes(offsetMinutes);
    }

    /**
     * 身份摘要（供挑战出题/校验绑定 subject）。与频率闸内部同一算法，
     * 保证"同一个账号在任何地方算出的 subject 都相同"，否则挑战永远校验不过。
     */
    public String subjectOf(String account) {
        if (account == null || account.isBlank()) {
            return null;
        }
        return hmac(account);
    }

    /** 账号等身份值统一走 HMAC 盲索引，与 {@code promo_conversion.phone_hmac} 同一算法，不存明文。 */
    private String hmac(String plain) {
        try {
            return truncate(cryptoUtil.searchIndex(plain.trim()));
        } catch (Exception e) {
            // HMAC 失败不阻断：退化为不可聚合的占位值，宁可少算也不要抛到登录流程
            log.warn("账号 HMAC 失败，本次跳过账号维度计数", e);
            return "";
        }
    }

    private String truncate(String s) {
        if (s == null) {
            return "";
        }
        return s.length() <= DIM_KEY_MAX ? s : s.substring(0, DIM_KEY_MAX);
    }

    /**
     * 读某维度当前窗口计数（供管理端/排查使用，业务路径不需要）。
     *
     * <p>刻意不抛异常：这是诊断接口，查不到就返回 0 比抛出去更有用。
     */
    public long peek(String dim, String rawKey) {
        try {
            if (rawKey == null || rawKey.isBlank()) {
                return 0L;
            }
            return counterMapper.countOfWindow(dim, truncate(rawKey), windowStart());
        } catch (Exception e) {
            return 0L;
        }
    }
}
