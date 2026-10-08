/**
 * DDL 漂移守卫反向测试（方案 B 配套）
 *
 * 为什么必须有这个文件：一个只报"✓ 通过"的守卫和一个**从不运行**的守卫，
 * 在输出里长得一模一样。本测试构造 12 个**故意做坏的变异**（临时改文件 → 跑守卫 →
 * 断言符合预期 → 逐字节还原），验证六项检查都不是空壳。
 *
 * 【为什么用 vm.SourceTextModule 而不是 spawn 子进程】
 * 与前两个守卫同一坑：本环境（托管 node.exe + 沙箱）对 spawnSync/execFileSync/spawn
 * 一律返回 **EBUSY**；同进程 `import(...?t=random)` 绕缓存实测无效（守卫读文件拿到的是
 * 已求值模块的旧副作用）。唯一可靠路径是 vm.SourceTextModule **每次重新求值源码**。
 * 故 npm script 需带 --experimental-vm-modules。
 *
 * 【为什么必须逐字节还原】
 * 变异直接改真实仓库文件。若中途抛错没还原，会留下脏工作树，而后续变异全在脏状态上跑，
 * 红灯/绿灯都不可信。故 finally 里统一比对字节并强制还原，还原失败会报出来。
 *
 * 【每条变异都要"锚点恰好命中一次"】
 * 否则"改到别的位置"也可能让守卫判红 → 假通过。inject 系列函数在命中数 ≠ 1 时抛错。
 *
 * 用法：node --experimental-vm-modules tests/check_ddl_entity_align_guard.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const util = require('node:util');

const ROOT = process.cwd();
const GUARD = path.join(ROOT, 'tools/check-ddl-entity-align.mjs');

// 变异目标（都是"正常样板"，保证变异前的守卫是绿的）
const ENTITY_DIR = path.join(ROOT, 'api/src/main/java/com/reservation/entity');
const MSG_ENTITY_DIR = path.join(ROOT, 'api/message-service/src/main/java/com/messagecenter/entity');
const BOOKING = path.join(ENTITY_DIR, 'Booking.java');
const TERM = path.join(ENTITY_DIR, 'Term.java');
const SCHEDULE = path.join(ENTITY_DIR, 'CourseSchedule.java');
const SCHEMA_DIR = path.join(ROOT, 'api/sql/schema');

class ExitSignal extends Error { }

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
  const mod = new vm.SourceTextModule(source, { context: ctx, identifier: 'check-ddl-entity-align.mjs' });
  await mod.link((specifier) => {
    const stub = { default: {} };
    if (specifier === 'node:fs') stub.default = fs;
    else if (specifier === 'node:path') stub.default = path;
    // ⚠️ SyntheticModule 必须显式传 { context: ctx }：否则报
    // ERR_VM_MODULE_DIFFERENT_CONTEXT（linked modules must use the same context）。
    return new vm.SyntheticModule(['default'], function () {
      this.setExport('default', stub.default);
    }, { context: ctx });
  });
  // 守卫末尾 process.exit(0|1) 在 vm 里表现为抛 ExitSignal 中断求值，必须 catch
  try {
    await mod.evaluate();
  } catch (e) {
    if (!(e instanceof ExitSignal)) throw e;
  }
  return { code, out: chunks.join('\n') };
}

// ---------------------------------------------------------------- 变异原语

/**
 * 锚点里的 `\n` 必须按目标文件**实际行尾**改写。
 *
 * ⚠️ 本仓库实体文件是 CRLF（实测 Term/CourseSchedule/Booking 均含 \r\n），
 * 锚点若直接写 `\n` 就命中 0 次——表现为"锚点命中 0 次"异常，
 * 而这类失败会让人怀疑守卫而不是怀疑测试。
 * 反过来 schema 脚本是 LF，所以不能无条件统一，一律按文件实测行尾决定。
 */
function adaptEol(file, anchor) {
  const text = fs.readFileSync(file, 'utf8');
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  return anchor.replace(/\r?\n/g, eol);
}

