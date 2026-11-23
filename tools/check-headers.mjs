#!/usr/bin/env node
/**
 * 音视频权限响应头守卫（Permissions-Policy）
 * ==========================================
 * 背景（2026-11-23 线上事故）：
 *   纯 IP 云服务器启用 HTTPS 后，「课前准备」页调不动摄像头/麦克风，而 localhost 调试一切正常。
 *   排查结论：**不是证书问题**（用户点过"继续前往"后 isSecureContext=true，getUserMedia
 *   按 Chromium 设计是放行的，见 crbug 40090684 官方回复），真凶是等保 P0-2 那批安全响应头里
 *   的这一行：
 *
 *     add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
 *
 *   空括号 `()` 是**空 allowlist**，语义是"任何来源都不许用"，**包括页面自己**。
 *   而 Permissions-Policy 是**文档级策略**，优先级高于浏览器站点设置 ——
 *   用户在 chrome://settings/content/camera 里点了"允许"完全压不过它，
 *   现象就是"权限都给了、按钮还是没反应"。localhost 能用的原因很朴素：
 *   本地调试服务器（doc-develop/dev-frontend-local.js）一个响应头都不发，
 *   走的是 `camera` 指令的默认值 `self`。
 *
 * 为什么必须挂守卫：
 *   这行是照抄等保合规清单来的，看着"更安全"所以没人怀疑；改回去**不报错、不告警**，
 *   只在真实浏览器里以"点了没反应"的形态出现，后端日志干干净净，极难定位。
 *   而且它散落在 5 份站点配置 + 云托管模板共 8 处（nginx add_header 是覆盖式继承，
 *   location 里出现任意 add_header 就要把 server 级 6 个头整套重发），漏改一处即失效。
 *
 * 本守卫校验四件事：
 *   A. 凡出现的 Permissions-Policy，camera / microphone 的 allowlist 必须非空且**含 self**
 *   B. 同一文件内多处 camera/microphone 口径必须一致（server 级与 location 级不许打架）
 *   C. allowlist 用 `*` 的给提示（能用但过宽，不阻断）
 *   D. 扫描路径必须真的扫到配置（目录改名导致守卫空转 = 假绿，判红）
 *
 * 允许的合法形态（两种都通过）：
 *   ① 完全不写 Permissions-Policy → 默认 allowlist 就是 self，功能正常；
 *   ② 写 `camera=(self), microphone=(self)` → 显式声明，推荐。
 *   注：`geolocation=()` 保持禁用是对的，项目没有定位需求，别顺手放开。
 *
 * 跳过：SKIP_HEADERS=1
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const problems = [];
const notes = [];

if (process.env.SKIP_HEADERS === '1') {
  console.log('[headers] SKIP_HEADERS=1，跳过音视频权限响应头守卫');
  process.exit(0);
}

/** 本次事故涉及、必须纳入校验的目录与后缀 */
const SCAN_TARGETS = [
  { dir: 'deploy/nginx', ext: '.conf', label: 'nginx 站点配置' },
  { dir: 'cloudBased/frontend', ext: '.template', label: '云托管前端 nginx 模板' },
];

/** 需要自查的功能（geolocation 故意不在列：项目不定位，保持禁用） */
const GUARDED_FEATURES = [
  ['camera', '摄像头'],
  ['microphone', '麦克风'],
];

/**
 * 匹配 add_header Permissions-Policy 及它的值。
 * ⚠️ 必须同时支持单引号、双引号、裸值三种形态：
 *   Permissions-Policy 的 allowlist 语法里 origin 本身要带双引号，例如
 *     camera=(self "https://a.example.com")
 *   而 nginx 的 header 值含空格时又要整体加引号，于是**正确写法是外层单引号**：
 *     add_header Permissions-Policy 'geolocation=(), camera=(self "https://a.example.com")' always;
 *   只认双引号的正则会在第一个内层双引号处截断 → 把合法配置误判成"没声明 camera"。
 *   （误报的守卫比没守卫更糟：会被整体关掉。这条是第一版实测踩到的。）
 */
