#!/usr/bin/env node
/**
 * check-secret-env-guard —— 密钥注入通道守卫
 *
 * 查什么：properties 里的密钥必须写成 `${ENV_NAME:兜底}`，且 env 模板里必须存在**同名**占位。
 *
 * 为什么需要这个守卫（2026-10-09 实测踩到）：
 *   env 模板里明明写了 JWT_SECRET=，但 properties 写的是裸明文字面量 → systemd 注入的
 *   环境变量**根本没被读**，实际生效的是那串明文。这层断线不报错、不告警，只有对照
 *   两处文件才发现得了。
 *
 * 最阴的一条：**`${}` 占位不做 Spring 的松散绑定**。
 *   模板写 `CRYPTO_AESKEY`、properties 写 `${AES_KEY:}` → 名字对不上，注入同样失效，
 *   而且两边看起来都"配了"。所以本守卫比对的是**字面完全相等**，不是"看起来像"。
 *
 * 跳过后缀：SKIP_SECRET_ENV=1
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_PROPS = path.join(ROOT, 'api/src/main/resources/application.properties');
const MSG_PROPS = path.join(ROOT, 'api/message-service/src/main/resources/application.properties');
const CLS_PROPS = path.join(ROOT, 'api/classroom-service/src/main/resources/application.properties');
const TPL = [path.join(ROOT, 'api/beforeRun/booking.env.template'),
             path.join(ROOT, 'api/beforeRun/message.env.template'),
             path.join(ROOT, 'api/beforeRun/classroom.env.template')];   // 2026-10-30 补：课堂模板

/**
 * 必须走 env 注入的密钥：[键名, 说明, 适用的 env 模板下标集合]
 * 适用范围很重要：微信配置是 api 专属（message / classroom 的 properties 与 Java 代码里都没有 wechat），
 * 不能要求其它 env 模板里也出现 WECHAT_* —— 那是"为满足守卫而加无用配置"。
 *
 * ⚠️ 这里最容易踩的认知坑（2026-10-30 用 spring-core 6.1.14 重跑实验后修订）：
 *
 *   老注释曾断言「环境变量 AES_KEY 不生效，只有与属性名词根一致的名字才生效」。**那个结论是错的**，
 *   它漏掉了 application.properties 这一层：真实链路是
 *     (a) 先按**属性名**查 Environment → systemEnvironment 里的 `CRYPTO_AES_KEY`（属性名规范化：. 和 - 都变 _、转大写）能直接命中；
 *     (b) 查不到才拿到 properties 里的值 `crypto.aes-key=${AES_KEY:内置默认值}`，再对该值做**占位符解析**，
 *         逐字查环境变量 `AES_KEY`。
 *   所以 `AES_KEY` 与 `CRYPTO_AES_KEY` 都能生效（后者优先级更高），
 *   而 `CRYPTO_AESKEY`（手册旧写法，少了中间的下划线）**两路都不命中**，静默回落内置默认值。
 *
 *   复现实验（properties 定义 crypto.aes-key=${AES_KEY:BUILTIN_DEFAULT}，systemEnvironment 在前）：
 *     · 不设变量              → BUILTIN_DEFAULT          ❌ 回落
 *     · AES_KEY=V             → V                        ✅ 占位符路径
 *     · CRYPTO_AESKEY=V       → BUILTIN_DEFAULT          ❌ 无效（历史 bug）
 *     · CRYPTO_AES_KEY=V      → V                        ✅ 属性名规范化路径
 *     · 两者都设              → CRYPTO_AES_KEY 的值      ← 属性名路径优先于占位符
 *
 *   故本守卫的判定口径不变（仍要求 properties 里的 `${ENV_NAME:}` 与模板**逐字相等**），
 *   这条比对本身是对的 —— 它防的正是 `${}` 占位不做松散绑定这件事。
 */
const SECRET_KEYS = [
  ['jwt.secret',            'HS512 签名密钥，与 message/classroom 共享密钥域', [0, 1, 2]],
  ['crypto.aes-key',        'AES-256-GCM 字段加密密钥，三服务共用须互通',      [0, 1, 2]],
  ['crypto.hmac-key',       'HMAC-SHA256 可搜索索引密钥',                     [0, 1, 2]],
  ['wechat.miniapp.appid',  '小程序 appid（api 专属）', [0]],
  ['wechat.miniapp.secret', '小程序 appsecret（api 专属）', [0]],
  // 开放平台网站应用（PC 扫码登录，2026-10-14 P2）：appid 非密钥但同样走 env；
  // secret 是凭证级，与 miniapp.secret 同规格管理。
  ['wechat.open.appid',     '开放平台网站应用 appid（PC 扫码登录，api 专属）', [0]],
  ['wechat.open.secret',    '开放平台网站应用 appsecret（api 专属）', [0]],
];