/** 替换文件中一段（要求恰好命中一次），返回还原函数 */
function replaceOnce(file, anchor, replacement) {
  const orig = fs.readFileSync(file);
  const text = orig.toString('utf8');
  const a = adaptEol(file, anchor);
  const r = adaptEol(file, replacement);
  const hits = text.split(a).length - 1;
  if (hits !== 1) throw new Error(`锚点在 ${path.basename(file)} 命中 ${hits} 次（须恰好 1 次）`);
  fs.writeFileSync(file, text.replace(a, r), 'utf8');
  return () => fs.writeFileSync(file, orig);
}

/** 在文件某行后插入文本 */
function insertAfter(file, anchor, added) {
  return replaceOnce(file, anchor, anchor + added);
}

/** 临时移走目录下所有文件 */
function hideDir(dir) {
  const entries = fs.readdirSync(dir).map((f) => ({ f, buf: fs.readFileSync(path.join(dir, f)) }));
  entries.forEach((x) => fs.unlinkSync(path.join(dir, x.f)));
  return () => entries.forEach((x) => fs.writeFileSync(path.join(dir, x.f), x.buf));
}

/** 临时清空 DDL 基线目录 */
function emptySchemaDir() {
  const files = fs.readdirSync(SCHEMA_DIR).filter((f) => f.endsWith('.sql'));
  if (files.length === 0) throw new Error('schema 目录本就没有 .sql，无法测"空基线"');
  const backups = files.map((f) => ({ f, buf: fs.readFileSync(path.join(SCHEMA_DIR, f)) }));
  backups.forEach((b) => fs.unlinkSync(path.join(SCHEMA_DIR, b.f)));
  return () => backups.forEach((b) => fs.writeFileSync(path.join(SCHEMA_DIR, b.f), b.buf));
}

/** 改 lesson_appointment 基线脚本 */
function mutateSchema(fn) {
  const main = fs.readdirSync(SCHEMA_DIR).find((f) => f.includes('lesson_appointment'));
  const p = path.join(SCHEMA_DIR, main);
  const orig = fs.readFileSync(p);
  const next = fn(orig.toString('utf8'));
  if (next === orig.toString('utf8')) throw new Error('schema 变异未生效（替换没命中）');
  fs.writeFileSync(p, next, 'utf8');
  return () => fs.writeFileSync(p, orig);
}

// ---------------------------------------------------------------- 测试框架

let pass = 0;
const failures = [];

/**
 * @param name     用例名
 * @param expect   { code, keyword }  期望的退出码与必须出现的输出关键词
 * @param mutate   返回还原函数的变异函数
 * @param watch    需要监控还原的文件（默认监控全部已知目标）
 */
async function variant(name, expect, mutate) {
  const watch = [GUARD, BOOKING, TERM, SCHEDULE, ...fs.readdirSync(SCHEMA_DIR).map((f) => path.join(SCHEMA_DIR, f))];
  const before = new Map(watch.map((f) => [f, fs.readFileSync(f)]));
  let restore = null;
  try {
    restore = mutate();
    const { code, out } = await runGuard();
    const ok = code === expect.code && (!expect.keyword || out.includes(expect.keyword));
    if (ok) {
      pass++;
      console.log(`  ✓ ${name}`);
    } else {
      failures.push(
        `${name}\n    期望 exit ${expect.code}${expect.keyword ? ` 且输出含「${expect.keyword}」` : ''}，` +
        `实际 exit ${code}\n    输出前 12 行：\n${indent(out)}`);
      console.log(`  ✗ ${name}`);
    }
  } catch (e) {
    failures.push(`${name}：执行异常 ${e.message}`);
    console.log(`  ✗ ${name}（异常：${e.message}）`);
  } finally {
    if (restore) {
      try { restore(); } catch (e) { failures.push(`${name}：还原抛错 ${e.message}`); }
    }
    // 兜底：逐字节校验，任何残留改动一律还原
    for (const [f, buf] of before) {
      if (!fs.existsSync(f)) {
        failures.push(`${name}：${path.basename(f)} 消失未还原`);
        continue;
      }
      const now = fs.readFileSync(f);
      if (!now.equals(buf)) {
        fs.writeFileSync(f, buf);
        failures.push(`${name}：${path.basename(f)} 有残留改动，已强制还原`);
      }
    }
  }
}

