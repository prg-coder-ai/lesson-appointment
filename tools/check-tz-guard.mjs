#!/usr/bin/env node
/**
 * 课次 UTC 守卫（2026-10-08 课次时间 UTC 化改造配套）
 *
 * 背景见 doc-develop/课次时间UTC化改造方案.md。时间口径铁律：
 *   排期层 course_schedule = 本地墙钟时间 + time_zone（保持现状不动）
 *   课次层 appointment 起   = UTC（唯一真相源）
 *   展示                   = 用户时区
 *
 * 本次改造把"课次存 UTC"这件事做完了，但**它是极易退化的**：
 * 两种退化都不报错、只在用户看到错时间时才暴露 ——
 *   ① 有人图省事，把排期本地时间直接 set 进课次（回到改造前的状态）；
 *   ② 有人新写一个业务时间判定，用了裸 LocalDateTime.now()。
 * 靠 code review 抓不住：前者看起来完全正常，后者编译期毫无异常。
 *
 * 两条检查：
 *   1. 课次写入必须经过 UTC 转换：CourseScheduleService#generateAppointmentsForBooking
 *      内出现 setAppointmentDatetime / setLastDatetime，就必须同时出现
 *      scheduleLocalToUtc 调用（"生成课次那一刻转换"是唯一合法入口）。
 *   2. 业务时间判定禁用裸 now()：下列文件内出现 LocalDateTime.now() / LocalDate.now()
 *      即判红——服务器时区一变，提醒窗口与退改档位会整体错位。
 *      审计、监控、token 过期等与业务时区无关的场合用白名单豁免。
 *
 * 用法：node tools/check-tz-guard.mjs
 * 退出码：0 = 全绿；1 = 有退化（须修）
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const JAVA_ROOT = path.join(ROOT, 'api/src/main/java/com/reservation');
const JS_ROOT = path.join(ROOT, 'frontend/js');
const SHARED = path.join(ROOT, 'shared');

const problems = [];
const notes = [];

function readOrDie(p, label) {
  if (!fs.existsSync(p)) {
    problems.push(`找不到${label}：${path.relative(ROOT, p)}`);
    return null;
  }
  return fs.readFileSync(p, 'utf8');
}

/**
 * 剥掉行注释与块注释，**严格保持行数与列数不变**（逐字符一一对应替换）。
 *
 * ⚠️ 这是本守卫最容易出错的地方，踩了两次：
 *   ① for 循环步进在 continue 后仍会 i++，若不显式把 '\n' 写进 out，**整行凭空消失**
 *      （实测 537 行 → 507 行），报错行号整体偏移，把无关的
 *      `new ArrayList<>()` 报成 now() 误用 —— 而"误报"比"漏报"更让人不信任守卫。
 *   ② 块注释结束标记占掉两字符时若不补空格，列数会漂。
 *      —— 写这段注释时也有同一个坑：JSDoc 里若直接写出结束标记字面量，
 *         会把注释**提前闭合**，后面所有代码都被当成注释解析，报错信息
 *         指向的位置完全无关（本次即栽在这，排查花了几轮）。
 * 所以这里的实现是"逐字符扫描 + 严格等长替换 + 每条换行原样输出"。
 */
function stripComments(src) {
  let out = '';
  let inBlock = false;
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    const two = src.slice(i, i + 2);
    if (inBlock) {
      if (two === '*/') { out += '  '; inBlock = false; i += 2; continue; }
      out += (ch === '\n') ? '\n' : ' ';
      i++;
      continue;
    }
    if (two === '/*') { out += '  '; inBlock = true; i += 2; continue; }
    if (two === '//') {
      while (i < src.length && src[i] !== '\n') { out += ' '; i++; }
      continue;                       // 换行符留给下一轮按普通字符输出
    }
    out += ch;
    i++;
  }
  return out;
}

/**
 * 取某个**方法声明**的方法体（按花括号配平）。方法不存在返回空串。
 *
 * ⚠️ 三个坑，都是实测踩出来的：
 *   1) 不能只 indexOf 方法名 —— 本类内部另有调用点
 *      generateAppointmentsForBooking(bookingId, scheduleId)，
 *      改名后会匹配到调用点，再从其后找 '{' 拿到的是**上一个方法的方法体**，
 *      守卫对着不相干代码做检查却照样输出 "✓"，防护静默归零。
 *   2) 修饰符必须**强制出现**（形如 public boolean name( )）。允许纯空白作前缀时
 *      调用点仍会被匹配（实测换行 + 缩进 + 方法名 + 左括号 就能命中）。
 *   3) 传入的源码必须已剥注释，否则注释掉的 setter 仍会被判为"有写入"。
 */
