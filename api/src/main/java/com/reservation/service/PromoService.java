package com.reservation.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.reservation.common.PageResult;
import com.reservation.common.RoleConst;
import com.reservation.common.Result;
import com.reservation.entity.PromoAchievement;
import com.reservation.entity.PromoConversion;
import com.reservation.entity.PromoReferral;
import com.reservation.entity.Tenant;
import com.reservation.entity.TenantPackage;
import com.reservation.entity.User;
import com.reservation.entity.WxUserid;
import com.reservation.exception.BusinessException;
import com.reservation.exception.ConflictException;
import com.reservation.mapper.PromoAchievementMapper;
import com.reservation.mapper.PromoConversionMapper;
import com.reservation.mapper.PromoReferralMapper;
import com.reservation.utils.CryptoUtil;
import com.reservation.utils.TenantCodeGenerator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 推广体系核心服务。
 *
 * <h3>两条路径</h3>
 * <ul>
 *   <li><b>路径1（pathType=1）</b>：自助建租户。推广码 {@code target_tenant_id} 为 NULL，
 *       用码开新租户并成为首管理员（免费试用）。</li>
 *   <li><b>路径2（pathType=2）</b>：指定租户拉新。推广码绑定目标租户，注册时后端校验
 *       {@code tcode} 解析出的租户与 {@code target_tenant_id} 一致，防篡改。</li>
 * </ul>
 *
 * <h3>计数口径（决策：点击只计数、不落明细）</h3>
 * 点击不写 {@code promo_conversion}，只在 {@code promo_achievement.total_clicks} 上 +1；
 * {@code promo_conversion} 从 {@code registered} 起记，{@code invitee_user_id} 恒非空，
 * 使 {@code uk_conversion_invitee}「一个被邀请者只归因一次」真正生效。
 *
 * <h3>租户隔离</h3>
 * 三张 promo 表与 {@code wx_userid} 都已登记进 {@code MyBatisPlusConfig.IGNORE_TABLES}
 * （表结构无 tenant_id 列 / 隔离语义是全局唯一），本服务所有查询都不受租户插件影响；
 * 作用域由 promoter_user_id / target_tenant_id 显式控制。
 */
@Service
public class PromoService {

    private static final Logger log = LoggerFactory.getLogger(PromoService.class);

    /** 路径1：自助建租户。 */
    public static final int PATH_TENANT = 1;
    /** 路径2：指定租户注册用户。 */
    public static final int PATH_USER = 2;

    @Autowired
    private PromoReferralMapper promoReferralMapper;
    @Autowired
    private PromoConversionMapper promoConversionMapper;
    @Autowired
    private PromoAchievementMapper promoAchievementMapper;
    @Autowired
    private TenantService tenantService;
    @Autowired
    private TenantPackageService tenantPackageService;
    @Autowired
    private UserService userService;
    @Autowired
    private WxUseridService wxUseridService;
    @Autowired
    private SysConfigService sysConfigService;
    @Autowired
    private CryptoUtil cryptoUtil;

    // ==================== 推广码 ====================

    /**
     * 生成或取回我的推广码（幂等：同推广者 + 同路径 + 同目标租户只保留一个码）。
     *
     * <p>并发首查双插由 {@code uk_promoter_scope} / {@code uk_referral_code} 兜底：
     * 撞唯一键的一方回退为读取已存在的那条，不向用户报错。
     *
     * <p><b>路径2 不变式</b>：租户码的 {@code targetTenantId} 必须等于推广者自己的租户
     * （{@code promoterTenantId}）——控制器只从令牌派生目标租户，这里再做一次服务端兜底：
     * 双闸门保证"不能给任意租户生成码，把别人的拉新业绩记在自己头上"。
     */
    @Transactional(rollbackFor = Exception.class)
    public PromoReferral getOrCreateCode(String promoterUserId, Long promoterTenantId,
                                         Integer pathType, Long targetTenantId) {
        int path = (pathType != null && pathType == PATH_USER) ? PATH_USER : PATH_TENANT;
        if (path == PATH_USER) {
            if (targetTenantId == null) {
                throw new BusinessException("指定租户的推广码必须带目标租户");
            }
            if (promoterTenantId == null || promoterTenantId <= 0
                    || !targetTenantId.equals(promoterTenantId)) {
                throw new BusinessException("只能为自己所属的租户生成推广码");
            }
        }
        PromoReferral exist = findByScope(promoterUserId, path, targetTenantId);
        if (exist != null) {
            return exist;
        }
        PromoReferral fresh = new PromoReferral();
        fresh.setReferralCode(generateUniqueReferralCode());
        fresh.setPromoterUserId(promoterUserId);
        fresh.setPromoterTenantId(promoterTenantId == null ? 0L : promoterTenantId);
        fresh.setPathType(path);
        fresh.setTargetTenantId(targetTenantId);
        fresh.setStatus("active");
        try {
            promoReferralMapper.insert(fresh);
        } catch (DuplicateKeyException e) {
            // 并发下另一方已建好：uk_promoter_scope 命中则回退读取；uk_referral_code 碰撞则让用户重试
            PromoReferral raced = findByScope(promoterUserId, path, targetTenantId);
            if (raced != null) {
                return raced;
            }
            throw new ConflictException("推广码生成冲突，请重试");
        }
        log.info("生成推广码, promoter={}, path={}, target={}, code={}",
                promoterUserId, path, targetTenantId, fresh.getReferralCode());
        return fresh;
    }

