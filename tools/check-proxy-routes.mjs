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

console.log(failed ? `\n共 ${failed} 处不一致` : '\n✓ 分流规则一致：前端课堂端点全部可达，dev 与 nginx 清单对齐');
process.exit(failed ? 1 : 0);
