/**
 * 级联守卫反向测试（第 4 批 · 配套）
 *
 * 为什么必须有这个文件：一个只报"✓ 通过"的守卫和一个**从不运行**的守卫，
 * 在输出里长得一模一样。本测试用 8 个**故意做坏**的变体验证：
 * 每种缺陷注入后，守卫都必须 exit 1 且报告里出现对应关键词。
 * 若某变体注入后守卫仍通过 → 说明该检查是空壳，必须修守卫而不是改测试。
 *
 * 【为什么用 vm.SourceTextModule 而不是 spawn 子进程】
 * 本环境（托管 node.exe + 沙箱）对 spawnSync / execFileSync / spawn 一律返回
 * **EBUSY**（与记忆里第 2 批 authz 守卫遇到的同一个坑）。
 * 而"同进程动态 import + ?t=random 绕缓存"**实测无效**：
 * 文件已改、import URL 也带了随机 query，守卫读到的仍是旧内容（run2 报通过），
 * 因为守卫用 fs.readFileSync 读文件、被缓存的是「已求值模块的顶层副作用」。
 * 唯一可靠路径是用 vm.SourceTextModule **每次重新求值源码**：
 * 它不进 ESM 缓存，拿到的一定是当前磁盘内容。
 * 代价是必须用 --experimental-vm-modules，故 npm script 里带了该 flag。
 *
 * 用法：node --experimental-vm-modules tests/check_cascade_rules_guard.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const util = require('node:util');

const ROOT = process.cwd();
const GUARD = path.join(ROOT, 'tools/check-cascade-rules.mjs');
const RULES_FILE = path.join(ROOT, 'api/src/main/java/com/reservation/common/CascadeRules.java');
const BOOKING_SERVICE = path.join(ROOT, 'api/src/main/java/com/reservation/service/BookingService.java');

/** 用于在 vm 里中断模块求值（替代守卫里的 process.exit） */
class ExitSignal extends Error { }

