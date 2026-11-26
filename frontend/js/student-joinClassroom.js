/**
 * 学生端「加入课堂」入口（C3，2026-11-19）
 *
 * 解决的真实问题：「我的课堂」列表是**排期驱动**的（student-myClassroom.js 遍历 booking 的
 * scheduleId），而管理员应急建的临时课堂没有排期、没有 booking，学生在菜单里永远看不到它，
 * 只能靠管理员一条条发链接。学生手里有的往往只是一串课堂号（或一条被 IM 折行的长链接），
 * 没有可粘贴的地方 —— 本页就是那个「粘贴口」。
 *
 * 流程：解析（链接或裸课堂号）→ 校验（GET /classrooms/{sid}/status，走 ClassroomAccessGuard）
 *       → 通过则经 ClassroomLink 跳课堂页
 *
 * 为什么校验用 /status 而不是方案里写的 POST /enter：
 *   enter 有副作用（membership.join 建名单行 + attendance.checkIn 签到 + 回调预约侧
 *   「已签到」）。在「查找课堂」这一步就把学生签到，等于他还没看到课堂页面就已算出勤；
 *   一旦他只是手滑点了一下，出勤就被污染，而收尾归一也不会自动抹掉。
 *   /status 同样过 ClassroomAccessGuard（课堂存在、租户一致、名单/有效预约、是否被移出），
 *   校验能力等价而零副作用；真正的 enter 交给课堂页自己发（classroom-main.js 进房时会调）。
 *
 * 依赖：js/public/api.js（window.ClassroomAPI / window.request）、feature-flags.js
 *       （window.getClassroomApiBaseUrl）。二者在 student.html 里都已早于本文件加载。
 */