function indent(s) {
  return s.split('\n').slice(0, 12).map((l) => '    | ' + l).join('\n');
}

const RED = (kw) => ({ code: 1, keyword: kw });
const GREEN = { code: 0, keyword: '✓ 实体与 DDL 基线一致' };

(async function main() {
  console.log('DDL 漂移守卫反向测试\n');

  // ---- 基线：未变异时必须绿，否则下面所有红灯都无意义
  console.log('— 基线 —');
  const base = await runGuard();
  if (base.code !== 0) {
    console.log(`  ✗ 基线不绿（exit ${base.code}），先修守卫：\n${indent(base.out)}`);
    process.exit(1);
  }
  console.log('  ✓ 基线绿\n');

  // ---- 检查 1：实体表存在性
  console.log('— 检查 1：实体表存在性 —');
  await variant('① @TableName 指向不存在的表',
    RED('在 DDL 基线中不存在'),
    () => replaceOnce(TERM, '@TableName("sys_term")', '@TableName("sys_term_typo")'));

  await variant('①b 无 @TableName 时按类名推导的默认表不存在',
    RED('在 DDL 基线中不存在'),
    () => replaceOnce(TERM, '@TableName("sys_term")\npublic class Term {',
      'public class SysTermNoSuchTable {'));

  // ---- 检查 2：实体字段存在性
  console.log('— 检查 2：实体字段存在性 —');
  await variant('② 实体加了字段但表里没这一列',
    RED('在 DDL 基线中不存在'),
    () => insertAfter(BOOKING, '    private String bookingId;', '\n    private String brandNewColumn;'));

  await variant('②b 字段行带行尾注释时仍能检出（防解析器丢字段）',
    RED('在 DDL 基线中不存在'),
    () => insertAfter(BOOKING, '    private String scheduleId;', '\n    private String lostBehindComment; // 带行尾注释'));

  await variant('②c 驼峰映射是严格的：scheduleId 写成 scheduleID 应判红（防映射被"宽松化"）',
    RED('在 DDL 基线中不存在'),
    () => replaceOnce(BOOKING, 'private String scheduleId;', 'private String scheduleID;'));

await variant('②d 本身含下划线的字段名原样映射（update_time）不误报',
    GREEN,
    () => insertAfter(BOOKING, '    private Date update_time;', '\n    private Date create_time; // 与表列同名，映射原样通过'));

  // ---- 检查 2 反向：豁免机制
  console.log('— 检查 2 反向：豁免机制 —');
  await variant('③ 带理由的字段豁免 → 转绿',
    GREEN,
    () => insertAfter(BOOKING, '    private String bookingId;',
      '\n    // ddl-align: ignore 变异用例：验证字段级豁免生效\n    private String neverInTable;'));

  await variant('④ 只写豁免标记不写理由 → 必须判红（防止豁免变成盲区）',
    RED('没给理由'),
    () => insertAfter(BOOKING, '    private String bookingId;',
      '\n    // ddl-align: ignore\n    private String exemptWithoutReason;'));

  await variant('④b ignore-table 不能被当成字段级豁免（否则表级理由会被误吞）',
    RED('在 DDL 基线中不存在'),
    () => insertAfter(BOOKING, '    private String bookingId;',
      '\n    // ddl-align: ignore-table 这行本意是表级豁免\n    private String shouldStillBeRed;'));

  // ---- 检查 3：NOT NULL 无默认列必须有实体字段
  console.log('— 检查 3：必填列覆盖 —');
  await variant('⑤ 表列 NOT NULL 无默认值但实体无该字段（sys_term.term_name 是 NOT NULL 且无 DEFAULT）',
    RED('NOT NULL 且无默认值'),
    () => replaceOnce(TERM, '    private String termName;', '    // private String termName;'));

  await variant('⑤b AUTO_INCREMENT 主键不得误报为"必填列无实体字段"（Term.id 是 AUTO_INCREMENT，去掉实体字段后仍应绿）',
    GREEN,
    () => replaceOnce(TERM,
      '@TableId(type = IdType.AUTO)\r\n    private Long id;',
      '// 主键字段被移除，但 AUTO_INCREMENT 列不应被判"必填列无实体字段"'));

  // ---- 检查 4：主键一致性
  console.log('— 检查 4：主键一致性 —');
  await variant('⑥ @TableId 指向非主键列',
    RED('不是表'),
    () => replaceOnce(TERM,
      '@TableId(type = IdType.AUTO)\n    private Long id;',
      'private Long id;\n    @TableId(type = IdType.AUTO)\n    private String termKey;'));

  await variant('⑦ IdType.AUTO 但列不是 AUTO_INCREMENT',
    RED('AUTO_INCREMENT'),
    () => replaceOnce(SCHEDULE,
      '@TableId(type = IdType.ASSIGN_ID)\n    private String scheduleId;',
      '@TableId(type = IdType.AUTO)\n    private String scheduleId;'));

  await variant('⑧ AUTO_INCREMENT 列的主键声明为 String → 由类型族检查拦住（不再靠已删除的死分支）',
    RED('与 Java 类型 String 不兼容'),
    () => replaceOnce(TERM,
      '@TableId(type = IdType.AUTO)\r\n    private Long id;',
      '@TableId(type = IdType.AUTO)\r\n    private String id;'));

  // ---- 检查 5：DDL 内部引用完整性
  console.log('— 检查 5：DDL 内部引用完整性（FK） —');
  await variant('⑨ FK 引用了不存在的本地列',
    RED('不存在的本地列'),
    () => mutateSchema((sql) => sql.replace(
      'CONSTRAINT `fk_booking_schedule` FOREIGN KEY (`schedule_id`)',
      'CONSTRAINT `fk_booking_schedule` FOREIGN KEY (`schedule_id_typo`)')));

  await variant('⑩ FK 引用了不存在的表',
    RED('引用了不存在的表'),
    () => mutateSchema((sql) => sql.replace(
      'REFERENCES `course_schedule` (`schedule_id`)',
      'REFERENCES `course_schedule_typo` (`schedule_id`)')));

  // ---- 守卫自身健壮性（防空转假绿）
  console.log('— 守卫自身健壮性 —');
  await variant('⑪ DDL 基线被清空 → 必须判红（不能"没有表就没有问题"）',
    RED('基线'),
    () => emptySchemaDir());

  await variant('⑫ 实体目录被清空 → 必须提示（不能"0 个实体全部通过"）',
    { code: 0, keyword: '没有找到任何实体类' },
    () => hideDir(MSG_ENTITY_DIR));

  await variant('⑬ 基线缺 CHECK/索引信息不影响 FK 检查（FK 解析不依赖其它约束）',
    GREEN,
    () => mutateSchema((sql) => sql.replace(/\n\s*KEY `idx_tenant_id`[^\n]*/g, '')));

  // ---- 还原校验
  console.log('\n— 还原校验 —');
  const after = await runGuard();
  if (after.code !== 0) {
    failures.push(`所有变异还原后守卫仍不绿（exit ${after.code}）——存在未还原改动：\n${indent(after.out)}`);
  } else {
    console.log('  ✓ 还原后基线恢复绿色');
  }

  console.log(`\n${failures.length ? '✗' : '✓'} 反向测试：${pass} 通过 / ${failures.length} 失败`);
  if (failures.length) {
    console.log('\n失败详情：');
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
  process.exit(0);
})();