    /**
     * 按（推广者, 路径, 目标租户）取码。
     *
     * <p>⚠️ 目标租户为 NULL 时必须用 {@code isNull} 而不是 {@code eq(..., null)}：
     * MP 的 eq 遇到 null 值会拼出 {@code target_tenant_id = null}，SQL 里恒不成立，
     * 路径1 会被误判成"没有码"而每次新建。
     */
    private PromoReferral findByScope(String promoterUserId, int pathType, Long targetTenantId) {
        LambdaQueryWrapper<PromoReferral> qw = new LambdaQueryWrapper<>();
        qw.eq(PromoReferral::getPromoterUserId, promoterUserId)
          .eq(PromoReferral::getPathType, pathType);
        if (targetTenantId == null) {
            qw.isNull(PromoReferral::getTargetTenantId);
        } else {
            qw.eq(PromoReferral::getTargetTenantId, targetTenantId);
        }
        qw.orderByAsc(PromoReferral::getId).last("LIMIT 1");
        return promoReferralMapper.selectOne(qw);
    }

    /**
     * 生成全局唯一推广码。撞 {@code uk_referral_code} 或保留字则重换，
     * 次数上限取配置 {@code tenant.code.max.retry}（默认 10）。
     */
    private String generateUniqueReferralCode() {
        int maxRetry = sysConfigService.getInt("tenant.code.max.retry", 10);
        for (int i = 0; i < maxRetry; i++) {
            String code = TenantCodeGenerator.generate();
            if (TenantCodeGenerator.isReserved(code)) {
                continue; // 撞保留字（platform/default）则换
            }
            if (promoReferralMapper.getByCode(code) == null) {
                return code;
            }
        }
        throw new BusinessException("推广码生成失败，请重试");
    }

    /**
     * 校验推广码可用性：存在、active、未过期。
     *
     * @return 可用返回该码；不可用返回 {@code null}（调用方自行决定话术）
     */
    public PromoReferral validateActiveCode(String code) {
        if (!StringUtils.hasText(code)) {
            return null;
        }
        PromoReferral ref = promoReferralMapper.getByCode(code.trim());
        if (ref == null || !"active".equals(ref.getStatus())) {
            return null;
        }
        if (ref.getExpireTime() != null && ref.getExpireTime().isBefore(LocalDateTime.now())) {
            return null;
        }
        return ref;
    }

    /**
     * 我的全部推广码（早建的在前）。
     *
     * <p>路径2 的码会富化 {@code targetTenantCode}（瞬态字段，不落库）：
     * 前端拼注册链接要 {@code ?tcode=} 字符串，只有 targetTenantId 拼不出来。
     */
    public List<PromoReferral> myCodes(String promoterUserId) {
        List<PromoReferral> list = promoReferralMapper.listByPromoter(promoterUserId);
        if (list == null) {
            return new ArrayList<>();
        }
        fillTargetTenantCodes(list);
        return list;
    }

    /**
     * 给路径2 的码批量富化目标租户编码（sys_tenant 已排除租户插件，可跨租户读）。
     *
     * <p>按 distinct targetTenantId 逐个查（码量极小：一推广者一路径最多一个码），
     * 不走 N+1 担忧；租户被删时该码的 targetTenantCode 留空，由前端回退展示 id。
     */
    private void fillTargetTenantCodes(List<PromoReferral> codes) {
        List<Long> ids = new ArrayList<>();
        for (PromoReferral c : codes) {
            if (c.getTargetTenantId() != null && !ids.contains(c.getTargetTenantId())) {
                ids.add(c.getTargetTenantId());
            }
        }
        if (ids.isEmpty()) {
            return;
        }
        Map<Long, String> codeOf = new HashMap<>();
        for (Long id : ids) {
            Tenant t = tenantService.getById(id);
            if (t != null) {
                codeOf.put(id, t.getTenantCode());
            }
        }
        for (PromoReferral c : codes) {
            c.setTargetTenantCode(codeOf.get(c.getTargetTenantId()));
        }
    }

    // ==================== 点击计数 ====================

    /**
     * 点击数 +1（{@code INSERT ... ON DUPLICATE KEY UPDATE}，推广者首次点击自动建行）。
     *
     * <p><b>刻意不更新 {@code last_conversion_at}</b>：字段名是"最近转化时间"，
     * 点击不是转化（原方案 §3.4 的示例 SQL 顺手更新了它，属于笔误，按语义修正）。
     * 前端按 {@code ref} 去重只上报一次，故这里不需要额外防抖。
     */
    @Transactional(rollbackFor = Exception.class)
    public void countClick(String referralCode) {
        PromoReferral ref = validateActiveCode(referralCode);
        if (ref == null) {
            return; // 无效码不计数，也不报错（公开接口，避免成为探针）
        }
        promoAchievementMapper.upsertClick(ref.getPromoterUserId(), ref.getPromoterTenantId());
    }