function methodBody(src, signature) {
  const clean = stripComments(src);
  // 要求：可见性修饰符 + 返回类型 + 方法名 + 左括号。
  // 方法名里的正则元字符全部转义后再拼进正则
  // （signature 是本文件硬编码的方法名，不含 /，故用 / 收尾无需额外处理）。
  // ⚠️ 字符类里 '$' 与 '{' 必须转义，否则拼接后的正则会与字符串模板语法混淆；
  //    这里改用 String.raw 拼接，避免反斜杠在普通字符串里被二次解析。
  const escaped = signature.replace(/[-/\\^$*+?.()|[\]{}]/g, (ch) => '\\' + ch);
  const declRe = new RegExp(
    String.raw`\b(?:public|private|protected)\s+[A-Za-z_$][\w$<>,.\[\] ]*\s+${escaped}\s*\(`
  );
  const m = declRe.exec(clean);
  if (!m) return '';
  const open = clean.indexOf('{', m.index + m[0].length - 1);
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return clean.slice(open + 1, i);
    }
  }
  return '';
}

// ============================================================ 检查 1：课次写入必须过 UTC 转换
const courseSchedulePath = path.join(JAVA_ROOT, 'service/CourseScheduleService.java');
const courseScheduleSrc = readOrDie(courseSchedulePath, '排期服务');

