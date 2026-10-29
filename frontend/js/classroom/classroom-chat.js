/**
 * classroom-chat.js —— 聊天面板模块
 *
 * 基于 WS signal 通道（广播）。消息：{ type:'chat', from, name, text, ts }
 * 纯前端渲染，无持久化；刷新后本地消息清空（后端亦无聊天存储接口）。
 */
(function () {
  var ClassroomChat = {
    ctx: null,
    listEl: null,
    inputEl: null,

    init: function (ctx) {
      this.ctx = ctx || {};
      this.listEl = document.getElementById('chat-messages');
      this.inputEl = document.getElementById('chat-input');
      this._bindEvents();
      this.appendSystem('已进入课堂，消息对所有参与者可见');
      return this;
    },

    _bindEvents: function () {
      var self = this;
      var send = document.getElementById('chat-send');
      if (send) send.addEventListener('click', function () { self.sendFromInput(); });
      if (this.inputEl) {
        this.inputEl.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); self.sendFromInput(); }
        });
      }
    },

    sendFromInput: function () {
      if (!this.inputEl) return;
      var text = (this.inputEl.value || '').trim();
      if (!text) return;
      // F4-17：聊天经服务端强控（全员禁言时服务端拦截并回 chat:rejected）；
      // 不再本地即时渲染，统一等服务端 chat:msg 回显，保证禁言前后一致
      var msg = {
        type: 'chat',
        text: text,
        displayName: this.ctx.userName
      };
      this.send(msg);
      this.inputEl.value = '';
    },

    send: function (msg) {
      if (window.ClassroomWS && this.ctx.scheduleId) {
        window.ClassroomWS.sendSignal(this.ctx.scheduleId, msg);
      }
    },

    // 远端消息入口：由 main.js 的 WS onSignal 调用
    onSignal: function (msg) {
      if (!msg || !msg.type) return;
      if (msg.type === 'chat:msg') {
        this.append(msg, false);
        return;
      }
      if (msg.type === 'chat:rejected') {
        this.appendSystem('全员禁言中，消息未发送');
        return;
      }
    },

    append: function (msg, isMe) {
      if (!this.listEl) return;
      var li = document.createElement('li');
      var time = this._fmtTime(msg.ts);
      li.innerHTML =
        '<span class="chat-name' + (isMe ? ' is-me' : '') + '">' + this._escape(msg.name || msg.from || '匿名') + '</span>' +
        '<span class="chat-text">' + this._escape(msg.text || '') + '</span>' +
        '<span class="chat-time">' + time + '</span>';
      this.listEl.appendChild(li);
      this.listEl.scrollTop = this.listEl.scrollHeight;
    },

    appendSystem: function (text) {
      if (!this.listEl) return;
      var li = document.createElement('li');
      li.className = 'chat-system';
      li.textContent = text;
      this.listEl.appendChild(li);
      this.listEl.scrollTop = this.listEl.scrollHeight;
    },

    _fmtTime: function (ts) {
      var d = ts ? new Date(ts) : new Date();
      var hh = String(d.getHours()).padStart(2, '0');
      var mm = String(d.getMinutes()).padStart(2, '0');
      return hh + ':' + mm;
    },

    _escape: function (s) {
      if (s == null) return '';
      return String(s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    }
  };

  window.ClassroomChat = ClassroomChat;
})();