/** 每次重新求值守卫源码（绕过 ESM 缓存），返回 {code, out} */
async function runGuard() {
  const chunks = [];
  let code = 0;
  const sandboxConsole = {
    log: (...a) => chunks.push(util.format(...a)),
    error: (...a) => chunks.push(util.format(...a)),
  };
  const ctx = vm.createContext({
    console: sandboxConsole,
    process: {
      cwd: () => ROOT,
      exit: (c) => { code = c === undefined ? 0 : c; throw new ExitSignal(); },
      stdout: { write: () => true },
      stderr: { write: () => true },
    },
    require,
    module: { exports: {} },
    Buffer,
    setTimeout,
    clearTimeout,
    URL,
  });
  ctx.globalThis = ctx;
  ctx.global = ctx;

  const source = fs.readFileSync(GUARD, 'utf8').replace(/^#!.*\r?\n/, '');
  const mod = new vm.SourceTextModule(source, { context: ctx, identifier: 'check-cascade-rules.mjs' });
  await mod.link((specifier) => {
    // vm.SyntheticModule 必须**恰好**提供被请求的导出名，少一个报
    // "does not provide an export named ..."，多一个报 "unexpected export"。
    // 守卫用的是 `import fs from 'node:fs'` / `import path from 'node:path'`
    // 这种**默认导入**，所以每个来源模块都要同时给出 default 与命名导出。
    const mod_ = requireStub({ from: specifier });
    return new vm.SyntheticModule(['default'], function () {
      this.setExport('default', mod_);
    }, { context: ctx });
  });
  // ⚠️ 守卫末尾会 process.exit(0|1)，在 vm 里那是"抛 ExitSignal 中断求值"，
  // 不是设置退出码。故这里必须 catch 它并以 code 记结果：
  // 不 catch 的话每次跑完守卫都会变成一次未捕获异常，判定全靠运气。
  try {
    await mod.evaluate();
  } catch (e) {
    if (!(e instanceof ExitSignal)) throw e;
  }
  return { code, out: chunks.join('\n') };
}

function collectImports(src) {
  const names = [];
  const re = /import\s+(?:([\w$]+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (m[1]) names.push({ name: m[1], from: m[3] });
    if (m[2]) {
      m[2].split(',').map((s) => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean)
        .forEach((n) => names.push({ name: n, from: m[3] }));
    }
  }
  return names;
}

/** 按「来自哪个内置模块」取真实实现 */
function requireStub(entry) {
  const spec = entry.from;
  if (spec === 'node:fs' || spec === 'fs') return require('node:fs');
  if (spec === 'node:path' || spec === 'path') return require('node:path');
  if (spec === 'node:util' || spec === 'util') return require('node:util');
  return undefined;
}

let pass = 0;
let fail = 0;

function report(name, ok, detail) {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}`);
    if (detail) {
      const first = String(detail).split('\n').slice(0, 8).join('\n      ');
      console.log('      ' + first);
    }
  }
}

async function scenario(name, mutate, expectKeywords) {
  const files = [RULES_FILE, BOOKING_SERVICE];
  const backups = new Map();
  for (const f of files) {
    if (fs.existsSync(f)) backups.set(f, fs.readFileSync(f, 'utf8'));
  }
  try {
    const injected = mutate();
    if (injected !== true) {
      // mutate 必须明确返回 true；返回 false/undefined 说明正则没匹配上，
      // 此时守卫读的是原文件，"通过"毫无意义——这正是本测试要防的空壳陷阱
      report(name + '（注入生效）', false, 'mutate 未改变文件，测试是空壳');
      return;
    }
    let g;
    try {
      g = await runGuard();
    } catch (e) {
      if (!(e instanceof ExitSignal)) {
        report(name, false, '守卫抛异常：' + (e && e.stack ? e.stack : e));
        return;
      }
      g = { code: 1, out: '(exit)' };
    }
    if (g.code === 0) {
      report(name, false, '守卫在缺陷注入后仍然通过（exit 0）——该检查是空壳');
      return;
    }
    const missing = expectKeywords.filter((k) => !g.out.includes(k));
    if (missing.length) {
      report(name, false, `守卫判红了但报告缺少关键词 ${JSON.stringify(missing)}：\n${g.out.split('\n').slice(0, 8).join('\n')}`);
      return;
    }
    report(name, true);
  } finally {
    for (const [f, content] of backups) {
      fs.writeFileSync(f, content, 'utf8');
    }
  }
}

(async () => {
  console.log('级联守卫 · 反向测试\n');

  const base = await runGuard();
  report('基线（干净仓库）应通过', base.code === 0, base.out);
  if (base.code !== 0) {
    console.log('\n基线不通过，后续用例无意义，终止。');
    process.exit(1);
  }

  // 1) 删除路径不声明级联 → 检查 1
  //    注入点选 TenantService#softDelete 之外的一个独立方法，避免与级联调用同窗：
  //    守卫判定的是「整个方法体」，若注入行所在方法本来就有级联，检查就抓不到。
  await scenario(
    '检查1：删除调用未声明级联 → 判红',
    () => {
      const src0 = fs.readFileSync(BOOKING_SERVICE, 'utf8');
      const inject = `
    // 反向测试注入：物理删除但不声明任何级联
    public int injectedDelete(String bookingId) {
        return bookingMapper.deleteById(bookingId);
    }
`;
      const idx = src0.lastIndexOf('}');
      const src = src0.slice(0, idx) + inject + src0.slice(idx);
      if (src === src0) return false;
      fs.writeFileSync(BOOKING_SERVICE, src, 'utf8');
      return true;
    },
    ['删除调用未声明级联处置']
  );

  // 2) 软删除不声明级联 → 检查 2
  await scenario(
    '检查2：软删除未声明关联表处置 → 判红',
    () => {
      const src0 = fs.readFileSync(BOOKING_SERVICE, 'utf8');
      const inject = `
    // 反向测试注入：软删除但不做任何级联
    public void injectedSoftDelete(String bookingId) {
        LambdaQueryWrapper<Booking> uw3 = new LambdaQueryWrapper<Booking>();
        uw3.eq(Booking::getBookingId, bookingId).set(Booking::getStatus, "frozen");
        bookingMapper.update(null, uw3);
    }
`;
      const idx = src0.lastIndexOf('}');
      const src = src0.slice(0, idx) + inject + src0.slice(idx);
      fs.writeFileSync(BOOKING_SERVICE, src, 'utf8');
      return src !== src0;
    },
    ['软删除']
  );

  // 3) FREEZE 规则缺目标状态 → 检查 4
  await scenario(
    '检查4：FREEZE 规则缺目标状态 → 判红',
    () => {
      const src0 = fs.readFileSync(RULES_FILE, 'utf8');
      const src = src0.replace(/Action\.FREEZE,\s*BookingStatus\.FROZEN,/, 'Action.FREEZE, null,');
      if (src === src0) return false;
      fs.writeFileSync(RULES_FILE, src, 'utf8');
      return true;
    },
    ['FREEZE 规则必须指定目标状态']
  );

  // 4) RESTORE_STATUS 缺 fromStatuses → 检查 4
  await scenario(
    '检查4：RESTORE_STATUS 缺 fromStatuses → 判红',
    () => {
      const src0 = fs.readFileSync(RULES_FILE, 'utf8');
      const src = src0.replace(/Action\.RESTORE_STATUS,\s*"active",\s*List\.of\(BookingStatus\.FROZEN\),/,
        'Action.RESTORE_STATUS, "active",');
      if (src === src0) return false;
      fs.writeFileSync(RULES_FILE, src, 'utf8');
      return true;
    },
    ['RESTORE_STATUS 必须指定 fromStatuses']
  );

  // 5) KEEP 规则理由为空 → 检查 4
  //    注：必须替换**整段** KEEP 条目的最后一个实参。
  //    规则里的 note 常写成字符串拼接（"a" + "b"），只把首段清空会留下 `" " + "b"`，
  //    拼出来的字符串仍非空 → 守卫本该判红却"通过"，测试就会假通过。
  await scenario(
    '检查4：KEEP 规则理由为空 → 判红',
    () => {
      const src0 = fs.readFileSync(RULES_FILE, 'utf8');
      const re = /Action\.KEEP,\s*null,\s*((?:"[^"]*"\s*\+?\s*)+)/;
      const m = re.exec(src0);
      if (!m) return false;
      const src = src0.replace(re, 'Action.KEEP, null, ""');
      if (src === src0) return false;
      fs.writeFileSync(RULES_FILE, src, 'utf8');
      return true;
    },
    ['KEEP 规则必须写明理由']
  );

  // 6) 同场景内规则重复 → 检查 4
  await scenario(
    '检查4：同场景内规则重复 → 判红',
    () => {
      const src0 = fs.readFileSync(RULES_FILE, 'utf8');
      const marker = 'private static final List<Rule> BOOKING_DELETE_RULES = List.of(';
      const idx = src0.indexOf(marker);
      if (idx < 0) return false;
      const oneRule = 'new Rule("booking", "booking_id", "appointment", "booking_id", '
        + 'Action.DELETE, null, '
        + '"课次的唯一父引用就是 booking_id：不删课次就必然留下悬空行")';
      const src = src0.replace(marker, marker + '\n            ' + oneRule + ',');
      if (src === src0) return false;
      fs.writeFileSync(RULES_FILE, src, 'utf8');
      return true;
    },
    ['规则重复']
  );

  // 7) 引用未登记的场景常量 → 检查 3
  await scenario(
    '检查3：引用未登记的场景常量 → 判红',
    () => {
      const src0 = fs.readFileSync(BOOKING_SERVICE, 'utf8');
      const src = src0.replace('CascadeRules.SCENARIO_BOOKING_DELETE',
        'CascadeRules.SCENARIO_NOT_REGISTERED');
      if (src === src0) return false;
      fs.writeFileSync(BOOKING_SERVICE, src, 'utf8');
      return true;
    },
    ['未登记的场景常量']
  );

  // 8) 绕过 BookingIdGenerator 生成 bookingId → 检查 5
  await scenario(
    '检查5：绕过 BookingIdGenerator 生成 bookingId → 判红',
    () => {
      const src0 = fs.readFileSync(BOOKING_SERVICE, 'utf8');
      // 必须让注入行自身带 booking 语义，否则检查 5（有意）不会判红：
      // 它只在生成点确实落在 booking 主键上时才拦，避免误伤 scheduleId/courseId。
      const src = src0.replace('String id = BookingIdGenerator.next();',
        'String bookingId = java.util.UUID.randomUUID().toString();');
      if (src === src0) return false;
      fs.writeFileSync(BOOKING_SERVICE, src, 'utf8');
      return true;
    },
    ['BookingIdGenerator']
  );

  console.log(`\n反向测试：${pass} 通过 / ${fail} 失败`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('反向测试自身异常：', e && e.stack ? e.stack : e);
  process.exit(2);
});
