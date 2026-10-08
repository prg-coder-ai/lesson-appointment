/**
 * 时区守卫反向测试 —— 证明 tools/check-tz-guard.mjs 真的会红。
 *
 * 为什么要反向测试：这类守卫的"绿"有两种来源——真的合规，和**根本没查到东西**。
 * 改个文件名、改个方法名、解析失败静默返回空，都能让守卫输出"✓ 全绿"而实际防护为零。
 * 所以每条检查都要"故意弄坏一次，看它是否报红"，并在报告里断言注入真的生效
 * （mutate 返回 false 时直接 exit 2，不允许静默当成"守卫没发现问题"）。
 *
 * 跑法：node --experimental-vm-modules tests/check_tz_guard.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const GUARD = path.join(ROOT, 'tools/check-tz-guard.mjs');

const SCHEDULE_SVC = path.join(ROOT, 'api/src/main/java/com/reservation/service/CourseScheduleService.java');
const NOTIFY_SVC = path.join(ROOT, 'api/src/main/java/com/reservation/service/NotifyDispatchService.java');
const REFUND_SVC = path.join(ROOT, 'api/src/main/java/com/reservation/service/RefundRuleService.java');
const APPT_CTRL = path.join(ROOT, 'api/src/main/java/com/reservation/controller/AppointmentController.java');
const DATETIME_JS = path.join(ROOT, 'shared/domain/datetime.js');

let pass = 0;
let fail = 0;
const failures = [];

/** 在 vm 里跑一次守卫，返回 { code, out }。不 spawn 子进程（托管 node.exe 会 EBUSY）。 */
async function runGuard() {
  const source = fs.readFileSync(GUARD, 'utf8').replace(/^#!.*\r?\n/, '');
  const chunks = [];
  let code = 0;

  const ctx = vm.createContext({
    console: {
      log: (...a) => chunks.push(a.join(' ')),
      error: (...a) => chunks.push(a.join(' ')),
    },
  });
  // 守卫用到 process.cwd() / process.exit()，须一并注入。
  // ⚠️ process.exit 在 vm 里表现为"抛 vm.SyntheticModule 类型的 Signal 中断求值"，
  //    不是设置退出码 —— 故用哨兵异常中断 evaluate，再以 code 记结果。
  const EXIT_SENTINEL = { __exitSignal: true };
  ctx.process = {
    cwd: () => ROOT,
    exit: (c) => { code = c; throw EXIT_SENTINEL; },
  };
  ctx.globalThis = ctx;
  ctx.global = ctx;

  const mod = new vm.SourceTextModule(source, { context: ctx, identifier: 'check-tz-guard.mjs' });
  await mod.link((specifier) => {
    // ⚠️ SyntheticModule 必须显式带 { context: ctx }，否则报
    // "Linked modules must use the same context"。
    // 守卫用的是 `import fs from 'node:fs'` 这种**默认导入**，故只需 default。
    let impl = {};
    if (specifier === 'node:fs') impl = fs;
    else if (specifier === 'node:path') impl = path;
    return new vm.SyntheticModule(['default'], function () {
      this.setExport('default', impl);
    }, { context: ctx });
  });
  try {
    await mod.evaluate();
  } catch (e) {
    // 守卫正常路径以 process.exit(0|1) 收尾 → 中断求值是预期行为，不是失败。
    if (e !== EXIT_SENTINEL) throw e;
  }
  return { code, out: chunks.join('\n') };
}

/**
 * 替换文件中一段（要求恰好命中一次）。返回还原函数。
 *
 * ⚠️ 这里必须做**两件事**，缺一不可（首轮就栽了）：
 *   ① 锚点命中次数必须恰好 1 —— 0 次说明测试与代码脱节（静默失去防护），
 *      多次说明锚点不唯一，改动会污染到别处；
 *   ② **还原后必须断言文件内容与原始字节完全一致**。
 *      只靠 finally 调 restore() 不够：若某个用例的 restore 自身抛错，
 *      或两个用例的锚点互相叠加（同一行被反复替换），
 *      源码会被**永久污染** —— 本轮实测出现过 // // // // // appt.setXxx
 *      这种叠加残留，编译能过、守卫能绿，但课次时间再也写不进库。
 *      所以结尾统一做全量字节比对，不一致直接 exit 2 且明确报出被污染的文件。
 */
const touchedFiles = new Map();   // file -> 原始 Buffer

function replaceOnce(file, anchor, replacement) {
  if (!touchedFiles.has(file)) touchedFiles.set(file, fs.readFileSync(file));
  const orig = touchedFiles.get(file);
  const text = orig.toString('utf8');
  const hits = text.split(anchor).length - 1;
  if (hits !== 1) {
    throw new Error(`锚点在 ${path.basename(file)} 命中 ${hits} 次（须恰好 1 次）—— 测试自身失效`);
  }
  fs.writeFileSync(file, text.replace(anchor, replacement), 'utf8');
  return () => fs.writeFileSync(file, orig);
}

/** 还原全部并逐字节校验；不一致直接退出，绝不"带着污染继续跑"。 */
function restoreAll() {
  const broken = [];
  for (const [file, orig] of touchedFiles) {
    fs.writeFileSync(file, orig);
    const now = fs.readFileSync(file);
    if (!now.equals(orig)) {
      broken.push(path.relative(ROOT, file));
    }
  }
  return broken;
}

/**
 * 跑一个变异用例：注入 → 跑守卫 → 还原 → 断言。
 * expect: 'red'（须报红且输出含 expectSubstring）| 'green'（须全绿）
 */
async function variant(name, expect, mutate, expectSubstring) {
  let restore;
  try {
    restore = mutate();
    if (typeof restore !== 'function') {
      throw new Error('mutate 未返回还原函数——注入没生效，拿到的是"原文件上的绿灯"');
    }
  } catch (e) {
    fail++;
    failures.push(`${name}\n    注入失败：${e.message}`);
    return;
  }

  try {
    const { code, out } = await runGuard();
    const isRed = code === 1;
    if (expect === 'red') {
      if (isRed && (!expectSubstring || out.includes(expectSubstring))) {
        pass++;
        console.log(`  ✓ ${name}`);
      } else {
        fail++;
        failures.push(
          `${name}\n    期望报红${expectSubstring ? `（含「${expectSubstring}」）` : ''}，实际 code=${code}\n` +
          `    --- 守卫输出 ---\n${out.split('\n').map(l => '    ' + l).join('\n')}`);
      }
    } else {
      if (!isRed) {
        pass++;
        console.log(`  ✓ ${name}`);
      } else {
        fail++;
        failures.push(
          `${name}\n    期望全绿，实际判红（误报）：\n` +
          out.split('\n').map(l => '    ' + l).join('\n'));
      }
    }
  } finally {
    restore();
  }
}

(async () => {
console.log('时区守卫反向测试：\n');

// ---------------------------------------------------------------- 基线
{
  const { code, out } = await runGuard();
  if (code === 0) {
    pass++;
    console.log('  ✓ 基线：未改动代码时守卫全绿');
  } else {
    fail++;
    failures.push(`基线就判红，说明改动有遗漏：\n${out}`);
  }
}

// ---------------------------------------------------------------- 检查 1：课次写入未过 UTC 转换
await variant(
  '① 课次写入绕过 UTC 转换（把 scheduleLocalToUtc 换成裸值）应判红',
  'red',
  () => replaceOnce(
    SCHEDULE_SVC,
    'LocalDateTime utc = ScheduleGenerator.scheduleLocalToUtc(scheduleLocal, scheduleZone);',
    'LocalDateTime utc = scheduleLocal;'
  ),
  '没经过 UTC 转换'
);

await variant(
  '①b 课次时间两个 setter 都不调用（转换算了却没落库）应判红',
  'red',
  () => {
    const r1 = replaceOnce(
      SCHEDULE_SVC,
      'appt.setAppointmentDatetime(utc);',
      '// appt.setAppointmentDatetime(utc);'
    );
    const r2 = replaceOnce(
      SCHEDULE_SVC,
      'appt.setLastDatetime(utc);',
      '// appt.setLastDatetime(utc);'
    );
    return () => { r1(); r2(); };
  },
  'generateAppointmentsForBooking'
);

await variant(
  '①b2 只注释掉 setLastDatetime 也应判红（少写一个时间字段同样是缺陷）',
  'red',
  () => replaceOnce(
    SCHEDULE_SVC,
    'appt.setLastDatetime(utc);',
    '// appt.setLastDatetime(utc);'
  ),
  '没有 setLastDatetime(utc)'
);

await variant(
  '①c 方法被改名后守卫须报"找不到方法"而不是静默通过',
  'red',
  () => replaceOnce(
    SCHEDULE_SVC,
    'public boolean generateAppointmentsForBooking(',
    'public boolean generateAppointmentsForBookingRenamed('
  ),
  '找不到 generateAppointmentsForBooking 方法'
);

// ---------------------------------------------------------------- 检查 2：业务 now() 口径
await variant(
  '② 通知服务改回裸 now() 应判红',
  'red',
  () => replaceOnce(
    NOTIFY_SVC,
    'LocalDateTime now = ScheduleGenerator.nowUtc();\n        List<Appointment> candidates = loadCandidates(now);',
    'LocalDateTime now = LocalDateTime.now();\n        List<Appointment> candidates = loadCandidates(now);'
  ),
  '裸 now()'
);

await variant(
  '②b 退改规则改回裸 now() 应判红',
  'red',
  () => replaceOnce(
    REFUND_SVC,
    'Duration.between(ScheduleGenerator.nowUtc(), lessonTime)',
    'Duration.between(LocalDateTime.now(), lessonTime)'
  ),
  '裸 now()'
);

await variant(
  '②c 课次查询改回裸 now() 应判红',
  'red',
  () => replaceOnce(
    APPT_CTRL,
    'java.time.LocalDateTime now = com.reservation.common.ScheduleGenerator.nowUtc();',
    'java.time.LocalDateTime now = java.time.LocalDateTime.now();'
  ),
  '裸 now()'
);

await variant(
  '②d 注释里写 now() 不应误报（说明"剥注释"生效）',
  'green',
  () => replaceOnce(
    APPT_CTRL,
    '    // ================================================================\n    // 课次时间出参转换',
    '    // 提醒：以前这里写的是 java.time.LocalDateTime.now()，别再改回去\n    // ================================================================\n    // 课次时间出参转换'
  )
);

await variant(
  '②e 审计戳 sentAt 允许裸 now()（白名单生效）',
  'green',
  () => replaceOnce(
    NOTIFY_SVC,
    'row.setSentAt(LocalDateTime.now());',
    'row.setSentAt(LocalDateTime.now()); // tz-guard-test: 审计戳，允许'
  )
);

// ---------------------------------------------------------------- 检查 3：转换出口必须存在
await variant(
  '③ 删除 scheduleLocalToUtc 定义应判红',
  'red',
  () => replaceOnce(
    path.join(ROOT, 'api/src/main/java/com/reservation/common/ScheduleGenerator.java'),
    'public static LocalDateTime scheduleLocalToUtc(',
    'public static LocalDateTime scheduleLocalToUtc_DISABLED('
  ),
  '缺少 public static LocalDateTime scheduleLocalToUtc'
);

await variant(
  '③b 删除 nowUtc 定义应判红',
  'red',
  () => replaceOnce(
    path.join(ROOT, 'api/src/main/java/com/reservation/common/ScheduleGenerator.java'),
    'public static LocalDateTime nowUtc()',
    'public static LocalDateTime nowUtc_DISABLED()'
  ),
  '缺少 public static LocalDateTime nowUtc'
);

// ---------------------------------------------------------------- 检查 4：前端渲染
await variant(
  '④ 手算时区偏移（夏令时必错）应判红',
  'red',
  () => replaceOnce(
    DATETIME_JS,
    'export function utcToZoned(iso, timeZone, withSeconds = false) {',
    'export function utcToZoned(iso, timeZone, withSeconds = false) {\n  const off = -new Date(iso).getTimezoneOffset();'
  ),
  'getTimezoneOffset'
);

await variant(
  '④b 去掉 isValidZone 校验应判红（CST 会被 Intl 静默接受）',
  'red',
  () => replaceOnce(
    DATETIME_JS,
    'function isValidZone(tz) {',
    'function isValidZone_tz(tz) {'
  ),
  'isValidZone'
);

await variant(
  '④c 删掉 utcToZoned 导出应判红',
  'red',
  () => replaceOnce(
    DATETIME_JS,
    'export function utcToZoned(iso, timeZone, withSeconds = false) {',
    'function utcToZoned_internal(iso, timeZone, withSeconds = false) {'
  ),
  '缺少 export function utcToZoned()'
);

// ---------------------------------------------------------------- 还原校验（先于汇总）
const broken = restoreAll();
if (broken.length) {
  console.error('\n✗✗ 源码被测试污染且未能完全还原，已强制中止：');
  for (const b of broken) console.error('  · ' + b);
  console.error('\n请用 git checkout 恢复上述文件后重跑。');
  process.exit(2);
}

// ---------------------------------------------------------------- 汇总
console.log(`\n${pass} 通过, ${fail} 失败`);
if (fail) {
  console.log('\n失败明细：');
  for (const f of failures) console.log('  ✗ ' + f);
  process.exit(1);
}
console.log('✓ 反向测试全部通过：每条检查都真的会红');
console.log('  （源码还原已逐字节校验通过）');
})().catch((e) => { console.error(e); process.exit(1); });
