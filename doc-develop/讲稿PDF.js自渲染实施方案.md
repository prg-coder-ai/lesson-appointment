# 讲稿 PDF.js 自渲染实施方案（P2）

> 编制：2026-11-15　｜　目标：根治教师端讲稿「换页背景变黑 + 延迟」，并顺带解锁 PDF 滚动同步。
> 状态：**待拍板实施**。P0（黑底改纸色）已于同日单独落地，本文是 P2 的完整清单。

---

## 0. 一句话结论

把讲稿 PDF 从「原生 `<iframe src="...pdf#page=N">`」换成「PDF.js 解析 + `<canvas>` 自渲染」，
一次 **纯前端渲染层替换**：后端 / 数据库 / 信令协议**全部零改动**，预估 **5~6 人天**（含多端联调）。
最大分叉点是 **pdf.js 版本必须选 v3.11.174 legacy（UMD）**，选错成 v4+（ESM+wasm）会多出 1~2 天构建改造。

---

## 1. 已核实的前置事实（实施前不必再查）

| # | 事实 | 代码证据 | 对方案的意义 |
|---|---|---|---|
| 1 | 讲稿签名 URL 是**同源相对路径** `/api/v1/files/{token}?exp&sig` | `StorageService.java:256`；`StorageProperties.java:46` `publicBaseUrl=""` | PDF.js `getDocument({url})` 走同源 fetch，**零 CORS 配置** |
| 2 | 文件端点已实现 **Range 206 / Accept-Ranges / `Content-Type: application/pdf` / `Cache-Control`** | `FileAccessController.java:53-110,115` | PDF.js 渐进加载、随机访问天然可用，后端无需补任何东西 |
| 3 | `page:scroll` 信令通道**已打通**（上一轮） | `classroom-material.js:59-62,184-207` | PDF 渲染到可控 DOM 后，滚动同步直接复用，无需新信令 |
| 4 | 讲稿已按 fileType 分流 PDF/IMAGE/PPT/OTHER | `MaterialService.java:101-109`；`classroom-material.js:104-125` | 只改 PDF 分支，IMAGE/PPT 路径不动，回归面小 |
| 5 | `page:state` 广播已含 `url` + `page` | `MaterialController.java:121-137` | PDF.js 加载入参现成；迟到进房靠 `getCurrentMaterial` 定位逻辑不变 |
| 6 | `buildJs()` 会压缩 `js/` 下所有 `.js`（含 vendor 已压缩文件） | `frontend/build.js:39-58` | worker 文件放 vendor 后需验证二次压缩不损坏（见 §7） |
| 7 | 当前无 PDF.js，vendor 仅 axios / font-awesome / fullcalendar / html2canvas | `frontend/js/public/vendor/` | 需新增 2 个库文件 |

**PDF 渲染现状（要替换掉的逻辑）**：`classroom-material.js:112`
```js
frame.src = state.url + '#page=' + page + '&toolbar=0&navpanes=0';
```
改 hash → 原生 viewer 重渲染 → 空隙露出 `.ms-body` 背景。P0 已把该背景由 `#000` 改 `#fff`，
但「重渲染空隙 + 无法保留旧页」的延迟与闪动本质仍在，需 P2 根治。

---

## 2. 版本选型（第一件事，务必先定）

### 2.1 选 v3.11.174 legacy（UMD）—— 推荐

- 官方发布里有 `build/pdf.min.js`（UMD，直接 `<script>` 引入即挂 `window.pdfjsLib`）与
  `build/pdf.worker.min.js`（**纯 JS** worker，非 `.mjs` / 非 wasm）。
- 契合本项目「多 IIFE + classic `<script>`」架构，无需 ESM 加载器。
- 主库与 worker 版本号**必须完全一致**（不一致会静默挂死 `getDocument()`）。
- 稳定、资料多、国内 CDN（bootcdn / bootcdn 镜像）可取。

可下载地址（任选其一，建议下载后**自托管到 vendor**，内网可离线）：
```
https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js
https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js
```

### 2.2 不选 v4+（ESM + wasm）

- 主库改为 ESM（`pdf.min.mjs`），与现有 classic script 架构冲突，需引入 module 加载链路。
- worker 是 `pdf.worker.wasm`（二进制）或 `.mjs`，`buildJs()` 的 terser 会把二进制当 JS 处理而**损坏**，
  必须额外给 vendor 加排除名单 + 配置 `.mjs` 的 MIME，凭空多出 1~2 天构建与部署改造。
