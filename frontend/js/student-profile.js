/**
 * 学生端「个人中心」面板（S2a 资料查看 + S2b 改密入口 + S2c 微信绑定入口）
 *
 * 后端零改动：资料取自本地会话（currentUser），并用 /user/name/{userId} 刷新权威姓名；
 * 改密走 api.js 的 changePasswordAPI / showChangePasswordDialog；
 * 微信绑定走 api.js 的 getWechatBindStatus / showWechatBindDialog（web 端仅查看状态 + 解绑）。
 *
 * 红线遵守：
 *  - R2 页面跳转用 loadAdminPageContent(key)（不手写 location，避免丢 tCode）
 *  - 不把 userId 落 URL 参数（userId 从会话取）
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
    return '<div style="margin-bottom:10px;">' +
      '<span style="color:var(--text-light-color);width:84px;display:inline-block;">' +
      esc(label) + '</span><span>' + valHtml + '</span></div>';
  }

  function renderStudentProfile(container) {
    if (!container) return;
    var u = (typeof getCurrentUserInfo === 'function') ? getCurrentUserInfo() : null;
    if (!u) {
      container.innerHTML = '<div class="card"><div class="empty-tip">未登录或登录信息缺失，请重新登录。</div></div>';
      return;
    }

    var name = u.name || '';
    var initial = name ? name.charAt(0) : '?';
    var account = u.account || '—';
    var role = roleText(u.role);
    var tenant = u.tenantCode || '—';

    container.innerHTML =
      '<div class="card">' +
        '<h3><i class="fa fa-user"></i> 个人信息</h3>' +
        '<div style="margin-top:15px;display:flex;gap:20px;align-items:center;">' +
          '<div style="width:72px;height:72px;border-radius:50%;background:var(--primary-color,#722ed1);' +
          'color:#fff;text-align:center;line-height:72px;font-size:30px;">' + esc(initial) + '</div>' +
          '<div style="flex:1;">' +
            row('姓名：', '<span id="sp-name">' + esc(name || '—') + '</span>') +
            row('账号：', esc(account)) +
            row('角色：', esc(role)) +
            row('租户编码：', esc(tenant)) +
          '</div>' +
        '</div>' +
        '<div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap;">' +
          '<button class="btn btn-primary" id="sp-mybooking" type="button">我的预订</button>' +
        '</div>' +
      '</div>' +
      '<div class="card">' +
        '<h3>账号设置</h3>' +
        '<div style="margin-top:15px;padding:0 4px 8px;">' +
          '<button class="btn btn-gray" id="sp-chgpwd" type="button" ' +
          'style="width:100%;text-align:left;padding:10px 15px;margin-bottom:12px;">' +
          '<i class="fa fa-lock"></i> 修改密码</button>' +
          '<button class="btn btn-gray" id="sp-wx" type="button" ' +
          'style="width:100%;text-align:left;padding:10px 15px;">' +
          '<i class="fa fa-weixin"></i> <span id="sp-wx-label">微信绑定</span></button>' +
        '</div>' +
      '</div>';

    // S2a：经 /user/name/{userId} 取权威姓名（会话里的 name 可能滞后）
    if (typeof getUserNameById === 'function' && u.userId) {
      getUserNameById(String(u.userId))
        .then(function (nm) {
          var el = document.getElementById('sp-name');
          if (el && nm && nm !== 'n/a') el.textContent = nm;
        })
        .catch(function () {});
    }

    var chgBtn = document.getElementById('sp-chgpwd');
    if (chgBtn) chgBtn.onclick = function () {
      if (typeof showChangePasswordDialog === 'function') showChangePasswordDialog();
    };

    var wxBtn = document.getElementById('sp-wx');
    if (wxBtn) wxBtn.onclick = function () {
      if (typeof showWechatBindDialog === 'function') showWechatBindDialog();
    };

    // 微信绑定状态 → 动态文案
    if (typeof getWechatBindStatus === 'function') {
      getWechatBindStatus()
        .then(function (st) {
          var lbl = document.getElementById('sp-wx-label');
          if (lbl && st && st.bound) lbl.textContent = '微信已绑定（点击管理）';
        })
        .catch(function () {});
    }

    var mbBtn = document.getElementById('sp-mybooking');
    if (mbBtn) mbBtn.onclick = function () {
      if (typeof loadAdminPageContent === 'function') loadAdminPageContent('my_booking');
    };
  }

  window.renderStudentProfile = renderStudentProfile;
})();
