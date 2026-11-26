/**
 * 反向代理分流守卫（2026-11-19）
 *
 * 拦的是一类**静默错位**：前端某个课堂接口的路径没有被分流规则覆盖，请求被兜底
 * 送到 booking(8081)，而主服务没有这个映射 —— 表现是 403/404 + 前端一句
 * 「无权限访问该资源」，看起来像权限问题，查半天才发现是分流漏了一条。
 *
 * 真实事故（2026-11-19）：`POST /api/v1/admin/classrooms`（创建临时课堂）没有子路径，
 * 而分流清单写的是 `'/api/v1/admin/classrooms/'`（带尾斜杠）用 startsWith 匹配，
 * 于是永远命中不了 → 8081 → SecurityConfig 403。运营台点「创建临时课堂」直接失败。
 *
 * 本守卫校验三件事：
 *   ① 前端每个 CLASSROOM_* 端点（shared/apiPaths.js）都能被 dev 代理判到课堂服务；
 *   ② nginx 里指向上游 8092 的 location 集合，与 dev 代理的前缀清单一一对应；
 *   ③ 「前缀去掉尾斜杠本身就是完整路径」的那些（如 /api/v1/admin/classrooms），
 *      nginx 必须有 `location = ...` 精确块 —— 前缀 location 匹配不到它。
 *
 * 用法：node tools/check-proxy-routes.mjs
 * 紧急跳过：不提供（这条守卫命中即线上必错，没有"先跳过"的合理场景）。
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const require = createRequire(import.meta.url);

const proxy = require(path.join(ROOT, 'doc-develop/90-tools/dev-proxy.js'));
const toClassroomService = proxy.toClassroomService;

const NGINX_FILES = ['deploy/nginx/booking.conf', 'deploy/nginx/booking-ip.conf',
                     'deploy/nginx/booking-https.conf',
                     'deploy/nginx/booking-ip-https.conf',   // 2026-11-22 补：纯 IP + 自签（仅 HTTPS）
                     'deploy/nginx/booking-ip-dual.conf'];   // 2026-11-22 补：纯 IP + 自签（HTTP/HTTPS 双栈）
// 五份同一时间只启用一份，但**分流清单必须逐条一致**，所以全部纳入校验。

let failed = 0;
function fail(msg) { failed++; console.log('  ✗ ' + msg); }
function ok(msg) { console.log('  ✓ ' + msg); }

/* ---------- ① 前端课堂端点是否都能判到课堂服务 ---------- */
const apiPathsSrc = fs.readFileSync(path.join(ROOT, 'shared/apiPaths.js'), 'utf8');

/**
 * 抽出 CLASSROOM_* 常量对应的路径。
 * 值可能是字符串（可能换行），或者是 `(sid) => \`...\`` 模板函数 —— 模板里的
 * `${encodeURIComponent(x || '')}` 先整体替换成 `_`，只留能过前缀判定的骨架。
 * 注：`ECLASSROOM_*` 不是课堂服务的端点（那是主服务的课堂开关），正则刻意不匹配。
 */
