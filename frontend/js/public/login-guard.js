/**
 * 登录人机验证（Web 端 UI 层，2026-10-22 P1）。
 *
 * 职责严格单一：**识别 code=1002 → 渲染滑块 → 收集作答 → 交回调用方重试**。
 * 不做任何"该不该放行"的判定——判定只有服务端能算（要读频率表与设备档案）。
 *
 * ── 为什么不用第三方验证码 SDK ──
 * 本项目前端是零框架 + build.js 打包，引带全局副作用的 SDK 会撞上
 * 「顶层标识符污染」与 dist 体积两个约束，而且小程序端还得再引一套。
 * 自研后两端共用同一份服务端出题协议，只有渲染方式不同。
 *
 * ── 为什么坐标只从服务端拿、且只拿 Y ──
 * 服务端下发的 data 里有 pieceY / pieceSize / bgWidth / bgHeight，**没有 targetX**。
 * 前者是"怎么摆"，后者是"答案"。前端永远拿不到答案，滑块才有意义。
 *
 * ── 三个必须踩准的实现点 ──
 * 1. 轨道宽度 == 背景宽度（1:1）。任何缩放都会让"用户看到的对齐"与"服务端比对的像素"
 *    不是同一套坐标系，表现为"明明对齐了却总是不通过"——这类 bug 极难自查。
 * 2. 轨迹采样：每次 move 记一帧。真人拖 250px 会产生几十帧，脚本瞬移只有一两帧，
 *    服务端据此拒绝（min-track-points）。
 * 3. 失败最多再弹 2 次，然后抛错。不然答错 → 重新出题 → 答错 会变成死循环。
 */
