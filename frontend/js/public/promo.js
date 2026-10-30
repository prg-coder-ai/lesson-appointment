/**
 * 推广体系前端逻辑（2026-10-13 二期；双码改造 2026-10-13）。
 *
 * 两个消费者：
 *   ① login.html —— URL 带 ref/path/tcode/inviter/source 时渲染推广注册表单
 *      （路径1 自助建租户 / 路径2 加入指定租户），首次访问带 touch=1 让后端点击 +1
 *      （localStorage 按 ref 去重，只上报一次）。路径1 表单含「所属行业」下拉
 *      （默认教育培训，随注册提交，服务端对缺省/无效值有兜底与校验）；
 *      路径2 注册成功后跳转 login.html?tCode=<租户编码>&registered=1
 *      —— 租户编码进 URL，登录页据此锁定租户，登录后的跳转链才带得住它。
 *   ② promo.html —— 推广业绩页：双推广码卡（平台码/租户码，可复制链接与码）、
 *      业绩汇总卡、转化明细表。每个已登录用户都可进入；租户码对平台管理员隐藏
 *      （平台管理员不属于任何租户，目标租户由服务端从令牌派生）。
 *
 * 依赖（均由页面先加载）：
 *   · window.request        utility_request.js 的 axios 实例（响应已解包为 data）
 *   · window.ApiPaths       shared-domain-bridge.js 桥接（PROMO 系列端点常量）
 *   · window.pageUrl        api.js（拼带 tCode 的地址）
 *
 * ⚠️ 全局作用域铁律：整个文件包 IIFE，只经 window.Promo* 显式导出，
 * 避免与登录页/业绩页既有顶层标识符冲突（check:global-collide 守卫）。
 */