- 结论：**不要为了「新」而选 v4**，本项目只要「解析 + 翻页 canvas」，v3.11 完全够。

---

## 3. 文件清单

| 文件 | 动作 | 说明 |
|---|---|---|
| `frontend/js/public/vendor/pdf.min.js` | 新增 | v3.11.174 主库（UMD） |
| `frontend/js/public/vendor/pdf.worker.min.js` | 新增 | 同版本 worker（纯 JS） |
| `frontend/classroom.html` | 改 | 在 `classroom-material.js`（第 219 行）**之前**引入主库；在 `.ms-body`（第 183 行）内加一个 `<canvas id="ms-pdf-canvas">` |
| `frontend/css/classroom.css` | 改 | `.ms-body` 保留纸色（P0 已改）；给 canvas 加样式；必要时加翻页 loading 遮罩 |
| `frontend/js/classroom/classroom-material.js` | 改（核心） | iframe → pdf.js；`_apply` PDF 分支重写；新增 `_renderPdf` / `_cancelPdf`；滚动广播放开 PDF；resize / URL 过期处理 |
| `frontend/build.js` | 视验证结果 | 若 worker 被二次压缩损坏，把 `.worker.min.js` 加入「原样复制」名单（见 §7） |
| 后端 / 数据库 / `shared/apiPaths.js` / WS 信令 | **零改动** | — |

---

## 4. 逐文件改造

### 4.1 classroom.html

```html
<!-- 讲稿 .ms-body 内，紧挨 img 之后加：PDF.js 自渲染画布（默认隐藏） -->
<div class="ms-body">
  <iframe id="ms-frame" class="ms-frame hidden" title="讲稿"></iframe>
  <img id="ms-image" class="ms-image hidden" alt="讲稿">
  <canvas id="ms-pdf-canvas" class="ms-pdf-canvas hidden"></canvas>   <!-- 新增 -->
  <div id="ms-empty" class="ms-empty">暂无讲稿</div>
</div>

...
<!-- 公共工具区，必须早于 classroom-material.js -->
<script src="js/public/vendor/pdf.min.js"></script>   <!-- 新增：主库，挂 window.pdfjsLib -->
...
<script src="js/classroom/classroom-material.js"></script>
```

> 主库也可放在 `js/public/` 其他位置，只要**早于** `classroom-material.js` 即可；worker 不走 `<script>`，靠 `workerSrc` 路径加载。

### 4.2 classroom.css

```css
/* 在 §讲稿容器 区块追加 */
.ms-pdf-canvas { max-width: 100%; box-shadow: 0 2px 12px rgba(0,0,0,.18); }
.ms-pdf-canvas.hidden { display: none; }
/* P0 已改：.ms-body 背景 #fff（纸色），与 PDF 白页同色，翻页空隙不闪黑 */
```

### 4.3 classroom-material.js（核心）

改造分 6 块，代码骨架见 §5：

1. **顶部**：加 pdf.js 可用性与 workerSrc 初始化（懒初始化一次）。
2. **`_apply` PDF 分支**：不再写 `frame.src`，改调 `this._renderPdf(state.url, page)`。
3. **新增 `_renderPdf(url, page)`**：加载/复用 `PDFDocumentProxy` → 取页 → **离屏 canvas 渲染** → 渲染成功后替换可见 canvas（§5.1）。
4. **新增 `_cancelPdf()`**：切课/关闭/换稿时 `cancel()` 当前 renderTask 并释放旧 document（§5.4）。
5. **滚动广播**：`_bind` 里滚动监听的 `if (ft !== 'IMAGE') return;` 改为 `if (ft !== 'IMAGE' && ft !== 'PDF') return;`（§5.3）。
6. **resize / URL 过期**：窗口 resize 防抖重渲染；2h 签名 URL 过期时重新拉 `getCurrentMaterial` 换 URL（§5.5）。

---

## 5. 代码骨架（可直接照抄改造）

> 以下用该文件的既有风格：`var`、IIFE、`this.state`、`this.ctx`、`window.ClassroomWS`、`window.ClassroomAPI`、`_isTeacher()`、`_toast()`。
> 全部方法挂在 `ClassroomMaterial` 对象上，新增方法插入在 `_apply` 与 `_applyScroll` 之间。

### 5.1 `_renderPdf` —— 加载 + 离屏双缓冲渲染（黑闪根治核心）

