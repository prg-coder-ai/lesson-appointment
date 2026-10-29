/**
 * classroom-whiteboard.js —— 白板协作模块
 *
 * 基于 canvas + WS whiteboard 通道。坐标为 0~1 归一化比例，跨屏尺寸一致。
 * 消息：{ type:'whiteboard', op:'draw', x0,y0,x1,y1,color,size,tool } / { op:'clear' }
 * 权限：admin 默认只读；学生是否可写由 ctx.canWrite 控制（默认 true）。
 */
(function () {
  var ClassroomWhiteboard = {
    ctx: null,
    canvas: null,
    ctx2d: null,
    drawing: false,
    last: null,
    tool: 'pen',
    color: '#2f80ed',
    size: 3,
    readOnly: false,
    granted: false,    // F4-08：被教师授予编辑权（学生）
    active: false,

    init: function (ctx) {
      this.ctx = ctx || {};
      this.canvas = document.getElementById('whiteboard-canvas');
      if (!this.canvas) return this;
      this.ctx2d = this.canvas.getContext('2d');
      this.readOnly = (this.ctx.role === 'admin') || (this.ctx.canWrite === false);
      this._bindEvents();
      this._resize();
      var self = this;
      window.addEventListener('resize', function () { self._resize(); });
      if (this.readOnly) {
        var hint = document.getElementById('wb-readonly-hint');
        if (hint) hint.style.display = '';
      }
      return this;
    },

    show: function (on) {
      var area = document.getElementById('whiteboard-area');
      var grid = document.getElementById('video-grid');
      if (!area) return;
      this.active = !!on;
      area.classList.toggle('hidden', !on);
      if (grid) grid.classList.toggle('hidden', on);
      if (on) this._resize();
    },

    toggle: function () {
      this.show(!this.active);
      return this.active;
    },

    isActive: function () { return this.active; },

    _bindEvents: function () {
      var self = this;
      var c = this.canvas;

      c.addEventListener('mousedown', function (e) { self._start(e); });
      c.addEventListener('mousemove', function (e) { self._move(e); });
      window.addEventListener('mouseup', function () { self._end(); });

      c.addEventListener('touchstart', function (e) { self._start(self._touch(e)); e.preventDefault(); }, { passive: false });
      c.addEventListener('touchmove', function (e) { self._move(self._touch(e)); e.preventDefault(); }, { passive: false });
      c.addEventListener('touchend', function () { self._end(); });

      var tools = document.querySelectorAll('.wb-tool[data-tool]');
      tools.forEach(function (btn) {
        btn.addEventListener('click', function () {
          tools.forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          self.tool = btn.getAttribute('data-tool');
        });
      });
      var colorEl = document.getElementById('wb-color');
      if (colorEl) colorEl.addEventListener('input', function () { self.color = colorEl.value; });
      var sizeEl = document.getElementById('wb-size');
      if (sizeEl) sizeEl.addEventListener('input', function () { self.size = Number(sizeEl.value) || 3; });
      var clearEl = document.getElementById('wb-clear');
      if (clearEl) clearEl.addEventListener('click', function () { self.clear(true); });
    },

    _touch: function (e) {
      var t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
      return { offsetX: t ? t.clientX : 0, offsetY: t ? t.clientY : 0, clientX: t ? t.clientX : 0, clientY: t ? t.clientY : 0 };
    },

    _norm: function (e) {
      var rect = this.canvas.getBoundingClientRect();
      var cx = (e.clientX != null) ? e.clientX : e.offsetX;
      var cy = (e.clientY != null) ? e.clientY : e.offsetY;
      return {
        x: rect.width ? (cx - rect.left) / rect.width : 0,
        y: rect.height ? (cy - rect.top) / rect.height : 0
      };
    },

    _start: function (e) {
      if (this.readOnly && !this.granted) return;
      this.drawing = true;
      this.last = this._norm(e);
    },

    _move: function (e) {
      if (!this.drawing || (this.readOnly && !this.granted)) return;
      var p = this._norm(e);
      var seg = {
        type: 'whiteboard', op: 'draw',
        x0: this.last.x, y0: this.last.y, x1: p.x, y1: p.y,
        color: this.tool === 'eraser' ? '#ffffff' : this.color,
        size: this.tool === 'eraser' ? this.size * 3 : this.size,
        tool: this.tool
      };
      this._drawSeg(seg);
      this.last = p;
      if (window.ClassroomWS && this.ctx.scheduleId) {
        window.ClassroomWS.sendWhiteboard(this.ctx.scheduleId, seg);
      }
    },

    _end: function () { this.drawing = false; this.last = null; },

    _drawSeg: function (seg) {
      if (!this.ctx2d) return;
      var w = this.canvas.width, h = this.canvas.height;
      var c2 = this.ctx2d;
      c2.strokeStyle = seg.color || '#2f80ed';
      c2.lineWidth = (seg.size || 3);
      c2.lineCap = 'round';
      c2.lineJoin = 'round';
      c2.beginPath();
      c2.moveTo(seg.x0 * w, seg.y0 * h);
      c2.lineTo(seg.x1 * w, seg.y1 * h);
      c2.stroke();
    },

    // 远端消息入口：由 main.js 的 WS onWhiteboard 调用
    onMessage: function (msg) {
      if (!msg) return;
      // F4-07：重连/迟到者恢复白板——服务器下发操作序列，本地重放
      if (msg.type === 'wb:init' && msg.ops) {
        var self = this;
        (msg.ops || []).forEach(function (opStr) {
          try {
            var op = (typeof opStr === 'string') ? JSON.parse(opStr) : opStr;
            if (op.op === 'clear') self._clearLocal();
            else if (op.op === 'draw') self._drawSeg(op);
          } catch (e) {}
        });
        return;
      }
      // F4-08：教师授予/收回编辑权
      if (msg.type === 'wb:grant:state') {
        this.granted = !!msg.grant;
        if (this.granted) {
          this.toast('教师已授权你编辑白板');
        } else if (this.readOnly) {
          this.toast('教师已收回白板编辑权');
        }
        return;
      }
      if (msg.type === 'wb:snapshot:saved') {
        this.toast('白板已保存');
        return;
      }
      if (msg.op === 'clear') { this._clearLocal(); return; }
      if (msg.op === 'draw') { this._drawSeg(msg); }
    },

    clear: function (broadcast) {
      this._clearLocal();
      if (broadcast && window.ClassroomWS && this.ctx.scheduleId) {
        window.ClassroomWS.sendWhiteboard(this.ctx.scheduleId, { op: 'clear' });
      }
    },

    _clearLocal: function () {
      if (!this.ctx2d) return;
      this.ctx2d.clearRect(0, 0, this.canvas.width, this.canvas.height);
    },

    _resize: function () {
      if (!this.canvas) return;
      var rect = this.canvas.getBoundingClientRect();
      var dpr = window.devicePixelRatio || 1;
      var w = Math.max(1, Math.round(rect.width));
      var h = Math.max(1, Math.round(rect.height));
      // 仅在尺寸变化时重置，避免清空已有绘制
      if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) {
        this.canvas.width = w * dpr;
        this.canvas.height = h * dpr;
        this.canvas.style.width = w + 'px';
        this.canvas.style.height = h + 'px';
        if (this.ctx2d) { this.ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0); }
      }
    }
  };

  window.ClassroomWhiteboard = ClassroomWhiteboard;
})();