const problems = [];
const skipped = process.env.SKIP_SECRET_ENV === '1';

function readLines(p) {
  if (!fs.existsSync(p)) { problems.push(`文件不存在: ${p}`); return []; }
  const raw = fs.readFileSync(p, 'utf8');
  if (raw.charCodeAt(0) === 0xfeff) problems.push(`${path.basename(p)} 含 UTF-8 BOM`);
  return raw.split(/\r?\n/);
}

/** 取 key=value 的行，忽略注释与空行 */
function findProp(lines, key) {
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    if (t.slice(0, i).trim() === key) return t.slice(i + 1).trim();
  }
  return null;
}

if (skipped) {
  console.log('⏭  check:secret-env 已跳过（SKIP_SECRET_ENV=1）');
} else {
  const propFiles = [API_PROPS, MSG_PROPS, CLS_PROPS];
  // ⚠️ 每个 env 模板**各自**建变量集，不能合并后再比。
  //   合并会让"booking 模板改名了、message 模板还是对的"这种漂移被后者掩盖 →
  //   守卫假绿（实测变异 2 就是这么溜过去的）。配对关系必须逐文件成立。
  const tplKeySets = TPL.map(tp => {
    const set = new Set();
    for (const l of readLines(tp)) {
      const m = /^\s*([A-Z][A-Z0-9_]*)=/.exec(l);
      if (m) set.add(m[1]);
    }
    return set;
  });

  let checked = 0;
  for (const pf of propFiles) {
    const name = pf.includes('message-service') ? 'message-service'
               : pf.includes('classroom-service') ? 'classroom-service'
               : 'api';
    const lines = readLines(pf);
    for (const [key, why, tplScope] of SECRET_KEYS) {
      const val = findProp(lines, key);
      if (val === null) continue;         // 该模块没有这项→ 跳过（如 msg 无 hmac）
      checked++;

      // ① 必须是 ${ENV:...} 形式
      // ⚠️ 默认值里的 `.` 必须用 [\s\S]：真实密钥值含 Base64 的 `=` 与换行，
      //    `.` 不匹配换行会让这条正则 **No match found 直接抛异常**（实测踩到）。
      const m = /^\$\{([A-Z][A-Z0-9_]*):([\s\S]*)\}$/.exec(val);
      if (!m) {
        problems.push(`[${name}] ${key} 未走 env 注入（${why}）。当前是裸字面量，env 模板注入的同名变量不会被读取`);
        continue;
      }
      const envName = m[1];

      // ② 兜底值不能为空 —— 空兜底等于"必须靠 env"，本机直接起不来
      if (!m[2]) {
        problems.push(`[${name}] ${key} 的 ${envName} 兜底值为空，本机（不注入 env）将无法启动。` +
                      `若确实要"生产强制注入"，需同时确认启动脚本一定会注入`);
      }

      // ③ 该密钥所属的每个 env 模板都必须各自含有同名占位（字面相等，不做松散匹配）
      for (const i of tplScope) {
        if (tplKeySets[i].has(envName)) continue;
        const near = [...tplKeySets[i]].filter(k => k.replace(/_/g, '') === envName.replace(/_/g, ''));
        problems.push(`[${name}] ${key} 读的是 \${${envName}:}，但 ${path.basename(TPL[i])} 里没有 ` +
                      `${envName}= 这一行${near.length ? `（该文件里像是 ${near.join(', ')} —— \${} 占位只按"词根一致"命中，名字必须逐字相同）` : ''}`);
      }
    }
  }

  // ④ 模板里不得带真值密钥
  for (const tp of TPL) {
    for (const l of readLines(tp)) {
      const m = /^\s*([A-Z][A-Z0-9_]*)=(.*)$/.exec(l);
      if (!m) continue;
      if (!/^(JWT_SECRET|AES_KEY|HMAC_KEY|WECHAT_SECRET|WECHAT_OPEN_APPID|WECHAT_OPEN_SECRET|DB_PASSWORD)$/.test(m[1])) continue;
      const v = m[2].trim();
      if (!v) continue;
      if (v === 'CHANGE_ME') continue;
      if (/^[A-Za-z0-9+/=_-]{16,}$/.test(v)) {
        problems.push(`${path.basename(tp)} 的 ${m[1]} 带了真实值（模板只应写 CHANGE_ME）—— ` +
                      `模板被复制/改名后就会连带入库`);
      }
    }
  }

  console.log(`check:secret-env —— 检查 ${checked} 处密钥注入（${propFiles.length} 个 properties + ${TPL.length} 个 env 模板）`);
  if (problems.length) {
    console.error(`❌ 密钥注入通道有 ${problems.length} 处问题：`);
    for (const p of problems) console.error(`   · ${p}`);
    process.exit(1);
  }
  console.log('   ✅ 密钥全部走 ${ENV:兜底}，env 模板占位名逐字对齐，模板内无真值');
}