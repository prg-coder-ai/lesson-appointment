// 端点守卫（跨端）——一次性把三类「端点漂移」缺陷挡在提交之前：
//
//  ① 引用完整性：所有 `ENDPOINTS.X` / 本地别名（如 `EP.X`）引用，都必须在
//     根 `shared/apiPaths.js` 的 `ENDPOINTS` 中定义。未定义 = undefined 拼进 URL
//     → 畸形请求路径 → 网络错（历史坑：只在小程序端扫描，Web 端漏网）。
//  ② 硬编码防回归：代码里不得再出现引号紧邻的 '/api/v1/...' 字面量。端点字符串
//     只允许住在 `shared/apiPaths.js` 一处；两端（Web classic 脚本经桥接、小程序 ESM 直 import）
//     都从那里取。豁免项由第 ③ 项从权威源**生成**，不手写白名单。
//  ③ 契约快照一致性：`BACKEND_PROBES` 在两个 Web 页面各有一份「降级快照」
//     （桥接未加载时兜底）。快照必须与权威源逐字段一致，否则报错——
//     这样"降级"不会退化成"第二份会漂移的真相"。
//
// 扫描范围：
//   miniprogram/**（排除 shared 镜像与 node_modules）+ frontend/js/**
//     （排除生成产物 shared-domain-bridge.js —— 它内联的就是权威源本身）
//   frontend/*.html 的**内联 <script> 块**（见 maskHtmlForScan）：
//     页面里写死路径的往往不是独立 js，而是内联脚本。扫之前先把 HTML 注释
//     （<!-- -->）和 <script> 外围内容整体掩成空格 —— 注释里的示例代码
//     （如 index.html 尾部 96-273 / 275-331 那几段 fetch 用法说明）不是可执行代码，
//     不该被当硬编码；掩码保持**字符长度与换行不变**，所以行号与偏移仍指向原文件真实位置。
//
//     实测结论（2026-10-07）：index.html 原有 5 处引号紧邻的 '/api/v1/...' 字面量，
//     经逐处核对**全部落在 HTML 注释块内**（行 117/146/173/177/225），其三段可执行内联
//     script（14-62、80-92）零端点字面量 → 无需收敛。顺带查出 index.html:306-321 的
//     showApiError <script> 整块位于 275-331 注释区间内，是从未执行的历史遗留代码。
//
// 用法：node tools/check-endpoints-refs.mjs
// 退出码：0=通过；1=有缺失 / 硬编码回归 / 快照漂移 / 扫描范围失效
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiPaths = await import('file://' + path.join(ROOT, 'shared/apiPaths.js'));
const defined = new Set(Object.keys(apiPaths.ENDPOINTS));
const probes = apiPaths.BACKEND_PROBES || [];

const ROOTS = [
  { dir: 'miniprogram', skipDirs: new Set(['node_modules', 'shared']), ext: '.js' },
  { dir: 'frontend/js', skipDirs: new Set(['node_modules']), ext: '.js' },
  // *.html：只看内联 <script>；dist/ 是构建产物（内联脚本由 build.js 从源码注入，
  // 扫它等于把同一份代码扫两遍），node_modules 同理。
  { dir: 'frontend', skipDirs: new Set(['js', 'dist', 'node_modules', 'css', 'assets']), ext: '.html' }
];

// 生成产物：内容即权威源内联，扫它只会把同一份定义报成"硬编码"。
// 注意：下列清单一律用 **POSIX 正斜杠**书写，与 rel() 的产出保持同一形式——
// 早先用 path.join 生成、在 Windows 上得到反斜杠，Set.includes 恒 false，
// 导致"生成产物被跳过"与"快照被实际校验"两件事同时静默失效（③ 会空跑假通过）。
const GENERATED = new Set(['frontend/js/shared-domain-bridge.js']);

// 维护 BACKEND_PROBES 降级快照的文件（第 ③ 项校验；其数组区间从第 ② 项豁免）。
const SNAPSHOT_FILES = [
  'frontend/js/admin-dataMaintainPage.js',
  'frontend/js/platform-admin-backend-info.js'
];

// POSIX 相对路径 -> 绝对路径（Windows 下 path.join 也能吃正斜杠）
const toAbs = (relPosix) => path.join(ROOT, ...relPosix.split('/'));

const refs = new Map();        // 常量名 -> ["相对路径:行"]
const hardcodes = [];          // { file, line, text }
const snapshotProblems = [];
let snapshotChecked = 0;       // 真正完成逐字段比对的快照文件数（用于识别"空跑假通过"）

function rel(fp) { return path.relative(ROOT, fp).split(path.sep).join('/'); }

