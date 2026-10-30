#!/usr/bin/env node
/**
 * 管理员自锁防护守卫
 * ==================
 * 背景（2026-10-24 建立）：
 *
 * 角色准入判据 `applyRoleAdmission` 刻意**只计数 role、不看 status**：
 * 一旦改成"只数 active"，一个被禁用的管理员会让"本租户/全平台尚无管理员"重新成立，
 * 任何知道租户码的人都能自助注册把那个位置顶掉，"禁用"就变成"可抢座"。
 *
 * 这个取舍的代价是：某租户（或平台）的管理员一旦**全部**变成非 active，
 * 自助注册通道就永远只能产出 pending —— 系统只剩改库一条救路。
 * 于是配套在写入侧加了 `UserService.assertNoAdminSelfLock`：管理员不得修改自己的状态。
 * **两者必须成对存在**，删任一半都会留下缺口：
 *   · 删掉"只计数不看状态" → 禁用变可抢座；
 *   · 删掉"自锁防护"     → 最后一个管理员可以一键把自己锁死。
 *
 * 这些退化都**不编译失败、不运行报错**：前者是语义漂移（SQL 加个条件而已），
 * 后者表现为"某个按钮点了返回 400 或干脆没生效"，只有真的去点才看得见。
 * 所以用构建期守卫钉住。
 *
 * 校验五组：
 *   A. assertNoAdminSelfLock 存在，且方法体含「自己」判定 + 「active 放行」+ BusinessException 拒绝
 *   B. updateStatus 与 updateUserInfo **两个**改状态入口的方法体里都调用了它
 *      （只堵一个等于留侧门：前端编辑弹窗的"状态"下拉走的是 updateInfo）
 *   C. 控制器的两个端点，操作者身份来自 permissionCheck.getUserIdFromToken(token)，
 *      而不是请求体里的 user.getUserId()（后者是"被改谁"，混淆即绕过）
 *   D. 两条计数 SQL 不得出现 status（钉住"只计数不看状态"这个决策）
 *   E. applyRoleAdmission 的 admin / platform_admin 两条判据仍在（防合并成一种）
 *
 * 跳过：SKIP_ADMIN_SELF_LOCK=1
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const F_USER_SERVICE = 'api/src/main/java/com/reservation/service/UserService.java';
const F_USER_CONTROLLER = 'api/src/main/java/com/reservation/controller/UserController.java';
const F_USER_MAPPER = 'api/src/main/java/com/reservation/mapper/UserMapper.java';

const problems = [];
const notes = [];

if (process.env.SKIP_ADMIN_SELF_LOCK === '1') {
  console.log('[admin-self-lock] SKIP_ADMIN_SELF_LOCK=1，跳过管理员自锁防护守卫');
  process.exit(0);
}

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    problems.push(`${rel}：文件不存在。`);
    return null;
  }
  return fs.readFileSync(abs, 'utf8');
}

/**
 * 剥离 Java 注释（保留行结构，避免行号错位）。
 * 必须剥离：本仓大量注释里写着"assertNoAdminSelfLock""status"等字样，
 * 不剥会让判据命中注释而误报绿。
 */