    // ==================== 转化记录 ====================

    /**
     * 记录一次注册转化（registered 起步），并把推广者业绩 +1。
     *
     * <p><b>去重</b>：先查 {@code uk_conversion_invitee}，已归因则静默返回（幂等）；
     * 并发双插由唯一键兜底 —— 撞键一方同样视为已归因，不向用户报错
     * （注册本身已成功，归因只是记账，不该让用户看到失败）。
     *
     * @param wxDirect 是否微信直接注册（计入 {@code total_wx_registered}）
     */
    @Transactional(rollbackFor = Exception.class)
    public void recordConversion(String referralCode, String inviteeUserId, Long inviteeTenantId,
                                 int pathType, String tenantCode, String source,
                                 boolean wxDirect, String ip, String phoneHmac) {
        PromoReferral ref = validateActiveCode(referralCode);
        if (ref == null) {
            log.warn("归因跳过：推广码不可用, code={}, invitee={}", referralCode, inviteeUserId);
            return;
        }
        PromoConversion exist = promoConversionMapper.getByInviteeUserId(inviteeUserId);
        if (exist != null) {
            return; // 已归因过，幂等
        }
        PromoConversion c = new PromoConversion();
        c.setReferralCode(ref.getReferralCode());
        c.setPromoterUserId(ref.getPromoterUserId());
        c.setInviteeUserId(inviteeUserId);
        c.setInviteeTenantId(inviteeTenantId);
        c.setPathType(pathType);
        c.setTenantCode(tenantCode);
        c.setStage("registered");
        c.setSource(StringUtils.hasText(source) ? source.trim() : null);
        c.setRegisterIp(ip);
        c.setRegisterPhoneHmac(phoneHmac);
        c.setRegisteredAt(LocalDateTime.now());
        try {
            promoConversionMapper.insert(c);
        } catch (DuplicateKeyException e) {
            return; // 并发下已归因
        }
        promoAchievementMapper.bumpRegistered(ref.getPromoterUserId(), ref.getPromoterTenantId(),
                pathType == PATH_TENANT ? 1 : 0, wxDirect ? 1 : 0);
        log.info("推广转化已记录, code={}, invitee={}, path={}, wx={}",
                ref.getReferralCode(), inviteeUserId, pathType, wxDirect);
    }

    /**
     * 归因上报（{@code POST /user/attribution}，小程序已埋点、web 登录页同契约）。
     *
     * <p>优先级（方案 §8.4）：
     * <ol>
     *   <li>有 {@code ref} → 按推广码归因（唯一、无歧义）；码不可用则不归因</li>
     *   <li>只有 {@code inviter} → 用默认码（路径1优先，早建优先）</li>
     *   <li>皆无 → 只记 source，不计业绩</li>
     * </ol>
     * 无论哪条登录方式（密码/静默/微信注册），setSession 成功后上报一次即可；
     * 已注册用户重复上报被 {@code uk_conversion_invitee} 去重。
     *
     * <p>{@code wxDirect} 不靠调用方传旗标，直接查 {@code wx_userid}：
     * {@code bind_source='auto_register'} 即"微信直接注册"—— 与 UserService.unbindWechat
     * 的判定口径同源，不会出现前端漏传导致统计偏小。
     */
    @Transactional(rollbackFor = Exception.class)
    public void recordAttribution(String userId, Long userTenantId,
                                  String ref, String inviter, String source) {
        if (!StringUtils.hasText(ref) && !StringUtils.hasText(inviter)) {
            return; // 无归因信息，不计业绩
        }
        PromoReferral target;
        if (StringUtils.hasText(ref)) {
            target = validateActiveCode(ref);
        } else {
            target = promoReferralMapper.getDefaultByPromoter(inviter.trim());
        }
        if (target == null) {
            log.warn("归因跳过：定位不到有效推广码, ref={}, inviter={}, user={}", ref, inviter, userId);
            return;
        }
        WxUserid binding = wxUseridService.findByUserId(userId);
        boolean wxDirect = binding != null && "auto_register".equals(binding.getBindSource());
        recordConversion(target.getReferralCode(), userId, userTenantId,
                target.getPathType(), null, source, wxDirect, null, null);
    }

    /** 审批通过：conversion registered → approved，业绩 total_approved +1。 */
    @Transactional(rollbackFor = Exception.class)
    public void onApproved(String inviteeUserId) {
        PromoConversion c = promoConversionMapper.getByInviteeUserId(inviteeUserId);
        if (c == null) {
            return; // 非推广来的用户，与推广业绩无关
        }
        int rows = promoConversionMapper.markApproved(inviteeUserId);
        if (rows > 0) {
            promoAchievementMapper.bumpApproved(c.getPromoterUserId());
            log.info("推广转化审批通过, invitee={}, promoter={}", inviteeUserId, c.getPromoterUserId());
        }
    }