// 从文件里抽出「本地端点别名」的变量名：var/const/let EP = (window.ApiPaths && window.ApiPaths.ENDPOINTS) || {}
const ALIAS_RE = /(?:var|const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*\(?\s*window\.ApiPaths\s*&&\s*window\.ApiPaths\.ENDPOINTS/;
// 引用：显式 ENDPOINTS.X，或本文件声明的别名 X
const REF_RE = /\bENDPOINTS\.([A-Z_][A-Z0-9_]*)/g;
// 硬编码：引号/反引号**紧邻** /api/v1/ —— 注释里的 "/api/v1/xxx 前缀" 前面是空格，不会命中。
const HARD_RE = /(['"`])(\/api\/v1\/[^'"`]*)/g;
// 降级快照数组字面量：`|| [ { key: '..', label: '..', url: '..', prefix: '..' } ])`
const SNAP_RE = /\|\|\s*\[([\s\S]*?)\]\s*\)/;
const SNAP_ENTRY_RE = /\{\s*key:\s*'([^']*)'\s*,\s*label:\s*'([^']*)'\s*,\s*url:\s*'([^']*)'\s*,\s*prefix:\s*'([^']*)'\s*\}/g;
// HTML 内联 <script>（无 src 属性者才是内联）
const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
// HTML 注释块 <!-- ... -->（内含说明性示例代码，不是可执行代码）
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;

let htmlFilesScanned = 0;      // 真正完成扫描的 html 文件数（用于识别"范围改了但没扫到"）
let htmlInlineBlocks = 0;      // 抽出的内联 script 块总数

// 把 .html 源码掩成「只剩内联 <script> 内容」的等价长度字符串：
//   1) 先把 HTML 注释整块替换为等长空格（去掉换行会毁掉行号）；
//   2) 再把 <script> 标签本身及其外围内容替换为等长空格。
// 关键性质：**每个字符位置一一对应**，因此下游按行/偏移做的判断
// （快照区间、报告行号）在 .html 上依然成立。
function maskHtmlForScan(src) {
  let masked = src.replace(HTML_COMMENT_RE, (m) => m.replace(/[^\n]/g, ' '));
  // 第二步要在第一次替换后的文本上做，偏移才仍然对得上原文件
  masked = masked.replace(SCRIPT_RE, (whole, attrs, body) => {
    if (/\bsrc\s*=/i.test(attrs)) return whole;      // 外链脚本，另有 .js 文件被扫
    const start = whole.indexOf(body);
    const blank = (s) => s.replace(/[^\n]/g, ' ');
    htmlInlineBlocks++;
    return blank(whole.slice(0, start)) + body + blank(whole.slice(start + body.length));
  });
  return masked;
}

function walk(dir, skipDirs, ext) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(entry.name) || entry.name.startsWith('.')) continue;
    const fp = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(fp, skipDirs, ext); continue; }
    if (!entry.name.endsWith(ext)) continue;
    checkFile(fp);
  }
}

function checkFile(fp) {
  const relPath = rel(fp);
  if (GENERATED.has(relPath)) return;

  const isHtml = relPath.endsWith('.html');
  const raw = fs.readFileSync(fp, 'utf8');
  const src = isHtml ? maskHtmlForScan(raw) : raw;
  if (isHtml) htmlFilesScanned++;
  const lines = src.split('\n');

  // 第 ③ 项：先定位快照区间（若本文件属于快照文件），供第 ② 项豁免
  let snapSpan = null;
  if (SNAPSHOT_FILES.includes(relPath)) {
    const m = src.match(SNAP_RE);
    if (!m) {
      snapshotProblems.push(`${relPath}: 未找到 BACKEND_PROBES 降级快照数组（|| [ ... ]）`);
    } else {
      const entries = [];
      let e;
      SNAP_ENTRY_RE.lastIndex = 0;
      while ((e = SNAP_ENTRY_RE.exec(m[1]))) {
        entries.push({ key: e[1], label: e[2], url: e[3], prefix: e[4] });
      }
      const want = probes.map(p => ({ key: p.key, label: p.label, url: p.url, prefix: p.prefix }));
      const got = JSON.stringify(entries);
      const exp = JSON.stringify(want);
      if (got !== exp) {
        snapshotProblems.push(`${relPath}: 降级快照与 shared/apiPaths.js 的 BACKEND_PROBES 不一致\n      期望 ${exp}\n      实际 ${got}`);
      }
      // 无论是否一致都计入"已定位并比对过"——否则漂移会被误报成"脚本路径没对上"
      // （反向测试抓到过：退出码虽为 1，但归因错误，会把人引向错误方向）。
      snapshotChecked++;
      snapSpan = [m.index, m.index + m[0].length];
    }
  }

  // 本文件声明的端点别名（有的文件直接把它命名为 ENDPOINTS，此时显式引用正则已覆盖，避免重复计数）
  const aliasRaw = (src.match(ALIAS_RE) || [])[1] || null;
  const alias = (aliasRaw === 'ENDPOINTS') ? null : aliasRaw;

  // 行/列 -> 绝对偏移，用于判断硬编码命中是否落在快照区间内
  const lineStart = [];
  { let acc = 0; for (const ln of lines) { lineStart.push(acc); acc += ln.length + 1; } }

  lines.forEach((ln, i) => {
    REF_RE.lastIndex = 0;
    let m;
    const names = [];
    while ((m = REF_RE.exec(ln))) names.push(m[1]);
    if (alias) {
      const are = new RegExp(`\\b${alias}\\.([A-Z_][A-Z0-9_]*)`, 'g');
      while ((m = are.exec(ln))) names.push(m[1]);
    }
    for (const name of names) {
      if (!refs.has(name)) refs.set(name, []);
      refs.get(name).push(`${relPath}:${i + 1}`);
    }

    HARD_RE.lastIndex = 0;
    let h;
    while ((h = HARD_RE.exec(ln))) {
      const abs = lineStart[i] + h.index;
      const inSnap = snapSpan && abs >= snapSpan[0] && abs <= snapSpan[1];
      if (inSnap) continue;   // 已由第 ③ 项逐字段校验过，不重复报
      hardcodes.push({ file: relPath, line: i + 1, text: ln.trim().slice(0, 120) });
    }
  });
}