(function () {
  'use strict';

  /** 后端错误码 → 学生能看懂的一句话（见 classroom-service ErrorCodes） */
  var CODE_TEXT = {
    40401: '没有找到这个课堂，请确认课堂号或链接是否完整',
    40402: '你不在本课堂名单内，请联系老师或管理员把你加入课堂后再试',
    40301: '你已被移出这间课堂，无法进入',
    40302: '当前账号是教师身份，请从教师入口（管理员发的教师链接）进入',
    42901: '操作太频繁，请稍等一会儿再试',
    403: '当前账号没有进入这间课堂的权限',
    401: '登录已过期，请重新登录后再试'
  };

  var STATUS_TEXT = {
    SCHEDULED: '待开课',
    READY: '待开课',
    LIVE: '进行中',
    PAUSED: '已暂停',
    CLOSED: '已结束',
    CANCELLED: '已取消'
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function host() {
    return byId('dynamic-content-center');
  }

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /** 当前登录态的租户码（用于发现「链接属于别家机构」这种点开也进不去的情况） */
  function myTenantCode() {
    try {
      var u = JSON.parse(localStorage.getItem('currentUser') || 'null');
      return (u && (u.tenantCode || u.tenant)) || '';
    } catch (e) {
      return '';
    }
  }

  /**
   * 解析用户输入（委托唯一构造器 ClassroomLink.parse，解析规则全站只有一处）。
   * 支持：裸课堂号、多课次复合键、旧相对/旧绝对链接、新 https 深链、带折行的粘贴。
   * @returns {{scheduleId:string, tCode:string, kind:string, error:string}}
   */
  function parseTarget(raw) {
    if (!window.ClassroomLink || typeof window.ClassroomLink.parse !== 'function') {
      return { scheduleId: '', tCode: '', kind: 'classroom', error: '页面脚本未就绪，请刷新后重试' };
    }
    var r = window.ClassroomLink.parse(raw);
    return {
      scheduleId: r.key || '',
      tCode: r.tCode || '',
      kind: r.target || 'classroom',
      error: r.error || ''
    };
  }

  /** 错误对象 → 可读文案。业务失败 reject 的是 Result 对象（含 code/message），网络失败是 Error/字符串 */
  function describeError(e) {
    if (!e) return { text: '查找失败，请稍后重试', code: null };
    if (typeof e === 'string') return { text: e, code: null };
    var code = e.code;
    if (code !== null && code !== undefined && CODE_TEXT[code]) {
      return { text: CODE_TEXT[code], code: code };
    }
    if (typeof code === 'number' && String(code).length === 5) {
      return { text: e.message || ('课堂服务返回错误（' + code + '）'), code: code };
    }
    if (e.bizCode && CODE_TEXT[e.bizCode]) return { text: CODE_TEXT[e.bizCode], code: e.bizCode };
    return { text: e.message || e.bodyMsg || '查找失败，请稍后重试', code: code || null };
  }

  /** 状态徽标：student.html 没有运营台那套 .tag 类，这里用内联色板，避免加全局样式 */
  function statusTag(status) {
    var bg = '#f2f4f7', fg = '#6b7280';
    if (status === 'LIVE') { bg = '#e7f6ec'; fg = '#1a7f37'; }
    else if (status === 'PAUSED' || status === 'READY') { bg = '#fff4e5'; fg = '#b54708'; }
    else if (status === 'CLOSED' || status === 'CANCELLED') { bg = '#feeceb'; fg = '#b42318'; }
    return '<span style="display:inline-block;padding:1px 8px;border-radius:4px;font-size:11px;'
      + 'background:' + bg + ';color:' + fg + ';vertical-align:middle;">'
      + esc(STATUS_TEXT[status] || status || '-') + '</span>';
  }

  function fmtTime(v) {
    if (!v) return '';
    var d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    var p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
      + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /** 校验课堂可进入性（无副作用，见文件头注释） */
  function checkAccess(scheduleId) {
    var api = window.ClassroomAPI;
    if (!api || typeof api.getClassroomStatus !== 'function') {
      return Promise.reject({ message: '课堂模块脚本未加载（js/public/api.js），请刷新页面重试' });
    }
    var base = (typeof window.getClassroomApiBaseUrl === 'function')
      ? (window.getClassroomApiBaseUrl() || '') : '';
    return api.getClassroomStatus(base, scheduleId);
  }

  function setResult(html) {
    var box = byId('stu-join-result');
    if (box) box.innerHTML = html || '';
  }

  function renderMessage(type, text, extraHtml) {
    var color = type === 'error'
      ? 'background:#fff1f0;border:1px solid #ffccc7;color:#a8071a;'
      : 'background:#f6f8fa;border:1px solid #e5e7eb;color:#1f2328;';
    setResult('<div style="margin-top:12px;padding:10px 14px;border-radius:6px;font-size:13px;' + color + '">'
      + esc(text) + (extraHtml || '') + '</div>');
  }

  function renderFound(target, c) {
    var sid = target.scheduleId;
    var status = c && c.status;
    var closed = (status === 'CLOSED' || status === 'CANCELLED');
    var title = (c && (c.courseName || c.title)) || '课堂';
    var when = '';
    if (c && c.startTime) {
      when = fmtTime(c.startTime) + (c.endTime ? ' ~ ' + fmtTime(c.endTime) : '');
    }
    // 链接自带 tCode 且与本地登录态不一致：这条链接属于别的机构，点进去必然 40402，
    // 与其让学生撞一次墙，不如在这里直说怎么办。
    var tenantMismatch = target.tCode && myTenantCode() && target.tCode !== myTenantCode();
    var html = '<div style="margin-top:12px;padding:12px 14px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;">'
      + '<div style="font-size:14px;font-weight:600;margin-bottom:6px;">' + esc(title) + ' ' + statusTag(status) + '</div>'
      + (when ? '<div style="color:#6b7280;font-size:12.5px;margin-bottom:4px;">上课时间：' + esc(when) + '</div>' : '')
      + '<div style="color:#6b7280;font-size:12.5px;">课堂号：<code>' + esc(sid) + '</code></div>';

    if (tenantMismatch) {
      html += '<div style="margin-top:10px;padding:8px 10px;border-radius:6px;background:#fff8e6;'
        + 'border:1px solid #ffe0a3;color:#8a5a00;font-size:12.5px;">'
        + '这条链接属于其他机构（' + esc(target.tCode) + '），当前账号登录的是 '
        + esc(myTenantCode()) + '。请退出后用该机构账号登录，再打开链接。</div>';
    }

    html += '<div style="margin-top:12px;">';
    if (closed) {
      html += '<span style="color:#6b7280;font-size:13px;">这堂课已结束，回放请到「我的课堂」查看。</span>';
    } else {
      html += '<button class="btn btn-primary" type="button" id="stu-join-enter">进入课堂</button>'
        + '<span style="margin-left:10px;color:#6b7280;font-size:12.5px;">'
        + (status === 'LIVE' ? '老师已开课，可以直接进入' : '老师尚未开课，进入后等待开课')
        + '</span>';
    }
    html += '</div></div>';
    setResult(html);

    var btn = byId('stu-join-enter');
    if (btn) {
      btn.addEventListener('click', function () {
        btn.disabled = true;
        btn.textContent = '正在进入…';
        // 真正的 enter 在课堂页里发（会写名单 + 签到），这里只负责跳转

        window.ClassroomLink.open({ target: 'entry', key: sid, intent: 'classroom' });
      });
    }
  }

  function doCheck() {
    var input = byId('stu-join-input');
    var target = parseTarget(input ? input.value : '');
    if (!target || target.error) {
      renderMessage('error', (target && target.error) || '无法识别的课堂号');
      return;
    }
    var btn = byId('stu-join-check');
    if (btn) { btn.disabled = true; btn.textContent = '查找中…'; }
    var restore = function () {
      if (btn) { btn.disabled = false; btn.textContent = '查找课堂'; }
    };
    setResult('<div style="margin-top:12px;color:#6b7280;font-size:13px;">正在查找课堂…</div>');

    checkAccess(target.scheduleId).then(function (c) {
      restore();
      renderFound(target, c || {});
    }).catch(function (e) {
      restore();
      var d = describeError(e);
      var extra = '';
      if (d.code === 40402) {
        extra = '<div style="margin-top:6px;color:#6b7280;">临时课堂不会出现在「我的课堂」里，'
          + '名单由管理员添加；如果确认课堂号没错，请让管理员在「运营台 → 给指定课堂加学员」里加上你。</div>';
      }
      renderMessage('error', d.text, extra);
    });
  }

  function pageHtml() {
    return ''
      + '<div class="card">'
      + '  <div class="card-title" style="margin-bottom:8px;"><i class="fas fa-door-open"></i> 加入课堂</div>'
      + '  <div style="color:#6b7280;font-size:13px;margin-bottom:12px;">'
      + '    把老师发来的课堂链接粘贴进来，或直接输入课堂号。'
      + '    <span style="color:#98a2b3;">临时课堂不会出现在「我的课堂」列表里，用这里进入。</span>'
      + '  </div>'
      + '  <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">'
      + '    <input type="text" id="stu-join-input" autocomplete="off" spellcheck="false"'
      + '           placeholder="粘贴老师发的课堂链接，或直接输入课堂号"'
      + '           style="flex:1;min-width:280px;padding:8px 12px;border:1px solid #d0d5dd;border-radius:6px;font-size:13px;">'
      + '    <button class="btn btn-primary" type="button" id="stu-join-check">查找课堂</button>'
      + '  </div>'
      + '  <div id="stu-join-result"></div>'
      + '  <div style="color:#98a2b3;font-size:12px;margin-top:14px;">'
      + '    进入课堂需要先登录；未登录时点「进入课堂」会被带到登录页，登录后自动回到这间课堂。'
      + '  </div>'
      + '</div>';
  }

  function render(container) {
    var el = container || host();
    if (!el) return;
    el.innerHTML = pageHtml();
    var btn = byId('stu-join-check');
    if (btn) btn.addEventListener('click', doCheck);
    var input = byId('stu-join-input');
    if (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.keyCode === 13) {
          e.preventDefault();
          doCheck();
        }
      });
      input.focus();
    }
  }

  window.renderStudentJoinClassroomPage = render;
})();
