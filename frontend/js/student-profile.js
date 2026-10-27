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
        '<h3>我的统计</h3>' +
        '<div class="sp-stat-row" id="sp-stats">' +
          '<div class="empty-tip">加载中…</div>' +
        '</div>' +
      '</div>' +
      '<div class="card">' +
        '<h3>账号设置</h3>' +
        '<div style="margin-top:15px;padding:0 4px 8px;">' +
          '<button class="btn btn-gray" id="sp-editinfo" type="button" ' +
          'style="width:100%;text-align:left;padding:10px 15px;margin-bottom:12px;">' +
          '<i class="fa fa-edit"></i> 修改个人信息</button>' +
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

    var editBtn = document.getElementById('sp-editinfo');
    if (editBtn) editBtn.onclick = function () {
      if (typeof showEditProfileDialog === 'function') {
        showEditProfileDialog(function () { renderStudentProfile(container); });
      }
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

    // S10 个人统计卡：基于学生本人预订数据（POST course/booking/page 已按会话 userId 隔离）
    var statsEl = document.getElementById('sp-stats');
    if (statsEl) loadStudentStats(statsEl);
  }

  // S10：拉取本人全部预订并统计各状态数量（不引服务端新字段，复用既有分页接口）。
  // 状态→大类映射以 api 端 BookingStatus.java 的常量值为单一事实来源，避免散落硬编码。
  // 大类：pending 待确认 / confirmed 已确认 / completed 已完成 / canceled 已取消。
  // 细分标签（方案 A：保持 5 大类 tile，tile 下方浅色小字标注构成）：
  //   booking→新预订  waiting→候补  canceling/cancelling→取消待确认
  //   booked/bookProved→已确认  rej-cancelling→拒绝取消
  //   completed→已完成
  //   cancelled/canceled→已取消  rej-booking→拒绝预订  frozen→删除
  // 未知状态不再兜底进「已取消」（历史上 else canceled++ 会把候补/被拒/删除/新增状态全误算成已取消），
  // 而是单独计入 unknown，UI 底部浅色提示，绝不污染四大类。
  //
  // ── 方案 B（暂未采用，仅作展开指引，保留于注释）──
  // 若将来要把细分拆成独立 tile（而非大类下的小字），只需以 STAT_CATEGORY 的每个 sub 为独立 tile 渲染，示例：
  //   var html = '';
  //   var seen = {};
  //   Object.keys(STAT_CATEGORY).forEach(function (k) {
  //     var m = STAT_CATEGORY[k];
  //     if (!seen[m.sub]) { seen[m.sub] = true; html += statTile(m.sub, counts[k] || 0); }
  //   });
  // 届时需把 counts 的 key 从大类改为每个 status 原值（booking/waiting/...），
  // 并移除 5 大类 tile 或改为「合计」行。此扩展不影响数据源与接口。
  var STAT_CATEGORY = {
    booking:          { cat: 'pending',   sub: '新预订' },
    waiting:          { cat: 'pending',   sub: '候补' },
    canceling:        { cat: 'pending',   sub: '取消待确认' },
    cancelling:       { cat: 'pending',   sub: '取消待确认' },
    booked:           { cat: 'confirmed', sub: '已确认' },
    bookproved:       { cat: 'confirmed', sub: '已确认' },
    'rej-cancelling': { cat: 'confirmed', sub: '拒绝取消' },
    completed:        { cat: 'completed', sub: '已完成' },
    cancelled:        { cat: 'canceled',  sub: '已取消' },
    canceled:         { cat: 'canceled',  sub: '已取消' },
    'rej-booking':    { cat: 'canceled',  sub: '拒绝预订' },
    frozen:           { cat: 'canceled',  sub: '删除' }
  };

  function loadStudentStats(cardsEl) {
    if (!cardsEl || typeof getBookingListPage !== 'function') return;
    var u = (typeof getCurrentUserInfo === 'function') ? getCurrentUserInfo() : null;
    if (!u) { cardsEl.innerHTML = '<div class="empty-tip">未登录</div>'; return; }
    getBookingListPage({ pageNum: 1, pageSize: 9999, userId: u.userId, userRole: u.role })
      .then(function (page) {
        var rows = (page && Array.isArray(page.rows)) ? page.rows : [];
        var counts = { pending: 0, confirmed: 0, completed: 0, canceled: 0 };
        var subs = { pending: {}, confirmed: {}, completed: {}, canceled: {} };
        var unknown = 0;
        rows.forEach(function (b) {
          var s = (b.status || '').toLowerCase();
          var m = STAT_CATEGORY[s];
          if (!m) { unknown++; return; }
          counts[m.cat]++;
          subs[m.cat][m.sub] = (subs[m.cat][m.sub] || 0) + 1;
        });
        var html = statTile('总预订', rows.length) +
          statTile('待确认', counts.pending, subs.pending) +
          statTile('已确认', counts.confirmed, subs.confirmed) +
          statTile('已完成', counts.completed, subs.completed) +
          statTile('已取消', counts.canceled, subs.canceled);
        if (unknown > 0) {
          html += '<div class="sp-stat-sub sp-stat-unknown">其它（未识别状态）' + unknown + '</div>';
        }
        cardsEl.innerHTML = html;
      })
      .catch(function () {
        cardsEl.innerHTML = '<div class="empty-tip">统计加载失败</div>';
      });
  }

  function statTile(label, val, subs) {
    var subHtml = '';
    if (subs) {
      var keys = Object.keys(subs).filter(function (k) { return subs[k] > 0; });
      if (keys.length) {
        subHtml = '<div class="sp-stat-sub">' +
          keys.map(function (k) { return esc(k) + ' ' + subs[k]; }).join(' · ') +
          '</div>';
      }
    }
    return '<div class="sp-stat-tile">' +
      '<div class="sp-stat-val">' + esc(String(val)) + '</div>' +
      '<div class="sp-stat-label">' + esc(label) + '</div>' + subHtml + '</div>';
  }

  window.renderStudentProfile = renderStudentProfile;
})();
