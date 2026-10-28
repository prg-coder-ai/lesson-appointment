#!/usr/bin/env node
/**
 * 声明式授权守卫（第 2 批 · 配套）
 *
 * 为什么需要它：AuthzRules 是"人工枚举"的。枚举必然有遗漏风险，而遗漏在
 * .anyRequest().authenticated() 兜底下是**静默放行**（不是报错），这正是
 * 根因 A 的本质。所以必须有工具把"漏声明"变成"构建失败"。
 *
 * 四条检查：
 *   1. 覆盖完整性：解析所有 Controller 的 @RequestMapping/@*Mapping，与 AuthzRules.RULES
 *      比对，列出既不在 RULES、也不在 permitAll 白名单里的端点 → 判红。
 *   2. 陈旧规则：RULES 里有、但 Controller 里已不存在的端点（改名/删除后忘了删规则）
 *      → 判红。否则规则表会越长越脏，最终没人信它。
 *   3. 角色合法性：RULES 里出现 RoleConst 之外的字面量角色 → 判红。
 *   4. 第四同步点（2026-10-13 新增）：permitAll 只解决"进得来"（SecurityConfig 与
 *      JwtFilter 两处），TenantInterceptor 的 excludePathPatterns 是并列的第四处——
 *      漏配的症状是请求穿过前两层后被拦截器以「无 Authorization 头」为由 401，
 *      公开端点整体失效且只在运行时暴露（wechat-register 与 promo 四端点两次踩中）。
 *      本检查断言：PERMIT_ALL 里每个真实存在的端点，两种路径形态都必须在
 *      WebMvcConfig.EXCLUDE_PATTERNS 中。
 *
 * 排除范围（重要，避免误报）：
 *   - message-service 的前缀（/api/v1/message、/sensitive、/sse、/users/）：
 *     由 Nginx/dev-proxy 分流到 8090，根本不到 booking-api，声明了也永不生效。
 *   - 注释掉的映射（如 AppointmentController#addBatch、authController#password/forgot）：
 *     正则会扫到注释行，故按行剔除注释后再解析。
 *
 * 用法：node tools/check-authz-declarative.mjs
 * 退出码：0 = 全绿；1 = 有漏配/陈旧/非法（须修）
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CTRL_DIR = path.join(ROOT, 'api/src/main/java/com/reservation/controller');
const RULES_FILE = path.join(ROOT, 'api/src/main/java/com/reservation/config/AuthzRules.java');

// 与 Nginx(booking.conf / booking-ip.conf) 及 dev-proxy.js 的分流保持一致：
// 这些前缀走 message-service:8090，压根不进 booking-api。
const MSG_SERVICE_PREFIXES = ['/api/v1/message', '/api/v1/sensitive', '/api/v1/sse', '/api/v1/users/'];

const VALID_ROLES = new Set(['student', 'teacher', 'admin', 'platform_admin']);

const problems = [];
const notes = [];

// ---------------------------------------------------------------- 1. 解析 AuthzRules
if (!fs.existsSync(RULES_FILE)) {
  console.error('✗ 找不到 ' + RULES_FILE);
  process.exit(1);
}
const rulesSrc = fs.readFileSync(RULES_FILE, 'utf8');

// 抓 r.add(new Rule(HttpMethod.VERB, "path", ARRAY_CONST, "note"));
const ruleRe = /new\s+Rule\s*\(\s*HttpMethod\.(\w+)\s*,\s*"([^"]+)"\s*,\s*([A-Za-z0-9_]+)\s*,/g;
const rules = [];
let m;
while ((m = ruleRe.exec(rulesSrc)) !== null) {
  rules.push({ verb: m[1].toUpperCase(), path: m[2], rolesConst: m[3], line: rulesSrc.slice(0, m.index).split('\n').length });
}

// 角色数组常量 -> 角色列表
// 注意：每项形如 `RoleConst.PLATFORM_ADMIN`，要整段剥掉 `RoleConst.` 前缀（含中间的空格），
// 只 replace 开头会留下 "PLATFORM_ADMIN" 与 ", RoleConst.ADMIN" 两种形态混在一起。
// 剥掉 `RoleConst.` 前缀后拿到的是**常量名**（全大写，如 PLATFORM_ADMIN），
// 而运行时值是小写（RoleConst.PLATFORM_ADMIN = "platform_admin"）。
// 这里统一小写化后再与 VALID_ROLES 比对，否则大小写不一致会把全部规则误判为非法角色。
const roleArrays = {};
const arrRe = /public static final String\[\]\s+(\w+)\s*=\s*\{([^}]*)\};/g;
while ((m = arrRe.exec(rulesSrc)) !== null) {
  roleArrays[m[1]] = m[2]
    .split(',')
    .map((s) => s.replace(/RoleConst\s*\.\s*/, '').trim().toLowerCase())
    .filter(Boolean);
}

