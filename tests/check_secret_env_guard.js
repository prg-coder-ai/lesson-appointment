#!/usr/bin/env node
/**
 * 反向测试：证明 tools/check-secret-env-guard.mjs **真会红**。
 *
 * 为什么需要：守卫只是"跑起来绿"没有意义 —— 它可能因为锚点/路径写错而永远不检查。
 * 本文件对每一条新判定做一次变异，要求守卫确实报错，跑完按**原始字节**还原。
 *
 * 2026-11-21 新增两条口径（配合 keys.env 单一权威来源）：
 *   ① 共用键必须在 keys.env.template 里有定义；
 *   ② 三份 xxx.env.template 里**必须没有**（systemd 后加载覆盖先加载，残留即静默覆盖）。
 * 只查①会漏掉②——②才是线上 401 的真实成因，所以必须单独证红。
 *
 * 2026-11-22 追加 DB_USERNAME / DB_PASSWORD 到共用键：
 * 三服务连同一 MySQL 账号，分散在三份 xxx.env 正是「Access denied / 查库卡 30s」的成因。
 * 对应新增三条变异（keys 模板缺 DB_PASSWORD、booking 残留、classroom 残留）。
 *
 * 踩过的坑（沿用本仓库约定）：
 *   · 禁用 spawnSync：本机 node 子进程一律 EBUSY，改为同进程 import + 拦 process.exit；
 *   · 工作区是 CRLF、索引是 LF：变异前先把 \r\n 归一成 \n 再 includes/replace，
 *     还原时写回**原始 Buffer**，保证逐字节复原；
 *   · 结尾必须 process.exit(failed ? 1 : 0)，漏了就是假绿。
 */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const GUARD = path.join(ROOT, 'tools/check-secret-env-guard.mjs');
const KEYS_TPL = path.join(ROOT, 'deploy/keys.env.template');
const BOOKING_TPL = path.join(ROOT, 'deploy/booking.env.template');
const MSG_TPL = path.join(ROOT, 'deploy/message.env.template');
const CLASSROOM_TPL = path.join(ROOT, 'deploy/classroom.env.template');
const COMPOSE = path.join(ROOT, 'deploy/docker/docker-compose.yml');

let seq = 0;

/** 同进程跑一次守卫，返回它想退出时的 exit code（0 = 绿） */
async function runGuard() {
  const origExit = process.exit;
  const origErr = console.error;
  const origLog = console.log;
  process.exit = (c) => { throw new Error('__EXIT__' + (c === undefined ? 0 : c)); };
  console.error = () => {};
  console.log = () => {};
  try {
    await import(pathToFileURL(GUARD).href + '?t=' + Date.now() + '-' + (++seq));
    return 0;
  } catch (e) {
    const m = /^__EXIT__(-?\d+)$/.exec(String(e && e.message));
    if (m) return Number(m[1]);
    throw e;                       // 守卫自身抛异常也算失败，要让调用方看见堆栈
  } finally {
    process.exit = origExit;
    console.error = origErr;
    console.log = origLog;
  }
}

/** 变异：归一化 CRLF 后做替换；返回按原始字节还原的函数 */
function mutate(file, from, to) {
  const buf = fs.readFileSync(file);
  const norm = buf.toString('utf8').replace(/\r\n/g, '\n');
  if (!norm.includes(from)) throw new Error(`变异锚点未命中（${path.basename(file)}）：${from}`);
  const next = norm.replace(from, to);
  if (next === norm) throw new Error(`变异未产生任何改动：${path.basename(file)}`);
  fs.writeFileSync(file, next, 'utf8');
  return () => fs.writeFileSync(file, buf);     // 写回原始 Buffer，逐字节还原
}