    /**
     * 缴费成功（{@code POST /tenant/{id}/package} 配套餐成功后触发）：
     * 该租户名下未付费转化一律置 paid，推广者 total_paid +1、累计奖励 += 配置值，
     * 租户试用标记转 converted。
     *
     * <p>无 referred_by（非推广来的租户）直接返回；无未付费转化时也直接返回（幂重放安全）。
     */
    @Transactional(rollbackFor = Exception.class)
    public void onPaid(Long tenantId) {
        if (tenantId == null || tenantId <= 0) {
            return;
        }
        Tenant tenant = tenantService.getById(tenantId);
        if (tenant == null || !StringUtils.hasText(tenant.getReferredBy())) {
            return;
        }
        int rows = promoConversionMapper.markPaidByTenant(tenantId);
        if (rows == 0) {
            return;
        }
        BigDecimal reward = parseDecimal(sysConfigService.getString("promotion.reward.on.paid", "0"));
        promoAchievementMapper.bumpPaid(tenant.getReferredBy(), reward);
        tenantService.markTrialConverted(tenantId);
        log.info("推广转化缴费, tenantId={}, promoter={}, reward={}, rows={}",
                tenantId, tenant.getReferredBy(), reward, rows);
    }

    private BigDecimal parseDecimal(String s) {
        try {
            return StringUtils.hasText(s) ? new BigDecimal(s.trim()) : BigDecimal.ZERO;
        } catch (NumberFormatException e) {
            return BigDecimal.ZERO;
        }
    }

    // ==================== 防刷 ====================

    /**
     * 注册限频（路径1/2 共用 IP 与手机号两闸；全局试用上限仅路径1）。
     *
     * <p>③ 全局试用租户上限按「推广创建的租户总数」计（{@code referred_by IS NOT NULL}），
     * 而不是 {@code trial_status='trial'} —— 后者会把过期/转化的租户放掉，限幅可被"等过期"绕过。
     */
    public void checkRegisterAbuse(String ip, String phonePlain, boolean globalTrialGate) {
        int limit = sysConfigService.getInt("promotion.register.period.limit", 3);
        LocalDateTime since = LocalDateTime.now().minusHours(1);
        if (StringUtils.hasText(ip) && promoConversionMapper.countByIpSince(ip, since) >= limit) {
            throw new BusinessException("注册过于频繁，请稍后再试");
        }
        if (StringUtils.hasText(phonePlain)) {
            String hmac = cryptoUtil.searchIndex(phonePlain.trim());
            if (promoConversionMapper.countByPhoneHmacSince(hmac, since) >= limit) {
                throw new BusinessException("该手机号注册过于频繁，请稍后再试");
            }
        }
        if (globalTrialGate) {
            int globalLimit = sysConfigService.getInt("promotion.trial.global.limit", 200);
            long created = tenantService.countPromoCreatedTenants();
            if (created >= globalLimit) {
                throw new BusinessException("免费体验名额已满，请联系平台方");
            }
        }
    }

    // ==================== 注册：路径1 自助建租户 ====================

