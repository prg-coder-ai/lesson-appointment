/**
 * 教师端「个人中心」面板
 *
 * 结构（自上而下）：
 *  1) 数据概览 —— 课程数量 / 排期数量 / 预订排期人数 / 本月完成课次数，取
 *     GET /teacher/stats/summary（后端按 Token 中的教师 ID 统计，教师只能看自己）
 *  2) 个人信息 —— 姓名/账号/角色/租户/手机号/邮箱，手机邮箱来自 /user/self（解密后的本人资料）
 *  3) 账号设置 —— 修改个人信息 / 修改密码 / 微信绑定
 *
 * 红线遵守：
 *  - 页面内跳转用 loadAdminPageContent(key)（不手写 location，避免丢 tCode）
 *  - 不把 userId 落 URL 参数（userId 从会话/Token 取）
 */
(function () {
  // 复用 api.js 暴露的全局转义（不存在时降级）
  var esc = (typeof escapeHtml === 'function')
    ? escapeHtml
    : function (s) {
        if (s == null) return '';
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
          .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      };

  function roleText(role) {
    switch (role) {
      case 'student': return '学生';
      case 'teacher': return '教师';
      case 'admin': return '管理员';
      case 'platform_admin': return '平台管理员';
      default: return role || '未知';
    }
  }

  function row(label, valHtml) {
    return '<div class="tp-info-row">' +
      '<span class="tp-info-label">' + esc(label) + '</span>' +
      '<span class="tp-info-value">' + valHtml + '</span></div>';
  }

  function statTile(label, val, subText) {
    return '<div class="tp-stat-tile">' +
      '<div class="tp-stat-val">' + esc(String(val == null ? '—' : val)) + '</div>' +
      '<div class="tp-stat-label">' + esc(label) + '</div>' +
      (subText ? '<div class="tp-stat-sub">' + esc(subText) + '</div>' : '') +
      '</div>';
  }

  function renderTeacherProfile(container) {
    if (!container) return;
    var u = (typeof getCurrentUserInfo === 'function') ? getCurrentUserInfo() : null;
    if (!u) {
      container.innerHTML = '<div class="tp-card"><div class="empty-tip">未登录或登录信息缺失，请重新登录。</div></div>';
      return;
    }

    var name = u.name || '';
    var initial = name ? name.charAt(0) : '?';
    var account = u.account || '—';
    var role = roleText(u.role);
    var tenant = u.tenantCode || '—';

    container.innerHTML =
      '<div class="tp-card">' +
        '<h3 class="tp-card-title"><i class="fa fa-chart-simple"></i> 数据概览</h3>' +
        '<div class="tp-stat-row" id="tp-stats"><div class="empty-tip">加载中…</div></div>' +
      '</div>' +
      '<div class="tp-card">' +
        '<h3 class="tp-card-title"><i class="fa fa-user"></i> 个人信息</h3>' +
        '<div class="tp-profile-head">' +
          '<div class="tp-avatar">' + esc(initial) + '</div>' +
          '<div class="tp-profile-body">' +
            row('姓名：', '<span id="tp-name">' + esc(name || '—') + '</span>') +
            row('账号：', esc(account)) +
            row('角色：', esc(role)) +
            row('租户编码：', esc(tenant)) +
            row('手机号：', '<span id="tp-phone">—</span>') +
            row('邮箱：', '<span id="tp-email">—</span>') +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="tp-card">' +
        '<h3 class="tp-card-title">账号设置</h3>' +
        '<div class="tp-actions">' +
          '<button class="btn btn-default tp-action-btn" id="tp-editinfo" type="button">' +
          '<i class="fa fa-edit"></i> 修改个人信息</button>' +
          '<button class="btn btn-default tp-action-btn" id="tp-chgpwd" type="button">' +
          '<i class="fa fa-lock"></i> 修改密码</button>' +
          '<button class="btn btn-default tp-action-btn" id="tp-wx" type="button">' +
          '<i class="fa fa-weixin"></i> <span id="tp-wx-label">微信绑定</span></button>' +
        '</div>' +
      '</div>';

    // 概览统计（失败不影响下面的资料展示）
    loadTeacherStats(document.getElementById('tp-stats'));

    // 手机号/邮箱：/user/self 返回解密后的本人资料
    if (typeof getSelfProfileAPI === 'function') {
      getSelfProfileAPI()
        .then(function (p) {
          if (!p) return;
          var ph = document.getElementById('tp-phone');
          if (ph) ph.textContent = p.phone || '—';
          var em = document.getElementById('tp-email');
          if (em) em.textContent = p.email || '—';
        })
        .catch(function () {});
    }

    // 经 /user/name/{userId} 取权威姓名（会话里的 name 可能滞后）
    if (typeof getUserNameById === 'function' && u.userId) {
      getUserNameById(String(u.userId))
        .then(function (nm) {
          var el = document.getElementById('tp-name');
          if (el && nm && nm !== 'n/a') el.textContent = nm;
        })
        .catch(function () {});
    }

    var editBtn = document.getElementById('tp-editinfo');
    if (editBtn) editBtn.onclick = function () {
      if (typeof showEditProfileDialog === 'function') {
        // 保存后重渲染：概览与资料都按最新数据刷新
        showEditProfileDialog(function () { renderTeacherProfile(container); });
      }
    };

    var chgBtn = document.getElementById('tp-chgpwd');
    if (chgBtn) chgBtn.onclick = function () {
      if (typeof showChangePasswordDialog === 'function') showChangePasswordDialog();
    };

    var wxBtn = document.getElementById('tp-wx');
    if (wxBtn) wxBtn.onclick = function () {
      if (typeof showWechatBindDialog === 'function') showWechatBindDialog();
    };

    // 微信绑定状态 → 动态文案
    if (typeof getWechatBindStatus === 'function') {
      getWechatBindStatus()
        .then(function (st) {
          var lbl = document.getElementById('tp-wx-label');
          if (lbl && st && st.bound) lbl.textContent = '微信已绑定（点击管理）';
        })
        .catch(function () {});
    }
  }

  /**
   * 拉取本人概览统计。接口：GET /teacher/stats/summary
   * 「本月」按浏览器本地时区计算，故把 userTimeZone 传后端换算 UTC 月界。
   * @param {HTMLElement} statsEl 统计容器
   */
  function loadTeacherStats(statsEl) {
    if (!statsEl) return;
    if (typeof request !== 'function') {
      statsEl.innerHTML = '<div class="empty-tip">统计加载失败（请求组件未就绪）</div>';
      return;
    }
    var tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { tz = ''; }

    request({
      url: '/teacher/stats/summary',
      method: 'get',
      params: tz ? { userTimeZone: tz } : {}
    })
      .then(function (data) {
        var d = data || {};
        var monthLabel = d.month ? d.month + ' 月' : '本月';
        statsEl.innerHTML =
          statTile('课程数量', d.courseCount, '我创建的课程') +
          statTile('排期数量', d.scheduleCount, '我名下的排期') +
          statTile('预订排期人数', d.bookedStudentCount, '已预订的学生') +
          statTile('本月完成课次', d.monthCompletedCount, monthLabel + '已完成');
      })
      .catch(function () {
        statsEl.innerHTML = '<div class="empty-tip">统计加载失败，请稍后重试</div>';
      });
  }

  window.renderTeacherProfile = renderTeacherProfile;
})();