const cases = [
  { name: '基线（未变异）应为绿', expect: 0, run: async () => 0 },
  {
    name: '① keys.env.template 注释掉 JWT_SECRET= → 应红',
    expect: 1,
    run: async () => {
      const restore = mutate(KEYS_TPL, 'JWT_SECRET=CHANGE_ME', '# JWT_SECRET=CHANGE_ME');
      try { return await runGuard(); } finally { restore(); }
    },
  },
  {
    name: '① keys.env.template 注释掉 AES_KEY= → 应红',
    expect: 1,
    run: async () => {
      const restore = mutate(KEYS_TPL, 'AES_KEY=CHANGE_ME', '# AES_KEY=CHANGE_ME');
      try { return await runGuard(); } finally { restore(); }
    },
  },
  {
    name: '① keys.env.template 注释掉 DB_PASSWORD= → 应红（2026-11-22 新增）',
    expect: 1,
    run: async () => {
      const restore = mutate(KEYS_TPL, 'DB_PASSWORD=CHANGE_ME', '# DB_PASSWORD=CHANGE_ME');
      try { return await runGuard(); } finally { restore(); }
    },
  },
  {
    name: '② booking.env.template 残留 JWT_SECRET= → 应红（会覆盖 keys.env）',
    expect: 1,
    run: async () => {
      const anchor = 'SPRING_DATASOURCE_URL=jdbc:mysql://127.0.0.1:3306/lesson_appointment';
      const restore = mutate(BOOKING_TPL, anchor, 'JWT_SECRET=CHANGE_ME\n' + anchor);
      try { return await runGuard(); } finally { restore(); }
    },
  },
  {
    name: '② message.env.template 残留 AES_KEY= → 应红',
    expect: 1,
    run: async () => {
      const anchor = 'SPRING_DATASOURCE_URL=jdbc:mysql://127.0.0.1:3306/message_center';
      const restore = mutate(MSG_TPL, anchor, 'AES_KEY=CHANGE_ME\n' + anchor);
      try { return await runGuard(); } finally { restore(); }
    },
  },
  {
    name: '② booking.env.template 残留 DB_PASSWORD= → 应红（2026-11-22 新增）',
    expect: 1,
    run: async () => {
      const anchor = 'SPRING_DATASOURCE_URL=jdbc:mysql://127.0.0.1:3306/lesson_appointment';
      const restore = mutate(BOOKING_TPL, anchor, 'DB_PASSWORD=someOtherPwd\n' + anchor);
      try { return await runGuard(); } finally { restore(); }
    },
  },
  {
    name: '② classroom.env.template 残留 DB_USERNAME= → 应红（2026-11-22 新增）',
    expect: 1,
    run: async () => {
      const anchor = 'SPRING_DATASOURCE_URL=jdbc:mysql://127.0.0.1:3306/classroom';
      const restore = mutate(CLASSROOM_TPL, anchor, 'DB_USERNAME=lesson\n' + anchor);
      try { return await runGuard(); } finally { restore(); }
    },
  },
  {
    name: '④ keys.env.template 写入真值 AES_KEY → 应红',
    expect: 1,
    run: async () => {
      const restore = mutate(KEYS_TPL, 'AES_KEY=CHANGE_ME', 'AES_KEY=abcdefghijklmnopqrstuvwxyz012345');
      try { return await runGuard(); } finally { restore(); }
    },
  },
  {
    name: '④ keys.env.template 写入真值 DB_PASSWORD → 应红（2026-11-22 新增）',
    expect: 1,
    run: async () => {
      const restore = mutate(KEYS_TPL, 'DB_PASSWORD=CHANGE_ME', 'DB_PASSWORD=abcdefghijklmnopqrstuvwxyz012345');
      try { return await runGuard(); } finally { restore(); }
    },
  },
  {
    name: '⑤ docker-compose 漏掉 keys.env → 应红（2026-11-23 新增）',
    expect: 1,
    run: async () => {
      const restore = mutate(COMPOSE, '      - /etc/lesson/keys.env\n', '');
      try { return await runGuard(); } finally { restore(); }
    },
  },
  {
    name: '⑤ docker-compose 把 keys.env 排在业务 env 之后 → 应红',
    expect: 1,
    run: async () => {
      const from = '      - /etc/lesson/keys.env\n      - /etc/lesson/booking.env';
      const to = '      - /etc/lesson/booking.env\n      - /etc/lesson/keys.env';
      const restore = mutate(COMPOSE, from, to);
      try { return await runGuard(); } finally { restore(); }
    },
  },
  { name: '还原后应为绿（确认无残留污染）', expect: 0, run: async () => 0 },
];

(async () => {
  let failed = 0;
  for (const c of cases) {
    let code;
    try {
      code = await c.run();
    } catch (e) {
      console.error(`\u2717 ${c.name}\n    执行异常：${e && e.message}`);
      failed++;
      continue;
    }
    if (code === c.expect) {
      console.log(`\u2713 ${c.name}`);
    } else {
      console.error(`\u2717 ${c.name}\n    期望 exit=${c.expect}，实际 exit=${code}`);
      failed++;
    }
  }
  console.log(failed === 0
    ? `\n全部 ${cases.length} 条通过：守卫对每条新判定都真会红。`
    : `\n${failed} 条失败。`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