    /**
     * 路径1：自助建租户 + 首管理员（免费试用）。
     *
     * <p>整个流程一个事务：租户、试用套餐、首管理员、归因记录，任一步失败整体回滚 ——
     * 否则会留下"租户建了、管理员没建上"的孤儿租户（无账号可登录，只能平台方手工清理）。
     * 注意失败时必须<b>抛异常</b>而不能只返回 fail：返回 fail 会让本方法正常结束从而提交事务。
     *
     * @param wxOpenid 可选：勾选了"微信登录"时由 Controller 经 {@code code2Session} 换取，
     *                 注册成功后把 openid 绑到新管理员账号。{@code bind_source=manual}：
     *                 该账号有登录密码，解绑不会永久丢失登录能力（auto_register 的
     *                 解绑禁令只对"account=openid 且密码随机"的账号成立）。
     * @return 与密码登录一致的会话 map（token/userId/role/tenantCode/...）+ trialExpireTime
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> registerTenant(String referralCode, String orgName, Long industryId,
                                              String account, String password, String name,
                                              String phone, String source, String wxOpenid,
                                              String ip) {
        PromoReferral ref = validateActiveCode(referralCode);
        if (ref == null) {
            throw new BusinessException("推广码无效或已停用");
        }
        if (ref.getPathType() == null || ref.getPathType() != PATH_TENANT) {
            throw new BusinessException("该推广码不支持自助建租户，请使用指定租户的注册链接");
        }
        if (!StringUtils.hasText(orgName) || !StringUtils.hasText(account) || !StringUtils.hasText(password)) {
            throw new BusinessException("机构名称、管理员账号、密码不能为空");
        }
        checkRegisterAbuse(ip, phone, true);

        int trialDays = sysConfigService.getInt("promotion.trial.days", 14);
        LocalDateTime trialExpire = LocalDateTime.now().plusDays(trialDays);

        // ① 租户（8 字符编码 + 创建者账号 + 推广者 + 试用期）
        Tenant tenant = new Tenant();
        tenant.setTenantCode(tenantService.generateUniqueTenantCode());
        tenant.setOrgName(orgName.trim());
        tenant.setIndustryId(industryId);
        tenant.setContact(name);
        tenant.setPhone(phone);
        tenant.setCreatorAccount(account.trim());
        tenant.setReferredBy(ref.getPromoterUserId());
        tenant.setTrialStatus("trial");
        tenant.setTrialExpireTime(trialExpire);
        Long tenantId = tenantService.insertTenant(tenant);

        // ② 试用套餐（先建套餐再建账号，让首管理员的名额占用走额度校验）
        TenantPackage pkg = new TenantPackage();
        pkg.setTenantId(tenantId);
        pkg.setCourseLimit(sysConfigService.getInt("promotion.trial.course.limit", 5));
        pkg.setScheduleLimit(0);
        pkg.setUserTotalLimit(sysConfigService.getInt("promotion.trial.user.limit", 10));
        pkg.setTeacherLimit(0);
        pkg.setStudentLimit(0);
        pkg.setTeacherPublishLimit(0);
        Long pkgId = tenantPackageService.insertPackage(pkg);
        tenantService.bindPackage(tenantId, pkgId);

        // ③ 首管理员（applyRoleAdmission：本租户无 admin → 自动 active）
        User admin = new User();
        admin.setAccount(account.trim());
        admin.setPassword(password);
        admin.setName(name);
        admin.setPhone(phone);
        admin.setRole(RoleConst.ADMIN);
        admin.setTenantCode(tenant.getTenantCode());
        ResultHolder reg = ResultHolder.of(userService.Register(admin, false));
        if (!reg.ok) {
            throw new BusinessException(reg.message); // 抛异常以回滚，避免孤儿租户
        }

        // ④ 微信绑定（可选，同事务）
        if (StringUtils.hasText(wxOpenid)) {
            wxUseridService.bind(wxOpenid, reg.userId, tenantId, "manual");
        }

        // ⑤ 归因（同事务，注册成功才记账）
        recordConversion(ref.getReferralCode(), reg.userId, tenantId, PATH_TENANT,
                tenant.getTenantCode(), source, false, ip,
                StringUtils.hasText(phone) ? cryptoUtil.searchIndex(phone.trim()) : null);

        Map<String, Object> data = new HashMap<>(reg.data);
        data.put("trialExpireTime", trialExpire.toString());
        data.put("trialDays", trialDays);
        log.info("路径1注册完成, tenant={}, code={}, admin={}", tenantId, tenant.getTenantCode(), reg.userId);
        return data;
    }

    // ==================== 注册：路径2 指定租户 ====================

    /**
     * 路径2：指定租户注册用户（student/teacher，pending 待审批）。
     *
     * <p>防篡改：请求带的 {@code tenantCode} 解析出的租户必须等于推广码的
     * {@code target_tenant_id} —— 否则把 A 租户的码用到 B 租户上就能给 A 刷业绩。
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> registerUser(String referralCode, String tenantCode, String account,
                                            String password, String name, String phone,
                                            String role, String source, String ip) {
        PromoReferral ref = validateActiveCode(referralCode);
        if (ref == null) {
            throw new BusinessException("推广码无效或已停用");
        }
        if (ref.getPathType() == null || ref.getPathType() != PATH_USER) {
            throw new BusinessException("该推广码不支持加入指定租户，请使用自助建租户的注册链接");
        }
        Tenant tenant = tenantService.getByCode(tenantCode);
        if (tenant == null || !Integer.valueOf(1).equals(tenant.getStatus())) {
            throw new BusinessException("租户编码无效或已停用，请检查注册链接");
        }
        if (ref.getTargetTenantId() == null || !ref.getTargetTenantId().equals(tenant.getId())) {
            throw new BusinessException("推广码与租户不匹配，请通过官方邀请链接注册");
        }
        String resolvedRole = (StringUtils.hasText(role)
                && (RoleConst.STUDENT.equals(role) || RoleConst.TEACHER.equals(role)))
                ? role : RoleConst.STUDENT;
        if (!StringUtils.hasText(account) || !StringUtils.hasText(password)) {
            throw new BusinessException("账号、密码不能为空");
        }
        checkRegisterAbuse(ip, phone, false);

        User user = new User();
        user.setAccount(account.trim());
        user.setPassword(password);
        user.setName(name);
        user.setPhone(phone);
        user.setRole(resolvedRole);
        user.setTenantCode(tenant.getTenantCode());
        ResultHolder reg = ResultHolder.of(userService.Register(user, false));
        if (!reg.ok) {
            throw new BusinessException(reg.message);
        }

        recordConversion(ref.getReferralCode(), reg.userId, tenant.getId(), PATH_USER,
                null, source, false, ip,
                StringUtils.hasText(phone) ? cryptoUtil.searchIndex(phone.trim()) : null);

        Map<String, Object> data = new HashMap<>(reg.data);
        data.put("status", "pending");
        data.put("message", "待审批");
        log.info("路径2注册完成, tenant={}, user={}, role={}", tenant.getId(), reg.userId, resolvedRole);
        return data;
    }

    /** 把 {@code Register} 的 Result 拆成"是否成功 + 数据 + userId + 话术"，供两个注册流程共用。 */
    private static final class ResultHolder {
        final boolean ok;
        final Map<String, Object> data;
        final String userId;
        final String message;

        private ResultHolder(boolean ok, Map<String, Object> data, String userId, String message) {
            this.ok = ok;
            this.data = data;
            this.userId = userId;
            this.message = message;
        }