for (const r of rules) {
  // 注意：空数组是 truthy，只判 `!roleArrays[name]` 抓不到"角色数组被清空"这种注入故障 ——
  // 而空角色会让所有引用它的路径无人可访问（Java 侧 applyDeclarativeAuthz 才抛异常，
  // 报错时机太晚）。这里必须显式判长度。
  if (!roleArrays[r.rolesConst] || roleArrays[r.rolesConst].length === 0) {
    problems.push(`规则 ${r.verb} ${r.path} 引用了未定义或为空的角色数组 ${r.rolesConst}（第 ${r.line} 行）—— 该路径将无人可访问`);
    r.roles = [];
    continue;
  }
  r.roles = roleArrays[r.rolesConst];
  const bad = r.roles.filter((x) => !VALID_ROLES.has(x));
  if (bad.length) {
    problems.push(`规则 ${r.verb} ${r.path} 含非法角色：${bad.join(',')}（第 ${r.line} 行）`);
  }
}

// 规则自身重复
const seen = new Map();
for (const r of rules) {
  const k = r.verb + ' ' + r.path;
  if (seen.has(k)) {
    problems.push(`规则重复声明：${k}（第 ${seen.get(k)} 行与第 ${r.line} 行）`);
  } else {
    seen.set(k, r.line);
  }
}

// ---------------------------------------------------------------- 2. 解析 Controller 端点
/** 去掉行注释与块注释，但保留行数（用等长空格替换，不过滤换行）。
 *  关键点（2026-10-15 修正）：必须跟踪双引号字符串字面量。否则路径里出现的
 *  "/file/星星" 形式（斜杠+星号+星号）会被误判为块注释起点，
 *  导致该行及之后内容被吞掉、端点漏扫。
 *  仅在非字符串、非注释态才识别注释符号；字符串内的注释符号一概按普通字符保留。 */
function maskComments(src) {
  let out = '';
  let inLine = false;
  let inBlock = false;
  let inString = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const c2 = src.substr(i, 2);
    if (inString) {
      out += c;
      // 遇未转义的双引号则结束字符串（转义 \" 不结束）
      if (c === '"' && (i === 0 || src[i - 1] !== '\\')) inString = false;
      continue;
    }
    if (inLine) {
      if (c === '\n') { inLine = false; out += c; } else { out += ' '; }
      continue;
    }
    if (inBlock) {
      if (c2 === '*/') { inBlock = false; out += '  '; i++; } else { out += c === '\n' ? '\n' : ' '; }
      continue;
    }
    if (c2 === '//') { inLine = true; out += '  '; i++; continue; }
    if (c2 === '/*') { inBlock = true; out += '  '; i++; continue; }
    if (c === '"') { inString = true; out += c; continue; }
    out += c;
  }
  return out;
}

const VERB = { GetMapping: 'GET', PostMapping: 'POST', PutMapping: 'PUT', DeleteMapping: 'DELETE', PatchMapping: 'PATCH' };

function firstQuoted(s) {
  const mm = s.match(/"([^"]+)"/);
  return mm ? mm[1] : '';
}

const endpoints = [];
for (const fn of fs.readdirSync(CTRL_DIR)) {
  if (!fn.endsWith('.java')) continue;
  const raw = fs.readFileSync(path.join(CTRL_DIR, fn), 'utf8');
  const src = maskComments(raw);

  // 类级 @RequestMapping
  let base = '';
  const clsIdx = src.indexOf('class ');
  if (clsIdx > 0) {
    const head = src.slice(0, clsIdx);
    const rm = [...head.matchAll(/@RequestMapping\s*\(([^)]*)\)/g)];
    if (rm.length) base = firstQuoted(rm[rm.length - 1][1]);
  }

  // 方法级映射（带方法名的 @XxxMapping，或裸 @RequestMapping）
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    let verb = null;
    let args = '';
    for (const [k, v] of Object.entries(VERB)) {
      const re = new RegExp('@' + k + '\\b');
      if (re.test(line)) { verb = v; args = line.slice(line.indexOf('@' + k)); break; }
    }
    if (!verb && /@RequestMapping\b/.test(line) && !/@RequestMapping\s*$/.test(line.trim())) {
      const rm = /@RequestMapping\s*\(([^)]*)\)/.exec(line);
      if (rm && /method\s*=/.test(rm[1])) {
        const mm = /RequestMethod\.(\w+)/.exec(rm[1]);
        if (mm) { verb = mm[1].toUpperCase(); args = rm[1]; }
      }
    }
    if (!verb) return;
    const sub = firstQuoted(args);
    const full = sub ? base + sub : base;
    if (!full || !full.startsWith('/')) return;
    if (full === '/api/v1') return; // ApiInfoController 类级前缀本身不是端点
    endpoints.push({ verb, path: full, file: fn, line: i + 1 });
  });
}

