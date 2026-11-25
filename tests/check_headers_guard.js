#!/usr/bin/env node
/**
 * 音视频权限响应头守卫 —— 反向测试
 *
 * 为什么这个守卫尤其需要反向测试：
 *   这条 header 的退化**完全静默**——nginx 配置语法合法、nginx -t 通过、服务照常起、
 *   后端日志干净，只有真实浏览器里"摄像头点了没反应"这一个现象。守卫是唯一的自动化发现
 *   手段，一旦它自己判据失配（比如正则改了、文件改名没扫到），就退回"靠人肉发现"。
 *   所以必须证明：真退化时它**确实会红**，正常形态**不误报**。
 *
 * 反向测试项：
 *   ① 基线通过
 *   ② camera 改回空括号 () → 判红（本次事故原样复现）
 *   ③ 云托管模板 location 级（8 空格那处）改空 → 判红（证明 location 级同样受管）
 *   ④ camera 换成不含 self 的域名 → 判红（token 比对，不被 "self.example.com" 骗过）
 *   ⑤ 删掉 camera 指令 → 判红（显式声明缺失）
 *   ⑥ 同一文件两处 allowlist 不一致 → 判红且点名「覆盖式继承」（不能只红在 camera 上）
 *   ⑦ 注释里写空括号示例 → **不误报**（剥离注释）
 *   ⑧ camera=* → 通过但提示过宽（不阻断，避免把守卫逼成误报源）
 *   ⑨ 外层单引号 + 内层 origin 双引号 → **不误报**（合法写法，第一版正则误判过）
 *   ⑩ 单份文件完全不声明该头 → **不误报**（浏览器默认 allowlist=self）
 *   ⑪ 还原后回到 exit 0 且源码零污染（逐字节比对）
 *   ⑫ SKIP_HEADERS=1 → exit 0
 *
 * 运行：node tests/check_headers_guard.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const GUARD = path.join(ROOT, 'tools/check-headers.mjs');

const NGINX_IP = path.join(ROOT, 'deploy/nginx/booking-ip.conf');
const NGINX_DUAL = path.join(ROOT, 'deploy/nginx/booking-ip-dual.conf');
const CLOUD_TPL = path.join(ROOT, 'cloudBased/frontend/default.conf.template');

/** 当前正确值（8 处统一） */
const GOOD = 'add_header Permissions-Policy "geolocation=(), microphone=(self), camera=(self)" always;';
/** 事故原样（空 allowlist） */
const BAD_EMPTY = 'add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;';

const results = [];
function expect(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log(`  ${ok ? '✓' : '✗'} ${name}`);
  if (!ok && detail) {
    console.log('      ' + String(detail).split('\n').slice(0, 12).join('\n      '));
  }
}

/**
 * 同进程 import 守卫，捕获 process.exit。
 * ⚠️ 不用 spawnSync：本机 node 子进程一律 EBUSY，会让基线就假红。
 * code 用 null 表示"没收到 exit"——守卫必须每条路径都 exit，否则断言必须失败。
 */
async function runGuard() {
  const origExit = process.exit;
  const origLog = console.log;
  const origErr = console.error;
  let code = null;
  const lines = [];
  console.log = (...a) => lines.push(a.join(' '));
  console.error = (...a) => lines.push(a.join(' '));
  process.exit = (c) => {
    code = c == null ? 0 : c;
    throw { __guardExit: true };
  };
  try {
    await import(pathToFileURL(GUARD).href + '?t=' + Date.now() + Math.random());
  } catch (e) {
    if (!e || !e.__guardExit) {
      console.log = origLog; console.error = origErr; process.exit = origExit;
      throw e;
    }
  } finally {
    process.exit = origExit;
    console.log = origLog;
    console.error = origErr;
  }
  return { code, out: lines.join('\n') };
}

async function runGuardSkipEnv() {
  const saved = process.env.SKIP_HEADERS;
  process.env.SKIP_HEADERS = '1';
  try {
    return await runGuard();
  } finally {
    if (saved === undefined) delete process.env.SKIP_HEADERS;
    else process.env.SKIP_HEADERS = saved;
  }
}

/** 备份原始 Buffer，按字节还原（CRLF 工作区里按字符串还原会改行尾，见 actuator 测试的教训） */
function backup(file) {
  const buf = fs.readFileSync(file);
  return {
    file,
    buf,
    orig: buf.toString('utf8'),
    restore() {
      fs.writeFileSync(file, buf);
      return Buffer.compare(fs.readFileSync(file), buf) === 0;
    },
  };
}

/**
 * 变异：把 oldStr 全部换成 newStr；未命中锚点返回 false（不写文件）。
 * ★ 比对前把 CRLF 归一成 LF —— 本仓 core.autocrlf=true，工作区是 CRLF、锚点是 LF，
 *   不归一会对多行锚点静默失配（只回报"未找到锚点"，不报错）。
 */