        @SuppressWarnings("unchecked")
        static ResultHolder of(Result<Object> rslt) {
            if (rslt == null) {
                return new ResultHolder(false, null, null, "注册失败");
            }
            boolean ok = rslt.getCode() == 200 && rslt.getData() != null;
            Map<String, Object> data = ok ? (Map<String, Object>) rslt.getData() : null;
            String userId = ok && data != null ? (String) data.get("userId") : null;
            return new ResultHolder(ok, data, userId, rslt.getMessage());
        }
    }

    // ==================== 业绩查询 ====================

    /**
     * 我的推广业绩（含默认推广码与转化率）。
     *
     * @param promoterTenantId 推广者所属租户（从令牌取）：>0 时附带我的租户编码/机构名/
     *        剩余名额（租户码卡片要展示"还能加多少人"，避免推广出去全是失败注册）；
     *        平台管理员为 0，不带这些字段。
     */
    public Map<String, Object> myAchievement(String promoterUserId, Long promoterTenantId) {
        PromoAchievement a = promoAchievementMapper.selectByPromoter(promoterUserId);
        List<PromoReferral> codes = myCodes(promoterUserId);
        Map<String, Object> data = new HashMap<>();
        data.put("promoterUserId", promoterUserId);
        data.put("promoterTenantId", promoterTenantId == null ? 0L : promoterTenantId);
        data.put("referralCodes", codes);
        data.put("referralCode", codes.isEmpty() ? null : codes.get(0).getReferralCode());
        if (promoterTenantId != null && promoterTenantId > 0) {
            Tenant mine = tenantService.getById(promoterTenantId);
            if (mine != null) {
                data.put("myTenantCode", mine.getTenantCode());
                data.put("myOrgName", mine.getOrgName());
                TenantPackage pkg = tenantPackageService.getByTenantId(promoterTenantId);
                if (pkg != null) {
                    Map<String, Object> quota = new HashMap<>();
                    quota.put("userTotalLimit", pkg.getUserTotalLimit());
                    quota.put("userCurrent", pkg.getUserCurrent());
                    data.put("tenantQuota", quota);
                }
            }
        }
        Map<String, Object> ach = new HashMap<>();
        if (a != null) {
            ach.put("totalClicks", a.getTotalClicks());
            ach.put("totalRegistered", a.getTotalRegistered());
            ach.put("totalApproved", a.getTotalApproved());
            ach.put("totalPaid", a.getTotalPaid());
            ach.put("totalTenantsCreated", a.getTotalTenantsCreated());
            ach.put("totalWxRegistered", a.getTotalWxRegistered());
            ach.put("totalRewardAmount", a.getTotalRewardAmount());
            ach.put("lastConversionAt", a.getLastConversionAt() == null ? null : a.getLastConversionAt().toString());
            int clicks = a.getTotalClicks() == null ? 0 : a.getTotalClicks();
            int registered = a.getTotalRegistered() == null ? 0 : a.getTotalRegistered();
            ach.put("conversionRate", clicks <= 0 ? "0%" :
                    BigDecimal.valueOf(registered * 100.0 / clicks).setScale(1, RoundingMode.HALF_UP) + "%");
        } else {
            ach.put("totalClicks", 0);
            ach.put("totalRegistered", 0);
            ach.put("totalApproved", 0);
            ach.put("totalPaid", 0);
            ach.put("totalTenantsCreated", 0);
            ach.put("totalWxRegistered", 0);
            ach.put("totalRewardAmount", BigDecimal.ZERO);
            ach.put("lastConversionAt", null);
            ach.put("conversionRate", "0%");
        }
        data.put("achievement", ach);
        return data;
    }

    /** 我的转化明细（分页，新→旧）。 */
    public PageResult<PromoConversion> myConversions(String promoterUserId, int pageNum, int pageSize) {
        LambdaQueryWrapper<PromoConversion> qw = new LambdaQueryWrapper<>();
        qw.eq(PromoConversion::getPromoterUserId, promoterUserId)
          .orderByDesc(PromoConversion::getRegisteredAt)
          .orderByDesc(PromoConversion::getId);
        Page<PromoConversion> page = promoConversionMapper.selectPage(
                new Page<>(Math.max(pageNum, 1), Math.min(Math.max(pageSize, 1), 100)), qw);
        return PageResult.of(page);
    }

    /** 全部推广者排行（platform_admin）。 */
    public PageResult<PromoAchievement> overview(int pageNum, int pageSize) {
        LambdaQueryWrapper<PromoAchievement> qw = new LambdaQueryWrapper<>();
        qw.orderByDesc(PromoAchievement::getTotalRegistered)
          .orderByAsc(PromoAchievement::getPromoterUserId);
        Page<PromoAchievement> page = promoAchievementMapper.selectPage(
                new Page<>(Math.max(pageNum, 1), Math.min(Math.max(pageSize, 1), 100)), qw);
        return PageResult.of(page);
    }

    // ==================== 两级统计（租户管理员 / 平台管理员） ====================