if (courseScheduleSrc) {
  const sig = 'generateAppointmentsForBooking';
  const body = methodBody(courseScheduleSrc, sig);
  if (!body) {
    problems.push(
      `CourseScheduleService 里找不到 ${sig} 方法 —— 守卫无法校验课次写入路径。\n` +
      `    → 方法可能被改名/移走。请同步更新 tools/check-tz-guard.mjs 的检查 1（形状变了会静默失去防护）`);
  } else {
    // 两个时间字段都必须被赋值：last_datetime 缺了会让"改期前原值"丢失，
    // 将来做改期功能时无从还原（该字段目前尚无读取方，但语义上属课次时间的一部分）。
    const setMain = /setAppointmentDatetime\s*\(\s*utc\s*\)/.test(body);
    const setLast = /setLastDatetime\s*\(\s*utc\s*\)/.test(body);
    const converts = /scheduleLocalToUtc\s*\(/.test(body);
    if (!converts && (setMain || setLast)) {
      problems.push(
        `${path.relative(ROOT, courseSchedulePath)}#${sig}：写了课次时间但没经过 UTC 转换。\n` +
        `    → 排期本地时间直接落库会让课次时间随服务器时区/比较口径整体错位，\n` +
        `      且不报任何错。必须走 ScheduleGenerator.scheduleLocalToUtc(local, scheduleZone)`);
    } else if (converts && !setMain) {
      problems.push(
        `${path.relative(ROOT, courseSchedulePath)}#${sig}：调了 scheduleLocalToUtc 却没有 setAppointmentDatetime(utc) —— 转换结果没被使用。\n` +
        `    → 疑似改到一半，或把转换接到了错误的变量上。\n` +
        `      （判据刻意收紧为"必须把 utc 变量传进去"：写成 setAppointmentDatetime(scheduleLocal)\n` +
        `        那种"调了转换但没用结果"的写法也要拦住。）`);
    } else if (converts && !setLast) {
      problems.push(
        `${path.relative(ROOT, courseSchedulePath)}#${sig}：没有 setLastDatetime(utc)。\n` +
        `    → last_datetime 记录"改期前原课次时间"，缺失会让将来的改期功能无从还原。`);
    } else if (setMain && setLast && converts) {
      notes.push(`${path.relative(ROOT, courseSchedulePath)}#${sig}：课次写入已走 UTC 转换 ✓`);
    }
  }
}

// ============================================================ 检查 2：业务时间判定禁用裸 now()
/** 必须用 nowUtc() 的文件 → 理由。审计/监控类不在此列。 */
const TZ_SENSITIVE = [
  ['service/NotifyDispatchService.java', '上课提醒窗口（offsetMinutes 与课次时间比较）'],
  ['service/RefundRuleService.java', '退改档位（Duration.between(now, lessonTime)）'],
  ['controller/AppointmentController.java', '课次查询窗口（"近 N 天"边界）'],
  ['service/MessageNotifyService.java', '通知正文里的课次时间渲染'],
  ['service/NotifyRuleService.java', '通知试算的"应发时刻已过期"判定（与课次时间同源）'],
];

// 豁免：这些文件里的 now() 是审计/监控/会话性质，与业务时区无关
const ALLOW_NOW = [
  'service/MonitorService.java',
  'service/RefreshTokenService.java',
  'service/TenantService.java',
  'audit/AuditAspect.java',
  'service/ServiceInfoService.java',
  'service/DashboardService.java',   // 平台运营统计：租户创建/到期，与排期时区无关
  'service/TenantQuotaService.java',
  'entity/',
  'service/NotifyDispatchService.java', // 该文件内的幂等键/发送时间戳允许 now()，见下方精细判定
];

for (const [rel, why] of TZ_SENSITIVE) {
  const p = path.join(JAVA_ROOT, rel);
  const src = readOrDie(p, '业务服务');
  if (!src) continue;

  // 逐行扫**剥掉注释后**的文本：块注释里的 now() 只是说明，不能判红。
  // ⚠️ 自检：剥注释必须严格等长等行，否则行号会错位——而错位会产生**看似合理实则无关**的
  //    误报（比漏报更糟：让人不再相信守卫）。行数不一致时直接判红而不是硬扫。
  const clean = stripComments(src);
  const cleanLines = clean.split(/\r?\n/);
  const rawLines = src.split(/\r?\n/);
  if (cleanLines.length !== rawLines.length) {
    problems.push(
      `${path.relative(ROOT, p)}：剥注释后行数不一致（原文 ${rawLines.length} 行 → 剥离后 ${cleanLines.length} 行），\n` +
      `    行号会错位，检查 2 的报错不可信。这是守卫自身的 bug，须修 stripComments。`);
    continue;
  }
  const hits = [];
  cleanLines.forEach((line, i) => {
    if (!/LocalDateTime\.now\s*\(|LocalDate\.now\s*\(/.test(line)) return;

    // NotifyDispatchService 例外：幂等去重前缀与 sentAt 是审计戳，允许裸 now()
    const raw = (rawLines[i] || '').trim();
    const isAuditStamp =
      rel.includes('NotifyDispatchService') &&
      (raw.includes('DEDUP_STAMP') || raw.includes('setSentAt'));
    if (isAuditStamp) return;

    // NotifyRuleService 例外：preview() 里"明天此刻"是给管理员看的**假想输入框默认值**，
    // 取本地墙钟才符合"明天此刻"的直觉（换 nowUtc 会让默认值在某些时区差一天）。
    // 它不是对课次时间的比较，故不参与口径统一。注意判据必须挂到具体方法上：
    // 只按"变量名叫 preview"判断会随重构失效，只按"有 plusDays"又太宽。
    const isHypotheticalSeed =
      rel.includes('NotifyRuleService') && raw.includes('plusDays(1)');
    if (isHypotheticalSeed) return;

    hits.push({ line: i + 1, text: raw });
  });

  if (hits.length) {
    problems.push(
      `${path.relative(ROOT, p)}：${hits.length} 处业务时间判定用了裸 now()（${why}）。\n` +
      hits.map((h) => `      L${h.line}  ${h.text}`).join('\n') +
      `\n    → 课次时间是 UTC，now() 取的是服务器默认时区，两者不同源。\n` +
      `      服务器 TZ 一改，${why}会整体错位。改用 ScheduleGenerator.nowUtc()`);
  } else {
    notes.push(`${path.relative(ROOT, p)}：无裸 now()（${why}）✓`);
  }
}

// ============================================================ 检查 3：转换方法必须存在且被使用
const genPath = path.join(JAVA_ROOT, 'common/ScheduleGenerator.java');
const genSrc = readOrDie(genPath, '排期生成工具类');
if (genSrc) {
  for (const m of ['scheduleLocalToUtc', 'utcToUserZone', 'nowUtc']) {
    if (!new RegExp(`public static LocalDateTime ${m}\\s*\\(`).test(genSrc)) {
      problems.push(
        `ScheduleGenerator 缺少 public static LocalDateTime ${m}() —— 课次 UTC 化的三个入口之一。\n` +
        `    → 详见 doc-develop/课次时间UTC化改造方案.md 步骤 1`);
    }
  }
  // 死代码提醒：toUtc 若始终无人调用，说明转换没真正接线（v1.0 曾出现过）
  const callers = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const fp = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'target') walk(fp); }
      else if (e.name.endsWith('.java') && !fp.endsWith('ScheduleGenerator.java')) {
        if (fs.readFileSync(fp, 'utf8').includes('ScheduleGenerator.toUtc(')) callers.push(fp);
      }
    }
  };
  walk(JAVA_ROOT);
  if (!callers.length) {
    notes.push(
      'ScheduleGenerator.toUtc 仍无调用点（当前实现走 scheduleLocalToUtc）。\n' +
      '    · 保留无害：它是文档给出的等价实现；但若日后有人以为"调 toUtc 就能转"，\n' +
      '      那是错的——落库口径只认 scheduleLocalToUtc。');
  }
}