// 已知 permitAll（免认证，不需角色声明）
const PERMIT_ALL = [
  '/api/v1/system/info', '/api/v1/apiInfo', '/api/v1/term/map', '/api/v1/tenant/name',
  '/api/v1/auth/login', '/api/v1/auth/refreshToken', '/api/v1/auth/logout',
  '/api/v1/auth/wechat-login', '/api/v1/auth/wechat-register',
  // 微信 PC 扫码登录/绑定（2026-10-14 P2，三端点全免登录）：
  //   qr=生成一次性 state+二维码 URL（bind 场景方法体内校验 Bearer，userId 服务端解析）；
  //   qr/status=轮询（state 即一次性凭证）；pc-callback=微信 302 回调。
  // 四处白名单双形态已同步：SecurityConfig / JwtFilter / WebMvcConfig / 本清单。
  '/api/v1/auth/wechat/qr', '/api/v1/auth/wechat/qr/status', '/api/v1/auth/wechat/pc-callback',
  '/api/v1/user/register', '/api/v1/user/account/exist',
  '/api/v1/teacher/published/latest-public', '/api/v1/teacher/published/public-get',
  '/api/v1/teacher/published/public-list', '/api/v1/schedule/getAvailableSchedule',
  // 推广公开端点（2026-10-13 二期，与 SecurityConfig 白名单同步）：
  //   referral/validate 带 touch=1 时点击计数；register-tenant/register-user 是两条注册路径；
  //   tenant/validate-code 给路径2 表单渲染前校验租户编码。防刷在 PromoService 内，不依赖登录态。
  '/api/v1/promo/referral/validate', '/api/v1/promo/register-tenant', '/api/v1/promo/register-user',
  '/api/v1/tenant/validate-code',
  // 行业字典选项（2026-10-13 修订）：推广落地页「免费体验注册」的所属行业下拉，匿名读取。
  // 与需平台管理员登录的 /industry/list 分开，只暴露启用行业的 id/code/name。
  '/api/v1/industry/options',
  // 协议/隐私政策公开阅读端点（2026-10-14）：匿名读取当前生效版本，与 SecurityConfig/JwtFilter/EXCLUDE_PATTERNS 同步。
  '/api/v1/legal/doc',
  // 教师已上传图片公开伺服（2026-10-15）：匿名读取教师头像/证书，供发布页/编辑页展示。
  // 四处白名单双形态已同步：SecurityConfig / JwtFilter / WebMvcConfig / 本清单（GET /file/**）。
  '/api/v1/teacher/professional/file/**',
  // classroom-service 回调端点（HMAC 签名鉴权，不走 JWT）
  // 四处白名单同步：SecurityConfig / JwtFilter / WebMvcConfig / authz PERMIT_ALL
  // 前缀 classroom-callback 刻意避开前端课堂路由 /api/v1/classrooms/**（nginx → 8092）
  '/api/v1/classroom-callback/attendance',
  '/api/v1/classroom-callback/events',
  '/api/v1/classroom-callback/alerts',
  '/api/v1/classroom-callback/reconcile',
];
const isPermitAll = (p) => PERMIT_ALL.includes(p);

// 页面路由（返回 HTML 而非业务数据）。这些不是"API 端点"，按角色区分没有意义 ——
// 页面自身的准入由前端 guardEntryPage + 后端接口授权共同承担。
// 例：/booking 是公开分享页（SecurityConfig 已 permitAll）。
const PAGE_ROUTES = new Set(['/', '/favicon.ico', '/booking']);
const isPageRoute = (p) => PAGE_ROUTES.has(p);

// message-service 前缀：不归本守卫管
const isMsg = (p) => MSG_SERVICE_PREFIXES.some((x) => p === x || p.startsWith(x));

// ---------------------------------------------------------------- 3. 比对
const ruleKeys = new Set(rules.map((r) => r.verb + ' ' + r.path));
const epKeys = new Set();

let covered = 0;
const uncovered = [];
for (const e of endpoints) {
  if (isMsg(e.path) || isPageRoute(e.path)) continue;
  const k = e.verb + ' ' + e.path;
  epKeys.add(k);
  if (isPermitAll(e.path)) { covered++; continue; }
  if (ruleKeys.has(k)) { covered++; continue; }
  uncovered.push(e);
}
for (const e of uncovered) {
  problems.push(`未声明授权：${e.verb} ${e.path}  （${e.file}:${e.line}）—— 兜底 authenticated() 下会静默放行`);
}

const stale = rules.filter((r) => !epKeys.has(r.verb + ' ' + r.path));
for (const r of stale) {
  problems.push(`陈旧规则：${r.verb} ${r.path}  在 Controller 里已不存在（第 ${r.line} 行）—— 改名/删除后忘了同步规则表`);
}

