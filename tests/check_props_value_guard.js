#!/usr/bin/env node
/**
 * 配置值纯净守卫 —— 反向测试
 *
 * 背景：2026-11-20 提交 10772866 把 application.properties 的一行注释粘到了值后面，
 * 8092 启动即失败（NumberFormatException: For input string: "2# ..."）。守卫与测试同批建立。
 *
 * 反向测试项（每项都要求守卫**真的变红**，不是"看起来红了"）：
 *   ① 基线通过
 *   ② 把 `=2` 与其下一行注释重新粘成一行 → 判红，点名文件/行/数值键，并给出启动失败提示
 *   ③ properties 的值里塞中文（=120秒）→ 判红（ISO-8859-1 读取必乱码这条规则）
 *   ④ env 模板的值里粘 `#` → 判红（env 只查 #，不查中文，因为 systemd 按 UTF-8 读）
 *   ⑤ 负向控制：值写成 `"a#b"`（引号内 #）→ **必须仍然绿**，证明规则没有误伤合法引号值
 *   ⑥ 还原后回到 exit 0，且三个被改文件逐字节一致（不留污染）
 *
 * 运行：node tests/check_props_value_guard.js
 * ⚠️ 不用 spawnSync：本机 node 子进程一律 EBUSY，会让基线就假红（项目既有约定）。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const GUARD = path.join(ROOT, 'tools/check-properties-value.mjs');

const CLASSROOM_PROPS = path.join(ROOT, 'api/classroom-service/src/main/resources/application.properties');
const CLASSROOM_ENV = path.join(ROOT, 'deploy/classroom.env.template');

const results = [];
function expect(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log(`  ${ok ? '✓' : '✗'} ${name}`);
  if (!ok && detail) {
    console.log('      ' + String(detail).split('\n').slice(0, 12).join('\n      '));
  }
}

/** 同进程 import 守卫并拦截 process.exit（与 tests/check_itest_sut_sync_guard.js 同法） */
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

/** 备份必须存原始字节（工作区可能是 CRLF），还原按字节写回 */
function backup(file) {
  const buf = fs.readFileSync(file);
  return {
    file,
    buf,
    text: buf.toString('utf8'),
    restore() {
      fs.writeFileSync(file, buf);
      return fs.readFileSync(file).equals(buf);
    },
  };
}

(async () => {
console.log('\n配置值纯净守卫反向测试\n' + '='.repeat(56));

const touched = [];
try {
  // ---------- ① 基线 ----------
  {
    const r = await runGuard();
    expect('① 基线通过', r.code === 0, r.out);
  }

  // ---------- ② 复现原事故：值吞注释 ----------
  {
    const bak = backup(CLASSROOM_PROPS);
    touched.push(bak);
    const RE = /=2\r?\n# 过期数据保留（天）/;
    if (!RE.test(bak.text)) {
      expect('② 值吞注释应判红', false,
        '未找到锚点「=2\n# 过期数据保留（天）」（配置结构已变，需同步本测试）');
    } else {
      fs.writeFileSync(bak.file, bak.text.replace(RE, '=2# 过期数据保留（天）'), 'utf8');
      const r = await runGuard();
      expect('② 值吞注释 → exit 1 且点名 rollcall-timeout-minutes',
        r.code === 1 && /rollcall-timeout-minutes/.test(r.out) && /注释被吞进值/.test(r.out), r.out);
      expect('   ② 报错须点明后果是「启动失败」而非「配置不生效」',
        /NumberFormatException|启动失败/.test(r.out), r.out);
    }
    bak.restore();
  }

  // ---------- ③ properties 值里塞中文 ----------
  {
    const bak = backup(CLASSROOM_PROPS);
    touched.push(bak);
    const anchor = 'classroom.teacher-drop-grace-seconds=120';
    if (!bak.text.includes(anchor)) {
      expect('③ 值内中文应判红', false, '未找到锚点 ' + anchor);
    } else {
      fs.writeFileSync(bak.file,
        bak.text.replace(anchor, 'classroom.teacher-drop-grace-seconds=120秒'), 'utf8');
      const r = await runGuard();
      expect('③ properties 值内中文 → exit 1 且点名该键',
        r.code === 1 && /teacher-drop-grace-seconds/.test(r.out) && /ISO-8859-1/.test(r.out), r.out);
    }
    bak.restore();
  }

  // ---------- ④ env 模板值里粘 # ----------
  {
    const bak = backup(CLASSROOM_ENV);
    touched.push(bak);
    const anchor = 'INSTANCE_CODE=';
    if (!bak.text.includes(anchor)) {
      expect('④ env 值内 # 应判红', false, '未找到锚点 ' + anchor);
    } else {
      // 只在行尾追加，避免破坏其它行
      fs.writeFileSync(bak.file,
        bak.text.replace(/(^|\r?\n)INSTANCE_CODE=[^\r\n]*/, (m0, p1) => p1 + 'INSTANCE_CODE=default-local#默认实例'),
        'utf8');
      const r = await runGuard();
      expect('④ env 模板值含 # → exit 1 且点名 classroom.env.template',
        r.code === 1 && /classroom\.env\.template/.test(r.out) && /注释被吞进值/.test(r.out), r.out);
    }
    bak.restore();
  }

  // ---------- ⑤ 负向控制：引号内的 # 必须放行 ----------
  {
    const bak = backup(CLASSROOM_PROPS);
    touched.push(bak);
    const eol = bak.text.includes('\r\n') ? '\r\n' : '\n';
    fs.writeFileSync(bak.file,
      bak.text + eol + 'demo.guard-probe="a#b"' + eol, 'utf8');
    const r = await runGuard();
    expect('⑤ 引号内的 # 不算注释 → 仍绿（无误伤）', r.code === 0, r.out);
    bak.restore();
  }
} finally {
  for (const bak of touched) bak.restore();
}

// ---------- ⑥ 还原校验 ----------
{
  const r = await runGuard();
  const polluted = touched.filter((b) => !fs.readFileSync(b.file).equals(b.buf));
  expect('⑥ 还原后回到 exit 0', r.code === 0, r.out);
  expect('   ⑥ 文件零污染（逐字节比对）', polluted.length === 0,
    polluted.map((b) => b.file).join(', '));
}

const passed = results.filter((x) => x.ok).length;
const failed = results.length - passed;
console.log('='.repeat(56));
console.log(`反向测试：${passed}/${results.length} 通过` + (failed ? `，${failed} 项失败` : ''));
process.exit(failed ? 1 : 0);
})();
