package com.reservation.service;

import com.reservation.common.GuardVerdict;
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

    public LoginGuardService(AuthRateCounterMapper counterMapper,
                             AuthDeviceMapper deviceMapper,
                             CryptoUtil cryptoUtil) {
        this.counterMapper = counterMapper;
        this.deviceMapper = deviceMapper;
        this.cryptoUtil = cryptoUtil;
    }

    /**
     * 登录入口频率闸：多维计数后取最先生效的一维。
     *
     * <p>注意<b>所有维度都要计数</b>，不能在第一个维度超限时提前 return ——
     * 否则攻击者一旦被 IP 闸拦住，账号维度的计数就停止增长，
     * 后续换 IP 继续打时会发现账号维度"很干净"，等于自己关掉了一层防线。
     *
     * @param request    当前请求（用于取真实 IP）
     * @param account    登录账号（内部转 HMAC，不落明文）
     * @param tenantCode 租户编码（可空；平台管理员为 platform）
     * @return 判定结果，永不为 null
     */
    public GuardVerdict evaluate(HttpServletRequest request, String account, String tenantCode) {
        try {
            String ip = ClientIpResolver.resolve(request);
            String accountHmac = (account == null || account.isBlank()) ? null : hmac(account);
            List<GuardVerdict> hits = new ArrayList<>();

            hits.add(hit(DIM_IP, ip, ipLimit));
            hits.add(hit(DIM_ACCOUNT, accountHmac, accountLimit));
            if (tenantCode != null && !tenantCode.isBlank()) {
                hits.add(hit(DIM_TENANT, tenantCode.trim(), tenantLimit));
            }

            for (GuardVerdict v : hits) {
                if (v != null && v.needChallenge()) {
                    log.warn("登录频率闸触发, dim={}, count={}, limit={}, ip={}, accountHmac={}",
                            v.dim(), v.count(), v.limit(), ip, accountHmac);
                    return v;
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
