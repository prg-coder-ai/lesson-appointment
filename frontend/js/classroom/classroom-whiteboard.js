/**
 * classroom-whiteboard.js —— 白板协作模块
 *
 * 基于 canvas + WS whiteboard 通道。坐标为 0~1 归一化比例，跨屏尺寸一致。
 * 消息：{ type:'whiteboard', op:'draw', x0,y0,x1,y1,color,size,tool } / { op:'shape', shape:'rect'|'circle'|'square' } / { op:'text', x,y,text,font,fontSize,baseH,color } / { op:'clear' } / { op:'undo', opId, by }
 * 权限（2026-11-17 与服务端对齐）：教师/管理员默认可写；学生默认只读，须由教师
 *   通过 wb:grant 授权后才可写（服务端 ClassroomLiveState.canEditWhiteboard 同口径）。
 *   ctx.canWrite 显式 false 或 admin 角色强制只读；granted=true 可覆盖学生的只读。
 * 形状工具（rect/circle/square）：按下记录起点，拖动时橡皮筋预览，抬笔提交为一条 shape 操作并广播。
 * 文字工具（text）：点击画布弹出输入浮层，确定后提交一条 text 操作并广播；
 *   字体/字号由工具栏选择，颜色复用「当前颜色」。字号随白板高度等比缩放（baseH 基准），
 *   保证 contain 布局下跨屏/缩放时文字与板书比例一致。
 *
 * 撤回（最近 5 步，仅撤自己的）：
 *  - 「一次落笔」= 从按下到抬笔的一条完整笔画（含多个 draw 小线段）或一个 shape，
 *    每次落笔分配唯一 opId，该次落笔产生的所有 op 都带 opId / by(作者 userId)。
 *  - 本地 _undoStack 只保留自己最近提交的 5 个 opId；点撤回或 Ctrl+Z 弹一条，
 *    按 opId 从 _ops 批量移除并重绘，再广播 { op:'undo', opId, by }。
 *  - 服务端 WhiteboardHandler 校验 by === 当前 WS 用户后，从 wbOps 移除该 opId 的全部条目、
 *    广播给全房间并强制落盘快照 —— 因此刷新/重连（wb:init）不会把撤掉的笔迹复活。
 *  - clear 不计入撤回栈，且会清空撤回栈（清空是破坏性操作，不提供撤销）。
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
    _undoStack: [],                     // 自己最近提交的 opId（最多 MAX_UNDO 步），撤回时从栈顶弹
    _curOpId: null,                     // 当前这次落笔的唯一 id（一次按下→抬笔共享）
    _curOpCommitted: false,             // 当前落笔是否已产生至少一条 op（避免空点击入栈）
    _opSeq: 0,                          // opId 自增序号
    MAX_UNDO: 5,                        // 可撤回步数上限
    font: 'sans',                       // 文字字体 key（映射到 CSS font-family，见 FONT_FAMILIES）
    fontSize: 24,                       // 文字字号（逻辑像素，基准高度 baseH）
    _textAnchor: null,                  // 文字输入浮层的归一化锚点 { x, y }

    // 字体 key → CSS font-family。用 key 而非直接存字体串，避免不同端字体串不一致导致的回放错位
    FONT_FAMILIES: {
      sans: '"PingFang SC","Microsoft YaHei",Arial,sans-serif',
      hei: '"SimHei","Microsoft YaHei",sans-serif',
      song: '"SimSun","Songti SC",serif',
      kai: '"KaiTi","STKaiti",serif',
      mono: 'Consolas,"Courier New",monospace'
    },

    init: function (ctx) {
      this.ctx = ctx || {};
      this.canvas = document.getElementById('whiteboard-canvas');
      if (!this.canvas) return this;
      this.ctx2d = this.canvas.getContext('2d');
      // 与服务端 canEditWhiteboard 对齐：教师可写，学生默认只读（等 wb:grant 授权）。
      // role 判定与服务端 isTeacherOrManager 一致（teacher/manager/admin）；
      // 注意 admin 在此前版本是默认只读（巡课端），这里保留——admin 若要板书需显式 grant。
      var role = String(this.ctx.role || '').toLowerCase();
      var isTeacher = (role === 'teacher' || role === 'manager');
      this.readOnly = !isTeacher || (this.ctx.canWrite === false);
      this._bindEvents();
      this._resize();
      var self = this;
      window.addEventListener('resize', function () { self._resize(); });
      this._syncReadonlyHint();
      this._syncUndoBtn();
      return this;
    },

    show: function (on) {
      var area = document.getElementById('whiteboard-area');
      var grid = document.getElementById('video-grid');
      if (!area) return;
      this.active = !!on;
      area.classList.toggle('hidden', !on);
      // 视频面板的显隐（2026-11-16 面板可移动化后）：
      //  - 视频还在布局里（占中栏）→ 保持原互斥：白板打开就藏视频，否则两者挤在一起谁都看不清；
      //  - 视频已被拖成浮动小窗（.cl-panel-free）→ 不藏，白板独占中栏、视频小窗叠在上层 = 画中画。
      // 隐藏整个 #video-panel 而不是只藏 #video-grid：后者会留下一条孤零零的「视频」标题条。
      var videoPanel = document.getElementById('video-panel') || grid;
      if (videoPanel) {
        var floating = videoPanel.classList.contains('cl-panel-free');
        videoPanel.classList.toggle('hidden', on && !floating);
      }
      if (!on) this._hideTextEditor();    // 浮层是 area 子元素，隐藏时一并清状态避免残留
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
          if (self.tool !== 'text') self._hideTextEditor();   // 切走文字工具时丢弃未提交的输入
        });
      });
      var colorEl = document.getElementById('wb-color');
      if (colorEl) colorEl.addEventListener('input', function () { self.color = colorEl.value; self._syncTextPreviewColor(); });
      var sizeEl = document.getElementById('wb-size');
      if (sizeEl) sizeEl.addEventListener('input', function () { self.size = Number(sizeEl.value) || 3; });
      var fontEl = document.getElementById('wb-font');
      if (fontEl) fontEl.addEventListener('change', function () { self.font = fontEl.value || 'sans'; });
      var fontSizeEl = document.getElementById('wb-font-size');
      if (fontSizeEl) fontSizeEl.addEventListener('change', function () { self.fontSize = Number(fontSizeEl.value) || 24; });
      this._bindTextEditor();
      var clearEl = document.getElementById('wb-clear');
      if (clearEl) clearEl.addEventListener('click', function () { self.clear(true); });
      var undoEl = document.getElementById('wb-undo');
      if (undoEl) undoEl.addEventListener('click', function () { self.undo(); });
      // Ctrl/Cmd + Z 撤回（输入框聚焦时不拦截，避免影响文本编辑）
      window.addEventListener('keydown', function (e) {
        var isZ = (e.key === 'z' || e.key === 'Z');
        if (!(e.ctrlKey || e.metaKey) || !isZ || e.shiftKey) return;
        var t = e.target || {};
        var tag = (t.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || t.isContentEditable) return;
        e.preventDefault();
        self.undo();
      });
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
      if (this._blocked()) { this._gateToast(); return; }
      if (this.tool === 'text') {
        // 文字工具：只记录锚点 + 弹输入浮层，不进入绘制状态（_move/_end 全程不触发）
        this._textAnchor = this._norm(e);
        this._showTextEditor(e);
        return;
      }
      this.drawing = true;
      this._shapeStart = this._norm(e);   // 形状工具记录起点；画笔工具同用作上一动点
      this.last = this._shapeStart;
      // 每次落笔分配唯一 opId：本次按下→抬笔产生的所有 op 共享，撤回时按它整条移除
      this._opSeq += 1;
      this._curOpId = (this.ctx.userId || 'u') + '-' + Date.now() + '-' + this._opSeq;
      this._curOpCommitted = false;
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
          color: this.color, size: this.size,
          opId: this._curOpId, by: this.ctx.userId
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
        tool: this.tool,
        opId: this._curOpId, by: this.ctx.userId
      };
      this._drawSeg(seg);
      this._ops.push(seg);
      this._curOpCommitted = true;
      this.last = p;
      if (window.ClassroomWS && this.ctx.scheduleId) {
        this._send(seg);
      }
    },

    _end: function () {
      if (!this.drawing) { this.last = null; this._shapeStart = null; return; }
      if (this._pendingShape) {
        // 绘制途中课堂被暂停/未开始：丢弃这次形状，避免「本地画了却没广播」的各端不一致
        if (this._blocked()) {
          this._pendingShape = null;
          this._curOpCommitted = false;
          this._redrawAll();
        } else {
          // 抬笔提交形状：写进 _ops 并广播，再按 _ops 正式重绘（含刚提交的形状）
          this._ops.push(this._pendingShape);
          this._curOpCommitted = true;
          if (window.ClassroomWS && this.ctx.scheduleId) {
            this._send(this._pendingShape);
          }
          this._pendingShape = null;
          this._redrawAll();
        }
      }
      // 本次落笔确实产生了 op → 作为一个撤回步压栈（画笔多段/形状一条都只算 1 步）
      if (this._curOpCommitted && this._curOpId) this._pushUndo(this._curOpId);
      this._curOpCommitted = false;
      this._curOpId = null;
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
      if (seg.op === 'text') {
        // 文字：字号按当前白板高度相对提交时的基准高度等比缩放，
        // 保证 contain 布局下窗口缩放时文字与板书比例一致（坐标本身已是归一化）。
        var baseH = seg.baseH || 720;
        var fs = Math.max(8, (seg.fontSize || 24) * (h / baseH));
        var family = this.FONT_FAMILIES[seg.font] || this.FONT_FAMILIES.sans;
        c2.fillStyle = seg.color || '#2f80ed';
        c2.font = fs + 'px ' + family;
        c2.textBaseline = 'top';
        var lines = String(seg.text == null ? '' : seg.text).split('\n');
        var lineH = fs * 1.35;
        for (var li = 0; li < lines.length; li++) {
          c2.fillText(lines[li], seg.x * w, seg.y * h + li * lineH);
        }
      } else if (seg.op === 'shape') {
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

    /**
     * 信令通道入口：main._dispatchSignal 会把每条信令转发给所有模块的 onSignal。
     *
     * <p>白板相关消息分两条通道，必须都接：
     * 笔迹/清空/撤回/wb:init 走白板通道（服务端 broadcastWhiteboard）→ onMessage；
     * <b>wb:grant:state 走信令通道</b>（服务端 ClassroomSignalService 用 broadcastSignal）→ 只能从 onSignal 进。
     * 此前没有 onSignal，教师的「授权白板」广播到这里就断了，
     * 学生 granted 永远为 false → 一直显示只读、画不上。</p>
     */
    onSignal: function (msg) {
      if (!msg || !msg.type) return;
      if (msg.type === 'wb:grant:state') this.onMessage(msg);
    },

    // 远端消息入口：由 main.js 的 WS onWhiteboard 调用
    onMessage: function (msg) {
      if (!msg) return;
      // 服务端发布门禁拒绝（课堂未开始 / 已暂停）：给可读提示，避免用户以为画上了
      if (msg.type === 'wb:rejected') {
        this.toast(msg.status === 'PAUSED'
          ? '课堂已暂停，白板操作未发送' : '课堂未开始/已结束，白板操作未发送');
        return;
      }
      // F4-07：重连/迟到者恢复白板——服务器下发操作序列，本地重放
      if (msg.type === 'wb:init' && msg.ops) {
        this._ops = [];
        this._undoStack = [];
        var self = this;
        var me = this.ctx && this.ctx.userId;
        (msg.ops || []).forEach(function (opStr) {
          try {
            var op = (typeof opStr === 'string') ? JSON.parse(opStr) : opStr;
            if (op.op === 'clear') { self._ops = []; self._undoStack = []; self._clearLocal(); }
            else if (op.op === 'draw' || op.op === 'shape' || op.op === 'text') {
              self._ops.push(op); self._drawSeg(op);
              // 刷新/重连后按作者重建自己的撤回栈：只认带 opId 且 by===自己的 op
              // 用 String 归一：服务端注入的 by 来自 JWT sub（字符串），本地 ctx.userId 可能是数字
              if (op.opId && me != null && String(op.by) === String(me)) self._pushUndo(op.opId, true);
            }
          } catch (e) {}
        });
        this._syncUndoBtn();
        return;
      }
      // 撤回广播（含自己发出的回显）：按 opId 幂等移除并重绘
      if (msg.op === 'undo') {
        if (msg.opId) this._applyUndo(msg.opId);
        return;
      }
      // F4-08：教师授予/收回编辑权。
      // 服务端是「全房间广播且带目标 userId」，必须只认发给自己的那条——
      // 否则教师授权 A 学生时，B 学生也会在本地解锁（写入仍会被服务端 deny，但体验成「能画却画不上」）。
      if (msg.type === 'wb:grant:state') {
        var me = this.ctx && this.ctx.userId;
        if (msg.userId != null && me != null && String(msg.userId) !== String(me)) return;
        this.granted = !!msg.grant;
        this._syncUndoBtn();
        this._syncReadonlyHint();   // 授权后必须把「只读」角标收掉，否则看着像没生效
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
      if (msg.type === 'wb:denied') {
        this.toast('没有白板编辑权限');
        return;
      }
      if (msg.op === 'clear') { this._clearLocal(); this._ops = []; this._undoStack = []; this._syncUndoBtn(); return; }
      if (msg.op === 'draw' || msg.op === 'shape' || msg.op === 'text') { this._ops.push(msg); this._drawSeg(msg); }
    },

    // ------------------------------------------------------------------
    // 文字输入
    // ------------------------------------------------------------------

    _bindTextEditor: function () {
      var self = this;
      var ok = document.getElementById('wb-text-ok');
      var cancel = document.getElementById('wb-text-cancel');
      var input = document.getElementById('wb-text-input');
      if (ok) ok.addEventListener('click', function () { self._commitText(); });
      if (cancel) cancel.addEventListener('click', function () { self._hideTextEditor(); });
      if (input) {
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Escape') { e.preventDefault(); self._hideTextEditor(); return; }
          // Ctrl/Cmd + Enter 提交；Enter 本身允许换行
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); self._commitText(); }
        });
      }
    },

    _showTextEditor: function (e) {
      var box = document.getElementById('wb-text-editor');
      var input = document.getElementById('wb-text-input');
      if (!box || !input) return;
      // 用点击的视口坐标定位（fixed），并做边界收敛，避免浮层溢出屏幕
      var cx = (e && e.clientX != null) ? e.clientX : (window.innerWidth / 2);
      var cy = (e && e.clientY != null) ? e.clientY : (window.innerHeight / 2);
      var left = Math.max(4, Math.min(cx, window.innerWidth - 260));
      var top = Math.max(4, Math.min(cy, window.innerHeight - 150));
      box.style.left = left + 'px';
      box.style.top = top + 'px';
      box.style.display = 'block';
      input.value = '';
      var self = this;
      window.setTimeout(function () { try { input.focus(); } catch (err) {} self._syncTextPreviewColor(); }, 0);
    },

    _hideTextEditor: function () {
      var box = document.getElementById('wb-text-editor');
      if (box) box.style.display = 'none';
      this._textAnchor = null;
    },

    // 输入浮层里用「当前颜色」实时预览，方便对齐白板上的呈现
    _syncTextPreviewColor: function () {
      var input = document.getElementById('wb-text-input');
      if (input) input.style.color = this.color;
    },

    _commitText: function () {
      if (this._blocked()) { this._hideTextEditor(); this._gateToast(); return; }
      var input = document.getElementById('wb-text-input');
      var anchor = this._textAnchor;
      if (!input || !anchor) { this._hideTextEditor(); return; }
      var text = String(input.value || '').replace(/\s+$/, '');
      this._hideTextEditor();
      if (!text || (this.readOnly && !this.granted)) return;
      // 一条文字 = 一次操作 = 一个撤回步
      this._opSeq += 1;
      var opId = (this.ctx.userId || 'u') + '-' + Date.now() + '-' + this._opSeq;
      var seg = {
        op: 'text',
        x: anchor.x, y: anchor.y,
        text: text,
        font: this.font || 'sans',
        fontSize: this.fontSize || 24,
        baseH: this._h || 720,           // 提交时的白板逻辑高度，供各端等比缩放；兜底 720 防 _h 未就绪
        color: this.color,
        opId: opId, by: this.ctx.userId
      };
      this._ops.push(seg);
      this._drawSeg(seg);
      this._pushUndo(opId);
      if (window.ClassroomWS && this.ctx.scheduleId) {
        this._send(seg);
      }
    },

    clear: function (broadcast) {
      if (this._blocked()) { this._gateToast(); return; }
      this._hideTextEditor();
      this._clearLocal();
      this._ops = [];
      this._undoStack = [];               // 清空是破坏性操作，撤回栈一并作废
      this._syncUndoBtn();
      if (broadcast && window.ClassroomWS && this.ctx.scheduleId) {
        this._send({ op: 'clear' });
      }
    },

    // ------------------------------------------------------------------
    // 撤回（最近 5 步，仅撤自己的）
    // ------------------------------------------------------------------

    // 压入一个撤回步；超过 MAX_UNDO 时丢掉最旧的一步
    _pushUndo: function (opId, silent) {
      if (!opId) return;
      var i = this._undoStack.indexOf(opId);
      if (i >= 0) this._undoStack.splice(i, 1);   // 去重（重连回放里同一 opId 有多段）
      this._undoStack.push(opId);
      while (this._undoStack.length > this.MAX_UNDO) this._undoStack.shift();
      if (!silent) this._syncUndoBtn();
    },

    // 撤回一步：弹栈 → 广播 → 本地立即生效（不等服务端回显）
    undo: function () {
      if (this.readOnly && !this.granted) return false;
      if (this._blocked()) { this._gateToast(); return false; }
      if (!this._undoStack.length) return false;
      var opId = this._undoStack.pop();
      this._applyUndo(opId);
      if (window.ClassroomWS && this.ctx.scheduleId) {
        this._send({
          op: 'undo', opId: opId, by: this.ctx.userId
        });
      }
      return true;
    },

    // 按 opId 移除该次落笔的全部 op（一条笔画含多个 draw 小段）+ 重绘。幂等，回显重复执行无害
    _applyUndo: function (opId) {
      if (!opId) return;
      var i = this._undoStack.indexOf(opId);
      if (i >= 0) this._undoStack.splice(i, 1);
      this._ops = (this._ops || []).filter(function (op) { return op.opId !== opId; });
      this._render();                     // 清屏 + 按剩余 _ops 重绘
      this._syncUndoBtn();
    },

    // 按钮状态：只读且未授权 → 禁用；显示剩余可撤步数
    _syncUndoBtn: function () {
      var btn = document.getElementById('wb-undo');
      if (!btn) return;
      var n = this._undoStack.length;
      var canUndo = n > 0 && !(this.readOnly && !this.granted) && !this._blocked();
      btn.disabled = !canUndo;
      btn.title = canUndo ? ('撤回最近一条操作（还可撤 ' + n + ' 条）') : '暂无可撤回的操作';
      var badge = document.getElementById('wb-undo-count');
      if (badge) badge.textContent = n ? String(n) : '';
    },

    /**
     * 「只读」角标只在真正不能写时显示：教师可写；学生获得授权后也算可写。
     * 单独抽出来是因为这个角标在 init 时显示后就再没人关过——
     * 授权成功但角标还挂着，用户会以为授权没生效。
     */
    _syncReadonlyHint: function () {
      var hint = document.getElementById('wb-readonly-hint');
      if (!hint) return;
      hint.style.display = (this.readOnly && !this.granted) ? '' : 'none';
    },

    // ------------------------------------------------------------------
    // 课堂发布门禁（口径与服务端 ClassroomPublishGuard 一致）
    // 白板是独立 WS 通道，signal 通道的拦截覆盖不到，所有 op 出站统一走 _send
    // ------------------------------------------------------------------
    applyGate: function (allowed, status) {
      this.gateBlocked = !allowed;
      this.gateStatus = status || '';
      if (!allowed) this._hideTextEditor();   // 暂停时收起未提交的文字浮层
      this._syncUndoBtn();
    },

    _blocked: function () {
      if (this.gateBlocked) return true;
      if (window.ClassroomMain && typeof window.ClassroomMain.canPublish === 'function'
          && !window.ClassroomMain.canPublish()) return true;
      return false;
    },

    _gateToast: function () {
      this.toast(this.gateStatus === 'PAUSED'
        ? '课堂已暂停，暂不能编辑白板' : '课堂未开始/已结束，暂不能编辑白板');
    },

    /** 白板统一出站：draw / shape / text / clear / undo 全部过门禁 */
    _send: function (op) {
      if (this._blocked()) return;
      if (window.ClassroomWS && this.ctx.scheduleId) {
        window.ClassroomWS.sendWhiteboard(this.ctx.scheduleId, op);
      }
    },

    // 轻量提示兜底：本模块原先 onMessage 就调用 this.toast，但对象内未定义会抛 TypeError
    toast: function (text) {
      try {
        if (window.ClassroomMain && typeof window.ClassroomMain.toast === 'function') {
          window.ClassroomMain.toast(text);
          return;
        }
      } catch (e) {}
      var old = document.getElementById('wb-toast');
      if (old) old.parentNode.removeChild(old);
      var el = document.createElement('div');
      el.id = 'wb-toast';
      el.textContent = text;
      el.style.cssText = 'position:fixed;left:50%;top:16%;transform:translateX(-50%);z-index:9999;' +
        'background:#22272e;color:#fff;padding:8px 16px;border-radius:6px;font-size:13px;' +
        'box-shadow:0 2px 10px rgba(0,0,0,.35);pointer-events:none;';
      document.body.appendChild(el);
      window.setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 1800);
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