#!/usr/bin/env node
/**
 * 前端 nginx 配置静态自检（无依赖，node 直接跑）
 *
 *   node deploy/docker/frontend/check-config.mjs
 *   node deploy/docker/frontend/check-config.mjs --tpl /tmp/mutated.conf
 *
 * 为什么需要它：
 *   nginx 的 location 优先级是「= 精确 > ^~ 最长前缀(命中即止) > 正则 > 普通最长前缀」。
 *   这份模板里有一条静态资源正则 `~* \.(js|css|...|mp4|...)$`，它比普通前缀优先 ——
 *   所以任何一条 API 前缀忘了加 `^~`，对应后缀的请求（课件 pdf、录播 mp4、图片 png）
 *   就会被当成"在静态根下找文件"，返回 404 + text/html。
 *
 *   这个错误 **nginx -t 查不出来**（语法完全合法），**容器也能正常起来**，
 *   只有真的访问到那种后缀才会暴露，表现是「视频打不开，其他都正常」。
 *   所以必须用「模拟匹配」在构建前把它拦下来。
 *
 * 特别注意 `^~` 的作用范围（很容易想当然）：
 *   `^~` 只在「它就是最长前缀匹配」时才压住正则。若更长的前缀是普通 location，
 *   它仍然会输给正则。实测：把 `/api/v1/files/` 的 `^~` 去掉，即使兜底里有一条
 *   `^~ /api/v1/`，`/api/v1/files/a.mp4` 照样命中静态正则 —— 兜底救不了它。
 *   本脚本的变异自验证就钉这一条（见 --self-test）。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const argv = process.argv.slice(2);
const getArg = (name, dft) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dft;
};
const TPL = getArg('--tpl', path.join(HERE, 'nginx/default.conf.template'));
const NGINX_DIR = path.join(HERE, 'nginx');

// --------------------------------------------------------------------------- 解析
/** 剥掉整行注释与行尾注释，避免注释里的 location 字样被当成真配置 */
function stripComments(src) {
  return src
    .split('\n')
    .filter((l) => !l.trim().startsWith('#'))
    .map((l) => l.replace(/\s+#.*$/, ''))
    .join('\n');
}

/** 提取 location 列表：{kind, pat, proxy} */
function parseLocations(clean) {
  const out = [];
  const re = /^\s*location\s+(=|\^~|~\*|~)?\s*(\S+?)\s*\{/gm;
  let m;
  while ((m = re.exec(clean)) !== null) {
    const kind = m[1] || 'prefix';
    const pat = m[2];
    // 取该 location 的块体（花括号计数）
    let depth = 0;
    let i = m.index + m[0].length - 1;
    let body = '';
    for (; i < clean.length; i++) {
      const ch = clean[i];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) break;
      }
      body += ch;
    }
    const pp = /proxy_pass\s+(\S+?);/.exec(body);
    out.push({ kind, pat, proxy: pp ? pp[1] : '', body });
  }
  return out;
}

// --------------------------------------------------------------------------- 匹配
/**
 * 严格按 ngx_http_core_find_location 的语义选 location。
 * 返回 { loc, why }
 */
function matchLocation(locs, uri) {
  // 1. 精确
  for (const L of locs) {
    if (L.kind === '=' && L.pat === uri) return { loc: L, why: '精确匹配 =' };
  }
  // 2. 所有前缀（^~ 与普通）里取最长
  let best = null;
  for (const L of locs) {
    if ((L.kind === '^~' || L.kind === 'prefix') && uri.startsWith(L.pat)) {
      if (!best || L.pat.length > best.pat.length) best = L;
    }
  }
  if (best && best.kind === '^~') return { loc: best, why: '^~ 最长前缀（命中即止，不试正则）' };
  // 3. 正则（按出现顺序）
  for (const L of locs) {
    if (L.kind === '~' || L.kind === '~*') {
      try {
        if (new RegExp(L.pat, L.kind === '~*' ? 'i' : '').test(uri)) return { loc: L, why: '正则' };
      } catch { /* 非法正则交给 nginx -t 报 */ }
    }
  }
  // 4. 回落到最长普通前缀
  if (best) return { loc: best, why: '普通前缀（最长，正则未命中）' };
  return { loc: null, why: '无匹配' };
}

// --------------------------------------------------------------------------- 用例
const BOOKING = '${BOOKING_UPSTREAM}';
const MSG = '${MSG_UPSTREAM}';
const CLASSROOM = '${CLASSROOM_UPSTREAM}';
const STATIC = '(静态)';

/** [URI, 期望 proxy_pass 前缀] —— STATIC 表示应落到静态 location */
const CASES = [
  // 课堂服务 8092：后缀带 js/css/png/mp4 的必须仍走反代（^~ 的真正考点）
  ['/api/v1/files/a.mp4', CLASSROOM],
  ['/api/v1/files/a.png', CLASSROOM],
  ['/api/v1/files/a.pdf', CLASSROOM],
  ['/api/v1/uploads/x.js', CLASSROOM],
  ['/api/v1/uploads/x.css', CLASSROOM],
  ['/api/v1/recordings/r.mp4', CLASSROOM],
  ['/api/v1/recordings/r.webm', CLASSROOM],
  ['/api/v1/classrooms/k/state', CLASSROOM],
  ['/api/v1/attendance/k/list', CLASSROOM],
  ['/api/v1/rtc/k/token', CLASSROOM],
  ['/api/v1/schedules/evt', CLASSROOM],
  ['/api/v1/admin/classrooms', CLASSROOM], // 无子段，靠 = 精确
  ['/api/v1/admin/classrooms/x', CLASSROOM],
  ['/api/v1/admin/monitor/overview', CLASSROOM],
  ['/api/v1/admin/exports/x', CLASSROOM],
  // 消息服务 8090
  ['/api/v1/messages', MSG],
  ['/api/v1/message-templates', MSG],
  ['/api/v1/message-categories', MSG],
  ['/api/v1/sse', MSG],
  ['/api/v1/sensitive/words', MSG],
  ['/api/v1/users/1/brief', MSG],
  ['/msg-health', MSG],
  // 主服务 8081
  ['/api/v1/schedule/detail/1', BOOKING], // 单数！
  ['/api/v1/system/info', BOOKING],
  ['/api/v1/eclassroom/config', BOOKING],
  ['/api/v1/classroom-callback/x', BOOKING],
  ['/actuator/health', BOOKING],
  // 静态
  ['/login.html', STATIC],
  ['/js/a.js', STATIC],
  ['/no/such/page', STATIC],
];

// --------------------------------------------------------------------------- 主流程
function run(tplPath) {
  if (!fs.existsSync(tplPath)) {
    console.error(`模板不存在：${tplPath}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(tplPath, 'utf8');
  const clean = stripComments(raw);
  const locs = parseLocations(clean);

  console.log(`模板：${path.relative(process.cwd(), tplPath)}`);
  console.log(`解析到 ${locs.length} 个 location\n`);

  // ---- 匹配用例 ----
  let caseFail = 0;
  const w1 = 34;
  console.log(`${'URI'.padEnd(w1)} ${'命中'.padEnd(10)} ${'proxy_pass'.padEnd(28)} 结果`);
  console.log('-'.repeat(96));
  for (const [uri, expect] of CASES) {
    const { loc, why } = matchLocation(locs, uri);
    const got = loc ? loc.proxy || STATIC : '<无>';
    let ok;
    if (expect === STATIC) ok = got === STATIC;
    else ok = got.startsWith(expect);
    if (!ok) caseFail++;
    const hit = loc ? `${loc.kind} ${loc.pat}`.slice(0, 9) : '<无>';
    console.log(
      `${uri.padEnd(w1)} ${hit.padEnd(10)} ${got.padEnd(28)} ${ok ? 'OK' : 'FAIL  ← 应为 ' + expect}`
    );
    if (!ok) console.log(`   └ 匹配规则：${why}`);
  }

  // ---- 结构断言 ----
  const probs = [];
  for (const L of locs) {
    if (L.pat.startsWith('/api/') && L.kind !== '=' && L.kind !== '^~') {
      probs.push(
        `API location 缺 ^~ 或 = ：${L.kind} ${L.pat}\n` +
          `     会被后面的静态正则（\\.(js|css|...|mp4)$）抢走，表现为课件/录播 404 且返回 text/html`
      );
    }
    if (L.proxy.endsWith('/')) {
      probs.push(
        `proxy_pass 带尾斜杠：${L.pat} -> ${L.proxy}\n` +
          `     尾斜杠 = 前缀替换，会把 /api/v1/ 从 URI 里吃掉，后端收到 /classrooms/x → 全站 404`
      );
    }
    if (L.proxy && !/^\$\{[A-Z_]+\}(\/\S*)?$/.test(L.proxy)) {
      probs.push(`proxy_pass 既不是占位符也不是空：${L.pat} -> ${L.proxy}（渲染后应成字面量地址）`);
    }
  }
  // 三个占位符必须都在
  for (const ph of [BOOKING, MSG, CLASSROOM]) {
    if (!raw.includes(ph)) probs.push(`模板缺少占位符 ${ph}`);
  }
  // include 的文件必须真实存在（镜像里 COPY 过去，缺了 nginx -t 才报，太晚）
  for (const m of clean.matchAll(/include\s+(\S+?);/g)) {
    const inc = m[1];
    if (!inc.startsWith('/opt/nginx/')) continue;
    const f = path.join(NGINX_DIR, inc.split('/').pop());
    if (!fs.existsSync(f)) probs.push(`include 指向不存在的文件：${inc}（应有 ${f}）`);
  }
  // 括号平衡
  const open = (clean.match(/\{/g) || []).length;
  const close = (clean.match(/\}/g) || []).length;
  if (open !== close) probs.push(`大括号不平衡：{ ${open} 个，} ${close} 个`);

  console.log('\n' + '='.repeat(60));
  console.log(`匹配用例：${CASES.length - caseFail}/${CASES.length} 通过`);
  console.log('结构检查：');
  if (probs.length === 0) {
    console.log('  全部通过（API 前缀均已 ^~ /=、proxy_pass 无尾斜杠、占位符齐全、include 存在、括号平衡）');
  } else {
    for (const p of probs) console.log('  FAIL ' + p);
  }
  return caseFail === 0 && probs.length === 0;
}

// --------------------------------------------------------------------------- 自验证
/**
 * --self-test：把模板「故意改坏」再跑一遍，证明检查器真会红。
 * 只改内存里的字符串，不碰磁盘文件。
 */
function selfTest() {
  const src = fs.readFileSync(TPL, 'utf8');
  const tmp = path.join(process.env.TEMP || '/tmp', 'fe-nginx-selftest.conf');
  const scenarios = [
    ['去掉 /api/v1/files/ 的 ^~（模拟抄云托管写法）', src.replace(/location \^~ \/api\/v1\/files\//, 'location /api/v1/files/')],
    ['proxy_pass 加尾斜杠', src.replace(/proxy_pass \$\{CLASSROOM_UPSTREAM\};/, 'proxy_pass ${CLASSROOM_UPSTREAM}/;')],
    ['删掉无子段的 = /api/v1/admin/classrooms', src.replace(/\n\s*location = \/api\/v1\/admin\/classrooms \{[\s\S]*?\n\s*\}\n/, '\n')],
  ];
  let allRed = true;
  for (const [name, mutated] of scenarios) {
    if (mutated === src) {
      console.log(`  SKIP  变异未生效（锚点没匹配到）：${name}`);
      allRed = false;
      continue;
    }
    fs.writeFileSync(tmp, mutated, 'utf8');
    const savedLog = console.log;
    const lines = [];
    console.log = (...a) => lines.push(a.join(' '));
    const ok = run(tmp);
    console.log = savedLog;
    const red = !ok;
    if (!red) allRed = false;
    const hint = lines.filter((l) => l.includes('FAIL')).slice(0, 1)[0] || '';
    console.log(`  ${red ? 'RED OK' : 'GREEN ✗'}  ${name}${hint ? '  →  ' + hint.trim().slice(0, 88) : ''}`);
  }
  try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  console.log('\n自验证：' + (allRed ? '三处变异全部被拦下 ✓' : '有变异未被拦下，检查器不可靠'));
  return allRed;
}

if (argv.includes('--self-test')) {
  process.exit(selfTest() ? 0 : 1);
}

const passed = run(TPL);
if (!passed) {
  console.error('\n有检查未通过，先修配置再构建镜像。');
  process.exit(1);
}