    /**
     * 租户推广统计（{@code GET /promo/achievement/tenant}，租户管理员）：
     * 本租户「租户码」的加入漏斗 + 推广人明细。
     *
     * <p>口径：{@code promo_referral(path_type=2, target_tenant_id=?)} 的码 →
     * {@code promo_conversion(path_type=2, invitee_tenant_id=?)} 的转化
     * （registerUser 里两者同源写入）。点击只计数不落明细（二期决策），
     * 故本统计只呈现真实加入漏斗，不含点击。
     *
     * <p>阶段口径：{@code joined}=全部；{@code pending}=registered（待审批）；
     * {@code approved}=approved ∪ paid（缴费前必先审批，故 paid 计入已审批）；
     * {@code paid}=paid。
     */
    public Map<String, Object> tenantStats(Long tenantId) {
        Map<String, Object> data = new HashMap<>();
        Tenant mine = tenantService.getById(tenantId);
        data.put("tenantId", tenantId);
        data.put("tenantCode", mine == null ? null : mine.getTenantCode());
        data.put("orgName", mine == null ? null : mine.getOrgName());
        TenantPackage pkg = tenantPackageService.getByTenantId(tenantId);
        if (pkg != null) {
            Map<String, Object> quota = new HashMap<>();
            quota.put("userTotalLimit", pkg.getUserTotalLimit());
            quota.put("userCurrent", pkg.getUserCurrent());
            data.put("tenantQuota", quota);
        }

        List<PromoReferral> codes = promoReferralMapper.listByTargetTenant(tenantId);
        List<PromoConversion> convs = promoConversionMapper.listByInviteeTenantPath(tenantId);

        // 推广人 → 码数（保序：先建码的在前）
        Map<String, Integer> codeCount = new LinkedHashMap<>();
        for (PromoReferral c : codes) {
            codeCount.merge(c.getPromoterUserId(), 1, Integer::sum);
        }
        // 推广人 → [joined, pending, approved, paid]
        Map<String, int[]> stage = new HashMap<>();
        for (PromoConversion c : convs) {
            int[] s = stage.computeIfAbsent(c.getPromoterUserId(), k -> new int[4]);
            s[0]++;
            String st = c.getStage();
            if ("registered".equals(st)) {
                s[1]++;
            } else if ("approved".equals(st) || "paid".equals(st)) {
                s[2]++;
                if ("paid".equals(st)) {
                    s[3]++;
                }
            }
        }

        // 姓名解析：promo 是平台级数据，推广人 user_id 理论上在本租户，
        // 仍走 IgnoreTenant 批量查（不依赖调用方租户上下文，统计接口要看全量）。
        java.util.Set<String> pids = new java.util.LinkedHashSet<>(codeCount.keySet());
        pids.addAll(stage.keySet());
        Map<String, User> users = loadUsersForStats(pids);

        List<Map<String, Object>> promoters = new ArrayList<>();
        int tJoined = 0, tPending = 0, tApproved = 0, tPaid = 0;
        for (String pid : pids) {
            int[] s = stage.getOrDefault(pid, new int[4]);
            User u = users.get(pid);
            Map<String, Object> row = new HashMap<>();
            row.put("promoterUserId", pid);
            row.put("promoterName", u == null ? null : u.getName());
            row.put("promoterAccount", u == null ? null : u.getAccount());
            row.put("promoterRole", u == null ? null : u.getRole());
            row.put("codeCount", codeCount.getOrDefault(pid, 0));
            row.put("joined", s[0]);
            row.put("pending", s[1]);
            row.put("approved", s[2]);
            row.put("paid", s[3]);
            promoters.add(row);
            tJoined += s[0];
            tPending += s[1];
            tApproved += s[2];
            tPaid += s[3];
        }
        promoters.sort((x, y) -> {
            int c = Integer.compare((Integer) y.get("joined"), (Integer) x.get("joined"));
            if (c != 0) {
                return c;
            }
            c = Integer.compare((Integer) y.get("codeCount"), (Integer) x.get("codeCount"));
            if (c != 0) {
                return c;
            }
            return String.valueOf(x.get("promoterUserId")).compareTo(String.valueOf(y.get("promoterUserId")));
        });

        Map<String, Object> totals = new HashMap<>();
        totals.put("codeCount", codes.size());
        totals.put("promoterCount", pids.size());
        totals.put("joined", tJoined);
        totals.put("pending", tPending);
        totals.put("approved", tApproved);
        totals.put("paid", tPaid);
        data.put("totals", totals);
        data.put("promoters", promoters);
        log.info("租户推广统计, tenant={}, codes={}, joined={}", tenantId, codes.size(), tJoined);
        return data;
    }