```js
    /**
     * PDF.js 渲染指定页到可见 canvas。
     * 黑闪根治：新页先画在「离屏 canvas」，画完再一次性贴到可见 canvas，
     * 旧页一直保留到新页就绪，中间没有空白帧 → 不再露底、不再黑闪。
     */
    _renderPdf: function (url, page) {
      var self = this;
      if (!window.pdfjsLib) { this._toast('讲稿渲染组件未加载'); return; }

      // workerSrc 只设一次；必须与主库同版本（3.11.174）。
      // classroom.html 在站点根、worker 在 js/public/vendor/，相对路径成立；
      // 云托管若挂在子目录，改为按 location 推导的绝对前缀（见 §7 第 2 点）。
      if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'js/public/vendor/pdf.worker.min.js';
      }

      var seq = (this._pdfSeq || 0) + 1;
      this._pdfSeq = seq;                       // 竞态令牌：只认最后一次渲染

      var docReady = (this._pdfDoc && this._pdfDocUrl === url)
        ? Promise.resolve(this._pdfDoc)         // 同一 URL 复用文档，避免重复下载/解析
        : window.pdfjsLib.getDocument({ url: url, withCredentials: false }).promise
            .then(function (doc) {
              // 换文档前先释放旧 document
              if (self._pdfDoc && self._pdfDoc.destroy) { try { self._pdfDoc.destroy(); } catch (e) {} }
              self._pdfDoc = doc;
              self._pdfDocUrl = url;
              return doc;
            });

      docReady.then(function (doc) {
        if (seq !== self._pdfSeq) return;       // 期间又翻页/换稿 → 丢弃
        var p = Math.min(Math.max(1, page), doc.numPages);
        return doc.getPage(p).then(function (pdfPage) {
          if (seq !== self._pdfSeq) return;

          // 取消上一次未完成的渲染，防止旧页后完成覆盖新页
          if (self._pdfTask) { try { self._pdfTask.cancel(); } catch (e) {} }

          var canvas = document.getElementById('ms-pdf-canvas');
          if (!canvas) return;
          var host = canvas.parentNode;
          var dpr = window.devicePixelRatio || 1;
          var availW = Math.max(240, (host.clientWidth || 800) - 16);
          var base = pdfPage.getViewport({ scale: 1 });
          var scale = Math.min(availW / base.width, 2.0) * dpr;  // 限宽 + 限最大倍率，控内存
          var vp = pdfPage.getViewport({ scale: scale });

          // ★ 离屏渲染：先画到临时 canvas
          var off = document.createElement('canvas');
          off.width = Math.floor(vp.width);
          off.height = Math.floor(vp.height);
          var task = pdfPage.render({ canvasContext: off.getContext('2d'), viewport: vp });
          self._pdfTask = task;

          return task.promise.then(function () {
            if (seq !== self._pdfSeq) return;   // 渲染期间又翻页 → 丢弃
            // ★ 画完再贴到可见 canvas：中间无空白帧，旧页留到此刻才被替换
            canvas.width = off.width;
            canvas.height = off.height;
            canvas.style.width = Math.round(vp.width / dpr) + 'px';
            canvas.style.height = Math.round(vp.height / dpr) + 'px';
            canvas.getContext('2d').drawImage(off, 0, 0);
            canvas.classList.remove('hidden');

            var body = document.getElementById('ms-body');
            if (body) body.scrollTop = 0;       // 新页从顶部看（与翻页复位一致）
          }).catch(function (e) {
            if (e && e.name === 'RenderingCancelledException') return; // 正常取消，不算错误
            throw e;
          });
        });
      }).catch(function (e) {
        if (seq === self._pdfSeq) self._toast('讲稿加载失败：' + (e && e.message ? e.message : '未知错误'));
      });
    },

    /** 关闭讲稿 / 换课 / 换稿时取消渲染并释放文档 */
    _cancelPdf: function () {
      this._pdfSeq = (this._pdfSeq || 0) + 1;   // 令牌 +1，令在途渲染全部作废
      if (this._pdfTask) { try { this._pdfTask.cancel(); } catch (e) {} this._pdfTask = null; }
      if (this._pdfDoc) { try { this._pdfDoc.destroy(); } catch (e) {} this._pdfDoc = null; }
      this._pdfDocUrl = null;
      var canvas = document.getElementById('ms-pdf-canvas');
      if (canvas) canvas.classList.add('hidden');
    },
```

### 5.2 `_apply` PDF 分支改写

把现有 `classroom-material.js:108-112` 的 PDF 分支：

