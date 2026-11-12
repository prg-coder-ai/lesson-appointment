/**
 * 课程准备页（2026-11-13）
 *
 * 教师端「今日课程」里未开始的课次点「课程准备」进这里：课前把讲稿传好、看一眼名单，
 * 再一键进入课堂。它是 classroom.html 的**课前轻量版**，不复用整套课堂 UI
 * （进课堂要建立成员名单、开摄像头，课前用不上）。
 *
 * URL：classroom-prep.html?scheduleId=<课次标识>（第 1 课次裸 id，第 2 起 sid~N）
 * 依赖：axios / utility_request / shared-domain-bridge / api.js / feature-flags /
 *       my-classroom-core.js（讲稿面板、同步课堂、阶段判定）
 *
 * 权限：讲稿上传与成员列表都过课堂服务的 ClassroomAccessGuard（本堂课教师才行）；
 * 课堂尚未创建时列表会返回「课堂不存在」，此时点「同步课堂」补推事件再刷新。
 */
(function () {
  'use strict';

  function core() {
    return window.MyClassroomCore || null;
  }

  function param(name) {
    try {
      return new URLSearchParams(window.location.search).get(name) || '';
    } catch (e) {
      return '';
    }
  }

  function apiBase() {
    return (typeof window.getClassroomApiBaseUrl === 'function') ? (window.getClassroomApiBaseUrl() || '') : '';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function showHint(msg) {
    var hint = document.getElementById('prep-hint');
    if (!hint) return;
    if (!msg) { hint.style.display = 'none'; hint.textContent = ''; return; }
    hint.style.display = 'block';
    hint.textContent = msg;
  }

  // 课堂状态枚举（classroom-service：SCHEDULED → READY → LIVE → CLOSED / CANCELLED）
  var STATUS_TEXT = {
    SCHEDULED: '待开始',
    READY: '待开课',
    LIVE: '上课中',
    CLOSED: '已结束',
    CANCELLED: '已取消'
  };

  function statusLabel(s) {
    if (!s) return '未创建';
    return STATUS_TEXT[String(s).toUpperCase()] || s;
  }

  function phaseLabel(phase) {
    return phase === 'live' ? '进行中' : (phase === 'past' ? '已结束' : (phase === 'upcoming' ? '未开始' : '—'));
  }

  var Prep = {
    key: '',
    sid: '',

    run: function () {
      this.key = param('scheduleId');
      if (!this.key) {
        showHint('缺少课次标识（URL 需要 ?scheduleId=）。请从「今日课程」列表重新进入。');
        return;
      }
      // 课次标识里 ~ 前面就是裸排期 id（第 1 课次本身不带 ~）
      this.sid = this.key.split('~')[0];

      setText('kv-key', this.key);
      this.bind();
      this.loadStatus();
      this.loadMembers();
      this.loadMaterials();
    },

    bind: function () {
      var self = this;
      var back = document.getElementById('btn-back');
      if (back) back.addEventListener('click', function () {
        // 有历史就回退（保留列表筛选/页码），否则回角色首页
        if (window.history && window.history.length > 1) window.history.back();
        else window.location.href = './teacher.html';
      });

      var enter = document.getElementById('btn-enter');
      if (enter) enter.addEventListener('click', function () {
        window.location.href = (typeof window.pageUrl === 'function')
          ? window.pageUrl('classroom.html', { scheduleId: self.key })
          : './classroom.html?scheduleId=' + encodeURIComponent(self.key);
      });

      var sync = document.getElementById('btn-sync');
      if (sync) sync.addEventListener('click', async function () {
        sync.disabled = true;
        var old = sync.innerHTML;
        sync.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 同步中…';
        var r = await core().syncClassrooms(self.sid);
        sync.disabled = false;
        sync.innerHTML = old;
        showHint(r.ok ? (r.msg + '（稍等几秒后点此页刷新查看）') : ('同步失败：' + r.msg));
      });
    },

    /** 课堂状态：时间 + 是否已创建（课堂不存在时提示同步） */
    loadStatus: function () {
      var self = this;
      var statusEl = document.getElementById('kv-status');
      if (!window.ClassroomAPI || typeof window.ClassroomAPI.getClassroomStatus !== 'function') {
        if (statusEl) statusEl.textContent = '课堂接口未加载';
        return;
      }
      window.ClassroomAPI.getClassroomStatus(apiBase(), this.key)
        .then(function (res) {
          if (!res) { if (statusEl) statusEl.textContent = '未创建'; return; }
          if (statusEl) statusEl.textContent = statusLabel(res.status);
          if (res.startTime || res.endTime) {
            setText('kv-time', (res.startTime || '') + (res.endTime ? ' ~ ' + res.endTime : ''));
          }
          if (res.courseName) setText('prep-title', res.courseName);
        })
        .catch(function (e) {
          // 40401 = 课堂不存在：这是课前最常见的情况（排期还没推送到课堂服务）
          if (statusEl) statusEl.textContent = '未创建';
          showHint('该课次的课堂尚未创建（' + core().errText(e) + '）。点右上角「同步课堂」推送到课堂服务后即可上传讲稿。');
        });
    },

    /** 成员名单（进过课堂的人；课前可能为空） */
    loadMembers: function () {
      var host = document.getElementById('member-host');
      if (!host) return;
      if (!window.ClassroomAPI || typeof window.ClassroomAPI.getMembers !== 'function') {
        host.textContent = '课堂接口未加载';
        return;
      }
      window.ClassroomAPI.getMembers(apiBase(), this.key)
        .then(function (list) {
          var arr = Array.isArray(list) ? list : (list && list.rows) || [];
          if (!arr.length) {
            host.innerHTML = '<span style="color:#999;">暂无成员（学生进入课堂后才会出现在名单里）</span>';
            return;
          }
          var html = '';
          arr.forEach(function (m) {
            // Membership 实体的名字字段是 displayName（不是 userName/name）
            var name = m.displayName || m.userId || '未知';
            var role = (m.role === 'teacher' || m.role === 'admin') ? '教师' : '学生';
            html += '<div class="member">'
              + '<span class="avatar">' + esc(String(name).charAt(0)) + '</span>'
              + '<span>' + esc(name) + '</span>'
              + '<span class="role">' + esc(role) + (m.kicked ? ' · 已移出' : '') + '</span>'
              + '</div>';
          });
          host.innerHTML = html;
        })
        .catch(function (e) {
          host.innerHTML = '<span style="color:#b42318;">名单读取失败：' + esc(core().errText(e)) + '</span>';
        });
    },

    /** 讲稿面板（复用我的课堂同一套：列表 + 上传） */
    loadMaterials: function () {
      var host = document.getElementById('material-host');
      if (!host) return;
      if (!core()) { host.textContent = '课堂核心脚本未加载，请刷新页面重试。'; return; }
      core().renderMaterialPanel(host, this.key, 'teacher', { scheduleId: this.sid });
    }
  };

  window.ClassroomPrep = Prep;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { Prep.run(); });
  } else {
    Prep.run();
  }
})();
