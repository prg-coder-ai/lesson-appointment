/**
 * 登录人机验证·滑块组件（2026-10-22 P1）。
 *
 * 职责单一：**渲染服务端下发的题目 → 收集作答 → 抛事件**。
 * 不做任何"该不该放行"的判定——判定只有服务端能算。
 *
 * ── 与 Web 端 login-guard.js 的关系 ──
 * 两端共用同一份服务端出题协议（ChallengeVO），差别只在渲染：
 * Web 用 canvas + mousemove/touchmove，小程序用 image + bindtouchmove。
 * 提示语、容差、失败上限全部来自服务端，不在端上各写一套。
 *
 * ── 三个必须踩准的点 ──
 * 1. **尺寸必须用 px**：服务端按 px 生成并比对，若这里用 rpx（随屏幕换算），
 *    真机上会出现"看起来对齐、服务端判偏差"。wxss 里影响坐标的尺寸全是 px。
 * 2. **轨道宽度 == 背景宽度**：1:1 映射，任何缩放都会引入换算误差。
 * 3. **拖动中节流 setData**：小程序 setData 有跨线程序列化开销，每帧都调用会掉帧。
 *    这里用 12ms 节流 + 同步变量 _curLeft 保真——提交值取自变量而不是 data，
 *    避免"最后一帧还没 setData 完就抬手"导致提交的位置比用户实际拖动的位置旧。
 */
Component({
  properties: {
    /** 是否显示。父页面控制。 */
    show: { type: Boolean, value: false },
    /** 服务端下发的挑战素材（ChallengeVO 的 data 部分）。 */
    challenge: { type: Object, value: null }
  },

  data: {
    left: 0,
    thumbLeft: 0,
    errTip: '',
    dragging: false,
    bgWidth: 300,
    bgHeight: 150,
    pieceSize: 50,
    pieceY: 10,
    bgImage: '',
    pieceImage: ''
  },

  observers: {
    // 两个字段任一变化都要重新初始化（父页面可能复用同一组件连续挑战两次）
    'show, challenge': function (show, challenge) {
      if (show && challenge) this.initChallenge(challenge);
    }
  },

  methods: {
    /** 用服务端素材初始化：记录映射参数，重置进度。 */
    initChallenge(ch) {
      const bgWidth = Number(ch.bgWidth) || 300;
      const bgHeight = Number(ch.bgHeight) || 150;
      const pieceSize = Number(ch.pieceSize) || 50;
      const pieceY = Number(ch.pieceY) || 10;

      // 位移映射：背景宽 - 块宽 = 块能走的最大行程；thumb 行程 = 轨道宽 - thumb 宽
      this._maxLeft = Math.max(1, bgWidth - pieceSize);
      this._maxThumb = Math.max(1, bgWidth - 44);
      this._curLeft = 0;
      this._points = 0;
      this._lastPaint = 0;

      this.setData({
        left: 0,
        thumbLeft: 0,
        errTip: '',
        dragging: false,
        bgWidth,
        bgHeight,
        pieceSize,
        pieceY,
        bgImage: ch.bgImage || '',
        pieceImage: ch.pieceImage || ''
      });
    },

    onStart(e) {
      const t = (e.touches && e.touches[0]) || null;
      if (!t) return;
      this._dragStartX = t.clientX - this._curLeft;
      this._points = 0;
      this._t0 = Date.now();
      this.setData({ dragging: true, errTip: '' });
    },

    onMove(e) {
      if (!this.data.dragging) return;
      const t = (e.touches && e.touches[0]) || null;
      if (!t) return;

      let x = t.clientX - this._dragStartX;
      if (x < 0) x = 0;
      if (x > this._maxLeft) x = this._maxLeft;
      this._curLeft = x;          // ★ 同步变量：提交以它为准，不受 setData 异步影响
      this._points++;

      const now = Date.now();
      if (now - this._lastPaint < 12) return;   // 节流：约 80fps 上限，防掉帧
      this._lastPaint = now;
      this.setData({
        left: x,
        thumbLeft: x / this._maxLeft * this._maxThumb
      });
    },

    onEnd() {
      if (!this.data.dragging) return;
      this.setData({ dragging: false });

      // 只点了一下没拖动：不算一次作答，允许重来（不消耗服务端的失败次数）
      if (this._points < 1) {
        this.setData({ errTip: '请按住滑块向右拖动' });
        return;
      }

      // 补最后一帧的视觉位置（节流可能吞掉了它）
      this.setData({
        left: this._curLeft,
        thumbLeft: this._curLeft / this._maxLeft * this._maxThumb
      });

      const costMs = Date.now() - (this._t0 || Date.now());
      this.triggerEvent('done', {
        moveX: Math.round(this._curLeft),
        trackPoints: this._points,
        costMs
      });
    },

    onCancel() {
      this.triggerEvent('cancel');
    },

    /** 吞掉遮罩上的滑动，避免拖动时穿透到页面滚动。 */
    noop() {
    }
  }
});