```js
      if (isPdf && state.url) {
        frame.classList.remove('hidden');
        img.classList.add('hidden');
        frame.src = state.url + '#page=' + page + '&toolbar=0&navpanes=0';
      }
```

改为：

```js
      if (isPdf && state.url) {
        frame.classList.add('hidden');
        img.classList.add('hidden');
        var cv = document.getElementById('ms-pdf-canvas');
        if (cv) cv.classList.remove('hidden');
        this._renderPdf(state.url, page);
      }
```

并在非 PDF 分支（IMAGE / OTHER）里补一句 `this._cancelPdf();`，避免切到图片/无讲稿后 PDF 渲染还在跑。
建议在 `_apply` 开头统一处理：

```js
      var wantPdf = String(state.fileType || '').toUpperCase() === 'PDF';
      if (!wantPdf && (this._pdfDoc || this._pdfTask)) this._cancelPdf();
```

> 页面变化时的滚动复位逻辑（`_apply` 里 `pageChanged` 那段，行 129-138）**保持不变**：
> PDF 渲染完成后也会 `body.scrollTop = 0`；教师翻页广播 `page:scroll:0` 依旧发出，学生端跟随复位。

### 5.3 滚动广播放开 PDF（`_bind`，行 190-206）

只改类型判断一行：

```js
          var ft = String(self.state.fileType || '').toUpperCase();
          if (ft !== 'IMAGE' && ft !== 'PDF') return;   // ★ 原为仅 IMAGE，现放开 PDF
```

> 原理：PDF.js 渲染到 `<canvas>` 后，`.ms-body` 成为真实可滚动容器（当 canvas 高度 > 容器时），
> `body.scrollTop` 可读可写，`page:scroll` 信令原样复用，学生端 `_applyScroll` 无需改动。
> 注意：若 canvas 恰好能完整放进容器（无需滚动），滚动同步自然无意义——这是正常的。

### 5.4 resize 重渲染（防抖，加在 `_bind`）

PDF canvas 按容器宽度算 scale，窗口变化后需重绘，否则会模糊或错位：

```js
      var resizeTimer = null;
      window.addEventListener('resize', function () {
        if (!self.state || String(self.state.fileType || '').toUpperCase() !== 'PDF') return;
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
          if (self.state && self.state.url) self._renderPdf(self.state.url, self.state.page || 1);
        }, 200);
      });
```

### 5.5 2h 签名 URL 过期重取

现状：`url` 2h 过期（`StorageProperties.java:40`）。PDF.js 一旦 `getDocument` 成功会把字节留在内存，
**同一份文档翻页不再请求网络**，比 iframe 更稳。但「开课超过 2h 后换页 / 刷新」会用旧 URL：

- 换页：走已缓存的 `_pdfDoc`，不受过期影响 → 无需处理。
- 刷新 / 迟到进房：`init()` 里 `getCurrentMaterial` 会拿到新签名 URL → 自动用新 URL → 无需处理。
- 边界：若 2h 后**首次**打开讲稿且用的是进房时缓存的旧 URL（极端情况），`getDocument` 会 403；
  在 5.1 的 `.catch` 里识别 403 时，可主动调一次 `ClassroomAPI.getCurrentMaterial` 换新 URL 重试一次（可选增强，非首期必须）。

### 5.6 关闭讲稿时清理（`ms-close` 点击，行 160-167）

在关闭分支里加 `self._cancelPdf();`，避免关了还在解码占内存。

---

## 6. 黑闪 / 延迟根治原理（对照用户两个痛点）

| 痛点 | 现状根因 | P2 后 |
|---|---|---|
| 换页背景变黑 | iframe 改 hash → 原生 viewer 重渲染 → 空隙露 `.ms-body` 黑底（P0 已改白，但空隙仍在） | 离屏 canvas：旧页保留到新页画完才替换，**无空白帧**；且背景已是白色 |
| 换页延迟大 | 原生 viewer 重新解析/光栅化 + 无进度反馈 | PDF.js worker 预解析 + 文档缓存；首次解析后翻页纯本地渲染；可加 loading 遮罩改善体感 |
| 滚动不同步（PDF） | iframe 跨文档，父页面读不到/设不了滚动 | canvas 在父文档，`.ms-body.scrollTop` 可读可写，`page:scroll` 复用 |

---

## 7. 构建适配与坑