// ============================================================ 检查 4：前端时区渲染不得手算偏移
const dtPath = path.join(SHARED, 'domain/datetime.js');
const dtSrc = readOrDie(dtPath, '前端日期时间领域模块');
if (dtSrc) {
  if (!/export function utcToZoned\s*\(/.test(dtSrc)) {
    problems.push(
      'shared/domain/datetime.js 缺少 export function utcToZoned() —— 课次时间的统一渲染出口。\n' +
      '    → 各页面各写一遍转换必然漂移；改动后须重跑 gen-shared-bridge + sync-miniprogram-shared + build.js');
  }
  // 手算偏移（getTimezoneOffset 拼字符串）会漏掉夏令时，必须禁止
  if (/getTimezoneOffset/.test(dtSrc)) {
    problems.push(
      'shared/domain/datetime.js 里出现了 getTimezoneOffset 手算时区偏移。\n' +
      '    → 夏令时切换日会错 1 小时（如 America/Edmonton 每年 3 月/11 月各切一次）。\n' +
      '      必须用 Intl.DateTimeFormat 的 timeZone 选项。');
  }
  // CST 这类三字母缩写：Intl 认得且会静默按 UTC-6 处理，比抛错更危险。
  // ⚠️ 判据必须是**函数定义**（function isValidZone / isValidZone =），
  //    不能只 test('isValidZone') —— 调用点与注释里都含这个名字，
  //    改个名（如 isValidZone_tz）就绕过了，守卫会静默失去这项防护。
  if (/function\s+isValidZone\s*\(/.test(dtSrc) || /\bisValidZone\s*=/.test(dtSrc)) {
    notes.push('shared/domain/datetime.js 已有 isValidZone 校验（拦 CST/GMT+8 缩写）✓');
  } else {
    problems.push(
      'shared/domain/datetime.js 缺少 isValidZone 函数定义。\n' +
      '    → 实测 Intl **认得** 三字母缩写：utcToZoned(x, "CST") 不抛错，而是静默按 UTC-6 解析，\n' +
      '      用户看到的时间平白差 14 小时且无任何报错。判据见 datetime.js 内注释。');
  }
}

// ============================================================ 检查 5：通知/试算正文的时间必须带时区换算
// 退化形态：2026-10-08 UTC 化时只把候补递补那条路径接上了换算，
// 上课提醒（4 档 × 每分钟轮询的高频路径）与管理端试算仍是
// `lesson.format(TIME_FMT)` 裸 UTC —— 排期 21:00(Asia/Shanghai) 会显示成 13:00。
// 两种退化都不报错、只在用户看到错时间时才暴露，靠review 抓不住。
//
// 判据用**禁形清单**而不是"必须出现某个调用"：后者只能覆盖已知的正确写法，
// 换一种写法（如直接 .toString()）就静默失去防护；禁形是黑名单，
// 新增任何"把课次时间直接变成用户可见文本"的写法都会撞上。
{
  const CONVERTERS = /utcToZonedText|utcToUserZone|lessonTimeClause|render\.apply/;
  const TEXT_PATHS = [
    ['service/NotifyDispatchService.java', '上课提醒正文 / 管理端试算'],
    ['service/MessageNotifyService.java', '候补递补正文'],
    ['service/NotifyRuleService.java', '管理端试算的上课时间与应发时刻'],
  ];
  // 每条：[正则, 说明] —— 正则只匹配"把课次时间变成用户可见文本"的形态。
  // ⚠️ 两条坑（都是反向测试实测撞出来的，不是设想的）：
  //   ① getter 调用形态必须一并覆盖：`a.getAppointmentDatetime().toString()` 的
  //      接收者是 `getAppointmentDatetime()` 而不是标识符，只写 \w* 会漏掉它
  //      （⑤b曾因此判绿——输出全绿而防护为零）。
  //   ② **顺序即优先级**：命中即 return，排在后面的规则会被前面的**完全遮蔽**。
  //      `plan.setLessonTime(lesson.format(FMT))` 同时命中规则 1 与规则 3，
  //      规则 3 写在后面就成了死检查——跑不红的检查和没有检查长得一模一样。
  //      故更具体的（带方法名的）放前面。
  const FORBIDDEN = [
    [/\bset(?:LessonTime|ExpectTime)\s*\(\s*\w+\s*\.\s*format\s*\(/,
     '把课次时间未换算就写进试算 VO 的上课时间/应发时刻字段'],
    [/\b\w*(?:lesson|appointment)\w*\s*\.\s*format\s*\(\s*(?:TIME_FMT|FMT)\s*\)/i,
     '把课次时间直接 format 成文本（应经utcToZonedText）'],
    [/\b\w*(?:lesson|appointment)\w*\s*(?:\(\s*\))?\s*\.\s*toString\s*\(\s*\)/i,
     '把课次时间直接 toString（会得到裸 UTC 数字且无时区标注）'],
  ];

  for (const [rel, why] of TEXT_PATHS) {
    const p = path.join(JAVA_ROOT, rel);
    const src = readOrDie(p, '通知服务');
    if (!src) continue;
    const rawLines = src.split(/\r?\n/);
    const cleanLines = stripComments(src).split(/\r?\n/);
    if (cleanLines.length !== rawLines.length) {
      problems.push(
        `${path.relative(ROOT, p)}：剥注释后行数不一致，报错行号不可信。这是守卫自身的 bug。`);
      continue;
    }

    const hits = [];
    cleanLines.forEach((line, i) => {
      if (CONVERTERS.test(line)) return;      // 走了换算出口 → 合法
      for (const [re, desc] of FORBIDDEN) {
        if (re.test(line)) {
          hits.push({ line: i + 1, text: (rawLines[i] || '').trim(), desc });
          return;
        }
      }
    });

    if (hits.length) {
      problems.push(
        `${path.relative(ROOT, p)}：${hits.length} 处把课次时间（UTC）直接变成用户可见文本（${why}）。\n` +
        hits.map((h) => `      L${h.line}  ${h.text}\n            ↳ ${h.desc}`).join('\n') +
        `\n    → 课次是 UTC，直接输出会把 UTC 数字当成本地时间甩给用户。\n` +
        `      必须走 ScheduleGenerator.utcToZonedText(utc, 排期时区, fmt)（自带时区标注）。\n` +
        `      注：这条检查是 2026-10-09 补的——此前只有候补递补路径接了换算。`);
    } else {
      notes.push(`${path.relative(ROOT, p)}：课次时间文本已带时区换算（${why}）✓`);
    }
  }

  // 换算出口本身必须存在，且必须带时区标注能力。
  if (genSrc) {
    if (!/public static String utcToZonedText\s*\(/.test(genSrc)) {
      problems.push(
        'ScheduleGenerator 缺少 public static String utcToZonedText() —— 课次时间转可见文本的唯一出口。\n' +
        '    → 通知正文/试算都要用它把 UTC 转成排期时区并附时区标注。');
    }
    if (!/public static String zoneLabel\s*\(/.test(genSrc)) {
      problems.push(
        'ScheduleGenerator 缺少 public static String zoneLabel() —— 时区 id 转可读标签。\n' +
        '    → 正文里只写「21:00」而不标时区，跨时区排期时会被读者误读成本地时间。');
    }
  }
}

// ============================================================ 输出
console.log('课次 UTC 守卫：检查课次写入转换、业务 now() 口径、转换出口存在性、前端渲染方式\n');
if (notes.length) {
  console.log('提示：');
  for (const n of notes) console.log('  · ' + n);
  console.log('');
}

if (problems.length) {
  console.log('✗ 发现 %d 个问题：', problems.length);
  for (const p of problems) console.log('  - ' + p);
  process.exit(1);
}

console.log('✓ 课次时间口径统一：写入走 UTC 转换，判定走 nowUtc()，展示走 utcToZoned()');
process.exit(0);