function extractClassroomPaths(src) {
  const out = [];
  const nameRe = /(^|\n)\s*(CLASSROOM_[A-Z0-9_]+)\s*:/g;
  let m;
  while ((m = nameRe.exec(src)) !== null) {
    const name = m[2];
    // 常量值最多跨两行（模板字符串的常见排版），取名字之后 300 字符足够
    const tail = src.slice(m.index, m.index + 300).replace(/\$\{[^}]*\}/g, '_');
    const p = tail.match(/["'`](\/api\/v1\/[^"'`\s,)]*)/);
    if (!p) continue;
    out.push({ name, path: p[1] });
  }
  return out;
}

const classroomPaths = extractClassroomPaths(apiPathsSrc);
if (!classroomPaths.length) {
  fail('shared/apiPaths.js 里没找到任何 CLASSROOM_* 端点，抽取逻辑可能已失效（请先修守卫本身）');
} else {
  ok(`抽取到 ${classroomPaths.length} 个 CLASSROOM_* 端点`);
  for (const it of classroomPaths) {
    if (!toClassroomService(it.path)) {
      fail(`${it.name} 的路径 ${it.path} 不会被分流到课堂服务（8081 会 403/404）`);
    }
  }
  if (!failed) ok(`全部 ${classroomPaths.length} 个课堂端点都能命中分流`);
}

/* ---------- ②③ nginx 与 dev 代理清单是否一一对应 ---------- */
/**
 * 清单从 dev-proxy.js 源码里读，不在本文件复制一份 —— 复制出来的第二份清单迟早漂移，
 * 而「清单漂移」正是这道守卫要防的东西。
 */
const proxySrc = fs.readFileSync(path.join(ROOT, 'doc-develop/90-tools/dev-proxy.js'), 'utf8');
const prefixBlock = proxySrc.match(/const PREFIXES = \[([\s\S]*?)\];/);
const DEV_PREFIXES = prefixBlock
  ? Array.from(prefixBlock[1].matchAll(/'([^']+)'/g)).map((x) => x[1])
  : [];
if (!DEV_PREFIXES.length) {
  fail('没能从 dev-proxy.js 里读出 PREFIXES（守卫的抽取逻辑需要跟着改）');
}

/** 从 nginx conf 里抽「upstream 指向 8092 的 location」，区分前缀()与精确(=) */
function extractNginxClassroomLocations(file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const out = [];
  // location [=|^~] /path {  ... }  —— 用大括号配对找到块结束
  const re = /location\s+(=|\^~)?\s*([^\s{]+)\s*\{/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const modifier = m[1] || '';
    const locPath = m[2];
    let depth = 0;
    let end = m.index;
    for (let i = m.index; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    const block = src.slice(m.index, end + 1);
    if (!block.includes('127.0.0.1:8092')) continue;
    out.push({ modifier, path: locPath });
  }
  return out;
}

for (const file of NGINX_FILES) {
  if (!fs.existsSync(path.join(ROOT, file))) { fail(`缺少 nginx 配置 ${file}`); continue; }
  const locs = extractNginxClassroomLocations(file);
  const exact = new Set(locs.filter((l) => l.modifier === '=').map((l) => l.path));
  const prefix = new Set(locs.filter((l) => l.modifier !== '=').map((l) => l.path));

  let bad = 0;
  // ② dev 清单 → nginx 必须有同款 location
  for (const p of DEV_PREFIXES) {
    if (!prefix.has(p)) {
      fail(`${file}: dev 代理有前缀 ${p}，nginx 缺少同款 location（本地能跑、上线 404）`);
      bad++;
    }
  }
  // 反向：nginx 多了课堂 location 而 dev 没有 → 本地行为与线上不一致
  for (const p of prefix) {
    if (p.startsWith('/ws/')) continue;           // WebSocket 由 nginx 单独处理，dev 侧另有判断
    if (!DEV_PREFIXES.includes(p)) {
      fail(`${file}: nginx 有课堂 location ${p}，dev 代理清单里没有（两边必须一致）`);
      bad++;
    }
  }

  // ③ 逐个真实端点验证「nginx 能匹配到」：前缀命中或精确命中，二者有一即可。
  //    这一步才真正兜住 2026-11-19 那次：/api/v1/admin/classrooms 没有子路径，
  //    前缀 location 匹配不到，必须靠 `location = ...`。
  for (const it of classroomPaths) {
    const hit = exact.has(it.path) || Array.from(prefix).some((p) => it.path.startsWith(p));
    if (!hit) {
      fail(`${file}: 端点 ${it.name}（${it.path}）在 nginx 里匹配不到任何课堂 location`);
      bad++;
    }
  }
  if (!bad) ok(`${file}: 课堂 location 与 dev 代理清单一致，且所有端点可达`);
}

/* -------------------------------------------------------------------------
 * ④ 课堂 App 静态承接块：五份齐备 + 逐字一致 + 回落不兜登录页
 *
 * 为什么加（2026-11-26）：frontend 侧所有「进入课堂」入口都收敛到
 * ClassroomLink，产出相对地址 ./launch.html?scheduleId=…，而 launch.html
 * 只存在于 classroom-app/www。只要某份 conf 漏了这组 location，该站点
 * 「进入课堂」就整片 404（近日课程/我的课程/课次列表/我的课堂四个入口同时挂）。
 *
 * 更隐蔽的是**回落链路**：本文件的 location 若兜 /login.html，线上访问
 * /launch.html 会返回 200 + 登录页内容，参数全丢 —— 看着像"没登录"，
 * 比 404 难查得多。所以这里断言回落必须是 `try_files $uri =404`。
 * ------------------------------------------------------------------------- */
const WWW_BLOCK_ANCHOR = '课堂 App 静态承接';
const WWW_REQUIRED = [
  [/location\s+~\s+\^\/\([^)]*launch[^)]*\)\\\.html\$/m, '页面正则 location（含 launch.html）'],
  [/location\s+~\s+\^\/\(app-\[a-z-\]\+\\\.js/, '根级脚本样式 location（app-*.js 等）'],
  [/location\s+\^~\s+\/js\/classroom\//, '课堂本体 JS location（/js/classroom/）'],
  [/location\s+=\s+\/css\/classroom\.css/, '课堂样式精确 location（/css/classroom.css）'],
  [/location\s+@fe_static\s*\{/, '回落 named location（@fe_static）'],
];

/** 抽出每处承接块：锚点行首 → @fe_static 块的大括号收尾 */
function extractWwwBlocks(src) {
  const out = [];
  let pos = 0;
  for (;;) {
    const i = src.indexOf(WWW_BLOCK_ANCHOR, pos);
    if (i < 0) break;
    const lineStart = src.lastIndexOf('\n', i) + 1;
    const fe = src.indexOf('location @fe_static', i);
    if (fe < 0) { out.push(''); pos = i + WWW_BLOCK_ANCHOR.length; continue; }
    let depth = 0;
    let end = -1;
    for (let k = src.indexOf('{', fe); k < src.length; k++) {
      if (src[k] === '{') depth++;
      else if (src[k] === '}') { depth--; if (depth === 0) { end = k; break; } }
    }
    out.push(end < 0 ? '' : src.slice(lineStart, end + 1));
    pos = i + WWW_BLOCK_ANCHOR.length;
  }
  return out;
}

/** 行首空白归一化：五份 conf 缩进可能不同，语义相同即可 */
function normalizeBlock(b) {
  return b.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join('\n');
}

const wwwBlocks = [];
for (const file of NGINX_FILES) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const blocks = extractWwwBlocks(src);
  if (!blocks.length) {
    fail(`${file}: 缺少「${WWW_BLOCK_ANCHOR}」块 —— 该站点「进入课堂」会 404 或落到登录页`);
    continue;
  }
  let bad = 0;
  blocks.forEach((b, idx) => {
    const tag = `${file}#${idx + 1}`;
    if (!b) { fail(`${tag}: 承接块结构不完整（找不到 @fe_static 收尾）`); bad++; return; }
    for (const [re, label] of WWW_REQUIRED) {
      if (!re.test(b)) { fail(`${tag}: 承接块缺少${label}`); bad++; }
    }
    if (/try_files\s+\$uri\s+\/login\.html/.test(b)) {
      fail(`${tag}: 承接块回落兜 /login\.html —— 会把「App 未部署」伪装成「未登录」，`
         + '必须写成 try_files $uri =404');
      bad++;
    }
    wwwBlocks.push({ tag, hash: normalizeBlock(b) });
  });
  if (!bad) ok(`${file}: 课堂 App 承接块 ${blocks.length} 份齐备`);
}

// 五份（booking-ip-dual 有两处）必须逐字一致：同一时间只启用一份，
// 不一致就等于"换一份 conf 行为就变"，而这种漂移不会在本地暴露。
if (wwwBlocks.length) {
  const uniq = new Set(wwwBlocks.map((x) => x.hash));
  if (uniq.size > 1) {
    const groups = new Map();
    for (const it of wwwBlocks) {
      if (!groups.has(it.hash)) groups.set(it.hash, []);
      groups.get(it.hash).push(it.tag);
    }
    fail(`课堂 App 承接块在 ${uniq.size} 种版本间不一致，切 conf 时行为会漂移：`
       + Array.from(groups.values()).map((g) => g.join(' + ')).join('  vs  '));
  } else {
    ok(`课堂 App 承接块 ${wwwBlocks.length} 处逐字一致`);
  }
}

/* ---------- ⑤ 桌面端（Electron）分流清单 ---------- */
/**
 * 分流清单实际有**三处**：dev-proxy（本地浏览器）、nginx（生产）、desktop/server.js（exe）。
 * ①②③④ 只守住了前两处，桌面端一直漏在外面 —— 2026-11-26 就因为它的清单少了 /ws/，
 * 导致 exe 里进课堂永远「连接中断，正在重连…」：proxyWs 拿不到上游就直接 socket.destroy()，
 * 而 WS 分支的错误是静默的，连日志都没有。
 *
 * 最难发现的是它在浏览器和生产上**都正常**（dev-proxy 用 startsWith('/ws/') 判定，
 * nginx 有 location /ws/classrooms/），所以第一反应都会去查网络/证书/后端。
 *
 * 复用 server.js 导出的 resolveUpstream（同一份实现），不在守卫里抄第二份清单。
 */
try {
  const desktop = require(path.join(ROOT, 'classroom-app/desktop/server.js'));
  const resolveUpstream = desktop.resolveUpstream;
  if (typeof resolveUpstream !== 'function') {
    fail('desktop/server.js 未导出 resolveUpstream —— 守卫无法校验桌面端分流（请保持该导出）');
  } else {
    // 用带 tag 的假上游，便于把"判错了哪个上游"讲清楚
    const UP = { api: { tag: 'api' }, message: { tag: 'message' }, classroom: { tag: 'classroom' } };
    const miss = [];
    for (const it of classroomPaths) {
      const hit = resolveUpstream(it.path, UP);
      if (!hit || hit.tag !== 'classroom') miss.push(`${it.name} ${it.path} → ${hit ? hit.tag : '静态文件'}`);
    }
    if (miss.length) {
      fail(`desktop/server.js 有 ${miss.length} 个课堂端点没判到 classroom 上游（exe 里这些接口会失败）：\n      `
        + miss.slice(0, 8).join('\n      '));
    } else {
      ok(`desktop/server.js: ${classroomPaths.length} 个课堂端点均判到 classroom 上游`);
    }

    // WS 三通道：路径不在 /api 下，是最容易被漏的一条（漏了就是本轮那个故障）
    const wsMiss = ['heartbeat', 'signal', 'whiteboard']
      .map((ch) => `/ws/classrooms/abc/${ch}?access_token=t&traceId=x`)
      .filter((p) => {
        const hit = resolveUpstream(p, UP);
        return !hit || hit.tag !== 'classroom';
      });
    if (wsMiss.length) {
      fail('desktop/server.js 未把课堂 WS 判到 classroom 上游：' + wsMiss.join('、')
        + '\n      后果：exe 里课堂一直「连接中断，正在重连…」（socket 被直接销毁且无日志），'
        + '\n      而浏览器与生产正常，极易误判成网络/证书/后端问题');
    } else {
      ok('desktop/server.js: WS 三通道（heartbeat/signal/whiteboard）均判到 classroom 上游');
    }
  }
} catch (e) {
  fail('无法加载 classroom-app/desktop/server.js：' + e.message);
}

console.log(failed ? `\n共 ${failed} 处不一致` : '\n✓ 分流规则一致：前端课堂端点全部可达，dev 与 nginx 清单对齐');
process.exit(failed ? 1 : 0);
