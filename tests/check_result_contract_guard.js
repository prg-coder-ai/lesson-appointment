#!/usr/bin/env node
/**
 * 统一错误响应契约守卫 —— 反向测试（第 6 批动作 28/29，含 29-b 方案 A）
 *
 * 每一条都必须反向验证的原因：守卫变"永远绿"时谁都不会发现，
 * 而它守护的恰恰是"接口能通、页面能开、只是契约悄悄烂掉"的静默漂移。
 *
 * 反向测试项：
 *   ① 基线通过
 *   ② api 出口删掉 case 409 → 判红（409 重新伪装成 HTTP 200）
 *   ③ msg 出口删掉 case 500 → 判红（两服务口径分叉）
 *   ④ api 出口加 case 401 → 判红（业务 401 映射 HTTP 会触发刷新/踢登录，方案 A 明确禁止）
 *   ⑤ api 出口文件被删 → 判红（统一出口缺失）
 *   ⑥ 还原后回到 exit 0 且源码零污染（逐字节比对）
 *
 * 运行：node tests/check_result_contract_guard.js
 * ⚠️ 不用 spawnSync：本机 node 子进程一律 EBUSY，会让基线就假红。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const GUARD = path.join(ROOT, 'tools/check-result-contract-guard.mjs');

const API_ADVICE = path.join(ROOT, 'api/src/main/java/com/reservation/common/ResultHttpStatusAdvice.java');
const MSG_ADVICE = path.join(ROOT, 'api/message-service/src/main/java/com/messagecenter/common/ResultHttpStatusAdvice.java');

const results = [];
function expect(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log(`  ${ok ? '✓' : '✗'} ${name}`);
  if (!ok && detail) {
    console.log('      ' + String(detail).split('\n').slice(0, 12).join('\n      '));
  }
}

/** 同进程 import 守卫并捕获 process.exit（模式与 check_tenant_cross_thread_guard.js 一致） */
async function runGuard(env) {
  const saved = {};
  if (env) {
    for (const [k, v] of Object.entries(env)) {
      saved[k] = process.env[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
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
    if (env) {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  }
  return { code, out: lines.join('\n') };
}

function backup(file) {
  const orig = fs.readFileSync(file, 'utf8');
  return {
    file,
    orig,
    restore() {
      fs.writeFileSync(file, orig, 'utf8');
      return fs.readFileSync(file, 'utf8') === orig;
    },
  };
}

(async () => {
console.log('\n错误响应契约守卫反向测试（含 29-b 方案 A 出口）\n' + '='.repeat(56));

const touched = [];
try {
  // ---------- ① 基线 ----------
  {
    const r = await runGuard();
    expect('① 基线通过', r.code === 0, r.out);
  }

  // ---------- ② api 出口删 case 409 ----------
  {
    const bak = backup(API_ADVICE);
    touched.push(bak);
    const anchor = '            case 409:';
    const txt = fs.readFileSync(bak.file, 'utf8');
    if (!txt.includes(anchor)) {
      expect('② 删 case 409 应判红', false, '未找到锚点 case 409（出口文件结构已变，需同步本测试）');
    } else {
      fs.writeFileSync(bak.file, txt.split(anchor).join('            // 回归：409 映射被删'), 'utf8');
      const r = await runGuard();
      expect('② api 出口缺 case 409 → exit 1 且点名该码',
        r.code === 1 && /case 409/.test(r.out) && /ResultHttpStatusAdvice\.java/.test(r.out), r.out);
    }
    bak.restore();
  }

  // ---------- ③ msg 出口删 case 500 ----------
  {
    const bak = backup(MSG_ADVICE);
    touched.push(bak);
    const anchor = '            case 500:';
    const txt = fs.readFileSync(bak.file, 'utf8');
    if (!txt.includes(anchor)) {
      expect('③ 删 case 500 应判红', false, '未找到锚点 case 500');
    } else {
      fs.writeFileSync(bak.file, txt.split(anchor).join('            // 回归：500 映射被删'), 'utf8');
      const r = await runGuard();
      expect('③ msg 出口缺 case 500 → exit 1 且点名 messagecenter',
        r.code === 1 && /case 500/.test(r.out) && /messagecenter/.test(r.out), r.out);
    }
    bak.restore();
  }

  // ---------- ④ api 出口加 case 401（方案 A 禁止项）----------
  {
    const bak = backup(API_ADVICE);
    touched.push(bak);
    const anchor = '            case 400:';
    const txt = fs.readFileSync(bak.file, 'utf8');
    if (!txt.includes(anchor)) {
      expect('④ 加 case 401 应判红', false, '未找到锚点 case 400');
    } else {
      fs.writeFileSync(bak.file, txt.replace(anchor, '            case 401: // 回归：禁止映射 401\n' + anchor), 'utf8');
      const r = await runGuard();
      expect('④ 出现 case 401 → exit 1 且点明刷新/踢登录风险',
        r.code === 1 && /case 401/.test(r.out) && /(刷新|踢登录)/.test(r.out), r.out);
    }
    bak.restore();
  }

  // ---------- ④b 出现 fail(200)（N2：白名单内不抛 → 假成功） ----------
  {
    const bak = backup(path.join(ROOT, 'api/src/main/java/com/reservation/controller/TimezoneCalcController.java'));
    touched.push(bak);
    const anchor = 'return Result.fail(400,  "时间格式或时区错误: " + e.getMessage());';
    const txt = fs.readFileSync(bak.file, 'utf8');
    if (!txt.includes(anchor)) {
      expect('④b 加 fail(200) 应判红', false, '未找到锚点 fail(400,  "时间格式或时区错误');
    } else {
      fs.writeFileSync(bak.file, txt.replace(anchor, 'return Result.fail(200,  "回归：假成功码");'), 'utf8');
      const r = await runGuard();
      expect('④b 出现 Result.fail(200) → exit 1 且点明假成功风险',
        r.code === 1 && /Result\.fail\(200/.test(r.out) && /(假成功|语义完全反向)/.test(r.out), r.out);
    }
    bak.restore();
  }

  // ---------- ⑤ api 出口文件被删 ----------
  {
    const bak = backup(API_ADVICE);
    touched.push(bak);
    const hidden = bak.file + '.hidden-by-reverse-test';
    fs.renameSync(bak.file, hidden);
    try {
      const r = await runGuard();
      expect('⑤ 出口文件缺失 → exit 1 且提示统一出口缺失',
        r.code === 1 && /ResultHttpStatusAdvice\.java 不存在/.test(r.out), r.out);
    } finally {
      fs.renameSync(hidden, bak.file);
    }
  }
} finally {
  for (const bak of touched) bak.restore();
}

// ---------- ⑥ 还原校验 ----------
{
  const r = await runGuard();
  const polluted = touched.filter((b) => fs.readFileSync(b.file, 'utf8') !== b.orig);
  expect('⑥ 还原后回到 exit 0', r.code === 0, r.out);
  expect('   ⑥ 源码零污染（逐字节比对）', polluted.length === 0, polluted.map((b) => b.file).join(', '));
}

const passed = results.filter((x) => x.ok).length;
const failed = results.length - passed;
console.log('='.repeat(56));
console.log(`反向测试：${passed}/${results.length} 通过` + (failed ? `，${failed} 项失败` : ''));
process.exit(failed ? 1 : 0);
})();