for (const r of ROOTS) {
  const abs = path.join(ROOT, r.dir);
  if (fs.existsSync(abs)) walk(abs, r.skipDirs, r.ext);
}

// ---------- 报告 ----------
console.log(`ENDPOINTS 定义常量数: ${defined.size}`);
console.log(`已引用到的常量数: ${refs.size}`);

let failed = false;

// ⪪ 扫描范围自检：*.html 已并入范围，若一个文件都没扫到（路径/过滤写错），
//   ② 就只在 js 里生效而看起来"全绿"—— 与本脚本踩过的 Windows 路径坑同类。
const htmlRoot = path.join(ROOT, 'frontend');
if (!fs.existsSync(htmlRoot) || htmlFilesScanned === 0) {
  failed = true;
  console.log(`\n❌ ⪪ 扫描范围：frontend/*.html 已声明为扫描对象，但实际扫到 ${htmlFilesScanned} 个文件` +
              `（目录缺失或过滤条件写错，② 对 html 形同虚设）`);
} else {
  console.log(`ⓘ html 覆盖：${htmlFilesScanned} 个文件 / ${htmlInlineBlocks} 段内联 <script>（注释区已掩码）`);
}

// ① 引用完整性
const missing = [...refs.keys()].filter(n => !defined.has(n));
if (missing.length) {
  failed = true;
  console.log(`\n❌ ① 引用完整性：缺失 ${missing.length} 个（被引用但未定义 → undefined 拼进 URL → 畸形请求）：`);
  for (const n of missing) console.log(`  - ${n}\n      <- ${refs.get(n).join('\n      <- ')}`);
} else {
  console.log('✅ ① 引用完整性：所有端点引用都在 shared/apiPaths.js 中定义');
}

// ② 硬编码防回归
if (hardcodes.length) {
  failed = true;
  console.log(`\n❌ ② 硬编码防回归：发现 ${hardcodes.length} 处引号紧邻的 /api/v1/... 字面量（应改取 ENDPOINTS）：`);
  for (const h of hardcodes) console.log(`  - ${h.file}:${h.line}\n      ${h.text}`);
} else {
  console.log('✅ ② 硬编码防回归：代码层零 /api/v1/... 字面量（仅注释保留说明）');
}

// ③ 降级快照一致性
// 报告顺序有讲究：先报"文件不存在 / 内容不一致"这些**业务可解释**的问题，
// 最后才报 checked 数不足（那是脚本自身路径没对上，属工具问题）。
// 顺序反了会把"快照真的漂移了"误报成"脚本路径问题"，反向测试已实证过。
const missingSnap = SNAPSHOT_FILES.filter(f => !fs.existsSync(toAbs(f)));
if (missingSnap.length) {
  failed = true;
  console.log(`\n❌ ③ 快照一致性：下列快照文件不存在（路径已变？）:\n  - ${missingSnap.join('\n  - ')}`);
} else if (snapshotProblems.length) {
  failed = true;
  console.log(`\n❌ ③ 快照一致性：${snapshotProblems.length} 个问题：`);
  for (const p of snapshotProblems) console.log('  - ' + p);
} else if (snapshotChecked !== SNAPSHOT_FILES.length) {
  failed = true;
  console.log(`\n❌ ③ 快照一致性：只校验了 ${snapshotChecked}/${SNAPSHOT_FILES.length} 份快照` +
              `（其余未匹配到，属脚本自身路径问题而非业务问题）`);
} else {
  console.log(`✅ ③ 快照一致性：${snapshotChecked} 份 BACKEND_PROBES 降级快照与权威源逐字段一致`);
}

// 提示（不计入通过/失败）：定义但无人引用的端点常量——可能是历史遗留，也可能是为
// 「已屏蔽但保留开关」的链路预留（如 AUTH_WECHAT_LOGIN），故只提示不判错。
const unused = [...defined].filter(n => !refs.has(n));
if (unused.length) {
  console.log(`\n💡 提示：${unused.length}/${defined.size} 个端点常量当前无人引用（保留还是清理由业务判断）：`);
  console.log('   ' + unused.join(', '));
}

process.exit(failed ? 1 : 0);