function stripComments(src) {
  // 块注释：把内容替换为等量空行，保住行号
  let out = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  // 行注释：整行注释直接清空（保护 http:// 之类的场景，只处理行首 //）
  out = out
    .split(/\r?\n/)
    .map((l) => (/^\s*\/\//.test(l) ? '' : l))
    .join('\n');
  return out;
}

/**
 * 按"签名正则"定位方法并返回其 {@code {...}} 方法体（含花括号内部）。
 *
 * 用花括号配对而不是"缩进 + 空行"启发式：本仓踩过
 * 「方法体内同为 4 空格的 if 块把正则提前截断」的坑（见 tests/check_actuator_guard.js 头部说明）。
 * 配对前先把字符串字面量清掉，否则 "}" 出现在字符串里会把配对带偏。
 */
function methodBody(src, signatureRe) {
  const m = signatureRe.exec(src);
  if (!m) return null;
  const start = m.index + m[0].length;
  const open = src.indexOf('{', start);
  if (open < 0) return null;
  let depth = 0;
  let inStr = null;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (ch === '\\') { i++; continue; }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'") { inStr = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  return null;
}

const svcRaw = read(F_USER_SERVICE);
const ctlRaw = read(F_USER_CONTROLLER);
const mapRaw = read(F_USER_MAPPER);

if (svcRaw !== null) {
  const svc = stripComments(svcRaw);

  // ---------- A. 防护方法本体 ----------
  const lockBody = methodBody(
    svc,
    /private\s+void\s+assertNoAdminSelfLock\s*\(\s*String\s+callerId\s*,\s*String\s+callerRole\s*,\s*String\s+targetUserId\s*,\s*String\s+targetStatus\s*\)\s*/,
  );
  if (lockBody === null) {
    problems.push(
      'A1 UserService 里找不到 assertNoAdminSelfLock(String callerId, String callerRole, String targetUserId, String targetStatus)。\n' +
      '     它是"最后一个管理员一键自锁"的唯一拦截点，被删掉后 applyRoleAdmission 的"只计数不看状态"就变成了单向死路。',
    );
  } else {
    if (!/callerId\s*\.\s*equals\s*\(\s*targetUserId/.test(lockBody)) {
      problems.push('A2 assertNoAdminSelfLock 缺少「是否改的是自己」的判定（callerId.equals(targetUserId)）。判定缺失等于对所有被改用户都放行。');
    }
    if (!/"active"\s*\.\s*equals\s*\(\s*targetStatus/.test(lockBody)) {
      problems.push('A3 assertNoAdminSelfLock 缺少「目标为 active 则放行」的白名单分支。改成黑名单（只拦 pending/frozen）时 status=inactive 可绕过。');
    }
    if (!/throw\s+new\s+BusinessException\s*\(/.test(lockBody)) {
      problems.push('A4 assertNoAdminSelfLock 没有抛 BusinessException —— 判定完不拒绝等于什么都没做。');
    }
    if (!/ADMIN\s*\.\s*equals\s*\(\s*callerRole\s*\)/.test(lockBody)
        || !/PLATFORM_ADMIN\s*\.\s*equals\s*\(\s*callerRole\s*\)/.test(lockBody)) {
      problems.push('A5 assertNoAdminSelfLock 只判了 admin 或 platform_admin 其中一种角色 —— 平台管理员同样能把自己锁死。');
    }
  }

  // ---------- B. 两个改状态入口都必须调用 ----------
  const updStatusBody = methodBody(
    svc,
    /public\s+int\s+updateStatus\s*\(\s*User\s+user\s*,\s*String\s+callerId\s*,\s*String\s+callerRole\s*\)\s*/,
  );
  if (updStatusBody === null) {
    problems.push('B1 UserService.updateStatus(User, String, String) 不存在或其签名的 callerId/callerRole 入参被去掉 —— 没有操作者身份就无法做自锁判定。');
  } else if (!/assertNoAdminSelfLock\s*\(/.test(updStatusBody)) {
    problems.push('B2 updateStatus 方法体内没有调用 assertNoAdminSelfLock —— /user/updateStatus 这条路径可以自锁。');
  }

  const updInfoBody = methodBody(
    svc,
    /public\s+int\s+updateUserInfo\s*\(\s*User\s+user\s*,\s*String\s+callerId\s*,\s*String\s+callerRole\s*\)\s*/,
  );
  if (updInfoBody === null) {
    problems.push('B3 UserService.updateUserInfo(User, String, String) 不存在或其签名的 callerId/callerRole 入参被去掉。');
  } else if (!/assertNoAdminSelfLock\s*\(/.test(updInfoBody)) {
    problems.push(
      'B4 updateUserInfo 方法体内没有调用 assertNoAdminSelfLock ——\n' +
      '     /user/updateInfo 是**第二条**改状态的路径（前端编辑弹窗的"状态"下拉走它，会把 status 透传给 mapper）。\n' +
      '     只堵 updateStatus 等于留了一个侧门。',
    );
  }

  // ---------- E. 角色准入的两条判据 ----------
  const admissionBody = methodBody(
    svc,
    /private\s+Result\s*<\s*Object\s*>\s+applyRoleAdmission\s*\(\s*User\s+user\s*,\s*Long\s+regTenantId\s*,\s*boolean\s+approvedByAdmin\s*\)\s*/,
  );
  if (admissionBody === null) {
    problems.push('E1 找不到 applyRoleAdmission(User, Long, boolean)。');
  } else {
    if (!/countByRoleGlobalForUpdate\s*\(/.test(admissionBody)) {
      problems.push('E2 applyRoleAdmission 不再用 countByRoleGlobalForUpdate 判定 platform_admin —— 平台管理员"全局唯一不可再生"的前提消失了。');
    }
    if (!/countByTenantAndRoleForUpdate\s*\(/.test(admissionBody)) {
      problems.push('E3 applyRoleAdmission 不再用 countByTenantAndRoleForUpdate 判定租户 admin —— 若并入全局判定，租户 B 会因为"租户 A 已有 admin"而永远拿不到自己的管理员。');
    }
    if (!/regTenantId\s*>\s*0/.test(admissionBody)) {
      problems.push('E4 applyRoleAdmission 里 admin 判定缺少 regTenantId > 0 的守卫 —— tenantId 为 0/空时会把"平台范围"误当成"本租户"。');
    }
  }
}

if (ctlRaw !== null) {
  const ctl = stripComments(ctlRaw);

  // ---------- C. 控制器：身份必须取自 Token ----------
  const ctlStatus = methodBody(
    ctl,
    /public\s+Result\s*<\s*Object\s*>\s+updateStatus\s*\(\s*@RequestBody\s+User\s+user\s*,\s*@RequestHeader\s*\(\s*"Authorization"\s*\)\s*String\s+token\s*\)\s*/,
  );
  if (ctlStatus === null) {
    problems.push('C1 UserController.updateStatus 的签名变了（不再是 @RequestBody User + @RequestHeader("Authorization") String）。守卫需同步。');
  } else {
    if (!/userService\s*\.\s*updateStatus\s*\(\s*user\s*,\s*permissionCheck\s*\.\s*getUserIdFromToken\s*\(\s*token\s*\)/.test(ctlStatus)) {
      problems.push(
        'C2 updateStatus 没有把 permissionCheck.getUserIdFromToken(token) 作为操作者身份传给 Service。\n' +
        '     若改成从请求体取（user.getUserId()），"被改谁"和"操作者"就混为一谈，自锁防护形同虚设。',
      );
    }
    if (/userService\s*\.\s*updateStatus\s*\(\s*user\s*,\s*user\s*\.\s*getUserId\s*\(/.test(ctlStatus)) {
      problems.push('C3 updateStatus 用请求体的 user.getUserId() 当操作者身份 —— 攻击者只要改请求体就能绕过自锁判定。');
    }
  }

  const ctlInfo = methodBody(
    ctl,
    /public\s+Result\s*<\s*Object\s*>\s+updateInfo\s*\(\s*@RequestBody\s+User\s+user\s*,\s*@RequestHeader\s*\(\s*"Authorization"\s*\)\s*String\s+token\s*\)\s*/,
  );
  if (ctlInfo === null) {
    problems.push('C4 UserController.updateInfo 的签名变了。守卫需同步。');
  } else {
    if (!/userService\s*\.\s*updateUserInfo\s*\(\s*user\s*,\s*permissionCheck\s*\.\s*getUserIdFromToken\s*\(\s*token\s*\)/.test(ctlInfo)) {
      problems.push('C5 updateInfo 没有把 permissionCheck.getUserIdFromToken(token) 作为操作者身份传给 Service。');
    }
    if (/userService\s*\.\s*updateUserInfo\s*\(\s*user\s*,\s*user\s*\.\s*getUserId\s*\(/.test(ctlInfo)) {
      problems.push('C6 updateInfo 用请求体的 user.getUserId() 当操作者身份。');
    }
  }
}

if (mapRaw !== null) {
  const map = stripComments(mapRaw);

  // ---------- D. 计数 SQL 不得看 status ----------
  for (const name of ['countByTenantAndRoleForUpdate', 'countByRoleGlobalForUpdate']) {
    // 抓 @Select("...") 注解里的 SQL 文本。
    // ⚠️ 不能用 [^)]* 抓参数字面量：SQL 里的 COUNT(*) 自带右括号，会把捕获提前截断，
    //    结果是"永远取不到 SQL" → 守卫恒红（本守卫第一版就栽在这里，由反向测试 ①基线 抓出）。
    //    改为按双引号定界：@Select 的 SQL 是不含内嵌双引号的单个字面量。
    const re = new RegExp('@Select\\s*\\(\\s*"([^"]*)"\\s*\\)\\s*(?:\\r?\\n\\s*)*int\\s+' + name + '\\s*\\(');
    const m = re.exec(map);
    if (!m) {
      problems.push(`D1 UserMapper.${name} 的 @Select 注解找不到了（方法可能被改成 XML 实现）。若确属重构，请同步本守卫。`);
      continue;
    }
    const sql = m[1];
    if (/\bstatus\b/i.test(sql)) {
      problems.push(
        `D2 UserMapper.${name} 的计数 SQL 里出现了 status 条件：${sql.trim()}\n` +
        '     ★ 这是刻意不写的 —— 若只数 active，一个被禁用的管理员会让"尚无管理员"重新成立，\n' +
        '       任何拿到租户码的人都能自助注册顶替他的位置，"禁用"就变成"可抢座"。\n' +
        '       若确实要改语义，必须先想清楚"最后一个管理员被禁用后如何恢复"，不能只改 SQL。',
      );
    }
    if (!/tenant_id|COUNT\(\*\)/i.test(sql)) {
      notes.push(`D3 ${name} 的 SQL 形如 ${sql.trim()}（未含 tenant_id，全系统口径）。`);
    }
  }
}

// ---------- 输出 ----------
if (problems.length === 0) {
  console.log('[admin-self-lock] 通过：自锁防护在位，两个改状态入口均已收口，计数 SQL 未掺 status。');
  for (const n of notes) console.log('[admin-self-lock] 提示：' + n);
  process.exit(0);
}

console.error('[admin-self-lock] 管理员自锁防护不完整，拒绝提交：\n');
for (const p of problems) console.error('  ✗ ' + p + '\n');
console.error('说明：applyRoleAdmission 的"只计数 role、不看 status"与 assertNoAdminSelfLock 必须成对存在。');
console.error('     删任一半都会留下缺口：前者防"禁用变可抢座"，后者防"最后一个管理员一键自锁"。');
console.error('     紧急跳过：SKIP_ADMIN_SELF_LOCK=1 git commit ...');
process.exit(1);
