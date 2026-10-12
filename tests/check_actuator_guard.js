#!/usr/bin/env node
/**
 * Actuator 探针守卫 —— 反向测试
 *
 * 为什么这个守卫尤其需要反向测试：
 *   本守卫第一版连续三次**误报**，都不是小问题：
 *     ① 判据扫全文，命中了 STATIC_PREFIXES 的裸 startsWith（那处是正确的写法）
 *        → 误报会让人把守卫整体关掉，比没守卫更糟；
 *     ② 方法体正则 [\s\S]*?\n{4}\} 被方法**内部**同为 4 空格的 if 块闭合截断
 *        → 只拿到半截方法体，判据作用在残缺文本上；
 *     ③ 区分两个 for 循环时只看"有没有裸 startsWith"，没按集合名区分
 *        → 又回到①的老问题。
 *   修完之后必须证明：真退化时它**确实会红**，且不再误报。
 *
 * 反向测试项：
 *   ① 基线通过
 *   ② exposure.include 加 env → 判红并指出 env
 *   ③ exposure.include 只留 health（去掉 info）→ 判红
 *   ④ shutdown.enabled=true → 判红（显式开比不配更危险）
 *   ⑤ SecurityConfig 去掉 permitAll → 判红（探针会401）
 *   ⑥ SecurityConfig 改成放行 /actuator/** 通配 → 判红
 *   ⑦ JwtAuthenticationFilter 白名单去掉 /actuator/health → 判红
 *   ⑧ 前缀匹配改回裸 startsWith → 判红（且**不能**误报 STATIC 那处）
 *   ⑨ probes.enabled 去掉 → 判红
 *   ⑩ 还原后回到 exit 0 且源码零污染
 *   ⑪ SKIP_ACTUATOR=1 → exit 0
 *
 * 运行：node tests/check_actuator_guard.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const GUARD = path.join(ROOT, 'tools/check-actuator-guard.mjs');

const API_PROPS = path.join(ROOT, 'api/src/main/resources/application.properties');
const MSG_PROPS = path.join(ROOT, 'api/message-service/src/main/resources/application.properties');
const SEC_CFG = path.join(ROOT, 'api/src/main/java/com/reservation/config/SecurityConfig.java');
const JWT = path.join(ROOT, 'api/src/main/java/com/reservation/config/JwtAuthenticationFilter.java');

const results = [];
function expect(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log(`  ${ok ? '✓' : '✗'} ${name}`);
  if (!ok && detail) {
    console.log('      ' + String(detail).split('\n').slice(0, 12).join('\n      '));
  }
}

/**
 * 同进程 import 守卫，捕获 process.exit。
 * ⚠️ 不用 spawnSync：本机 node 子进程一律 EBUSY，会让基线就假红。
 * code 用 null 表示"没收到 exit"——守卫必须每条路径都 exit，否则断言必须失败。
 */
async function runGuard() {
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
  }
  return { code, out: lines.join('\n') };
}

async function runGuardSkipEnv() {
  const saved = process.env.SKIP_ACTUATOR;
  process.env.SKIP_ACTUATOR = '1';
  try {
    return await runGuard();
  } finally {
    if (saved === undefined) delete process.env.SKIP_ACTUATOR;
    else process.env.SKIP_ACTUATOR = saved;
  }
}

/** 备份并返回还原函数（还原后再逐字节比对） */
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

/** 变异：把 oldStr 换成 newStr；未命中锚点返回 false（不写文件） */
function mutate(bak, oldStr, newStr) {
  const txt = fs.readFileSync(bak.file, 'utf8');
  if (!txt.includes(oldStr)) return false;
  fs.writeFileSync(bak.file, txt.split(oldStr).join(newStr), 'utf8');
  return true;
}

