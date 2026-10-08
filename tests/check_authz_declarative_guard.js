#!/usr/bin/env node
/**
 * 声明式授权守卫的反向测试 —— 证明 tools/check-authz-declarative.mjs 真的会红。
 *
 * 动机：守卫"全绿"本身不能证明它有效。解析型守卫最常见的失效方式是
 * 正则改坏 → 扫到 0 个端点 → 0 个问题 → 退出码 0 → 假通过。
 * 本测试对守卫注入 6 类故障，每类都必须以非 0 退出码被拒。
 *
 * 用法：node tests/check_authz_declarative_guard.js
 */

const fs = require('node:fs');
const path = require('node:path');
const util = require('node:util');

const ROOT = process.cwd();
const RULES_REL = 'api/src/main/java/com/reservation/config/AuthzRules.java';
const GUARD_REL = 'tools/check-authz-declarative.mjs';
const RULES_ABS = path.join(ROOT, RULES_REL);
const GUARD_ABS = path.join(ROOT, GUARD_REL);

const orig = fs.readFileSync(RULES_ABS, 'utf8');
let pass = 0;
const failures = [];

/**
 * 在**同进程内**执行守卫，取其退出码。
 *
 * 为什么不用 spawnSync(process.execPath)：本机托管 node.exe 常被占用，
 * spawnSync 恒返回 EBUSY → status=null，会让本测试 7 项全部假失败
 * （与 tests/miniprogram-itest/static.mjs 的 63 FAIL 同源）。
 * 改为动态 import 守卫并临时接管 process.exit / process.argv，
 * 拿到真实退出码与输出。守卫是单次执行的脚本，无跨场景状态残留。
 */
async function runGuard() {
  const realExit = process.exit;
  const realArgv = process.argv;
  const realStdoutWrite = process.stdout.write.bind(process.stdout);
  const realStderrWrite = process.stderr.write.bind(process.stderr);
  const realLog = console.log;

  let code = 0;
  const outChunks = [];
  // 收集器必须走 util.format：守卫用 console.log('%d 个', n) 这类格式化输出，
  // 直接 String(chunk) 只会拿到 "%d 个" 而丢掉 n，报告里就全是未替换的占位符。
  // 且收集器必须是"裸函数"，绝不能再走 console/stdout ——
  // 否则 process.stdout.write 被替换成 console.log 的实现会无限递归。
  const collect = function (...args) {
    outChunks.push(args.length === 0 ? '' : util.format(...args));
    return true;
  };
  console.log = collect;
  console.error = collect;
  console.warn = collect;
  process.stdout.write = collect;
  process.stderr.write = collect;
  process.exit = function (c) { code = c == null ? 0 : c; throw new Error('__GUARD_EXIT__'); };

  try {
    process.argv = [process.argv[0], GUARD_ABS];
    const url = 'file:///' + GUARD_ABS.replace(/\\/g, '/') + '?t=' + Date.now() + Math.random();
    await import(url);
  } catch (e) {
    if (!e || e.message !== '__GUARD_EXIT__') {
      outChunks.push('运行时异常: ' + (e && e.stack ? e.stack : e));
      code = 99;
    }
  } finally {
    process.exit = realExit;
    process.argv = realArgv;
    process.stdout.write = realStdoutWrite;
    process.stderr.write = realStderrWrite;
    console.log = realLog;
  }
  return { code, out: outChunks.join('\n') };
}

async function scenario(name, mutate, expectCode, expectText) {
  const backup = orig;
  const src = mutate(backup);
  // 前置断言：mutate 必须真的改动了内容。
  // 否则 replace 正则写错时会静默返回原串 → 守卫在未改动的文件上跑 → 拿到"通过"，
  // 这个用例就变成了给自己盖章的空壳，反而掩盖守卫失效。
  if (src === backup) {
    failures.push(`${name}: 用例注入无效（mutate 未改动规则表），不能据此判守卫通过`);
    console.log(`  ✗ ${name} → 注入无效（mutate 未改动文件）`);
    return;
  }
  fs.writeFileSync(RULES_ABS, src, 'utf8');
  try {
    const { code, out } = await runGuard();
    const ok = code === expectCode && (!expectText || out.includes(expectText));
    if (ok) {
      pass++;
      console.log(`  ✓ ${name} → 退出码 ${code}（符合预期）`);
    } else {
      failures.push(`${name}: 期望退出码 ${expectCode}${expectText ? ' 且输出含 "' + expectText + '"' : ''}，实际 ${code}\n${out.slice(0, 400)}`);
      console.log(`  ✗ ${name} → 实际退出码 ${code}（期望 ${expectCode}）`);
    }
  } finally {
    fs.writeFileSync(RULES_ABS, backup, 'utf8');
  }
}