    /**
     * 平台推广统计（{@code GET /promo/achievement/platform}，平台管理员）：
     * 全平台合计 + 推广者排行 Top20 + 最近转化 10 条。
     *
     * <p>姓名/租户名解析走 {@code UserMapper.listByIdsIgnoreTenant} 与
     * {@code sys_tenant}（均已排除租户插件）——业绩行里的 user_id 可能属于任意租户。
     */
    public Map<String, Object> platformStats() {
        Map<String, Object> data = new HashMap<>();
        PromoAchievement sum = promoAchievementMapper.sumTotals();
        long promoters = promoAchievementMapper.selectCount(null);

        Map<String, Object> totals = new HashMap<>();
        totals.put("promoters", promoters);
        totals.put("clicks", sum == null || sum.getTotalClicks() == null ? 0 : sum.getTotalClicks());
        totals.put("registered", sum == null || sum.getTotalRegistered() == null ? 0 : sum.getTotalRegistered());
        totals.put("approved", sum == null || sum.getTotalApproved() == null ? 0 : sum.getTotalApproved());
        totals.put("paid", sum == null || sum.getTotalPaid() == null ? 0 : sum.getTotalPaid());
        totals.put("tenantsCreated", sum == null || sum.getTotalTenantsCreated() == null ? 0 : sum.getTotalTenantsCreated());
        totals.put("usersJoined", promoConversionMapper.countByPathType(PATH_USER));
        totals.put("wxRegistered", sum == null || sum.getTotalWxRegistered() == null ? 0 : sum.getTotalWxRegistered());
        totals.put("rewardAmount", sum == null || sum.getTotalRewardAmount() == null
                ? BigDecimal.ZERO : sum.getTotalRewardAmount());
        data.put("totals", totals);

        List<PromoAchievement> top = promoAchievementMapper.listTopByRegistered(20);
        List<PromoConversion> recent = promoConversionMapper.listRecent(10);

        java.util.Set<String> userIds = new java.util.HashSet<>();
        for (PromoAchievement a : top) {
            userIds.add(a.getPromoterUserId());
        }
        for (PromoConversion c : recent) {
            userIds.add(c.getPromoterUserId());
            userIds.add(c.getInviteeUserId());
        }
        Map<String, User> users = loadUsersForStats(userIds);
        Map<Long, String> tenantNames = new HashMap<>();
        List<Map<String, Object>> ranking = new ArrayList<>();
        int rank = 0;
        for (PromoAchievement a : top) {
            rank++;
            User u = users.get(a.getPromoterUserId());
            Map<String, Object> row = new HashMap<>();
            row.put("rank", rank);
            row.put("promoterUserId", a.getPromoterUserId());
            row.put("promoterName", u == null ? null : u.getName());
            row.put("promoterAccount", u == null ? null : u.getAccount());
            row.put("tenantName", tenantNameOf(a.getPromoterTenantId(), tenantNames));
            row.put("totalClicks", a.getTotalClicks() == null ? 0 : a.getTotalClicks());
            row.put("totalRegistered", a.getTotalRegistered() == null ? 0 : a.getTotalRegistered());
            row.put("totalApproved", a.getTotalApproved() == null ? 0 : a.getTotalApproved());
            row.put("totalPaid", a.getTotalPaid() == null ? 0 : a.getTotalPaid());
            row.put("totalRewardAmount", a.getTotalRewardAmount() == null ? BigDecimal.ZERO : a.getTotalRewardAmount());
            ranking.add(row);
        }

        List<Map<String, Object>> recentRows = new ArrayList<>();
        for (PromoConversion c : recent) {
            User promoter = users.get(c.getPromoterUserId());
            User invitee = users.get(c.getInviteeUserId());
            Map<String, Object> row = new HashMap<>();
            row.put("registeredAt", c.getRegisteredAt() == null ? null : c.getRegisteredAt().toString());
            row.put("promoterName", promoter == null ? null : promoter.getName());
            row.put("inviteeName", invitee == null ? null : invitee.getName());
            row.put("pathType", c.getPathType());
            row.put("tenantCode", c.getTenantCode() != null ? c.getTenantCode()
                    : tenantNameOf(c.getInviteeTenantId(), tenantNames));
            row.put("stage", c.getStage());
            row.put("source", c.getSource());
            recentRows.add(row);
        }

        data.put("ranking", ranking);
        data.put("recent", recentRows);
        return data;
    }

    /** 租户名缓存查询（sys_tenant 已排除租户插件；查不到的租户返回 null）。 */
    private String tenantNameOf(Long tenantId, Map<Long, String> cache) {
        if (tenantId == null) {
            return null;
        }
        String cached = cache.get(tenantId);
        if (cached != null) {
            return cached;
        }
        Tenant t = tenantService.getById(tenantId);
        String name = t == null ? null : t.getOrgName();
        cache.put(tenantId, name);
        return name;
    }

    /**
     * 统计专用：批量取用户并解密姓名，返回 userId → User。
     *
     * <p><b>为什么必须就地解密</b>：{@code user.name} 入库加密、解密是服务级动作
     * （{@code UserService.decryptUserFields}，无 MyBatis TypeHandler），
     * 裸 {@code SELECT} 拿到的是密文（{@code hex:base64} 形态）。
     * 账号（account）是登录标识、不明文加密，无需处理；
     * 空值与历史明文由 {@code CryptoUtil.decrypt} 原样透传，可安全调用。
     */
    private Map<String, User> loadUsersForStats(java.util.Collection<String> ids) {
        Map<String, User> users = new HashMap<>();
        if (ids == null || ids.isEmpty()) {
            return users;
        }
        for (User u : userService.listByIdsIgnoreTenant(ids)) {
            u.setName(cryptoUtil.decrypt(u.getName()));
            users.put(u.getUserId(), u);
        }
        return users;
    }
}
