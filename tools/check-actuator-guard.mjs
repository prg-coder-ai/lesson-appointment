#!/usr/bin/env node
/**
 * Actuator 探针与放行守卫
 * ========================
 * 背景（2026-10-09 接入 Actuator 时建立）：
 *   项目此前没有任何健康检查端点。本次接入后引入两类**新的、且不会报错的退化**：
 *
 *   ① 暴露面扩大：management.endpoints.web.exposure.include 被改成
 *      health,info,env,beans,configprops,loggers 之类 → /actuator/env 会把
 *      配置里的密钥前缀、数据库地址打印给匿名访问者。**不报错，只是泄露。**
 *
 *   ② 探针 401：JWT 是自定义过滤器（JwtAuthenticationFilter），
 *      actuator/health 会经过它。放行必须**同时**改两处：
 *        · SecurityConfig的 requestMatchers(...).permitAll()
 *        · JwtAuthenticationFilter 的 WHITELIST_PATHS / WHITELIST_PREFIXES
 *      漏改任一处 → 探针返回 401 → LB 认为服务已死并摘掉全部流量。
 *      项目里 SecurityConfig 的注释早就写明"两处分处之地是既有隐患"。
 *
 * 因此本守卫校验四件事：
 *   A. exposure.include 严格等于 health,info（不多不少）
 *   B. env/beans/configprops/loggers/threaddump/heapdump 等端点被显式禁用
 *   C. SecurityConfig 放行了 /actuator/health（且**没有**放行 /actuator/** 通配）
 *   D. JwtAuthenticationFilter 的白名单里有 /actuator/health，且前缀匹配校验了分隔符
 *
 * 跳过：SKIP_ACTUATOR=1
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const problems = [];
const notes = [];

if (process.env.SKIP_ACTUATOR === '1') {
  console.log('[actuator] SKIP_ACTUATOR=1，跳过 Actuator 探针守卫');
  process.exit(0);
}

/** 只取配置行，剥离注释（避免注释里的示例值被当成真配置） */
function activeLines(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    problems.push(`${rel}：文件不存在。`);
    return null;
  }
  return fs
    .readFileSync(abs, 'utf8')
    .split(/\r?\n/)
    .map((l) => {
      const i = l.indexOf('#');
      return i >= 0 ? l.slice(0, i) : l;
    })
    .filter((l) => l.trim());
}