console.log('声明式授权守卫 · 反向测试\n');

async function main() {
// 0) 基线：未改动的规则表必须通过
{
  const { code, out } = await runGuard();
  if (code === 0) {
    pass++;
    console.log('  ✓ 基线（原始规则表）→ 退出码 0');
  } else {
    failures.push('基线本应通过，实际退出码 ' + code + '\n' + out.slice(0, 600));
    console.log('  ✗ 基线本应通过，实际退出码 ' + code);
  }
}

// 1) 删掉一条已有端点的规则 → 必须报"未声明授权"
await scenario(
  '删掉 /user/updateStatus 规则 → 未声明授权',
  (s) => s.replace(/\s*r\.add\(new Rule\(HttpMethod\.POST, "\/api\/v1\/user\/updateStatus".*?\);\n/, '\n'),
  1,
  '未声明授权'
);

// 2) 规则里塞入不存在的角色 → 必须报"非法角色"
await scenario(
  '注入非法角色 superadmin → 非法角色',
  (s) => s.replace(/PLATFORM_ONLY = \{RoleConst\.PLATFORM_ADMIN\};/, 'PLATFORM_ONLY = {RoleConst.PLATFORM_ADMIN, RoleConst.SUPER_ADMIN};'),
  1,
  '非法角色'
);

// 3) 造一条 Controller 里不存在的规则 → 必须报"陈旧规则"
await scenario(
  '注入不存在的端点规则 → 陈旧规则',
  (s) => s.replace(
    /(r\.add\(new Rule\(HttpMethod\.GET, "\/api\/v1\/dashboard\/overview".*?\);\n)/,
    '$1        r.add(new Rule(HttpMethod.GET, "/api/v1/ghost/endpoint", PLATFORM_ONLY, "人为注入"));\n'
  ),
  1,
  '陈旧规则'
);

// 4) 同一端点重复声明 → 必须报"规则重复"
// 锚点用 /api/v1/monitor/trend（确认存在），复制成一条完全相同的规则。
// 注意：必须断言 replace 真的改动了内容 —— mutate 写错时 replace 静默返回原串，
// 测试会"通过"但其实什么都没注入，等于给自己开了个后门。
{
  const anchor = /(r\.add\(new Rule\(HttpMethod\.GET, "\/api\/v1\/monitor\/trend"[^\n]*\n)/;
  const after = orig.replace(anchor, '$1        r.add(new Rule(HttpMethod.GET, "/api/v1/monitor/trend", PLATFORM_ONLY, "人为重复"));\n');
  if (after === orig) {
    failures.push('用例自身缺陷：锚点 /api/v1/monitor/trend 未匹配，注入无效（不能据此判守卫通过）');
    console.log('  ✗ 重复声明同一端点 → 用例注入失败（锚点未匹配）');
  } else {
    await scenario('重复声明同一端点 → 规则重复', () => after, 1, '规则重复');
  }
}


// 5) 规则数组常量被清空 → 必须报错（否则 hasRole 传空串，路径无人可访问）
await scenario(
  '清空 PLATFORM_ONLY 角色数组 → 引用未定义/非法',
  (s) => s.replace(/PLATFORM_ONLY = \{[^}]*\};/, 'PLATFORM_ONLY = {};'),
  1,
  '未定义'
);

// 6) 大面积删规则（模拟"重构时把规则表清空"）→ 必须报大量未声明
await scenario(
  '删除全部规则 → 大量未声明',
  (s) => s.replace(/^(\s*)r\.add\(new Rule\(.*?\);\n/gm, ''),
  1,
  '未声明授权'
);

console.log('\n结果：%d 项通过，%d 项失败', pass, failures.length);
if (failures.length) {
  console.log('\n失败详情：');
  for (const f of failures) console.log('\n--- ' + f);
  process.exit(1);
}
console.log('全部反向测试通过 —— 守卫确实会红，不是假通过。');
}

main();