(async () => {
console.log('\nActuator 探针守卫反向测试\n' + '='.repeat(56));

const touched = [];
try {
  // ---------- ① 基线 ----------
  {
    const r = await runGuard();
    expect('① 基线通过', r.code === 0, r.out);
  }

  // ---------- ② exposure.include 加 env ----------
  {
    const bak = backup(API_PROPS);
    touched.push(bak);
    const okMut = mutate(bak, 'management.endpoints.web.exposure.include=health,info',
                          'management.endpoints.web.exposure.include=health,info,env');
    if (!okMut) {
      expect('② exposure 加 env 应判红', false, '未找到锚点 exposure.include=health,info');
    } else {
      const r = await runGuard();
      expect('② exposure.include 加 env → exit 1 且点名 env', r.code === 1 && /env/.test(r.out), r.out);
    }
    bak.restore();
  }

  // ---------- ③ 去掉 info ----------
  {
    const bak = backup(API_PROPS);
    touched.push(bak);
    mutate(bak, 'management.endpoints.web.exposure.include=health,info',
                'management.endpoints.web.exposure.include=health');
    const r = await runGuard();
    // info 缺失本身不该判红（health 才是探针），但守卫应给 notes；此条只验"不因缺 info 而误报红"
    expect('③ 只留 health 不应误报（探针只需要 health）', r.code === 0, r.out);
    bak.restore();
  }

  // ---------- ④ shutdown.enabled=true ----------
  {
    const bak = backup(API_PROPS);
    touched.push(bak);
    const okMut = mutate(bak, 'management.endpoint.shutdown.enabled=false',
                          'management.endpoint.shutdown.enabled=true');
    if (!okMut) {
      expect('④ shutdown=true 应判红', false, '未找到锚点 shutdown.enabled=false');
    } else {
      const r = await runGuard();
      expect('④ shutdown.enabled=true → exit 1（匿名可远程关服务）', r.code === 1 && /shutdown/.test(r.out), r.out);
    }
    bak.restore();
  }

  // ---------- ⑤ 去掉 SecurityConfig 的 permitAll ----------
  {
    const bak = backup(SEC_CFG);
    touched.push(bak);
    const okMut = mutate(
      bak,
      `auth.requestMatchers(
                            "/actuator/health",
                            "/actuator/health/**"
                    ).permitAll();`,
      `auth.requestMatchers("/actuator/health").authenticated();`
    );
    if (!okMut) {
      expect('⑤ 去掉 permitAll 应判红', false, '未找到 SecurityConfig 里的 actuator permitAll 锚点（代码已变，需同步本测试）');
    } else {
      const r = await runGuard();
      expect('⑤ SecurityConfig 不放行 → exit 1 且指出 permitAll', r.code === 1 && /permitAll/.test(r.out), r.out);
    }
    bak.restore();
  }

  // ---------- ⑥ 改成 /actuator/** 通配 ----------
  {
    const bak = backup(SEC_CFG);
    touched.push(bak);
    const okMut = mutate(
      bak,
      `auth.requestMatchers(
                            "/actuator/health",
                            "/actuator/health/**"
                    ).permitAll();`,
      `auth.requestMatchers("/actuator/**").permitAll();`
    );
    if (!okMut) {
      expect('⑥ 通配放行应判红', false, '未找到锚点');
    } else {
      const r = await runGuard();
      expect('⑥ 放行 /actuator/** 通配 → exit 1', r.code === 1 && /actuator\/\*\*/.test(r.out), r.out);
    }
    bak.restore();
  }

  // ---------- ⑦ Jwt 白名单去掉 actuator ----------
  {
    const bak = backup(JWT);
    touched.push(bak);
    // 锚点取 WHITELIST_PREFIXES 里那一处（Set.of 里也有同名字符串，需区分）。
    // 变更方式：把前缀集合里的条目换成占位值 —— 只动这一处，Set.of 那处保留，
    // 守卫仍能在 Set.of 里找到 "/actuator/health" 从而判"白名单没放行"？
    // 不对：两处都在同文件，只改一处的话守卫会判绿。所以这里**两处都改**。
    const before = fs.readFileSync(bak.file, 'utf8');
    const count = (before.match(/"\/actuator\/health"/g) || []).length;
    if (count < 2) {
      expect('⑦ JWT 白名单去掉 actuator 应判红', false,
        `文件中 "/actuator/health" 出现 ${count} 次（预期至少 2：Set.of + WHITELIST_PREFIXES），代码结构已变`);
    } else {
      fs.writeFileSync(bak.file,
        before.split('"/actuator/health"').join('"/__removed_actuator__"'), 'utf8');
      const r = await runGuard();
      // 断言匹配"白名单"三个字（守卫文案是中文），不要用 /WHITELIST/ —— 那是源码标识符，
      // 不出现在报错文本里。第一版就是这么写的，守卫明明红了却判测试红。
      expect('⑦ JWT 白名单无 /actuator/health → exit 1 且指向白名单',
        r.code === 1 && /白名单/.test(r.out) && /JwtAuthenticationFilter/.test(r.out), r.out);
    }
    bak.restore();
  }

  // ---------- ⑧ 前缀匹配改回裸 startsWith ----------
  {
    const bak = backup(JWT);
    touched.push(bak);
    const okMut = mutate(
      bak,
      'if (uri.equals(prefix) || uri.startsWith(prefix + "/")) {',
      'if (uri.startsWith(prefix)) {'
    );
    if (!okMut) {
      expect('⑧ 裸 startsWith 应判红', false, '未找到分隔符守卫锚点');
    } else {
      const r = await runGuard();
      // 关键：既要判红，又不能因为 STATIC_PREFIXES 那个**本来就正确**的裸 startsWith 而误报
      const flaggedRight = /WHITELIST_PREFIXES 的循环用了裸/.test(r.out);
      const falsePositive = /STATIC/.test(r.out);
      expect('⑧ 裸 startsWith → exit 1 且指向 WHITELIST_PREFIXES（不误报 STATIC）',
        r.code === 1 && flaggedRight && !falsePositive, r.out);
    }
    bak.restore();
  }

  // ---------- ⑨ probes 关闭 ----------
  {
    const bak = backup(MSG_PROPS);
    touched.push(bak);
    const okMut = mutate(bak, 'management.endpoint.health.probes.enabled=true',
                          'management.endpoint.health.probes.enabled=false');
    if (!okMut) {
      expect('⑨ probes 关闭应判红', false, '未找到锚点');
    } else {
      const r = await runGuard();
      expect('⑨ probes.enabled=false → exit 1 且提到 liveness/readiness',
        r.code === 1 && /probes/.test(r.out), r.out);
    }
    bak.restore();
  }
} finally {
  for (const bak of touched) bak.restore();
}

// ---------- ⑩ 还原校验 ----------
{
  const r = await runGuard();
  const polluted = touched.filter((b) => fs.readFileSync(b.file, 'utf8') !== b.orig);
  expect('⑩ 还原后回到 exit 0', r.code === 0, r.out);
  expect('   ⑩ 源码零污染（逐字节比对）', polluted.length === 0, polluted.map((b) => b.file).join(', '));
}

// ---------- ⑪ SKIP ----------
{
  const r = await runGuardSkipEnv();
  expect('⑪ SKIP_ACTUATOR=1 → exit 0', r.code === 0 && /SKIP_ACTUATOR/.test(r.out), r.out);
}

const passed = results.filter((x) => x.ok).length;
const failed = results.length - passed;
console.log('='.repeat(56));
console.log(`反向测试：${passed}/${results.length} 通过` + (failed ? `，${failed} 项失败` : ''));
})();