function prop(lines, key) {
  const re = new RegExp('^\\s*' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*=\\s*(.*)$');
  for (const l of lines) {
    const m = l.match(re);
    if (m) return m[1].trim();
  }
  return null;
}

// ============================================================ A + B：两个服务的 properties
const PROPS = [
  ['api/src/main/resources/application.properties', 'booking-api'],
  ['api/message-service/src/main/resources/application.properties', 'message-service'],
];

/** 明确不该开放的端点 —— 每一个都是信息泄露面 */
const FORBIDDEN_ENDPOINTS = [
  ['env', '打印全部配置（含 jwt.secret / crypto.aes-key 的值或前缀）'],
  ['beans', '暴露全部 Bean 与依赖结构，便于针对性攻击'],
  ['configprops', '同env，且带@ConfigurationProperties 绑定后的完整值'],
  ['loggers', '可读甚至（在旧版本可写）日志级别，能被用来关掉审计日志'],
  ['threaddump', '暴露全量线程栈，含内部类名/库版本/可能的连接串'],
  ['heapdump', '下载堆快照，等于把内存里所有数据（含密钥、用户手机号）拿走'],
  ['mappings', '暴露全部 URL 与处理方法，是完整的攻击面地图'],
  ['scheduledtasks', '暴露全部定时任务与 cron，可推断业务节律'],
  ['shutdown', '可远程关闭服务 —— 匿名可调用等于 anyone can DoS'],
];

for (const [rel, label] of PROPS) {
  const lines = activeLines(rel);
  if (!lines) continue;

  // --- A) exposure.include 必须严格是 health,info ---
  const include = prop(lines, 'management.endpoints.web.exposure.include');
  if (include === null) {
    problems.push(
      `${rel}（${label}）：缺少 management.endpoints.web.exposure.include。\n` +
      `    → 不配则用 Spring Boot 默认值（health），info 不可用；\n` +
      `      但更重要的是：一旦有人为排查加了 env 而守卫不在，就会泄露配置。\n` +
      `    → 修法：management.endpoints.web.exposure.include=health,info`
    );
  } else {
    const parts = include.split(',').map((s) => s.trim()).filter(Boolean);
    const set = new Set(parts);
    if (set.size !== parts.length) {
      problems.push(`${rel}：exposure.include 有重复项：${include}`);
    }
    const extra = parts.filter((p) => p !== 'health' && p !== 'info');
    if (extra.length) {
      problems.push(
        `${rel}：exposure.include 包含 health,info 之外的端点：${extra.join(', ')}\n` +
        `    → 本项目 Actuator 面向匿名访问（探针需免登录），多暴露一个端点就多一份泄露面。\n` +
        `    → 需要这些端点请先用 management.endpoint.xxx.enabled=false 显式关掉，再收紧本行。`
      );
    }
    for (const must of ['health']) {
      if (!set.has(must)) {
        problems.push(`${rel}：exposure.include 缺 ${must}（探针必须可访问）。当前=${include}`);
      }
    }
    if (set.has('health') && set.has('info')) {
      notes.push(`${rel}：exposure=health,info ✓`);
    }
  }

  // --- B) 危险端点必须显式禁用 ---
  for (const [key, why] of FORBIDDEN_ENDPOINTS) {
    const v = prop(lines, `management.endpoint.${key}.enabled`);
    if (v === 'true') {
      problems.push(
        `${rel}：management.endpoint.${key}.enabled=true —— ${why}。\n` +
        `    → 显式开了比"没配置"更危险：没配置至少默认关闭。`
      );
    } else if (v === null) {
      notes.push(`${rel}：${key} 未显式禁用（依赖 Spring Boot 默认关闭）`);
    } else {
      notes.push(`${rel}：${key} 已显式禁用 ✓`);
    }
  }

  // --- 探针分组必须区分liveness / readiness ---
  const probes = prop(lines, 'management.endpoint.health.probes.enabled');
  if (probes !== 'true') {
    problems.push(
      `${rel}：management.endpoint.health.probes.enabled 未设为 true。\n` +
      `    → 不开则 /actuator/health/liveness 与 /readiness 都 404，\n` +
      `      而这两条正是 LB/K8s 探针要用的路径。`
    );
  } else {
    notes.push(`${rel}：health probes 已开启 ✓`);
  }
}

// ============================================================ C：SecurityConfig 放行
const SEC_CFG = 'api/src/main/java/com/reservation/config/SecurityConfig.java';
{
  const abs = path.join(ROOT, SEC_CFG);
  if (!fs.existsSync(abs)) {
    problems.push(`${SEC_CFG}：文件不存在。`);
  } else {
    const src = fs.readFileSync(abs, 'utf8');
    const hasPermit = /requestMatchers\([^)]*\/actuator\/health[^)]*\)\s*\.permitAll\(\)/.test(src);
    if (!hasPermit) {
      problems.push(
        `${SEC_CFG}：未找到对 /actuator/health 的 permitAll 放行。\n` +
        `    → 探针会落到兜底 anyRequest().authenticated() → 401，\n` +
        `      LB 随即判定服务不可用并摘掉全部流量（比没有探针更糟）。`
      );
    } else {
      notes.push(`${SEC_CFG}：已放行 /actuator/health ✓`);
    }

    // 通配放行 = 把 env/beans/loggers 一并放开
    const wildcard = /requestMatchers\(\s*"\/actuator\/\*\*"\s*\)/.test(src);
    if (wildcard) {
      problems.push(
        `${SEC_CFG}：放行了 "/actuator/**" 通配。\n` +
        `    → 等于同时放行 env/beans/configprops/loggers/threaddump 等全部端点。\n` +
        `    → 只放行 /actuator/health 与 /actuator/health/** 两个精确形态。`
      );
    }
    if (/requestMatchers\([^)]*"\/actuator"\s*\)/.test(src)) {
      problems.push(`${SEC_CFG}：放行了 "/actuator" 根路径 —— 会连带暴露全部子端点。`);
    }
  }
}

