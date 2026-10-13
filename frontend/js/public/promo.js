/**
 * 推广体系前端逻辑（2026-10-13 二期）。
 *
 * 两个消费者：
 *   ① login.html —— URL 带 ref/path/tcode/inviter/source 时渲染推广注册表单
 *      （路径1 自助建租户 / 路径2 加入指定租户），首次访问带 touch=1 让后端点击 +1
 *      （localStorage 按 ref 去重，只上报一次）。
 *   ② promo.html —— 推广业绩页：我的推广码（可复制链接）、业绩汇总卡、转化明细表。
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
        method: 'GET'
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
    } else {
      openUserModal(info, promo);
    }
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
    var tc = document.getElementById('promo-user-tcode');
    if (tc) tc.value = promo.tcode || '';
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

    if (!orgName || !account || !pwd) {
      if (errTip) { errTip.textContent = '机构名称、管理员账号、密码不能为空'; errTip.style.display = 'block'; }
      return;
    }
    if (pwd !== pwd2) {
      if (errTip) { errTip.textContent = '两次输入的密码不一致'; errTip.style.display = 'block'; }
      return;
    }
    var btn = document.getElementById('promo-tenant-btn');
    if (btn) btn.disabled = true;
    try {
      var data = await window.request({
        url: ENDPOINTS.PROMO_REGISTER_TENANT,
        method: 'POST',
        data: {
          referralCode: attr.ref || '',
          orgName: orgName,
          account: account,
          name: name,
          phone: phone,
          password: pwd,
          source: attr.source || 'landing'
        }
      });
      var user = savePromoSession(data, data.tenantCode);
      await reportAttribution();
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
        okTip.textContent = '注册申请已提交，请等待管理员审批；审批通过后即可登录。';
        okTip.style.display = 'block';
      }
      if (btn) btn.disabled = false;
    } catch (e) {
      if (errTip) {
        errTip.textContent = (e && e.message) || '注册失败，请稍后再试';
        errTip.style.display = 'block';
      }
      if (btn) btn.disabled = false;
    }
  }

  // ==================== ② promo.html：业绩页 ====================

  /** 入口守卫：未登录回 login.html。 */
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
    var code = (data && data.referralCode) || '';
    var setText = function (id, v) {
      var el = document.getElementById(id);
      if (el) el.textContent = v;
    };
    setText('promo-code', code || '尚未生成');
    setText('stat-clicks', ach.totalClicks || 0);
    setText('stat-registered', ach.totalRegistered || 0);
    setText('stat-approved', ach.totalApproved || 0);
    setText('stat-paid', ach.totalPaid || 0);
    setText('stat-tenants', ach.totalTenantsCreated || 0);
    setText('stat-wx', ach.totalWxRegistered || 0);
    setText('stat-rate', ach.conversionRate || '0%');
    setText('stat-reward', ach.totalRewardAmount == null ? '0' : ach.totalRewardAmount);

    // 推广链接：域名 + login.html?ref=<code>
    var linkBox = document.getElementById('promo-link');
    if (linkBox && code) {
      linkBox.value = window.location.origin + '/login.html?ref=' + encodeURIComponent(code);
    }
    var codesBox = document.getElementById('promo-codes');
    if (codesBox) {
      var codes = (data && data.referralCodes) || [];
      codesBox.innerHTML = codes.length
        ? codes.map(function (c) {
            var scope = c.pathType === 2 ? '（指定租户）' : '（自助建租户）';
            var state = c.status === 'active' ? '' : '［已停用］';
            return '<div class="promo-code-row">推广码 <b>' + escapeHtml(c.referralCode) +
              '</b>' + scope + state + '</div>';
          }).join('')
        : '<div class="promo-code-row">暂无推广码，点击上方按钮生成</div>';
    }
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

  /** 生成/获取推广码（路径1 默认码）。 */
  async function generateCode() {
    var data = await window.request({
      url: ENDPOINTS.PROMO_GENERATE_CODE,
      method: 'POST',
      data: { pathType: 1 }
    });
    await loadAchievement();
    return data;
  }

  function copyPromoLink() {
    var linkBox = document.getElementById('promo-link');
    if (!linkBox || !linkBox.value) return;
    var done = function () {
      var btn = document.getElementById('promo-copy-btn');
      if (btn) {
        var old = btn.textContent;
        btn.textContent = '已复制';
        setTimeout(function () { btn.textContent = old; }, 1500);
      }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(linkBox.value).then(done, function () { linkBox.select(); document.execCommand('copy'); done(); });
    } else {
      linkBox.select();
      document.execCommand('copy');
      done();
    }
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
    reloadConversions: function (p) { return loadConversions(p); }
  };
})();
