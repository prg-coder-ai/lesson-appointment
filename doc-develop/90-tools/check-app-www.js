#!/usr/bin/env node
/**
 * 课堂 App 静态承接自检 —— 验证前端站点是否真的把 classroom-app/www 接管了
 *
 * 为什么需要它：frontend 侧所有「进入课堂」入口都收敛到 ClassroomLink，
 * 产出相对地址 ./launch.html?scheduleId=…，而 launch.html 只存在于
 * classroom-app/www。代理/nginx 没接管 → 所有入口 404（2026-11-26 踩过）。
 * 而"接管了"还不够 —— 必须同时满足**没误伤后台站点**（6 个同名页）。
 *
 * 三组判据（缺一不可）：
 *   A 必须由 www 承接：状态 200 且**内容与 www 文件逐字节一致**（硬证据）
 *   B 必须仍是 frontend：内容必须**不等于** www 版（证明没被整站接管）
 *   C 课堂页的静态依赖全部 200（此前踩过 app-*.js 整批 404 的坑）
 *
 * 用法：
 *   node doc-develop/90-tools/check-app-www.js                     # 默认 https://127.0.0.1:8080
 *   node doc-develop/90-tools/check-app-www.js --base=http://127.0.0.1:8080
 *   BASE=https://your.domain node doc-develop/90-tools/check-app-www.js
 *
 * 退出码：0 全过 / 1 有失败（可直接进 CI 或 npm script）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '../..');
const WWW = path.join(ROOT, 'classroom-app/www');

const argBase = (process.argv.find((a) => a.startsWith('--base=')) || '').split('=')[1];
const BASE = (argBase || process.env.BASE
  || `https://127.0.0.1:${process.env.DEV_PORT || 8080}`).replace(/\/+$/, '');

/* ---------------- HTTP ---------------- */
function get(urlPath) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(BASE + urlPath); }
    catch (e) { resolve({ status: 0, buf: Buffer.alloc(0), err: 'bad-url' }); return; }
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.get(u, { rejectUnauthorized: false, timeout: 8000 }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, buf: Buffer.concat(chunks) }));
    });
    req.on('error', (e) => resolve({ status: 0, buf: Buffer.alloc(0), err: e.code || e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, buf: Buffer.alloc(0), err: 'timeout' }); });
  });
}

const md5 = (b) => crypto.createHash('md5').update(b).digest('hex').slice(0, 12);
function fileMd5(abs) {
  try { return md5(fs.readFileSync(abs)); } catch (e) { return ''; }
}

/* ---------------- 判据清单 ---------------- */
// A：必须由 www 承接（www 独有 + 课堂侧须用 App 补丁版 + 根级脚本样式）
const MUST_WWW = [
  'launch.html', 'classroom.html', 'classroom-prep.html', 'my-classroom.html',
  'app-config.js', 'app-bridge.js', 'app-entry-guard.js', 'app-permissions.js',
  'role-router.js', 'app.css',
  'css/classroom.css', 'js/classroom/classroom-main.js',
];
// B：与 www 同名但**必须留在 frontend**（整站接管会把后台站点变成 App 版）
const MUST_FE = ['index.html', 'login.html', 'teacher.html', 'student.html'];
// C：课堂页里引用到的静态依赖（从 www 页面源码提取）
const DEP_PAGES = ['classroom.html', 'classroom-prep.html', 'my-classroom.html'];