1. **worker 二次压缩**：`buildJs()`（`build.js:39-58`）会 terser 压缩 `js/` 下所有 `.js`，
   vendor 下已压缩的 pdf.js 也会被再压一遍。terser 对合法 JS 二次压缩通常安全，
   但**必须实测** worker 在 dist 下能正常实例化（控制台无 `Setting up fake worker` / `API version does not match`）。
   若损坏，在 `build.js#copyAssets` 增加排除：把 `.worker.min.js` 归到 `isVendorCss` 类似的「原样复制」白名单，
   并在 `buildJs` 的过滤里跳过它。
2. **workerSrc 路径**：dist 与源码目录结构镜像（`js/public/vendor/...`），相对路径 `js/public/vendor/pdf.worker.min.js`
   在 classroom.html 所在根路径下成立；云托管/子目录部署时若相对路径失效，改为按 `location` 推导的绝对前缀
   （如 `location.origin + '/js/public/vendor/pdf.worker.min.js'`，按实际挂载路径调整）。
3. **版本一致**：主库与 worker 必须同为 3.11.174，否则 `getDocument()` 静默挂死。
4. **字体/中文**：部分 PDF 内嵌子集字体 PDF.js 渲染可能与原生 viewer 略有差异，属已知可接受范围。
5. **内存**：单页 canvas 按 scale≤2.0*DPR 渲染，避免整份高 DPI；文档用 `destroy()` 及时释放。

---

## 8. 测试清单（checklist）

- [ ] 教师上传 PDF → 自动广播 `page:state` → 学生端 PDF.js 渲染首页
- [ ] 教师翻页（上一页/下一页/跳页）→ 多端同步到同一页，且**无黑闪**、无旧页覆盖
- [ ] 快速连点下一页 5 次 → 最终停在正确页（竞态令牌 + cancel 生效）
- [ ] 迟到进房 / 刷新 → `getCurrentMaterial` 定位到当前页
- [ ] 学生滚动画布 → 教师端**不**随之滚动（单向：教师→学生）；教师滚动 → 学生同步（IMAGE 与 PDF 都验）
- [ ] 翻页后滚动复位到顶，多端一致
- [ ] 窗口 resize → canvas 清晰重绘、不错位
- [ ] 关闭讲稿 / 切到 IMAGE / 换课 → PDF 渲染被取消，无内存泄漏迹象
- [ ] 开课 >2h 后刷新 → 拿到新签名 URL 正常渲染
- [ ] 构建后 dist 与 deploy/dist 的 worker 能实例化（无 fake worker 警告）
- [ ] 守卫不回归：`npm run check:bridge-exports` / `check:endpoints` / 前端 build 全绿

---

## 9. 工作量分解（复核 §0 的 5~6 人天）

| 步骤 | 内容 | 人天 |
|---|---|---|
| 1 | 库下载/自托管 + 版本锁定 + 引入 + workerSrc 验证 | 0.5 |
| 2 | `_renderPdf` 加载/缓存/离屏渲染 + `_apply` 改写 + `_cancelPdf` | 1.5~2 |
| 3 | 黑闪根治逻辑（离屏双缓冲）+ loading 遮罩（可选） | 0.5 |
| 4 | 滚动广播放开 PDF + 复位一致性 | 0.5 |
| 5 | 竞态 / resize / URL 过期 / 换稿清理 等边界 | 1 |
| 6 | 构建适配（worker 二次压缩验证）+ dist 分发 | 0.5 |
| 7 | 多端联调测试（上表 checklist） | 1~1.5 |
| | **合计** | **5~6.5** |

> 若团队已有 PDF.js 接入经验，可压到 4~5 人天；若要加文本层/搜索/缩放工具条，另加 0.5~1 人天（首期建议砍掉）。

---

## 10. 验收指标（metrics）

- 换页「黑屏帧」：多端录屏逐帧检查，翻页间隙 **0 帧**纯黑/空白。
- 换页可见延迟：从点击到新页显示的 P95（目标 < 300ms，首次加载除外）。
- 翻页同步率：多人同时在线，页码一致的端点比例 **100%**。
- 滚动同步（IMAGE/PDF）：教师滚动后学生 scrollTop 差值 **≤ 2px**。
- 回归：上述守卫与 build 全绿，IMAGE/PPT/OTHER 讲稿行为与改造前一致。

---

## 11. 回滚方案

P2 只改前端渲染层：回滚 = 恢复 `classroom.html` / `classroom.css` / `classroom-material.js` 三个文件的改造前版本
（git 可精确 revert），删掉 vendor 两个库文件，重建 dist 即可。后端/数据库无需任何回滚。
P0（纸色背景）可独立保留——它本身无害且改善观感。