(function () {
  'use strict';

  var ENDPOINTS = window.ApiPaths && window.ApiPaths.ENDPOINTS ? window.ApiPaths.ENDPOINTS : {};

  // ==================== 公共工具 ====================

  function readStorage(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function writeStorage(key, val) {
    try { localStorage.setItem(key, val); } catch (e) { /* 隐私模式忽略 */ }
  }
  function currentUser() {
    try { return JSON.parse(readStorage('currentUser') || 'null'); } catch (e) { return null; }
  }
  function redirectByRole(user) {
    if (typeof window.redirectToUserPage === 'function') {
      window.redirectToUserPage(user);
    } else if (user && user.role === 'admin') {
      window.location.href = 'admin.html';
    } else if (user && user.role === 'platform_admin') {
      window.location.href = 'platform_admin.html';
    } else {
      window.location.href = 'student.html';
    }
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ==================== ① login.html：推广落地 ====================

  /** 解析 URL 上的推广参数（契约：ref + inviter 同时带，path/tcode/source 可选）。 */
  function getPromoParamsFromUrl() {
    var p = new URLSearchParams(window.location.search);
    return {
      ref: p.get('ref') || '',
      path: p.get('path') || '',
      tcode: p.get('tcode') || p.get('tCode') || '',
      inviter: p.get('inviter') || '',
      source: p.get('source') || ''
    };
  }

  /**
   * 登录页推广初始化：有 ref 才动作。
   * 首次访问（storage 无 promoClicked:<ref>）带 touch=1 → 后端 total_clicks +1。
   */
  async function initPromoLanding() {
    var promo = getPromoParamsFromUrl();
    if (!promo.ref) return; // 非推广链接：常规登录页，不做任何改写

    var touch = true;
    if (readStorage('promoClicked:' + promo.ref)) {
      touch = false; // 同一浏览器重复打开不重复计数
    } else {
      writeStorage('promoClicked:' + promo.ref, '1');
    }

    var info = null;
    try {
      info = await window.request({
        url: ENDPOINTS.PROMO_VALIDATE_CODE(promo.ref, touch),
        method: 'GET',
        // 公开端点：401 只可能是后端白名单漏配/旧代码，不是"登录过期"——
        // 不触发清场跳转（noAuthRedirect），由下方 catch 静默降级为无效码提示，
        // 否则会把用户从推广落地页踢到裸 login.html（2026-10-14 修复）。
        noAuthRedirect: true
      });
    } catch (e) {
      info = null; // 校验失败静默：不弹错误，保持常规登录页可用
    }
    if (!info || !info.valid) {
      showPromoInvalid(promo.ref);
      return;
    }
    // 归因参数暂存：注册成功后随 setSession 一起上报（三种登录方式对归因透明）
    writeStorage('promoAttribution', JSON.stringify({
      ref: promo.ref, inviter: promo.inviter, source: promo.source || 'landing'
    }));

    if (info.pathType === 1) {
      openTenantModal(info);
      loadIndustryOptions(); // 所属行业下拉（异步加载，不阻塞弹窗展示）
    } else {
      // URL 归一：租户码链接带的是小写 tcode，而页面跳转体系（api.js 的
      // resolveTenantCode / pageUrl）只认 tCode。这里补一个等值的 tCode 参数，
      // 用户若关闭注册弹窗直接在登录页登录，登录后的跳转链也带得住租户编码。
      normalizeTenantCodeParam(promo.tcode);
      openUserModal(info, promo);
    }
  }

  /**
   * URL 归一：给地址栏补一个与 {@code tcode} 等值的 {@code tCode} 参数（2026-10-13 修订）。
   *
   * <p>{@code history.replaceState} 不刷新页面、不产生历史记录，仅统一参数名口径：
   * 推广链接约定用小写 {@code tcode}，页面跳转体系（api.js）约定用 {@code tCode}，
   * 两者只差大小写但读取方互不兼容（getUrlParam 大小写敏感）。
   */
  function normalizeTenantCodeParam(tcode) {
    if (!tcode) return;
    try {
      var params = new URLSearchParams(window.location.search);
      if (params.get('tCode')) return; // 已是规范形态，不重复补
      params.set('tCode', tcode);
      window.history.replaceState(null, '',
        window.location.pathname + '?' + params.toString() + (window.location.hash || ''));
    } catch (e) { /* 隐私模式等异常忽略，不影响注册主流程 */ }
  }

  /** 默认行业编码/名称（教育培训）：与后端 PromoService 的兜底口径一致。 */
  var DEFAULT_INDUSTRY_CODE = 'education';
  var DEFAULT_INDUSTRY_NAME = '教育培训';

  /**
   * 加载「所属行业」下拉（路径1 弹窗）：GET /industry/options（免登录，仅启用行业）。
   *
   * <p>默认选中「教育培训」：按 code 精确匹配 → 退化按名称 → 退化第一项；
   * 加载失败时保留一个空值失败项，由提交校验给出明确提示（服务端另有默认兜底，
   * API 客户端不传 industryId 也不会拿到"无行业"的租户）。
   */
  async function loadIndustryOptions() {
    var sel = document.getElementById('promo-industry');
    if (!sel) return;
    var list = [];
    try {
      // noAuthRedirect：行业下拉是公开端点，旧后端/漏配返回 401 时只走下方
      // "行业加载失败"提示分支，绝不清场踢人（2026-10-14 修复）。
      list = (await window.request({
        url: ENDPOINTS.INDUSTRY_OPTIONS, method: 'GET', noAuthRedirect: true
      })) || [];
    } catch (e) {
      list = []; // 失败走下面的提示分支，不抛断弹窗
    }
    if (!Array.isArray(list) || list.length === 0) {
      sel.innerHTML = '<option value="">行业加载失败，请刷新页面重试</option>';
      return;
    }
    var html = '';
    var defaultId = '';
    for (var i = 0; i < list.length; i++) {
      var it = list[i] || {};
      html += '<option value="' + escapeHtml(it.id) + '">' + escapeHtml(it.name || it.code || '') + '</option>';
      if (!defaultId && (it.code === DEFAULT_INDUSTRY_CODE || it.name === DEFAULT_INDUSTRY_NAME)) {
        defaultId = String(it.id);
      }
    }
    if (!defaultId) defaultId = String(list[0].id); // 字典被改名时兜底第一项
    sel.innerHTML = html;
    sel.value = defaultId;
  }

  function showPromoInvalid(ref) {
    var tip = document.getElementById('promo-invalid-tip');
    if (!tip) return;
    tip.textContent = '推广码 ' + ref + ' 无效或已停用，您仍可正常登录或注册';
    tip.style.display = 'block';
  }

  function openTenantModal(info) {
    var modal = document.getElementById('promo-tenant-modal');
    if (!modal) return;
    var days = document.getElementById('promo-trial-days');
    if (days) days.textContent = info.trialDays || 14;
    modal.style.display = 'flex';
  }

  function openUserModal(info, promo) {
    var modal = document.getElementById('promo-user-modal');
    if (!modal) return;
    var org = document.getElementById('promo-user-org');
    if (org) org.textContent = info.targetOrgName || promo.tcode || '';
    // 锁定租户编码：优先 validate 反查的 targetTenantCode（ref 是唯一真相源），
    // 链接没带 tcode（如小程序 scene 只有 ref）时也能锁住租户。
    var tc = document.getElementById('promo-user-tcode');
    if (tc) tc.value = info.targetTenantCode || promo.tcode || '';
    modal.style.display = 'flex';
  }

  /** 保存会话（与 login.html 登录成功分支同一套 key：token/refreshToken/currentUser）。 */
  function savePromoSession(data, tenantCode) {
    var user = {
      userId: data.userId,
      account: data.account,
      role: data.role,
      token: data.token,
      name: data.name || '',
      tenantCode: tenantCode
    };
    writeStorage('currentUser', JSON.stringify(user));
    if (data.token) writeStorage('token', data.token);
    writeStorage('refreshToken', data.refreshToken || '');
    return user;
  }

  /** 归因上报（幂等：uk_conversion_invitee 去重，失败不影响主流程）。 */
  async function reportAttribution() {
    var attr = null;
    try { attr = JSON.parse(readStorage('promoAttribution') || 'null'); } catch (e) { /* ignore */ }
    if (!attr || (!attr.ref && !attr.inviter)) return;
    try {
      await window.request({
        url: ENDPOINTS.TRACK_ATTRIBUTION,
        method: 'POST',
        data: { ref: attr.ref, inviter: attr.inviter, source: attr.source }
      });
    } catch (e) { /* 归因是附属账，失败静默 */ }
  }

  /** 路径1 提交：自助建租户 + 首管理员。 */
  async function submitTenantForm() {
    var errTip = document.getElementById('promo-tenant-error');
    var okTip = document.getElementById('promo-tenant-success');
    if (errTip) { errTip.style.display = 'none'; }
    if (okTip) { okTip.style.display = 'none'; }
    var attr = {};
    try { attr = JSON.parse(readStorage('promoAttribution') || '{}'); } catch (e) { /* ignore */ }

    var orgName = (document.getElementById('promo-org-name').value || '').trim();
    var account = (document.getElementById('promo-admin-account').value || '').trim();
    var name = (document.getElementById('promo-admin-name').value || '').trim();
    var phone = (document.getElementById('promo-admin-phone').value || '').trim();
    var pwd = document.getElementById('promo-admin-password').value || '';
    var pwd2 = document.getElementById('promo-admin-password2').value || '';
    var industryId = (document.getElementById('promo-industry').value || '').trim();

    if (!orgName || !account || !pwd) {
      if (errTip) { errTip.textContent = '机构名称、管理员账号、密码不能为空'; errTip.style.display = 'block'; }
      return;
    }
    if (pwd !== pwd2) {
      if (errTip) { errTip.textContent = '两次输入的密码不一致'; errTip.style.display = 'block'; }
      return;
    }
    if (!industryId) {
      // 只有行业下拉加载失败才会是空值：正常形态必有默认选中项
      if (errTip) { errTip.textContent = '请选择所属行业（加载失败请刷新页面重试）'; errTip.style.display = 'block'; }
      return;
    }
    // 合规：场景 A（租户自注册 → 平台对租户协议）采用隐式签署——
    //   前端不再展示勾选项，注册即视为同意；注册成功后 L294-297 自动调 /legal/accept 完成留痕。
    //   场景 B（租户对用户）：终端用户在 register-modal 显式勾选，链接动态拼 tenant 参数。
    // var agreeCb = document.getElementById('promo-tenant-agree-legal');
    // var agreeErr = document.getElementById('promo-tenant-agree-error');
    // if (agreeCb && !agreeCb.checked) {
    //   if (agreeErr) agreeErr.style.display = 'block';
    //   return;
    // }
    // if (agreeErr) agreeErr.style.display = 'none';
    var btn = document.getElementById('promo-tenant-btn');
    if (btn) btn.disabled = true;
    try {
      var data = await window.request({
        url: ENDPOINTS.PROMO_REGISTER_TENANT,
        method: 'POST',
        data: {
          referralCode: attr.ref || '',
          orgName: orgName,
          industryId: industryId ? Number(industryId) : null,
          account: account,
          name: name,
          phone: phone,
          password: pwd,
          source: attr.source || 'landing'
        }
      });
      var user = savePromoSession(data, data.tenantCode);
      await reportAttribution();
      // 场景 B：注册成功即记录对当前生效版协议/政策的签署留痕（fire-and-forget）
      if (data.token) {
        ['user_agreement', 'privacy_policy'].forEach(function (dt) {
          try { window.request({ url: '/legal/accept', method: 'POST', noAuthRedirect: true, data: { docType: dt, channel: 'promo_tenant' } }); } catch (e) { /* ignore */ }
        });
      }
      if (okTip) {
        okTip.textContent = '注册成功！租户编码 ' + (data.tenantCode || '') +
          '，免费体验 ' + (data.trialDays || 14) + ' 天，正在进入管理端...';
        okTip.style.display = 'block';
      }
      setTimeout(function () { redirectByRole(user); }, 1200);
    } catch (e) {
      if (errTip) {
        errTip.textContent = (e && e.message) || '注册失败，请稍后再试';
        errTip.style.display = 'block';
      }
      if (btn) btn.disabled = false;
    }
  }

  /** 路径2 提交：加入指定租户（student/teacher，待审批）。 */
  async function submitUserForm() {
    var errTip = document.getElementById('promo-user-error');
    var okTip = document.getElementById('promo-user-success');
    if (errTip) { errTip.style.display = 'none'; }
    if (okTip) { okTip.style.display = 'none'; }
    var attr = {};
    try { attr = JSON.parse(readStorage('promoAttribution') || '{}'); } catch (e) { /* ignore */ }

    var account = (document.getElementById('promo-user-account').value || '').trim();
    var name = (document.getElementById('promo-user-name').value || '').trim();
    var phone = (document.getElementById('promo-user-phone').value || '').trim();
    var pwd = document.getElementById('promo-user-password').value || '';
    var pwd2 = document.getElementById('promo-user-password2').value || '';
    var role = document.getElementById('promo-user-role').value || 'student';
    var tcode = (document.getElementById('promo-user-tcode').value || '').trim();

    if (!account || !pwd) {
      if (errTip) { errTip.textContent = '账号、密码不能为空'; errTip.style.display = 'block'; }
      return;
    }
    if (pwd !== pwd2) {
      if (errTip) { errTip.textContent = '两次输入的密码不一致'; errTip.style.display = 'block'; }
      return;
    }
    var btn = document.getElementById('promo-user-btn');
    if (btn) btn.disabled = true;
    try {
      await window.request({
        url: ENDPOINTS.PROMO_REGISTER_USER,
        method: 'POST',
        data: {
          referralCode: attr.ref || '',
          tenantCode: tcode,
          account: account,
          name: name,
          phone: phone,
          password: pwd,
          role: role,
          source: attr.source || 'landing'
        }
      });
      await reportAttribution();
      if (okTip) {
        okTip.textContent = '注册申请已提交，请等待管理员审批；审批通过后即可登录。正在返回登录页...';
        okTip.style.display = 'block';
      }
      // 2026-10-13 修订：注册后跳转的 URL 必须带租户编码参数（与常规注册 submitRegister
      // 同一约定：login.html?tCode=<注册时的租户编码>&registered=1）。
      //  · tCode：登录页据此锁定租户（applyTcodeToLogin 隐藏并锁定身份/租户编码），
      //    登录成功后 redirectToUserPage 也靠 resolveTenantCode 从 URL 取到它，
      //    拼出带 tCode 的角色页——否则入口守卫 guardEntryPage 会以「URL 无 tCode /
      //    与本地 tenantCode 不一致」把人弹回登录页（租户端角色的死循环）。
      //  · registered=1：告知登录页停留在登录表单并显示绿色提示，不被「已登录自动跳转」弹走。
      // 租户编码取自表单里的锁定值（打开弹窗时由 validate 接口的 targetTenantCode 反填，
      // ref 是唯一真相源，不信任链接上可能被篡改的 tcode）。
      var regTenantCode = (document.getElementById('promo-user-tcode').value || '').trim();
      var loginUrl = regTenantCode
        ? './login.html?tCode=' + encodeURIComponent(regTenantCode) + '&registered=1'
        : './login.html?registered=1';
      setTimeout(function () { window.location.assign(loginUrl); }, 2000);
    } catch (e) {
      if (errTip) {
        errTip.textContent = (e && e.message) || '注册失败，请稍后再试';
        errTip.style.display = 'block';
      }
      if (btn) btn.disabled = false;
    }
  }

  // ==================== ② promo.html：业绩页 ====================

  /** 入口守卫：未登录回 login.html（不限角色——每个已登录用户都有自己的推广页）。 */
  function guardPromoPage() {
    var user = currentUser();
    if (!user || !user.token) {
      window.location.href = (typeof window.pageUrl === 'function')
        ? window.pageUrl('login.html') : './login.html';
      return null;
    }
    return user;
  }

  async function loadAchievement() {
    var data = await window.request({ url: ENDPOINTS.PROMO_ACHIEVEMENT, method: 'GET' });
    renderAchievement(data);
    return data;
  }

  function renderAchievement(data) {
    var ach = (data && data.achievement) || {};
    var setText = function (id, v) {
      var el = document.getElementById(id);
      if (el) el.textContent = v;
    };
    setText('stat-clicks', ach.totalClicks || 0);
    setText('stat-registered', ach.totalRegistered || 0);
    setText('stat-approved', ach.totalApproved || 0);
    setText('stat-paid', ach.totalPaid || 0);
    setText('stat-tenants', ach.totalTenantsCreated || 0);
    setText('stat-wx', ach.totalWxRegistered || 0);
    setText('stat-rate', ach.conversionRate || '0%');
    setText('stat-reward', ach.totalRewardAmount == null ? '0' : ach.totalRewardAmount);

    // —— 双码卡片：平台码（pathType=1）+ 租户码（pathType=2）——
    var codes = (data && data.referralCodes) || [];
    var platformCode = null;
    var tenantCode = null;
    for (var i = 0; i < codes.length; i++) {
      if (codes[i] && codes[i].pathType === 2) {
        tenantCode = codes[i];
      } else if (codes[i]) {
        platformCode = codes[i];
      }
    }
    renderCodeCard(1, platformCode, data);
    renderCodeCard(2, tenantCode, data);

    // 平台管理员没有归属租户：隐藏租户码卡并给出说明（目标租户由服务端派生，前端也无从拼链接）
    var user = currentUser();
    var tenantCard = document.getElementById('promo-card-tenant');
    var noneTip = document.getElementById('promo-tenant-none');
    if (tenantCard) {
      var isPlatform = !!(user && user.role === 'platform_admin');
      tenantCard.style.display = isPlatform ? 'none' : '';
      if (noneTip) noneTip.style.display = isPlatform ? 'block' : 'none';
    }

    // 租户名额提示（满员后新用户无法加入，推广前先让推广者看到）
    var quotaEl = document.getElementById('promo-tenant-quota');
    if (quotaEl) {
      var q = data && data.tenantQuota;
      if (q && q.userTotalLimit != null) {
        var limit = q.userTotalLimit;
        var cur = q.userCurrent || 0;
        quotaEl.textContent = limit > 0
          ? '本租户名额：已用 ' + cur + ' / ' + limit + '，剩余 ' + Math.max(limit - cur, 0) + '（满员后新用户将无法加入）'
          : '本租户名额：不限（已加入 ' + cur + ' 人）';
      } else {
        quotaEl.textContent = '';
      }
    }
  }

  /** 渲染一张码卡：pathType 1=平台码 2=租户码；code=码对象（null=尚未生成）。 */
  function renderCodeCard(pathType, code, data) {
    var suffix = pathType === 2 ? '-tenant' : '-platform';
    var codeEl = document.getElementById('promo-code' + suffix);
    var linkEl = document.getElementById('promo-link' + suffix);
    var codeText = code && code.referralCode ? code.referralCode : '';
    if (codeEl) codeEl.textContent = codeText || '尚未生成';
    if (linkEl) linkEl.value = codeText ? buildPromoLink(codeText, pathType, data) : '';
  }

  /**
   * 拼注册落地链接：
   *   · 平台码：login.html?ref=<code>
   *   · 租户码：login.html?ref=<code>&path=2&tcode=<我的租户编码>（登录页据此锁租户）
   */
  function buildPromoLink(code, pathType, data) {
    // 允许部署方注入 PROMO_PUBLIC_ORIGIN 覆盖落地域名（如开发机局域网 IP），
    // 使手机扫码能访问到本机；默认沿用当前页面 origin，行为不变。
    var origin = window.PROMO_PUBLIC_ORIGIN || window.location.origin;
    var link = origin + '/login.html?ref=' + encodeURIComponent(code);
    if (pathType === 2) {
      link += '&path=2&tcode=' + encodeURIComponent((data && data.myTenantCode) || '');
    }
    return link;
  }

  async function loadConversions(pageNum) {
    var data = await window.request({
      url: ENDPOINTS.PROMO_CONVERSIONS(pageNum || 1, 20),
      method: 'GET'
    });
    renderConversions(data);
  }

  var STAGE_TEXT = { registered: '已注册', approved: '已审批', paid: '已缴费', expired: '已过期' };

  function renderConversions(page) {
    var tbody = document.getElementById('promo-conversions-body');
    if (!tbody) return;
    // 分页契约是 PageResult：rows + total（与 admin-*.js 各列表页一致）。
    // 曾误读 page.records（IPage 的字段名）→ 转化明细表恒空，T6/T10c 端到端测试抓出。
    var records = (page && page.rows) || [];
    if (!records.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#888;">暂无转化记录</td></tr>';
      return;
    }
    tbody.innerHTML = records.map(function (r) {
      return '<tr>' +
        '<td>' + escapeHtml(r.referralCode) + '</td>' +
        '<td>' + (r.pathType === 1 ? '自助建租户' : '加入租户') + '</td>' +
        '<td>' + escapeHtml(r.tenantCode || '-') + '</td>' +
        '<td>' + escapeHtml(STAGE_TEXT[r.stage] || r.stage) + '</td>' +
        '<td>' + escapeHtml(r.source || '-') + '</td>' +
        '<td>' + escapeHtml(r.registeredAt || '-') + '</td>' +
        '</tr>';
    }).join('');
    var total = document.getElementById('promo-conversions-total');
    if (total) total.textContent = page.total || records.length;
  }

  /**
   * 生成/获取推广码（pathType 1=平台码 2=租户码）。
   *
   * <p>只传 pathType：租户码的目标租户由服务端从令牌派生（推广者自己的租户），
   * 不接受客户端传值——否则可给任意租户生成码刷业绩。
   */
  async function generateCode(pathType) {
    var data = await window.request({
      url: ENDPOINTS.PROMO_GENERATE_CODE,
      method: 'POST',
      data: { pathType: pathType === 2 ? 2 : 1 }
    });
    await loadAchievement();
    return data;
  }

  // —— 复制（链接/推广码，平台码与租户码各一套）——

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* 老浏览器忽略 */ }
    document.body.removeChild(ta);
  }

  function copyToClipboard(text, onDone) {
    var done = function () { if (onDone) onDone(); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text); done(); });
    } else {
      legacyCopy(text);
      done();
    }
  }

  function flashButton(el, text) {
    if (!el) return;
    var old = el.textContent;
    el.textContent = text || '已复制';
    setTimeout(function () { el.textContent = old; }, 1500);
  }

  function copyPromoLink(pathType) {
    var linkEl = document.getElementById(pathType === 2 ? 'promo-link-tenant' : 'promo-link-platform');
    if (!linkEl || !linkEl.value) return;
    copyToClipboard(linkEl.value, function () {
      flashButton(document.getElementById(pathType === 2 ? 'promo-copy-btn-tenant' : 'promo-copy-btn-platform'));
    });
  }

  function copyPromoCode(pathType) {
    var codeEl = document.getElementById(pathType === 2 ? 'promo-code-tenant' : 'promo-code-platform');
    var text = codeEl ? (codeEl.textContent || '') : '';
    if (!text || text === '尚未生成' || text === '加载中...') return;
    copyToClipboard(text, function () {
      flashButton(document.getElementById(pathType === 2 ? 'promo-copycode-btn-tenant' : 'promo-copycode-btn-platform'), '已复制码');
    });
  }

  // —— 二维码（本地生成，不依赖网络；渐进增强，库加载失败仅影响本功能）——
  function showPromoQr(pathType) {
    var linkEl = document.getElementById(pathType === 2 ? 'promo-link-tenant' : 'promo-link-platform');
    var link = linkEl ? linkEl.value : '';
    if (!link) {
      var tip = document.getElementById('promo-page-error');
      if (tip) { tip.textContent = '请先生成推广码再生成二维码'; tip.style.display = 'block'; }
      return;
    }
    var box = document.getElementById('promo-qr-box');
    if (!box) return;
    var title = document.getElementById('promo-qr-title');
    if (title) title.textContent = pathType === 2 ? '租户推广二维码' : '平台推广二维码';
    box.innerHTML = ''; // qrcodejs 对同容器重复 makeCode 会叠加画布，先清空
    try {
      if (typeof window.QRCode !== 'function') throw new Error('组件未加载');
      new window.QRCode(box, {
        text: link,
        width: 220,
        height: 220,
        colorDark: '#1f2937',
        colorLight: '#ffffff',
        correctLevel: window.QRCode.CorrectLevel.M
      });
    } catch (e) {
      box.innerHTML = '<div style="padding:24px;color:#c05656;font-size:13px;">二维码组件加载失败，请刷新页面</div>';
    }
    var mask = document.getElementById('promo-qr-mask');
    if (mask) mask.classList.add('show');
  }

  function closePromoQr() {
    var mask = document.getElementById('promo-qr-mask');
    if (mask) mask.classList.remove('show');
  }

  /** 返回各角色主页（从侧栏"我的推广"跳过来时用）。 */
  function goBack() {
    redirectByRole(currentUser());
  }

  async function initPromoPage() {
    var user = guardPromoPage();
    if (!user) return;
    var nameEl = document.getElementById('promo-user-name-display');
    if (nameEl) nameEl.textContent = user.name || user.account || '';
    try {
      await loadAchievement();
      await loadConversions(1);
    } catch (e) {
      var err = document.getElementById('promo-page-error');
      if (err) {
        err.textContent = (e && e.message) || '加载失败，请刷新重试';
        err.style.display = 'block';
      }
    }
  }

  // ==================== 导出 ====================

  window.PromoLanding = {
    init: initPromoLanding,
    submitTenantForm: submitTenantForm,
    submitUserForm: submitUserForm
  };
  window.PromoPage = {
    init: initPromoPage,
    generateCode: generateCode,
    copyLink: copyPromoLink,
    copyCode: copyPromoCode,
    showQr: showPromoQr,
    closeQr: closePromoQr,
    goBack: goBack,
    reloadConversions: function (p) { return loadConversions(p); }
  };
})();