const RE_HEADER = /add_header\s+Permissions-Policy\s+(?:"([^"]*)"|'([^']*)'|([^\s;]+))/gi;

/**
 * 收集待扫描文件。
 * 用动态扫描而不是硬编码 5 个文件名 —— 新增站点配置（如将来的域名版）会自动纳入，
 * 不必有人记得回来加。
 */
function collectFiles() {
  const out = [];
  for (const t of SCAN_TARGETS) {
    const abs = path.join(ROOT, t.dir);
    if (!fs.existsSync(abs)) {
      problems.push(
        `${t.dir}：目录不存在（${t.label}）。\n` +
        `    → 若目录被移动/改名，请同步更新本守卫的 SCAN_TARGETS，\n` +
        `      否则守卫会空转通过（假绿），比没有守卫更糟。`
      );
      continue;
    }
    for (const name of fs.readdirSync(abs)) {
      if (!name.endsWith(t.ext)) continue;
      out.push({ rel: `${t.dir}/${name}`, label: t.label, abs: path.join(abs, name) });
    }
  }
  return out;
}

/** 剥离 nginx 行注释：注释里写示例值不应被当成真配置 */
function stripComment(line) {
  const i = line.indexOf('#');
  return i >= 0 ? line.slice(0, i) : line;
}

/**
 * 把 Permissions-Policy 的值解析成 { feature: allowlist }。
 * 逗号分隔指令；allowlist 内部的多个 origin 用空格分隔（不含逗号），
 * 所以这里按逗号切是安全的。
 */
function parseDirectives(value) {
  const map = new Map();
  for (const raw of value.split(',')) {
    const item = raw.trim();
    if (!item) continue;
    const eq = item.indexOf('=');
    if (eq < 0) {
      // 裸指令（无 =）按旧语法等价于 `*`
      map.set(item.toLowerCase(), '*');
    } else {
      map.set(item.slice(0, eq).trim().toLowerCase(), item.slice(eq + 1).trim());
    }
  }
  return map;
}

/**
 * 判定 allowlist 是否放行 self（页面自身）。
 * 必须按 token 比对：`("https://self.example.com")` 里含 self 子串但**不放行**自身。
 */
function checkAllowsSelf(allow) {
  if (allow === '*') return { ok: true, loose: true };
  const m = /^\(\s*([\s\S]*?)\s*\)$/.exec(allow);
  if (!m) {
    return { ok: false, reason: `allowlist 语法无法识别：${allow}（应为 (self) / () / * 形式）` };
  }
  const inner = m[1].trim();
  if (!inner) {
    return {
      ok: false,
      reason: 'allowlist 是空括号 ()，语义是「任何来源都不许用」，连自身页面也禁',
    };
  }
  const tokens = inner.split(/\s+/).map((s) => s.replace(/^"|"$/g, '').toLowerCase());
  if (tokens.includes('self')) return { ok: true };
  return {
    ok: false,
    reason: `allowlist 里没有 self（当前：(${inner})）—— 页面自身被排除，前端照样调不动`,
  };
}

// ============================================================ 主扫描
const files = collectFiles();
let headerCount = 0;
let fileWithHeader = 0;

