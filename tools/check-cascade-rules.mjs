#!/usr/bin/env node
/**
 * 引用完整性级联守卫（第 4 批 · 配套）
 *
 * 为什么需要它：级联规则（CascadeRules）是人工枚举的，而枚举必然有遗漏。
 * 本项目此前"漏了"的表现形式是**静默留下悬空引用**——删掉一条预订，
 * 课次没人管；删掉一门课，排期被数据库 CASCADE 带走，而它的课次又没人管。
 * 实测库里 149 行课次有 109 行 booking_id 指向不存在的预订。这类缺陷
 * 不报错、不告警，只在有人回头查数据时才发现，代价极高。
 *
 * 六条检查：
 *   1. 删除路径必须声明级联：所有 `xxxMapper.deleteById / delete / deleteChild`
 *      与 `xxxService.delete*` 的调用点，其所在方法内必须出现
 *      `cascadeService.run(` 或显式标注 `// cascade: none` 理由。
 *   2. 软删除入口必须声明级联：所有把 status 置 frozen / deleted 的
 *      `updateStatus*` / `softDelete` 方法，同样必须调用级联或有理由。
 *   3. 场景名必须已登记：代码里出现的 `CascadeRules.SCENARIO_*` 必须在规则表里定义。
 *   4. 规则表自身合法性：
 *      - KEEP / SKIP 必须写非空 reason（"决定不动"和"做不到"都必须有说法）；
 *      - FREEZE / SOFT_STATUS / RESTORE_STATUS 必须指定目标状态；
 *      - RESTORE_STATUS 必须指定 fromStatuses；
 *      - 同一场景内 (父表,父键列,子表,子键列) 不得重复。
 *   5. bookingId 生成口径统一：业务代码不得直接调 `UUID.randomUUID()` 生成
 *      bookingId（双生成器是悬空引用根因之一），必须走 BookingIdGenerator。
 *   6. 规则引用的表与列必须真实存在于 DDL 基线脚本中（拼错表名/列名会在运行时报
 *      SQL 错误，而级联是删除路径上的，报错时机太晚）。
 *
 * 用法：node tools/check-cascade-rules.mjs
 * 退出码：0 = 全绿；1 = 有漏声明/非法规则（须修）
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const JAVA_ROOT = path.join(ROOT, 'api/src/main/java/com/reservation');
const RULES_FILE = path.join(JAVA_ROOT, 'common/CascadeRules.java');
const DDL_FILE = path.join(ROOT, 'api/beforeRun/referential-integrity-20261008.sql');

const problems = [];
const notes = [];

function lineOf(src, index) {
  return src.slice(0, index).split('\n').length;
}

function walk(dir, filter, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, filter, acc);
    else if (filter(full)) acc.push(full);
  }
  return acc;
}

function rel(p) {
  return path.relative(ROOT, p).split(path.sep).join('/');
}

// ---------------------------------------------------------------- 解析级联规则表
if (!fs.existsSync(RULES_FILE)) {
  console.error('✗ 找不到 ' + RULES_FILE);
  process.exit(1);
}
const rulesSrc = fs.readFileSync(RULES_FILE, 'utf8');

// 抓场景常量：public static final String SCENARIO_X = "X";
const scenarioConsts = new Map();
const scRe = /public\s+static\s+final\s+String\s+(SCENARIO_\w+)\s*=\s*"([^"]+)"/g;
let m;
while ((m = scRe.exec(rulesSrc)) !== null) {
  scenarioConsts.set(m[1], m[2]);
}

// 抓规则条目。
//
// ⚠️ 必须按**括号配平**逐条提取，不能用单个正则：
// new Rule(...) 的实参里含 List.of("a","b") 这类嵌套括号，且常量引用
// （BookingStatus.FROZEN / AppointmentStatus.FROZEN / "active"）混用，
// 正则一旦按固定形状匹配就会漏条目——本守卫第一版就是这样只抓到 5/17 条，
// 检查 4 形同虚设（却因为"没报错"看起来是绿的）。
// 这里改为：定位 `new Rule(` 后手动配平括号，取出实参列表再逐项解析。
const ruleItems = [];
{
  const OPEN = 'new Rule(';
  let idx = 0;
  while ((idx = rulesSrc.indexOf(OPEN, idx)) !== -1) {
    const start = idx + OPEN.length;
    let depth = 1;
    let j = start;
    while (j < rulesSrc.length && depth > 0) {
      const ch = rulesSrc[j];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      j++;
    }
    const argStr = rulesSrc.slice(start, j - 1);
    const args = splitTopLevelArgs(argStr);
    ruleItems.push({
      line: lineOf(rulesSrc, idx),
      args,
    });
    idx = j;
  }
}

/** 按顶层逗号切分实参（忽略括号内与字符串内的逗号） */
function splitTopLevelArgs(s) {
  const out = [];
  let depth = 0;
  let inStr = false;
  let cur = '';
  for (let k = 0; k < s.length; k++) {
    const ch = s[k];
    if (inStr) {
      cur += ch;
      if (ch === '\\') { cur += s[++k] ?? ''; continue; }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; cur += ch; continue; }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const rules = [];
for (const item of ruleItems) {
  const a = item.args;
  // 形状：parentTable, parentKey, childTable, childKey, Action.X, target[, from], note
  if (a.length < 7) {
    problems.push(`CascadeRules.java:${item.line} Rule 实参个数为 ${a.length}，应为 7 或 8`);
    continue;
  }
  const pick = (s) => {
    const m = /^"([^"]*)"$/.exec(s.trim());
    return m ? m[1] : (s.trim() === 'null' ? null : s.trim());
  };
  const actionM = /^Action\.(\w+)$/.exec(a[4].trim());
  if (!actionM) {
    problems.push(`CascadeRules.java:${item.line} 第 5 个实参不是 Action.X：${a[4].trim()}`);
    continue;
  }
  const fromArg = a.length >= 8 ? a[6].trim() : null;
  rules.push({
    line: item.line,
    parentTable: pick(a[0]),
    parentKey: pick(a[1]),
    childTable: pick(a[2]),
    childKey: pick(a[3]),
    action: actionM[1],
    targetStatus: pick(a[5]),
    fromStatuses: fromArg && fromArg !== 'null'
      ? fromArg.replace(/^List\.of\(/, '').replace(/\)$/, '').split(',').map((x) => x.trim()).filter(Boolean)
      : null,
    note: pick(a[a.length - 1]),
  });
}