function mutate(bak, oldStr, newStr) {
  const txt = fs.readFileSync(bak.file, 'utf8').replace(/\r\n/g, '\n');
  if (!txt.includes(oldStr)) return false;
  fs.writeFileSync(bak.file, txt.split(oldStr).join(newStr), 'utf8');
  return true;
}

/** 变异：只替换**第一处**命中（用于制造"同文件两处不一致"） */
function mutateFirst(bak, oldStr, newStr) {
  const txt = fs.readFileSync(bak.file, 'utf8').replace(/\r\n/g, '\n');
  const i = txt.indexOf(oldStr);
  if (i < 0) return false;
  fs.writeFileSync(bak.file, txt.slice(0, i) + newStr + txt.slice(i + oldStr.length), 'utf8');
  return true;
}

(async () => {
console.log('\n音视频权限响应头守卫反向测试\n' + '='.repeat(56));

const touched = [];
try {
  // ---------- ① 基线 ----------
  {
    const r = await runGuard();
    expect('① 基线通过', r.code === 0, r.out);
  }

  // ---------- ② camera 改回空括号（事故原样） ----------
  {
    const bak = backup(NGINX_IP);
    touched.push(bak);
    const okMut = mutate(bak, GOOD, BAD_EMPTY);
    if (!okMut) {
      expect('② camera 空括号应判红', false, `未找到锚点，请核对 ${path.relative(ROOT, NGINX_IP)} 的当前值`);
    } else {
      const r = await runGuard();
      expect('② camera=() → exit 1 且指出「文档级策略」', r.code === 1 && /camera/.test(r.out) && /文档级/.test(r.out), r.out);
    }
    bak.restore();
  }

  // ---------- ③ 云托管模板 location 级那处（8 空格） ----------
  {
    const bak = backup(CLOUD_TPL);
    touched.push(bak);
    // 用 8 空格缩进定位 /api/v1/files/ 里那一处（91 行是 4 空格），确保不是同名的 server 级
    const okMut = mutate(
      bak,
      '        add_header Permissions-Policy "geolocation=(), microphone=(self), camera=(self)" always;',
      '        add_header Permissions-Policy "geolocation=(), microphone=(self), camera=()" always;'
    );
    if (!okMut) {
      expect('③ location 级改空应判红', false, '未找到 8 空格缩进的 location 级锚点（结构已变，需同步本测试）');
    } else {
      const r = await runGuard();
      expect('③ 云托管 files location 级 camera=() → exit 1', r.code === 1 && /default\.conf\.template/.test(r.out), r.out);
    }
    bak.restore();
  }

  // ---------- ④ 伪装：token 里含 self 子串 ----------
  {
    const bak = backup(NGINX_IP);
    touched.push(bak);
    const okMut = mutate(
      bak,
      GOOD,
      'add_header Permissions-Policy "geolocation=(), microphone=(self), camera=(self.example.com)" always;'
    );
    if (!okMut) {
      expect('④ 不含 self 的 token 应判红', false, '未找到锚点');
    } else {
      const r = await runGuard();
      // 关键：必须按 token 精确比对。"self.example.com" 里含 self 子串（\bself\b 也会命中），
      // 但它是另一个来源、**不放行**页面自身，用子串判断就会漏掉这类配置。
      expect('④ camera=(self.example.com) → exit 1（不被 self 子串骗过）',
        r.code === 1 && /allowlist 里没有 self/.test(r.out), r.out);
    }
    bak.restore();
  }

  // ---------- ⑤ 删掉 camera 指令 ----------
  {
    const bak = backup(NGINX_IP);
    touched.push(bak);
    const okMut = mutate(
      bak,
      GOOD,
      'add_header Permissions-Policy "geolocation=(), microphone=(self)" always;'
    );
    if (!okMut) {
      expect('⑤ 缺 camera 声明应判红', false, '未找到锚点');
    } else {
      const r = await runGuard();
      expect('⑤ 未声明 camera → exit 1', r.code === 1 && /没有声明 camera/.test(r.out), r.out);
    }
    bak.restore();
  }

  // ---------- ⑥ 同文件两处不一致 ----------
  {
    const bak = backup(NGINX_DUAL);
    touched.push(bak);
    // 两处都放行 self（都不该因"禁用"而红），仅 allowlist 不同 → 只能由一致性判据抓到。
    // 用 (self *) 而不是带 origin 的形态：nginx 的值里内嵌双引号必须外层用单引号，
    // 否则构造出来的配置本身就是非法的，测的就不再是一致性判据了（第一版踩过）。
    const okMut = mutateFirst(bak, 'microphone=(self)', 'microphone=(self *)');
    if (!okMut) {
      expect('⑥ 两处口径不一致应判红', false, '未找到 microphone=(self) 锚点');
    } else {
      const r = await runGuard();
      const onlyConsistency = r.code === 1 && /覆盖式继承/.test(r.out) && !/被禁用/.test(r.out);
      expect('⑥ 同文件 microphone 两种 allowlist → exit 1 且点名「覆盖式继承」', onlyConsistency, r.out);
    }
    bak.restore();
  }

  // ---------- ⑦ 注释里的示例不能误报 ----------
  {
    const bak = backup(NGINX_IP);
    touched.push(bak);
    const txt = fs.readFileSync(bak.file, 'utf8').replace(/\r\n/g, '\n');
    fs.writeFileSync(bak.file,
      txt + '\n# 下面只是注释示例，不是真配置：add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;\n',
      'utf8');
    const r = await runGuard();
    expect('⑦ 注释里的空括号示例 → 不误报（exit 0）', r.code === 0, r.out);
    bak.restore();
  }

  // ---------- ⑧ camera=* 通过但提示 ----------
  {
    const bak = backup(NGINX_IP);
    touched.push(bak);
    const okMut = mutate(bak, 'camera=(self)', 'camera=*');
    if (!okMut) {
      expect('⑧ camera=* 应通过并提示', false, '未找到锚点');
    } else {
      const r = await runGuard();
      expect('⑧ camera=* → exit 0 且提示过宽', r.code === 0 && /通配/.test(r.out), r.out);
    }
    bak.restore();
  }

  // ---------- ⑨ 单引号包裹 + 内含 origin 双引号 → 合法，不能误报 ----------
  {
    const bak = backup(CLOUD_TPL);
    touched.push(bak);
    // nginx 里 header 值含空格要整体加引号，而 allowlist 的 origin 本身带双引号，
    // 所以正确写法是外层单引号。只认双引号的正则会在内层第一个 " 处截断，
    // 把这行判成"没声明 camera" —— 这个误报真实存在过（本守卫第一版）。
    const okMut = mutate(
      bak,
      GOOD,
      `add_header Permissions-Policy 'geolocation=(), microphone=(self "https://meet.example.com"), camera=(self)' always;`
    );
    if (!okMut) {
      expect('⑨ 单引号形态不应误报', false, '未找到锚点');
    } else {
      const r = await runGuard();
      expect('⑨ 外层单引号 + 内层 origin 双引号 → 不误报（exit 0）', r.code === 0, r.out);
    }
    bak.restore();
  }

  // ---------- ⑩ 某一份文件完全不声明该头 → 不误报 ----------
  {
    const bak = backup(CLOUD_TPL);
    touched.push(bak);
    const txt = fs.readFileSync(bak.file, 'utf8').replace(/\r\n/g, '\n');
    const stripped = txt.split('\n').filter((l) => !/^\s*add_header\s+Permissions-Policy/i.test(l)).join('\n');
    if (stripped === txt) {
      expect('⑩ 单份文件不声明该头不应误报', false, '未找到可删除的 Permissions-Policy 行');
    } else {
      fs.writeFileSync(bak.file, stripped, 'utf8');
      const r = await runGuard();
      // 不写该头是合法形态（浏览器默认 allowlist=self），其余文件仍在 → 整体应通过，
      // 且报错里不该出现这个文件名（出现了就说明被当成了问题）。
      expect('⑩ 单份文件不声明该头 → exit 0 且未被点名',
        r.code === 0 && !/default\.conf\.template/.test(r.out), r.out);
    }
    bak.restore();
  }
} finally {
  for (const bak of touched) bak.restore();
}

// ---------- ⑪ 还原校验 ----------
{
  const r = await runGuard();
  const polluted = touched.filter((b) => fs.readFileSync(b.file, 'utf8') !== b.orig);
  expect('⑪ 还原后回到 exit 0', r.code === 0, r.out);
  expect('   ⑪ 源码零污染（逐字节比对）', polluted.length === 0, polluted.map((b) => b.file).join(', '));
}

// ---------- ⑫ SKIP ----------
{
  const r = await runGuardSkipEnv();
  expect('⑫ SKIP_HEADERS=1 → exit 0', r.code === 0 && /SKIP_HEADERS/.test(r.out), r.out);
}

const passed = results.filter((x) => x.ok).length;
const failed = results.length - passed;
console.log('='.repeat(56));
console.log(`反向测试：${passed}/${results.length} 通过` + (failed ? `，${failed} 项失败` : ''));
// 必须用失败数决定退出码：漏了 process.exit 就等于把反向测试变成装饰（有失败也返回 0）。
process.exit(failed ? 1 : 0);
})();