(function () {
  'use strict';

  var STYLE_ID = 'lg-slider-style';
  var MAX_ATTEMPT = 2;

  // ── 样式注入（幂等，不新增 css 文件以免动构建） ──
  var CSS = ''
    + '.lg-mask{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99999;'
    + 'display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;}'
    + '.lg-card{background:#fff;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.25);'
    + 'padding:20px;max-width:100%;box-sizing:border-box;}'
    + '.lg-title{font-size:16px;font-weight:600;color:#1f2329;margin:0 0 4px;}'
    + '.lg-hint{font-size:12px;color:#8a8f99;margin:0 0 12px;line-height:1.5;}'
    + '.lg-stage{position:relative;overflow:hidden;border-radius:8px;background:#f2f3f5;'
    + 'touch-action:none;user-select:none;-webkit-user-select:none;}'
    + '.lg-stage canvas{display:block;}'
    + '.lg-piece{position:absolute;left:0;box-shadow:0 2px 8px rgba(0,0,0,.35);'
    + 'border-radius:2px;pointer-events:none;}'
    + '.lg-track{position:relative;height:40px;margin-top:14px;background:#f2f3f5;border-radius:20px;'
    + 'border:1px solid #e5e6eb;overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none;}'
    + '.lg-fill{position:absolute;left:0;top:0;bottom:0;width:0;background:#e8f0ff;}'
    + '.lg-thumb{position:absolute;left:0;top:0;width:44px;height:40px;background:#fff;'
    + 'border:1px solid #d0d3d9;border-radius:20px;display:flex;align-items:center;justify-content:center;'
    + 'color:#4e6ef2;font-size:16px;cursor:grab;box-shadow:0 2px 6px rgba(0,0,0,.12);}'
    + '.lg-thumb.lg-active{cursor:grabbing;background:#f7f9ff;}'
    + '.lg-track-text{position:absolute;left:0;right:0;top:0;bottom:0;display:flex;align-items:center;'
    + 'justify-content:center;font-size:12px;color:#a8adb5;pointer-events:none;}'
    + '.lg-err{font-size:12px;color:#f54a45;margin:10px 0 0;min-height:16px;}'
    + '.lg-close{position:absolute;right:10px;top:8px;width:24px;height:24px;line-height:24px;'
    + 'text-align:center;color:#a8adb5;cursor:pointer;font-size:18px;}'
    + '.lg-card-wrap{position:relative;}';

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.appendChild(document.createTextNode(CSS));
    document.head.appendChild(s);
  }

  /** 从各种错误形态里取出 challenge 结果；不是挑战就返回 null。 */
  function toChallenge(err) {
    if (!err) return null;
    // Web 请求层非 200/401/403 的 code 会直接 reject res 对象；有的封装会挂在 .raw 上
    var src = err.raw || err;
    var dom = window.ErrorCodeDomain;
    if (dom && typeof dom.resolveResult === 'function') {
      var r = dom.resolveResult(src);
      if (r && r.type === 'challenge') return r;
    }
    // 兜底：即使共享域没加载也要认得出来（1002 是服务端 Result.CODE_NEED_CHALLENGE）
    if (src && src.code === 1002) {
      return { type: 'challenge', code: 1002, message: src.message || '', data: src.data };
    }
    return null;
  }

  function pointerX(e) {
    if (e.touches && e.touches.length) return e.touches[0].clientX;
    if (e.changedTouches && e.changedTouches.length) return e.changedTouches[0].clientX;
    return e.clientX;
  }

  function clamp(v, min, max) {
    return v < min ? min : (v > max ? max : v);
  }

  /**
   * 渲染滑块并等待作答。
   *
   * @param {Object} data 服务端下发的挑战素材 { challengeId, bgImage, pieceImage, pieceY, pieceSize, bgWidth, bgHeight, expireIn, tolerance }
   * @returns {Promise<{moveX:number, trackPoints:number, costMs:number}|null>}
   *          用户取消时 resolve(null)
   */
  function renderSlider(data) {
    return new Promise(function (resolve) {
      injectStyle();

      var bgW = data.bgWidth || 300;
      var bgH = data.bgHeight || 150;
      var pieceSize = data.pieceSize || 50;
      var pieceY = data.pieceY || 10;

      // ── DOM 构建（全部用 createElement，不拼 innerHTML 以避开 XSS 面） ──
      var mask = document.createElement('div');
      mask.className = 'lg-mask';

      var card = document.createElement('div');
      card.className = 'lg-card lg-card-wrap';

      var close = document.createElement('div');
      close.className = 'lg-close';
      close.setAttribute('role', 'button');
      close.setAttribute('aria-label', '关闭');
      close.textContent = '×';

      var title = document.createElement('div');
      title.className = 'lg-title';
      title.textContent = '安全验证';

      var hint = document.createElement('div');
      hint.className = 'lg-hint';
      hint.textContent = '拖动下方滑块，把拼图块对齐到图中缺口';

      var stage = document.createElement('div');
      stage.className = 'lg-stage';
      stage.style.width = bgW + 'px';
      stage.style.height = bgH + 'px';

      var bgCanvas = document.createElement('canvas');
      bgCanvas.width = bgW;
      bgCanvas.height = bgH;
      stage.appendChild(bgCanvas);

      var piece = document.createElement('div');
      piece.className = 'lg-piece';
      piece.style.top = pieceY + 'px';
      piece.style.left = '0px';
      piece.style.width = pieceSize + 'px';
      piece.style.height = pieceSize + 'px';
      var pieceCanvas = document.createElement('canvas');
      pieceCanvas.width = pieceSize;
      pieceCanvas.height = pieceSize;
      pieceCanvas.style.width = pieceSize + 'px';
      pieceCanvas.style.height = pieceSize + 'px';
      pieceCanvas.style.display = 'block';
      piece.appendChild(pieceCanvas);
      stage.appendChild(piece);

      // 轨道宽度与背景同宽 → 1:1 像素映射，不存在换算误差
      var track = document.createElement('div');
      track.className = 'lg-track';
      track.style.width = bgW + 'px';
      var fill = document.createElement('div');
      fill.className = 'lg-fill';
      var thumb = document.createElement('div');
      thumb.className = 'lg-thumb';
      thumb.textContent = '→';
      var trackText = document.createElement('div');
      trackText.className = 'lg-track-text';
      trackText.textContent = '按住滑块拖动';
      track.appendChild(fill);
      track.appendChild(thumb);
      track.appendChild(trackText);

      var errTip = document.createElement('div');
      errTip.className = 'lg-err';

      card.appendChild(close);
      card.appendChild(title);
      card.appendChild(hint);
      card.appendChild(stage);
      card.appendChild(track);
      card.appendChild(errTip);
      mask.appendChild(card);
      document.body.appendChild(mask);

      var maxLeft = bgW - pieceSize;
      var thumbW = 44;
      var maxThumb = bgW - thumbW;
      var curLeft = 0;
      var moving = false;
      var startX = 0;
      var t0 = 0;
      var points = 0;
      var settled = false;

      // 画背景 + 块（canvas 渲染，避免 img 加载态与 DPI 缩放带来的尺寸偏差）
      var pending = 2;
      function done() {
        if (--pending === 0) { /* 两张图画完即可交互 */ }
      }
      drawToCanvas(bgCanvas, data.bgImage, bgW, bgH, done);
      drawToCanvas(pieceCanvas, data.pieceImage, pieceSize, pieceSize, done);

      function setLeft(px) {
        curLeft = px;
        piece.style.left = px + 'px';
        thumb.style.left = (px / maxLeft * maxThumb) + 'px';
        fill.style.width = thumb.style.left;
      }

      function onDown(e) {
        if (settled) return;
        e.preventDefault();
        moving = true;
        points = 0;
        t0 = (window.performance && performance.now) ? performance.now() : Date.now();
        startX = pointerX(e) - curLeft;
        thumb.classList.add('lg-active');
        trackText.style.display = 'none';
        bindMove();
      }

      function onMove(e) {
        if (!moving) return;
        e.preventDefault();
        var x = pointerX(e) - startX;
        setLeft(clamp(x, 0, maxLeft));
        points++;
      }

      function onUp(e) {
        if (!moving) return;
        moving = false;
        if (e && e.preventDefault) e.preventDefault();
        thumb.classList.remove('lg-active');
        unbindMove();
        var cost = ((window.performance && performance.now) ? performance.now() : Date.now()) - t0;
        if (points < 1) {
          // 只是点了一下没拖：不算一次作答，允许重来
          errTip.textContent = '请按住滑块向右拖动';
          return;
        }
        settled = true;
        cleanup();
        resolve({
          moveX: Math.round(curLeft),
          trackPoints: points,
          costMs: Math.round(cost)
        });
      }

      function bindMove() {
        document.addEventListener('mousemove', onMove, { passive: false });
        document.addEventListener('mouseup', onUp, { passive: false });
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onUp, { passive: false });
      }

      function unbindMove() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onUp);
      }

      function cleanup() {
        unbindMove();
        if (mask.parentNode) mask.parentNode.removeChild(mask);
      }

      function cancel() {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(null);
      }

      thumb.addEventListener('mousedown', onDown, { passive: false });
      thumb.addEventListener('touchstart', onDown, { passive: false });
      close.addEventListener('click', cancel);
      mask.addEventListener('click', function (e) {
        if (e.target === mask) cancel();
      });
      document.addEventListener('keydown', function onEsc(e) {
        if (e.key === 'Escape') { document.removeEventListener('keydown', onEsc); cancel(); }
      });
    });
  }

  /** 把 dataURI 画进 canvas。绘制失败时静默（用户仍可尝试拖动，只是看不到图）。 */
  function drawToCanvas(canvas, dataUri, w, h, done) {
    try {
      var img = new Image();
      img.onload = function () {
        try {
          var ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
        } catch (e) { /* 绘制失败不阻断交互 */ }
        if (done) done();
      };
      img.onerror = function () { if (done) done(); };
      img.src = dataUri;
    } catch (e) {
      if (done) done();
    }
  }

  /**
   * 包装一次登录调用：遇到 1002 自动弹滑块、收集作答、带答案重试。
   *
   * @param {Function} doLogin (extra) => Promise
   *        extra 里会带 { challengeId, moveX, trackPoints, costMs }，由调用方塞进登录请求体
   * @returns {Promise} 最终登录结果（成功）或最后一次的错误
   */
  function wrap(doLogin) {
    var attempt = 0;
    var extra = {};

    function run() {
      return Promise.resolve()
        .then(function () { return doLogin(extra); })
        .catch(function (err) {
          var ch = toChallenge(err);
          if (!ch || attempt >= MAX_ATTEMPT) {
            throw err;
          }
          attempt++;
          return renderSlider(ch.data || {}).then(function (ans) {
            if (!ans) throw err;   // 用户主动关闭 → 原样抛出，交给页面提示
            extra = {
              challengeId: (ch.data && ch.data.challengeId) || '',
              moveX: ans.moveX,
              trackPoints: ans.trackPoints,
              costMs: ans.costMs
            };
            return run();
          });
        });
    }
    return run();
  }

  window.LoginGuard = {
    wrap: wrap,
    /** 供排查/单测使用：从错误对象里识别挑战，非挑战返回 null。 */
    toChallenge: toChallenge,
    /** 设备指纹 + 环境异常采集，登录请求体里一并上报（失败不影响登录）。 */
    collectDevice: collectDevice
  };

  /**
   * 采集设备标识与环境异常标记。
   *
   * 说明：这是**降权信号**而不是唯一判据 —— localStorage 可清、改机工具能伪造整组环境字段。
   * 因此服务端只把它算进风险分（+20/+40），不作为黑名单依据。
   */
  function collectDevice() {
    var out = { deviceId: '', emuFlag: false };
    try {
      var nav = window.navigator || {};
      var scr = window.screen || {};
      var raw = [
        nav.platform || '', nav.language || '', nav.hardwareConcurrency || '',
        scr.width || '', scr.height || '', scr.colorDepth || '',
        new Date().getTimezoneOffset()
      ].join('|');
      // 用 canvas 采样一次像素做粗指纹（同一设备不同浏览器会有差异，够用）
      try {
        var c = document.createElement('canvas');
        c.width = 60; c.height = 20;
        var ctx = c.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '12px Arial';
        ctx.fillStyle = '#f60';
        ctx.fillText('lg#fp', 2, 2);
        raw += '|' + c.toDataURL().slice(-48);
      } catch (e) { /* canvas 被禁用则跳过 */ }

      out.deviceId = 'w' + hash32(raw);

      // 自动化框架的强信号：Puppeteer/Playwright 默认把 webdriver 置 true 且不易彻底隐藏
      if (nav.webdriver === true) out.emuFlag = true;
      // 无头环境常见：没有插件、没有触摸点、UA 含 Headless
      if (!nav.plugins || nav.plugins.length === 0) out.emuFlag = true;
      if (/headless/i.test(nav.userAgent || '')) out.emuFlag = true;
    } catch (e) { /* 采集失败按"无设备标识"处理，服务端 +10 分 */ }
    return out;
  }

  /** 32 位非加密哈希：只用于"同一设备是否同一串"，不需要抗碰撞强度。 */
  function hash32(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) {
      h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(16);
  }
})();