// ============================================================ D：JwtAuthenticationFilter 白名单
const JWT_FILTER = 'api/src/main/java/com/reservation/config/JwtAuthenticationFilter.java';
{
  const abs = path.join(ROOT, JWT_FILTER);
  if (!fs.existsSync(abs)) {
    problems.push(`${JWT_FILTER}：文件不存在。`);
  } else {
    const src = fs.readFileSync(abs, 'utf8');

    const inSet = /WHITELIST_PATHS\s*=\s*Set\.of\(([\s\S]*?)\)/.exec(src);
    const inPrefix = /WHITELIST_PREFIXES\s*=\s*[\w.]*\.of\(([\s\S]*?)\)/.exec(src);
    const anywhere = inSet || inPrefix;
    const hasHealth = anywhere ? /"\/actuator\/health"/.test(anywhere[1]) : false;

    if (!hasHealth) {
      problems.push(
        `${JWT_FILTER}：白名单里没有 "/actuator/health"。\n` +
        `    → SecurityConfig 的 permitAll 放行了，但过滤器仍会解析 token：\n` +
        `      带/不带 token 都可能失败并清空 SecurityContext → 探针 401。\n` +
        `    → 这是本项目注释里写明的"两处分处之地"，改一处必须改另一处。`
      );
    } else {
      notes.push(`${JWT_FILTER}：白名单含 /actuator/health ✓`);
    }

    // 前缀匹配必须校验分隔符，否则 /actuator/healthz 会被一并放行
    //
    // ⚠️ 必须**限定在 shouldNotFilter 方法体内**扫，不能扫全文：
    // 本文件里STATIC_PREFIXES 的匹配本来就是裸 startsWith(prefix)（那是正确的，
    // 静态资源路径本就以 /js/、/css/ 结尾前缀，无需分隔符），
    // 全文扫描会命中它→ 守卫误报。误报的守卫比没守卫更糟：会被整体关掉。
    // 方法体 = 从方法签名行到**缩进恰为 4 空格的行首 }**（类体内方法的闭合花括号）。
    // 不用 [\s\S]*?\n{4}\}: 惰性匹配会先撞上方法**内部**同为 4 空格的闭合括号
    // （本方法内有多个 if 块就是 4 空格缩进），导致只截到半截方法体 → 判据失效。
    if (inPrefix) {
      const lines = src.split(/\r?\n/);
      const sigIdx = lines.findIndex((l) => /protected\s+boolean\s+shouldNotFilter\s*\(/.test(l));
      let scope = '';
      if (sigIdx < 0) {
        problems.push(
          `${JWT_FILTER}：找不到 shouldNotFilter 方法签名，无法核对前缀匹配方式。\n` +
          `    → 若该方法被重命名，请同步更新本守卫的定位正则。`
        );
      } else {
        for (let i = sigIdx; i < lines.length; i++) {
          scope += lines[i] + '\n';
          // 类体内方法以 4 空格缩进的 } 结束；类本身以 0 缩进 } 结束
          if (i > sigIdx && /^ {4}\}$/.test(lines[i])) break;
          if (i > sigIdx && /^\}$/.test(lines[i])) break;
        }
      }
      if (scope) {
        // ⚠️ 方法体内有**两个**遍历不同集合的 for 循环，必须按集合名区分：
        //    WHITELIST_PREFIXES 的循环要求校验分隔符；
        //    STATIC_PREFIXES 的循环用裸 startsWith 是正确的（静态资源以 /js/、/css/ 结尾前缀，
        //    本来就不需要分隔符）。不加区分就会误报 STATIC 那个 → 守卫被整体关掉。
        const loops = [...scope.matchAll(/for\s*\(\s*String\s+prefix\s*:\s*(\w+)\s*\)[\s\S]*?\n {8}\}/g)].map(
          (m) => ({ set: m[1], body: m[0] })
        );
        const whitelistLoop = loops.find((l) => l.set === 'WHITELIST_PREFIXES');

        if (!whitelistLoop) {
          problems.push(
            `${JWT_FILTER}：未找到遍历 WHITELIST_PREFIXES 的循环，无法核对前缀匹配方式。\n` +
            `    → 若该循环被改名或内联，请同步更新本守卫的判据。\n` +
            `    → 当前方法体内识别到的循环：${loops.map((l) => l.set).join(', ') || '(无)'}`
          );
        } else {
          const usesRawStartsWith = /uri\.startsWith\(\s*prefix\s*\)/.test(whitelistLoop.body);
          const usesGuarded =
            /uri\.equals\(\s*prefix\s*\)\s*\|\|\s*uri\.startsWith\(\s*prefix\s*\+\s*"\/"\s*\)/.test(
              whitelistLoop.body
            );
          if (usesRawStartsWith) {
            problems.push(
              `${JWT_FILTER}：WHITELIST_PREFIXES 的循环用了裸 uri.startsWith(prefix)。\n` +
              `    → /actuator/healthz、/actuator/health-foo 这类路径会被一并放行；\n` +
              `      日后 Actuator 增加自定义 health group 时会撞上。\n` +
              `    → 修法：uri.equals(prefix) || uri.startsWith(prefix + "/")`
            );
          } else if (!usesGuarded) {
            problems.push(
              `${JWT_FILTER}：WHITELIST_PREFIXES 的匹配方式无法识别（既非裸 startsWith，也非分隔符守卫版）。\n` +
              `    → 请确认前缀匹配是否校验了 "/" 边界。`
            );
          } else {
            notes.push(`${JWT_FILTER}：WHITELIST_PREFIXES 前缀匹配已校验分隔符 ✓`);
          }
        }
      }
    }
  }
}

// ============================================================ E：message-service 的拦截器范围
const WEB_MVC = 'api/message-service/src/main/java/com/messagecenter/config/WebMvcConfig.java';
{
  const abs = path.join(ROOT, WEB_MVC);
  if (fs.existsSync(abs)) {
    const src = fs.readFileSync(abs, 'utf8');
    const patterns = /addPathPatterns\(([\s\S]*?)\)/.exec(src);
    const hitActuator = patterns ? /actuator/.test(patterns[1]) : false;
    if (hitActuator) {
      problems.push(
        `${WEB_MVC}：拦截范围新增了 actuator 前缀。\n` +
        `    → MessageAuthInterceptor 要求 Bearer token，而探针必须是匿名可访问。\n` +
        `    → 若确实要拦，必须同时在 excludePathPatterns 里补上 /actuator/health。`
      );
    } else {
      notes.push(`${WEB_MVC}：拦截范围未含 actuator（/actuator/** 匿名可达）✓`);
    }
  }
}

if (problems.length) {
  console.error(`✗ Actuator 探针配置存在 ${problems.length} 处问题：\n`);
  for (const p of problems) console.error('  · ' + p + '\n');
  process.exit(1);
}

console.log('✓ Actuator 探针配置正常');
for (const n of notes) console.log('  · ' + n);
process.exit(0);