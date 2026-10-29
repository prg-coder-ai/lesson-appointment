/**
 * classroom-teacher.js —— 教师专属功能
 * 开课/下课、全员静音、录制控制、移出成员。
 * 后端接口：/classrooms/{sid}/start|end、/members/{userId}/kick（见 ClassroomController）。
 * 全员静音/录制无后端强控接口，通过 WS signal 广播约定消息，客户端自行响应。
 */
(function () {
  var ClassroomTeacher = {
    ctx: null,

    init: function (ctx) {
      this.ctx = ctx || {};
      return this;
    },

    startClass: function () {
      var self = this;
      return this._api('startClass', '已开课', function () {
        if (window.ClassroomWS) {
          window.ClassroomWS.sendSignal(self.ctx.scheduleId, { type: 'class-start', from: self.ctx.userId });
        }
      });
    },

    endClass: function () {
      var self = this;
      return this._api('endClass', '已下课', function () {
        if (window.ClassroomWS) {
          window.ClassroomWS.sendSignal(self.ctx.scheduleId, { type: 'class-end', from: self.ctx.userId });
        }
        if (window.ClassroomMain && typeof window.ClassroomMain.leave === 'function') {
          window.ClassroomMain.leave();
        }
      });
    },

    muteAll: function () {
      if (!window.ClassroomWS) return this.toast('信令未就绪');
      this._muted = !this._muted;
      // 服务端权威强控：广播 mute-all（含自身），落库 + 全员（含重连者）生效
      window.ClassroomWS.sendSignal(this.ctx.scheduleId, { type: 'mute-all', muted: this._muted });
      // 教师自身也静音（教师不在服务端禁言拦截范围，但 UI 一致）
      if (window.ClassroomRTC) window.ClassroomRTC.setMicEnabled(!this._muted);
      var btn = document.getElementById('ctrl-mute-all');
      if (btn) btn.classList.toggle('active', this._muted);
      this.toast(this._muted ? '已开启全员静音' : '已解除全员静音');
      return this._muted;
    },

    // F4-11：教师点名（指定或随机）入口
    initiateRollCall: function () {
      var modal = document.getElementById('teacher-rollcall-modal');
      if (!modal) return;
      var self = this;
      modal.classList.remove('hidden');
      var select = document.getElementById('rollcall-student-select');
      if (select && window.ClassroomMain && window.ClassroomMain.participants) {
        var ps = window.ClassroomMain.participants;
        select.innerHTML = '<option value="">（随机）</option>' + Object.keys(ps)
          .filter(function (id) { return ps[id].role === 'student'; })
          .map(function (id) { return '<option value="' + id + '">' + self._escape(ps[id].name) + '</option>'; }).join('');
      }
      var btn = document.getElementById('rollcall-initiate');
      if (btn) btn.onclick = function () {
        var target = select ? select.value : '';
        if (!window.ClassroomAPI || typeof window.ClassroomAPI.initiateRollCall !== 'function') return;
        window.ClassroomAPI.initiateRollCall(self.ctx.apiBaseUrl, self.ctx.scheduleId, target || null)
          .then(function (rec) {
            self.toast('已发起点名');
            self._showRollCallStatus(rec);
          })
          .catch(function (e) { self.toast((e && e.message) || '点名失败'); });
      };
      var closeBtn = document.getElementById('rollcall-modal-close');
      if (closeBtn) closeBtn.onclick = function () { modal.classList.add('hidden'); };
    },

    _showRollCallStatus: function (rec) {
      var area = document.getElementById('rollcall-status-area');
      if (!area) return;
      var target = (rec && rec.targetUserId) || '（随机）';
      var name = (window.ClassroomMain && window.ClassroomMain.participants[target] && window.ClassroomMain.participants[target].name) || target;
      area.innerHTML = '<div>本次点名：' + this._escape(name) + ' <span class="rc-status">待应答</span></div>';
    },

    // 教师端接收服务端权威点名事件
    onSignal: function (msg) {
      if (!msg || !msg.type) return;
      if (msg.type === 'rollcall:start') {
        var area = document.getElementById('rollcall-status-area');
        if (area) {
          var name = (window.ClassroomMain && window.ClassroomMain.participants[msg.targetUserId] && window.ClassroomMain.participants[msg.targetUserId].name) || (msg.targetUserId || '（随机）');
          area.innerHTML = '<div>本次点名：' + this._escape(name) + ' <span class="rc-status">待应答</span></div>';
        }
      }
      if (msg.type === 'rollcall:answered' && msg.userId) {
        var a2 = document.getElementById('rollcall-status-area');
        if (a2) {
          var nn = (window.ClassroomMain && window.ClassroomMain.participants[msg.userId] && window.ClassroomMain.participants[msg.userId].name) || msg.userId;
          a2.innerHTML = '<div>本次点名：' + this._escape(nn) + ' <span class="rc-status rc-answered">已应答</span></div>';
        }
      }
      if (msg.type === 'mute:state') {
        this._muted = !!msg.muted;
        var btn = document.getElementById('ctrl-mute-all');
        if (btn) btn.classList.toggle('active', this._muted);
      }
    },

    _escape: function (s) {
      if (s == null) return '';
      return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    },

    // F4-16：教师作业点评——列出作品 + 评语/评分 + 提交
    openReview: function () {
      var modal = document.getElementById('teacher-review-modal');
      var list = document.getElementById('review-list');
      if (!modal || !list) return;
      modal.classList.remove('hidden');
      list.innerHTML = '<li class="review-loading">加载中...</li>';
      var self = this;
      var closeBtn = document.getElementById('review-close');
      if (closeBtn) closeBtn.onclick = function () { modal.classList.add('hidden'); };
      if (!window.ClassroomAPI || typeof window.ClassroomAPI.getSubmissions !== 'function') {
        list.innerHTML = '<li>接口未就绪</li>'; return;
      }
      window.ClassroomAPI.getSubmissions(this.ctx.apiBaseUrl, this.ctx.scheduleId)
        .then(function (rows) {
          if (!rows || !rows.length) { list.innerHTML = '<li class="review-empty">暂无学生作品</li>'; return; }
          list.innerHTML = rows.map(function (r) {
            var typeMap = { AUDIO: '语音', TEXT: '文字', IMAGE: '图片', FILE: '文件' };
            var content = r.content ? self._escape(r.content) : '';
            // 包3·P2：作品有签名 URL 后可直接试听/预览，不再只显示一个「文件」字样
            var media = '';
            if (r.url) {
              var u = self._escape(r.url);
              if (r.submissionType === 'AUDIO') {
                media = '<audio class="rv-audio" controls preload="none" src="' + u + '"></audio>';
              } else if (r.submissionType === 'IMAGE') {
                media = '<a href="' + u + '" target="_blank" rel="noopener">' +
                  '<img class="rv-thumb" src="' + u + '" alt="作品"></a>';
              } else if (r.submissionType !== 'TEXT') {
                media = '<a class="rv-file" href="' + u + '" target="_blank" rel="noopener">查看附件</a>';
              }
            }
            return '<li class="review-item" data-id="' + r.submissionId + '">' +
              '<div class="rv-head">学员：' + self._escape(r.userId) + ' · ' + (typeMap[r.submissionType] || r.submissionType) + '</div>' +
              '<div class="rv-content">' + content + media + '</div>' +
              '<div class="rv-form">' +
              '<input class="rv-comment" placeholder="评语" value="' + self._escape(r.teacherComment || '') + '">' +
              '<input class="rv-score" type="number" step="0.01" placeholder="评分" value="' + (r.score != null ? r.score : '') + '">' +
              '<button class="rv-submit">提交点评</button>' +
              '</div></li>';
          }).join('');
          Array.prototype.forEach.call(list.querySelectorAll('.rv-submit'), function (btn) {
            btn.addEventListener('click', function () {
              var li = btn.closest('.review-item');
              var id = li.getAttribute('data-id');
              var comment = li.querySelector('.rv-comment').value;
              var score = li.querySelector('.rv-score').value;
              if (!window.ClassroomAPI || typeof window.ClassroomAPI.reviewSubmission !== 'function') return;
              window.ClassroomAPI.reviewSubmission(self.ctx.apiBaseUrl, self.ctx.scheduleId, id, comment, score)
                .then(function () { self.toast('已点评'); })
                .catch(function (e) { self.toast((e && e.message) || '点评失败'); });
            });
          });
        })
        .catch(function (e) { list.innerHTML = '<li class="review-empty">加载失败：' + self._escape((e && e.message) || '') + '</li>'; });
    },

    // 录制（F6-01/02）：委托录制模块做真实录制 + 分片上传，这里只保留入口
    toggleRecord: function () {
      if (!window.ClassroomRecord) {
        this.toast('录制模块未加载');
        return false;
      }
      return window.ClassroomRecord.toggle();
    },

    kickMember: function (userId) {
      if (!userId) return Promise.reject(new Error('缺少用户ID'));
      if (!window.ClassroomAPI) return Promise.reject(new Error('ClassroomAPI 未加载'));
      return window.ClassroomAPI.kickMember(this.ctx.apiBaseUrl, this.ctx.scheduleId, userId)
        .then(function () {
          if (window.ClassroomWS) {
            window.ClassroomWS.sendSignal(this.ctx.scheduleId, { type: 'member-kicked', from: this.ctx.userId, to: userId });
          }
          return true;
        }.bind(this))
        .catch(function (e) { console.warn('[Teacher] kickMember failed', e); return false; });
    },

    _api: function (method, okMsg, afterOk) {
      var CAPI = window.ClassroomAPI;
      if (!CAPI || typeof CAPI[method] !== 'function') return Promise.reject(new Error('ClassroomAPI 未加载'));
      return CAPI[method](this.ctx.apiBaseUrl, this.ctx.scheduleId)
        .then(function (data) {
          if (typeof afterOk === 'function') afterOk();
          this.toast(okMsg || '操作成功');
          return data;
        }.bind(this))
        .catch(function (e) {
          console.warn('[Teacher] ' + method + ' failed', e);
          this.toast((e && e.message) || '操作失败');
          throw e;
        }.bind(this));
    },

    toast: function (msg) {
      if (typeof window.clToast === 'function') window.clToast(msg);
      else console.log('[Teacher]', msg);
    }
  };

  window.ClassroomTeacher = ClassroomTeacher;
})();