for (const f of files) {
  let src;
  try {
    src = fs.readFileSync(f.abs, 'utf8');
  } catch (e) {
    problems.push(`${f.rel}：读取失败（${e.message}）`);
    continue;
  }

  const lines = src.split(/\r?\n/);
  /** feature -> Map<allowlist, 行号列表>，用于一致性比对 */
  const seen = new Map();

  for (let i = 0; i < lines.length; i++) {
    const code = stripComment(lines[i]);
    if (!/Permissions-Policy/i.test(code)) continue;

    RE_HEADER.lastIndex = 0;
    let m;
    while ((m = RE_HEADER.exec(code)) !== null) {
      headerCount++;
      const lineNo = i + 1;
      // 三选一：双引号 / 单引号 / 裸值（捕获组只会有一个非 undefined）
      const value = m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3];
      const directives = parseDirectives(value);

      for (const [feat, cn] of GUARDED_FEATURES) {
        const allow = directives.get(feat);
        if (allow === undefined) {
          problems.push(
            `${f.rel}:${lineNo}：Permissions-Policy 里没有声明 ${feat}（${cn}）。\n` +
            `    → 不写该指令时 nginx 仍会下发本行，浏览器按"未声明=默认 allowlist(self)"处理，\n` +
            `      功能上能用，但审计口径不完整。建议显式写 ${feat}=(self)。\n` +
            `    → 当前值：${value}`
          );
          continue;
        }
        const r = checkAllowsSelf(allow);
        if (!r.ok) {
          problems.push(
            `${f.rel}:${lineNo}：${feat}（${cn}）被禁用 —— ${r.reason}\n` +
            `    → Permissions-Policy 是**文档级**策略，浏览器站点设置里的「允许」压不过它，\n` +
            `      用户看到的现象就是"权限都给了、摄像头还是点不动"，而服务端日志毫无异常。\n` +
            `    → 修法：${feat}=(self)（保留 geolocation=()）。\n` +
            `    → 当前整行：add_header Permissions-Policy "${value}" always;`
          );
        } else if (r.loose) {
          notes.push(`${f.rel}:${lineNo}：${feat}=*（通配所有来源，能用但过宽，建议收成 (self)）`);
        }

        if (!seen.has(feat)) seen.set(feat, new Map());
        const slot = seen.get(feat);
        if (!slot.has(allow)) slot.set(allow, []);
        slot.get(allow).push(lineNo);
      }
    }
  }

  if (seen.size) fileWithHeader++;

  // ---- B) 同文件内 camera/microphone 口径必须一致 ----
  for (const [feat, slot] of seen) {
    if (slot.size <= 1) continue;
    const detail = [...slot.entries()]
      .map(([allow, nos]) => `${allow}（行 ${nos.join(', ')}）`)
      .join(' vs ');
    problems.push(
      `${f.rel}：${feat} 在同一个文件里有 ${slot.size} 种不同配置 —— ${detail}\n` +
      `    → nginx 的 add_header 是**覆盖式继承**：location 里只要写了一个 add_header，\n` +
      `      server 级那一整套就会全部失效，所以 location 内必须成套重发（本项目\n` +
      `      /api/v1/files/ 就是这么处理的）。两处口径不一致时，实际生效的取决于\n` +
      `      请求命中的 location，表现为"有的页面能用、有的不能"，极难复现。\n` +
      `    → 修法：统一成同一个值；确需分组请在本守卫登记例外并写明理由。`
    );
  }
}

// ============================================================ D) 防空转
if (files.length === 0) {
  problems.push(
    `扫描目标下没有找到任何 .conf / .template 文件（共 ${SCAN_TARGETS.length} 个目录）。\n` +
    `    → 目录或后缀被改了，守卫在空转（假绿）。请同步更新 SCAN_TARGETS。`
  );
} else if (headerCount === 0) {
  // 全部删掉该头是合法形态（默认 self），但要明确提示，避免"以为守卫在管"其实没内容可管
  notes.push(
    `扫描到 ${files.length} 个文件，但均未声明 Permissions-Policy —— ` +
    `合规上可用（浏览器默认 allowlist=self，音视频能调），但等保 P0-2 要求 6 个头齐全，请确认是有意为之。`
  );
} else if (fileWithHeader === 0) {
  problems.push(`扫描到 ${files.length} 个文件却没有任何有效 Permissions-Policy 行，判据可能已失配。`);
}

// ============================================================ 输出
if (problems.length) {
  console.error(`✗ 音视频权限响应头存在 ${problems.length} 处问题：\n`);
  for (const p of problems) console.error('  · ' + p + '\n');
  console.error(
    '  说明：camera/microphone 必须显式放行 self，否则课前准备页与课堂页调不动设备。\n' +
    '        紧急跳过：SKIP_HEADERS=1（仅限确认本次改动与该头无关时）\n'
  );
  process.exit(1);
}

console.log(`✓ 音视频权限响应头正常（${files.length} 个文件 / ${headerCount} 处声明）`);
for (const n of notes) console.log('  · ' + n);
process.exit(0);