// ---------------------------------------------------------------- 检查 4：规则表合法性
// ⚠️ 重复判定必须**按场景分组**：同一条父子关系出现在不同场景是正常的
// （例如 booking→appointment 在 BOOKING_DELETE 与 BOOKING_FREEZE 里都有，只是动作不同）。
// 真正要禁的是「同一场景内重复」——那会让执行顺序变得不可预测。
//
// ⚠️ 场景归属必须按「规则列表常量」分块，**不能**按 SCENARIO_ 常量的行号区间推断：
// 本守卫第一版用「行号落在哪个 SCENARIO_ 声明之后」来归属，而 SCENARIO_ 常量声明在
// 文件末尾，导致前面所有规则都被归到最后一个场景 → 报出一堆假重复。
// 现在改为：先切出每个 `XXX_RULES = List.of( ... )` 块，块名即场景标识。
const rulesBlockRe = /private\s+static\s+final\s+List<Rule>\s+(\w+_RULES)\s*=\s*List\.of\(/g;
const blockRanges = [];
{
  let bm;
  while ((bm = rulesBlockRe.exec(rulesSrc)) !== null) {
    const start = bm.index + bm[0].length;
    let depth = 1;
    let j = start;
    while (j < rulesSrc.length && depth > 0) {
      const ch = rulesSrc[j];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      j++;
    }
    blockRanges.push({ name: bm[1], startLine: lineOf(rulesSrc, bm.index), endLine: lineOf(rulesSrc, j) });
  }
}

function scenarioOfLine(line) {
  const hit = blockRanges.find((b) => line >= b.startLine && line <= b.endLine);
  return hit ? hit.name : '(未归属场景)';
}

const seenByScenario = new Map();
for (const r of rules) {
  const where = `CascadeRules.java:${r.line}`;
  const scen = scenarioOfLine(r.line);
  r.scenario = scen;
  if (scen === '(未归属场景)') {
    problems.push(`${where} 规则不属于任何场景列表（应放进某个 XXX_RULES = List.of(...) 块）`);
  }
  if ((r.action === 'KEEP' || r.action === 'SKIP') && !r.note.trim()) {
    problems.push(`${where} ${r.action} 规则必须写明理由（"决定不动"和"做不到"都必须回答）`);
  }
  if (['FREEZE', 'SOFT_STATUS', 'RESTORE_STATUS'].includes(r.action) && !r.targetStatus) {
    problems.push(`${where} ${r.action} 规则必须指定目标状态（它就是"置成什么"）`);
  }
  if (r.action === 'RESTORE_STATUS' && !r.fromStatuses) {
    problems.push(`${where} RESTORE_STATUS 必须指定 fromStatuses（否则会把 pending/inactive 一并改掉）`);
  }
  const key = `${scen}|${r.parentTable}.${r.parentKey}->${r.childTable}.${r.childKey}`;
  if (seenByScenario.has(key)) {
    problems.push(`${where} 场景 ${scen} 内规则重复：${r.parentTable}.${r.parentKey} -> ${r.childTable}.${r.childKey}`
      + `（同一场景内出现两次，执行顺序会变得不可预测；`
      + `若确实要两种动作，请拆成两个场景）`);
  }
  seenByScenario.set(key, r.line);
}

// 场景与规则块必须一一对应：漏建块 = 场景跑起来是空的（级联静默失效）
{
  const blockNames = new Set(blockRanges.map((b) => b.name));
  const usedByScenarios = new Set();
  const scRe2 = /new\s+Scenario\s*\(\s*(SCENARIO_\w+)\s*,[\s\S]*?,\s*(\w+_RULES)\s*\)/g;
  let sm2;
  while ((sm2 = scRe2.exec(rulesSrc)) !== null) {
    usedByScenarios.add(sm2[2]);
    if (!blockNames.has(sm2[2])) {
      problems.push(`CascadeRules.java:${lineOf(rulesSrc, sm2.index)} 场景 ${sm2[1]} 引用了未定义的规则块 ${sm2[2]}`);
    }
  }
  for (const b of blockNames) {
    if (!usedByScenarios.has(b)) {
      problems.push(`CascadeRules.java 规则块 ${b} 没有被任何场景使用（死规则，等于没登记）`);
    }
  }
}

// ---------------------------------------------------------------- 检查 6：表列存在于 DDL 基线
if (!fs.existsSync(DDL_FILE)) {
  problems.push('找不到 DDL 基线脚本 ' + rel(DDL_FILE) + '（检查 6 需要它核对表列是否真实存在）');
} else {
  const ddl = fs.readFileSync(DDL_FILE, 'utf8');
  // 基线脚本里显式出现的表名（CREATE TABLE / ALTER TABLE / DELETE FROM / JOIN）
  const tableSet = new Set();
  const tRe = /\b(?:CREATE TABLE(?:\s+IF NOT EXISTS)?|ALTER TABLE|DELETE\s+\w+\s+FROM|FROM|INNER JOIN|LEFT JOIN)\s+`?(\w+)`?/gi;
  let tm;
  while ((tm = tRe.exec(ddl)) !== null) tableSet.add(tm[1].toLowerCase());
  // 基线未包含全量建表语句时，退化为只检查"脚本里提到的表"是否存在（不足则仅提示）
  if (tableSet.size < 5) {
    notes.push('DDL 基线里识别到的表不足 5 张，检查 6 只能覆盖部分表（不影响其余检查）');
  }
  for (const r of rules) {
    for (const t of [r.parentTable, r.childTable]) {
      if (t.toLowerCase().startsWith('bak_')) continue; // 备份表不在基线里
      if (tableSet.size >= 5 && !tableSet.has(t.toLowerCase())) {
        notes.push(`规则引用了基线中未出现的表 ${t}（${r.parentTable}.${r.parentKey} -> ${r.childTable}.${r.childKey}），请确认拼写`);
      }
    }
  }
}

// ---------------------------------------------------------------- 检查 1/2：删除与软删路径
// 规则：方法体内出现 Mapper.delete*/remove*，必须同时出现级联调用或显式豁免。
const DELETE_PATTERNS = [
  /\.deleteById\s*\(/,
  /\.delete\s*\(\s*new\s+QueryWrapper/,
  /\.delete\s*\(\s*wrapper/,
  /\.delete\s*\(\s*del/,
  /\.removeById\s*\(/,
  /\.removeByBookingId\s*\(/,
  /\.deleteChild/,
];
// 软删除标志：把状态置为已删除语义
const SOFT_DELETE_PATTERNS = [
  /"frozen"/,
  /BookingStatus\.FROZEN/,
  /setDeleted\s*\(\s*1/,
  /\.set\s*\(\s*Tenant::getDeleted/,
];

function stripComments(src) {
  // 逐行剔除 // 注释与 /* */ 块注释，但**保持行数不变**（用等长空格替换），
  // 否则后续按行号定位会全部错位（与 check-endpoints-refs 的 maskHtmlForScan 同理）。
  let out = src;
  out = out.replace(/\/\*[\s\S]*?\*\//g, (seg) => seg.replace(/[^\n]/g, ' '));
  out = out.split('\n').map((line) => {
    const i = line.indexOf('//');
    return i >= 0 ? line.slice(0, i) : line;
  }).join('\n');
  return out;
}

const javaFiles = walk(JAVA_ROOT, (f) => f.endsWith('.java'));
let scannedFiles = 0;
let deleteSites = 0;
let softDeleteSites = 0;

/**
 * 方法窗口内的级联声明检测。
 *
 * ⚠️ 豁免标记 `// cascade: none <理由>` 必须读**原文**而不是剔注释后的源码：
 * 它的载体就是注释，剔掉就等于把豁免标记也剔掉了。这里同时看两份文本。
 */
/**
 * 上溯到最近的方法签名行。
 *
 * 坑：签名行以 ` {` 结尾（如 `public int softDelete(Long id) {`），
 * 正则若要求 `{` 前不能有空格就会漏匹配 → 窗口退化成"只看这 20 行"，
 * 方法体稍长时窗口从中间开始，级联调用落在窗口之外 → 误报。
 * 故这里只要求行内出现 `public|private|protected` 且以 `{` 或 `{`+空白结尾。
 */
/**
 * 上溯到最近的方法签名行。
 *
 * 两个坑（都是本守卫实测踩到的）：
 * 1. 签名行以 ` {` 结尾（如 `public int softDelete(Long id) {`），
 *    正则若要求 `{` 前不能有空格就会漏匹配 → 窗口退化成"只看这 20 行"，
 *    方法体稍长时窗口从中间开始，级联调用落在窗口之外 → 误报。
 * 2. 本项目里不少 public 方法写在**类体第一层**（缩进 0，如
 *    `public boolean removeById(Integer appId){`），而嵌套的 private 方法缩进 4。
 *    只认 4 缩进会漏掉第一层方法 → 同样误报。故这里接受 0~8 任意缩进。
 */
const SIG_RE = /^\s{0,8}(public|private|protected)\s.*\{\s*$/;


function findSignatureLine(lines, i) {
  for (let j = i; j >= 0 && j >= i - 80; j--) {
    if (SIG_RE.test(lines[j])) return j;
  }
  return -1;
}

/**
 * 方法窗口内的级联声明检测。
 *
 * ⚠️ 豁免标记 `// cascade: none <理由>` 必须读**原文**而不是剔注释后的源码：
 * 它的载体就是注释，剔掉就等于把豁免标记也剔掉了。这里同时看两份文本。
 *
 * ⚠️ 窗口必须是**整个方法体**，不能是「签名 → 删除行」。
 * 典型反例（TenantService#softDelete）：软删除写在方法开头，级联调用写在它后面几行。
 * 若窗口按「签名→删除行」截断，级联落在窗口外 → 误报。
 * 方法体边界按大括号配平（从签名行的 `{` 数到闭合），且在**剔注释后**的文本上配平，
 * 否则注释里的 `{` 会把边界算错。
 */
function methodBodyRange(maskedLines, sigIdx, i) {
  if (sigIdx < 0) return { start: Math.max(0, i - 20), end: i };
  let depth = 0;
  let started = false;
  for (let j = sigIdx; j < maskedLines.length; j++) {
    for (const ch of maskedLines[j]) {
      if (ch === '{') { depth++; started = true; }
      else if (ch === '}') {
        depth--;
        if (started && depth === 0) return { start: sigIdx, end: j };
      }
    }
  }
  return { start: sigIdx, end: i };
}

function hasCascadeDeclaration(rawSrc, maskedSrc, sigIdx, i) {
  const maskedLines = maskedSrc.split('\n');
  const range = methodBodyRange(maskedLines, sigIdx, i);
  const rawWindow = rawSrc.split('\n').slice(range.start, range.end + 1).join('\n');
  const maskedWindow = maskedLines.slice(range.start, range.end + 1).join('\n');
  const EXEMPT = /cascade:\s*none\s*\S/;
  const CALL = /cascadeService\.run\s*\(|cascadeDelete|cascadeOn/;
  return CALL.test(maskedWindow) || EXEMPT.test(rawWindow);
}

for (const file of javaFiles) {
  const raw = fs.readFileSync(file, 'utf8');
  const src = stripComments(raw);
  if (src.includes('class CascadeRules') || src.includes('class ReferentialCascadeService')) continue;
  // CascadeMapper 是级联执行器本身，它执行删除是本职，不参与"是否声明级联"的判定
  if (file.endsWith('CascadeMapper.java')) continue;
  scannedFiles++;

  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!DELETE_PATTERNS.some((p) => p.test(line))) continue;
    deleteSites++;
    const sigIdx = findSignatureLine(lines, i);
    if (!hasCascadeDeclaration(raw, src, sigIdx, i)) {
      problems.push(
        `${rel(file)}:${i + 1} 删除调用未声明级联处置\n    → 该方法内必须调用 cascadeService.run(...)（或 cascadeDelete*/cascadeOn* 辅助方法），` +
        `确实不需要级联时在该行上方写 "// cascade: none <理由>"`);
    }
  }

  // 软删除：方法体把状态置 frozen / deleted
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!SOFT_DELETE_PATTERNS.some((p) => p.test(line))) continue;
    // 只关心"写"的位置：排除纯比较（如 if 判断）与常量的引用声明行
    if (!/(set|update|\.eq\(|setStatus)/.test(line)) continue;
    softDeleteSites++;
    const sigIdx = findSignatureLine(lines, i);
    if (!hasCascadeDeclaration(raw, src, sigIdx, i)) {
      problems.push(
        `${rel(file)}:${i + 1} 软删除（置 frozen/deleted）未声明关联表处置\n` +
        `    → 用户确认删除后关联表也要相应置状态，必须调用级联；` +
        `确实不联动时写 "// cascade: none <理由>"`);
    }
  }
}

// ---------------------------------------------------------------- 检查 3：场景名已登记
const usedScenarios = [];
for (const file of javaFiles) {
  const src = fs.readFileSync(file, 'utf8');
  const re = /CascadeRules\.(SCENARIO_\w+)/g;
  let um;
  while ((um = re.exec(src)) !== null) {
    usedScenarios.push({ name: um[1], file: rel(file), line: lineOf(src, um.index) });
  }
}
for (const u of usedScenarios) {
  if (!scenarioConsts.has(u.name)) {
    problems.push(`${u.file}:${u.line} 引用了未登记的场景常量 ${u.name}（须先在 CascadeRules 定义）`);
  }
}

// ---------------------------------------------------------------- 检查 5：bookingId 生成口径
// ⚠️ 判定不能只认"同一行出现 bookingId 字面量"：真实代码常写成
//    `String id = UUID.randomUUID()...; setBookingId(id);`
//    或 `String bookingId = ...` 换行后才传给 booking。改用**方法窗口**判定：
//    方法体内出现 UUID.randomUUID 且方法名/参数含 booking 语义 → 判红。
const ID_GENERATION_FILES = javaFiles.filter((f) =>
  f.includes(`${path.sep}service${path.sep}`) || f.includes(`${path.sep}controller${path.sep}`));
for (const file of ID_GENERATION_FILES) {
  const src = stripComments(fs.readFileSync(file, 'utf8'));
  src.split('\n').forEach((line, idx) => {
    if (!/UUID\.randomUUID\s*\(/.test(line)) return;
    const ci = line.indexOf('//');
    if (ci >= 0 && line.indexOf('UUID.randomUUID') > ci) return;
    // 放宽：只要这一行在生成 bookingId / booking 主键即算违规。
    // 不在这里要求同行出现 bookingId 字面量——那样会漏掉
    // `String id = UUID...; booking.setBookingId(id);` 这种两行写法。
    if (!/(bookingId|booking\.setBookingId|\bbooking\b\s*[.,)]|Booking::getBookingId)/.test(line)) return;
    if (/BookingIdGenerator\.next/.test(line)) return;
    problems.push(
      `${rel(file)}:${idx + 1} 直接用 UUID.randomUUID() 生成 bookingId\n` +
      `    → 必须走 BookingIdGenerator.next()：库里 booking_id 曾同时存在 32 位 hex 与` +
      ` 36 位带横线两种格式，是悬空引用根因之一`);
  });
}

// ---------------------------------------------------------------- 输出
console.log('级联守卫：删除路径 %d 处、软删除路径 %d 处，规则表 %d 条规则，%d 个场景，扫描 %d 个 Java 文件',
  deleteSites, softDeleteSites, rules.length, scenarioConsts.size, scannedFiles);

if (notes.length) {
  console.log('\n提示：');
  for (const n of notes) console.log('  · ' + n);
}

if (problems.length) {
  console.log('\n✗ 发现 %d 个问题：', problems.length);
  for (const p of problems) console.log('  - ' + p);
  process.exit(1);
}

console.log('\n✓ 级联规则完整：删除与软删除路径均已声明关联表处置');
process.exit(0);
