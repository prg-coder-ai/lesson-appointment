/**
 * classroom-whiteboard.js —— 白板协作模块
 *
 * 基于 canvas + WS whiteboard 通道。坐标为 0~1 归一化比例，跨屏尺寸一致。
 * 消息：{ type:'whiteboard', op:'draw', x0,y0,x1,y1,color,size,tool } / { op:'shape', shape:'rect'|'circle'|'square' } / { op:'clear' }
 * 权限：admin 默认只读；学生是否可写由 ctx.canWrite 控制（默认 true）。
 * 形状工具（rect/circle/square）：按下记录起点，拖动时橡皮筋预览，抬笔提交为一条 shape 操作并广播。
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
    _ops: [],                          // 当前白板操作缓存，供 resize 重绘与重连恢复
    _w: 0, _h: 0, _dpr: 1,             // 逻辑尺寸缓存（去掉 dpr 缩放，绘制坐标用逻辑像素）
    aspect: 16 / 9,                     // 白板内容固定纵横比（宽/高）。保持后同一幅归一化画在任意屏比例下形状一致；改这里即可换比例（如 4/3）
    _shapeStart: null,                  // 形状工具：按下时的归一化起点
    _pendingShape: null,                // 形状工具：拖动中暂存的预览 shape（抬笔才提交进 _ops）

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
      this._shapeStart = this._norm(e);   // 形状工具记录起点；画笔工具同用作上一动点
      this.last = this._shapeStart;
    },

    _move: function (e) {
      if (!this.drawing || (this.readOnly && !this.granted)) return;
      var p = this._norm(e);
      var isShape = (this.tool === 'rect' || this.tool === 'circle' || this.tool === 'square');
      if (isShape) {
        // 形状工具：实时橡皮筋预览——清屏 + 重绘已落笔画 + 当前预览，但不写进 _ops
        var s0 = this._shapeStart || this.last;
        var seg = {
          op: 'shape', shape: this.tool,
          x0: s0.x, y0: s0.y, x1: p.x, y1: p.y,
          color: this.color, size: this.size
        };
        this._render(seg);                 // 清屏 + 重绘 _ops + 预览
        this._pendingShape = seg;          // 暂存，抬笔时提交
        return;
      }
      // 画笔/橡皮：增量落笔（每段独立成 op，便于远端增量同步）
      var seg = {
        type: 'whiteboard', op: 'draw',
        x0: this.last.x, y0: this.last.y, x1: p.x, y1: p.y,
        color: this.tool === 'eraser' ? '#ffffff' : this.color,
        size: this.tool === 'eraser' ? this.size * 3 : this.size,
        tool: this.tool
      };
      this._drawSeg(seg);
      this._ops.push(seg);
      this.last = p;
      if (window.ClassroomWS && this.ctx.scheduleId) {
        window.ClassroomWS.sendWhiteboard(this.ctx.scheduleId, seg);
      }
    },

    _end: function () {
      if (!this.drawing) { this.last = null; this._shapeStart = null; return; }
      if (this._pendingShape) {
        // 抬笔提交形状：写进 _ops 并广播，再按 _ops 正式重绘（含刚提交的形状）
        this._ops.push(this._pendingShape);
        if (window.ClassroomWS && this.ctx.scheduleId) {
          window.ClassroomWS.sendWhiteboard(this.ctx.scheduleId, this._pendingShape);
        }
        this._pendingShape = null;
        this._redrawAll();
      }
      this.drawing = false;
      this.last = null;
      this._shapeStart = null;
    },

    _drawSeg: function (seg) {
      if (!this.ctx2d) return;
      // 关键修复：ctx2d 已 setTransform(dpr,...)，坐标单位必须是「逻辑像素」，
      // 不能用 canvas.width（物理像素），否则归一化坐标被再乘一次 dpr → 线条飞出画布。
      var w = this._w || (this.canvas.width / (this._dpr || window.devicePixelRatio || 1));
      var h = this._h || (this.canvas.height / (this._dpr || window.devicePixelRatio || 1));
      var c2 = this.ctx2d;
      // 橡皮只用于画笔工具（shape 用当前颜色描边，不做擦除）
      var isErase = (seg.tool === 'eraser');
      // 用 save/restore 隔离合成模式，避免污染后续绘制
      c2.save();
      if (isErase) {
        // 真擦除：destination-out 把画布像素变透明（背景走 CSS #fff），重放时同样生效；
        // 旧实现是 source-over 画白线，透明层上画白=没擦，且 ops 回放会把白线重新画出来。
        c2.globalCompositeOperation = 'destination-out';
        c2.strokeStyle = 'rgba(0,0,0,1)';   // destination-out 只看 alpha，颜色无所谓
      } else {
        c2.globalCompositeOperation = 'source-over';
        c2.strokeStyle = seg.color || '#2f80ed';
      }
      c2.lineWidth = (seg.size || 3);
      c2.lineCap = 'round';
      c2.lineJoin = 'round';
      if (seg.op === 'shape') {
        this._strokeShape(c2, seg, w, h);   // 矩形 / 圆 / 正方形
      } else {
        c2.beginPath();
        c2.moveTo(seg.x0 * w, seg.y0 * h);
        c2.lineTo(seg.x1 * w, seg.y1 * h);
        c2.stroke();
      }
      c2.restore();
    },

    // 把一条 shape 操作渲染成对应几何图形（归一化坐标 → 逻辑像素）
    _strokeShape: function (c2, seg, w, h) {
      var x0 = seg.x0 * w, y0 = seg.y0 * h, x1 = seg.x1 * w, y1 = seg.y1 * h;
      if (seg.shape === 'rect') {
        c2.strokeRect(x0, y0, x1 - x0, y1 - y0);
      } else if (seg.shape === 'square') {
        // 正方形：取拖动两个方向里的较大者作为边长，方向与拖动一致
        var dx = x1 - x0, dy = y1 - y0;
        var side = Math.max(Math.abs(dx), Math.abs(dy));
        var sx = dx < 0 ? -side : side;
        var sy = dy < 0 ? -side : side;
        c2.strokeRect(x0, y0, sx, sy);
      } else if (seg.shape === 'circle') {
        // 圆：以拖动框的较大边为直径，保证是「圆」而不是椭圆（与白板固定纵横比配合，圆永远是圆）
        var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        var r = Math.max(Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2);
        c2.beginPath();
        c2.ellipse(cx, cy, r, r, 0, 0, Math.PI * 2);
        c2.stroke();
      }
    },

    // 形状预览：清屏 → 重绘所有已落笔画(_ops) → 叠加当前预览 shape。不修改 _ops。
    _render: function (previewSeg) {
      if (!this.ctx2d) return;
      this._clearLocal();
      this._redrawAll();
      if (previewSeg) this._drawSeg(previewSeg);
    },

    // 远端消息入口：由 main.js 的 WS onWhiteboard 调用
    onMessage: function (msg) {
      if (!msg) return;
      // F4-07：重连/迟到者恢复白板——服务器下发操作序列，本地重放
      if (msg.type === 'wb:init' && msg.ops) {
        this._ops = [];
        var self = this;
        (msg.ops || []).forEach(function (opStr) {
          try {
            var op = (typeof opStr === 'string') ? JSON.parse(opStr) : opStr;
            if (op.op === 'clear') { self._ops = []; self._clearLocal(); }
            else if (op.op === 'draw' || op.op === 'shape') { self._ops.push(op); self._drawSeg(op); }
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
      if (msg.op === 'clear') { this._clearLocal(); this._ops = []; return; }
      if (msg.op === 'draw' || msg.op === 'shape') { this._ops.push(msg); this._drawSeg(msg); }
    },

    clear: function (broadcast) {
      this._clearLocal();
      this._ops = [];
      if (broadcast && window.ClassroomWS && this.ctx.scheduleId) {
        window.ClassroomWS.sendWhiteboard(this.ctx.scheduleId, { op: 'clear' });
      }
    },

    _clearLocal: function () {
      if (!this.ctx2d) return;
      // 用逻辑尺寸（_w/_h）清屏：ctx2d 已 setTransform(dpr)，clearRect 参数为逻辑像素，
      // 用 canvas.width（物理）会过度清除；用 _w/_h 恰好清整块画布。
      var w = this._w || (this.canvas.width / (this._dpr || window.devicePixelRatio || 1));
      var h = this._h || (this.canvas.height / (this._dpr || window.devicePixelRatio || 1));
      this.ctx2d.clearRect(0, 0, w, h);
    },

    _resize: function () {
      if (!this.canvas) return;
      // 保持纵横比：白板内容按固定 aspect（宽/高）渲染，不再拉伸填满容器。
      // 做法——在【可用区域】内以 contain 方式放入一个固定纵横比的矩形（letterbox 居中），
      // 这样同一幅归一化画在任意屏比例下形状一致，不被拉扁。
      //
      // 可用区域取自【父容器 whiteboard-area】的实测尺寸（减去工具栏高度），
      // 而不是 canvas 自身：
      //   · 父容器尺寸由外层布局决定，与 canvas 自身 style 无关 → 测出来稳定，无反馈死循环；
      //   · 若测 canvas 自身，之前已被钉死的 style 会污染下一次测量（就是「宽度计算有误」的根源）。
      var availW = 0, availH = 0;
      var area = document.getElementById('whiteboard-area');
      if (area) {
        var areaRect = area.getBoundingClientRect();
        var toolbar = document.getElementById('whiteboard-toolbar');
        var barH = toolbar ? toolbar.offsetHeight : 0;
        availW = areaRect.width;
        availH = areaRect.height - barH;     // 工具栏占掉的高度不能再画
      } else {
        var r = this.canvas.getBoundingClientRect();
        availW = r.width; availH = r.height;
      }
      var dpr = window.devicePixelRatio || 1;
      var A = this.aspect || (16 / 9);
      var drawW, drawH;
      // contain：取能放进 (availW, availH) 的最大固定纵横比矩形
      if (availW / Math.max(1, availH) > A) {
        drawH = Math.max(1, availH);
        drawW = drawH * A;
      } else {
        drawW = Math.max(1, availW);
        drawH = drawW / A;
      }
      drawW = Math.round(drawW);
      drawH = Math.round(drawH);
      // 让 canvas 以固定纵横比居中（letterbox），不再 flex 拉伸填满——这样显示尺寸永远保持 aspect。
      // 注意：这里写 style 是「按父容器算出来的目标尺寸」，不是「测自身再钉回自身」，所以安全。
      this.canvas.style.flex = '0 0 auto';
      this.canvas.style.margin = 'auto';
      this.canvas.style.width = drawW + 'px';
      this.canvas.style.height = drawH + 'px';
      // ★ 读回真实渲染尺寸：让 _w/_h 与显示像素严格一致。
      //   这样「输入归一化(_norm 用 canvas 真实 getBoundingClientRect)」与「输出绘制(_w/_h)」用的是
      //   同一份尺寸——无论布局/时序如何，画圆永远是圆，缩放时不会因为测量错位而把比例拉偏。
      var real = this.canvas.getBoundingClientRect();
      var rw = real.width || drawW;
      var rh = real.height || drawH;
      // backing store 按 dpr 放大，绘制坐标用逻辑像素（_w/_h）
      var pw = Math.max(1, Math.round(rw * dpr));
      var ph = Math.max(1, Math.round(rh * dpr));
      // 仅在物理尺寸变化时重置（用整数 backing 比较，避免 dpr 乘积非整数时每次都触发）
      if (this.canvas.width !== pw || this.canvas.height !== ph) {
        this.canvas.width = pw;          // 赋值会清空像素并重置变换，下方重设
        this.canvas.height = ph;
        this._w = rw; this._h = rh; this._dpr = dpr;
        if (this.ctx2d) { this.ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0); }
        this._redrawAll();   // 重置 canvas.width 会清空像素，按缓存重绘板书，避免 resize 后板书消失
      }
    },

    // 重置尺寸后按 _ops 缓存重绘（修复：resize 清空画布导致板书消失）
    _redrawAll: function () {
      if (!this.ctx2d) return;
      var self = this;
      (this._ops || []).forEach(function (op) { self._drawSeg(op); });
    },
  };

  window.ClassroomWhiteboard = ClassroomWhiteboard;
})();