// ---------------------------------------------------------------- 3.5 第四同步点：WebMvcConfig
// permitAll 只解决"进得来"（SecurityConfig + JwtFilter 两处）。
// TenantInterceptor 的 excludePathPatterns 是**第四处**同步点：漏配的症状是请求穿过
// 前两层后，被拦截器以「无 Authorization 头」为由 401 —— 公开端点整体失效，且只在
// 运行时暴露（2026-10-13 实测：wechat-register 与 promo 四个公开端点两次踩中）。
// 本段断言：PERMIT_ALL 里每个**真实存在**的端点，其两种路径形态（/api/v1 前缀与裸路径，
// 与 SecurityConfig 的双写惯例一致）都必须出现在 WebMvcConfig.EXCLUDE_PATTERNS 中。
const WEBMVC_FILE = path.join(ROOT, 'api/src/main/java/com/reservation/config/WebMvcConfig.java');
if (!fs.existsSync(WEBMVC_FILE)) {
  problems.push(`找不到 ${WEBMVC_FILE} —— 第四同步点（TenantInterceptor 排除表）校验无法执行`);
} else {
  const mvcSrc = fs.readFileSync(WEBMVC_FILE, 'utf8');
  // EXCLUDE_PATTERNS 是字符串数组，抓所有字面量即为放行清单
  const excluded = new Set([...mvcSrc.matchAll(/"([^"]+)"/g)].map((x) => x[1]));
  let checkedPublic = 0;
  for (const p of PERMIT_ALL) {
    // 只校验真实存在的端点：PERMIT_ALL 里可能有防御性冗余路径（无 Controller 映射），
    // 对它们要求出现在排除表里会误报。
    const real = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].some((v) => epKeys.has(v + ' ' + p));
    if (!real) continue;
    checkedPublic++;
    const bare = p.replace(/^\/api\/v1/, '');
    for (const form of new Set([p, bare])) {
      if (!excluded.has(form)) {
        problems.push(`公开端点未排除租户拦截：${form} 不在 WebMvcConfig.EXCLUDE_PATTERNS —— TenantInterceptor 将以其无登录态为由 401（第四同步点漏配）`);
      }
    }
  }
  // 自检：这条检查必须真的核对到了东西，否则正则/路径改坏会静默假绿
  if (checkedPublic === 0) {
    problems.push('第四同步点自检失败：PERMIT_ALL 中没有任何路径匹配到真实端点，解析逻辑可能已失效');
  }
  console.log('第四同步点（WebMvcConfig 排除表）：已核对 %d 个公开端点', checkedPublic);
}

// ---------------------------------------------------------------- 4. 输出
// 断言"真的检查到了东西"：正则一旦改坏（如 maskComments 全吞掉内容）会静默变成 0 端点、
// 0 问题、退出码 0 的假通过。历史教训见记忆条目「守卫必须断言实际检查数量」。
// 注意：这些自检放在**问题列表打印之后**执行 —— 否则"确实有漏配"这种正常判红
// 会被自检的差值断言（scanned !== covered）抢先以 exit 2 退出，掩盖真实问题清单。
const scanned = endpoints.filter((e) => !isMsg(e.path) && !isPageRoute(e.path)).length;
const msgSkipped = endpoints.filter((e) => isMsg(e.path)).length;
const pageSkipped = endpoints.filter((e) => isPageRoute(e.path)).length;

console.log('扫描 Controller 端点：%d 个', endpoints.length);
console.log('  纳入授权检查：%d 个（跳过 message-service 前缀 %d、页面路由 %d）', scanned, msgSkipped, pageSkipped);
console.log('AuthzRules 规则：%d 条', rules.length);
console.log('已覆盖（声明或 permitAll）：%d 个', covered);

if (problems.length > 0) {
  console.log('\n✗ 发现 %d 个问题：\n', problems.length);
  for (const p of problems) console.log('  · ' + p);
  console.log('');
  process.exit(1);
}

// 自检：解析层是否失效（此时预期覆盖 = 全部，无差值可查，只能查绝对量）
if (endpoints.length < 100) {
  console.error('\n✗ 端点扫描数异常（%d < 100）：解析逻辑可能已失效，拒绝给出"通过"结论。', endpoints.length);
  process.exit(2);
}
if (rules.length < 50) {
  console.error('\n✗ 规则数异常（%d < 50）：AuthzRules 解析逻辑可能已失效。', rules.length);
  process.exit(2);
}

console.log('\n✓ 全部端点均已声明授权角色，无陈旧规则。');
console.log('  下一步可把 SecurityConfig 的 anyRequest() 从 authenticated() 改为 denyAll()。');
process.exit(0);