/* ---------------- 执行 ---------------- */
(async () => {
  const fails = [];
  const warn = (m) => { fails.push(m); console.log('  ✗ ' + m); };
  console.log(`\n课堂 App 静态承接自检  →  ${BASE}\n` + '='.repeat(64));

  if (!fs.existsSync(path.join(WWW, 'launch.html'))) {
    console.log(`  ✗ www 未构建：${WWW}/launch.html 不存在`);
    console.log('    先跑：node classroom-app/scripts/build.js\n');
    process.exit(1);
  }

  // 连通性先探一次，端口没起就别刷一屏 ECONNREFUSED
  const probe = await get('/launch.html');
  if (probe.status === 0) {
    console.log(`  ✗ 连不上 ${BASE}（${probe.err}）`);
    console.log('    代理没起？ doc-develop/90-tools/run-lcl.bat   或   deploy/run-all.bat');
    console.log('    注意本代理默认 HTTPS，用 http:// 探会失败\n');
    process.exit(1);
  }

  /* --- A 组 --- */
  console.log('\nA 必须由 www 承接（200 + 内容与 www 逐字节一致）');
  for (const f of MUST_WWW) {
    const r = await get('/' + f);
    const want = fileMd5(path.join(WWW, f));
    const got = r.status === 200 ? md5(r.buf) : '';
    if (r.status !== 200) { warn(`/${f} 返回 ${r.status}${r.err ? ' (' + r.err + ')' : ''} —— 未接管`); continue; }
    if (!want) { warn(`/${f} 本地 www 无此文件，无法比对（清单过期？）`); continue; }
    if (got !== want) { warn(`/${f} 内容不是 www 版（got ${got} / www ${want}）—— 被 frontend 抢先命中`); continue; }
    console.log(`  ✓ /${f}`);
  }

  /* --- B 组 --- */
  console.log('\nB 必须仍是 frontend（内容不得等于 www 版）');
  for (const f of MUST_FE) {
    const r = await get('/' + f);
    if (r.status !== 200) { warn(`/${f} 返回 ${r.status} —— 后台站点被带崩`); continue; }
    const wwwMd5 = fileMd5(path.join(WWW, f));
    if (wwwMd5 && md5(r.buf) === wwwMd5) {
      warn(`/${f} 命中的是 www 版 —— 同名页被整站接管，后台布局会缺`);
      continue;
    }
    console.log(`  ✓ /${f}（frontend 版）`);
  }

  /* --- C 组 --- */
  console.log('\nC 课堂页静态依赖全部可达');
  let depTotal = 0;
  for (const pg of DEP_PAGES) {
    const src = fs.readFileSync(path.join(WWW, pg), 'utf8');
    const paths = new Set();
    const re = /(?:src|href)="([^"]+)"/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const raw = m[1].trim();
      // 页面都在根目录，相对路径（app-config.js / js/classroom/x.js）与
      // 绝对路径（/css/x.css）都归一成 /xxx；外链、锚点、data: 跳过。
      // ⚠ 不能只认以 / 或 ./ 开头的 —— www 的 html 全是**裸相对路径**，
      //   按前缀过滤会得到 0 个依赖，看着"全通过"其实是啥都没验（踩过）。
      if (!raw || raw.startsWith('#')) continue;
      if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(raw) || /^[a-z][a-z0-9+.-]*:/i.test(raw)) continue;
      // 页面里还有 JS 拼接模板的碎片（如 href="' + v.target + '"），它们不是 URL。
      // 只放行"路径字符"组成的串：字母数字 _ - . / % ~，含空格/引号/加号一律跳过。
      const clean = raw.replace(/^\.\//, '').replace(/^\/+/, '');
      if (!clean || !/^[A-Za-z0-9_\-./%~]+$/.test(clean.split('?')[0])) continue;
      paths.add('/' + clean);
    }
    if (!paths.size) { warn(`${pg} 没提取到任何依赖 —— 提取逻辑失效，C 组等于没验证`); continue; }
    let bad = 0;
    for (const p of paths) {
      depTotal++;
      const tail = p.split('?')[0];
      const r = await get(tail);
      if (r.status !== 200) { warn(`${pg} 依赖 ${tail} 返回 ${r.status}`); bad++; }
    }
    if (!bad) console.log(`  ✓ ${pg}（${paths.size} 个依赖）`);
  }

  console.log('\n' + '='.repeat(64));
  if (!fails.length) {
    console.log(`✓ 代理已接管 www：A 组 ${MUST_WWW.length} 项内容一致，B 组 ${MUST_FE.length} 项未被抢，C 组 ${depTotal} 个依赖全 200`);
    console.log('  四个入口（近日课程 / 我的课程 / 课次列表 / 我的课堂）现在应能进课堂。\n');
    process.exit(0);
  }
  console.log(`✗ ${fails.length} 项未通过\n`);
  if (fails.some((m) => /launch\.html 返回 404/.test(m))) {
    console.log('  launch.html 404 的排查顺序：');
    console.log('   1) 代理启动日志里「课堂 App」那一行：');
    console.log('        "课堂 App : /launch.html ... -> <路径>"  = 已接管');
    console.log('        "课堂 App : 未启用（加 --app-www 后...）" = 开关没开');
    console.log('   2) 确认 classroom-app/www/launch.html 存在（node classroom-app/scripts/build.js）');
    console.log('   3) 配置只在启动时读一次 —— 改完必须重启代理；');
    console.log('      local / local-src / remote 三个入口共用同一个默认值');
    console.log('      （dev-proxy.js 的 resolveAppWww），起哪个都该生效\n');
  }
  process.exit(1);
})();
