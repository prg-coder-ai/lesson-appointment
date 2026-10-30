#!/usr/bin/env node
/**
 * 调度线程池守卫
 * ==============
 * 背景（2026-10-09 发现）：
 *   Spring Boot 的 TaskSchedulingAutoConfiguration 默认 pool.size = 1。
 *   本项目 8 个 @Scheduled 共用这唯一一条线程，其中 NotifyTask 每 60s逐租户遍历
 *   并对 message-service 做**同步 HTTP**（耗时取决于外部响应），MonitorTask 每60s
 *   读 CPU/内存/磁盘（磁盘 IO 忙时变慢）。
 *   单线程下这些耗时串行累加 —— 指标采样一卡，**上课提醒被整体推迟**。
 *   而上课提醒是 4 档 × 每分钟轮询的高频业务。
 *
 * 为什么需要守卫：
 *   把 pool.size 改回 1（或整段删掉）**不会报错、不会启动失败**，
 *   只是悄悄退回到"指标采样拖慢上课提醒"的状态 —— review 时极难察觉。
 *   这是典型的"配置型回归"，只能靠守卫拦。
 *
 * 校验项：
 *   1. api与 message-service 的 pool.size 必须显式 > 1
 *   2.必须显式声明（不能依赖默认值）
 *   3. thread-name-prefix 必须显式声明（jstack 排障靠它区分任务线程与业务线程）
 *   4. api 必须开启优雅停机（否则发版会砍掉正在跑的NotifyTask 那一轮）
 *
 * 跳过：SKIP_SCHEDULER=1
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROOT = path.resolve(__dirname, '..');

/** 每个服务：配置文件 → 该服务实际有多少个 @Scheduled（用于说明必要性） */
const TARGETS = [
  {
    label: 'booking-api',
    rel: 'api/src/main/resources/application.properties',
    minSize: 2,
    mustShutdown: true,
    why: '8 个 @Scheduled（含逐租户同步 HTTP 的 NotifyTask）',
  },
  {
    label: 'message-service',
    rel: 'api/message-service/src/main/resources/application.properties',
    minSize: 2,
    mustShutdown: false,
    why: '当前无 @Scheduled，但Spring SSE 心跳/清理类任务随时会加；留位避免到时候再踩单线程坑',
  },
];

/** 去掉 properties 注释，避免注释里的示例值被误读成真实配置 */
function stripComments(src) {
  return src
    .split(/\r?\n/)
    .map((l) => {
      const i = l.indexOf('#');
      // 只在 # 不处于引号内时截断；本文件无含 # 的值，故直接截断
      return i >= 0 ? l.slice(0, i) : l;
    })
    .join('\n');
}

function readProp(clean, key) {
  const re = new RegExp('^\\s*' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*=\\s*(.*)$', 'm');
  const m = clean.match(re);
  return m ? m[1].trim() : null;
}

const problems = [];
const notes = [];

if (process.env.SKIP_SCHEDULER === '1') {
  console.log('[scheduler] SKIP_SCHEDULER=1，跳过调度线程池守卫');
  process.exit(0);
}

for (const t of TARGETS) {
  const abs = path.join(ROOT, t.rel);
  if (!fs.existsSync(abs)) {
    problems.push(`${t.rel}：文件不存在，无法校验调度线程池配置。`);
    continue;
  }
  const raw = fs.readFileSync(abs, 'utf8');
  const clean = stripComments(raw);

  // --- 1) pool.size 必须显式声明 ---
  const sizeStr = readProp(clean, 'spring.task.scheduling.pool.size');
  if (sizeStr === null) {
    problems.push(
      `${t.rel}：缺少 spring.task.scheduling.pool.size。\n` +
      `    → 不配等于用Spring Boot 默认值 **1**，即单线程调度（${t.why}）。\n` +
      `    → 单线程下任一任务耗时都会推迟其余任务，且**不报任何错**。\n` +
      `    → 修法：加上 spring.task.scheduling.pool.size=4 与 thread-name-prefix=sched-。`
    );
    continue;
  }

  // --- 2) 值必须 > 1 ---
  const size = Number(sizeStr);
  if (!Number.isInteger(size)) {
    problems.push(`${t.rel}：spring.task.scheduling.pool.size="${sizeStr}" 不是整数。`);
  } else if (size <= 1) {
    problems.push(
      `${t.rel}：spring.task.scheduling.pool.size=${size}（${t.why} 仍是单线程）。\n` +
      `    → 值写成 1 与不写等价：退回到"任一任务卡住就推迟上课提醒"的状态，且不报错。\n` +
      `    → 若确认本服务任务都很轻，把下方 why 的理由一并改掉，不要留一条骗人的配置。`
    );
  } else {
    notes.push(`${t.rel}：pool.size=${size}（${t.why}）✓`);
  }

  // --- 3) thread-name-prefix 必须显式声明 ---
  const prefix = readProp(clean, 'spring.task.scheduling.thread-name-prefix');
  if (prefix === null) {
    problems.push(
      `${t.rel}：缺少 spring.task.scheduling.thread-name-prefix。\n` +
      `    → 默认线程名是 "scheduling-1"，与 Tomcat/业务线程混在一起；\n` +
      `      jstack 抓到线程时无法快速判断"这是定时任务还是处理用户请求的"。\n` +
      `    → 修法：spring.task.scheduling.thread-name-prefix=sched-`
    );
  } else if (!prefix.trim()) {
    problems.push(`${t.rel}：thread-name-prefix 值为空，等同于没配。`);
  } else {
    notes.push(`${t.rel}：thread-name-prefix="${prefix}"✓`);
  }

  // --- 4) 优雅停机（仅 api 要求）---
  if (t.mustShutdown) {
    const awaitTerm = readProp(clean, 'spring.task.scheduling.shutdown.await-termination');
    if (awaitTerm !== 'true') {
      problems.push(
        `${t.rel}：未开启 spring.task.scheduling.shutdown.await-termination=true。\n` +
        `    → systemctl stop / 发版重启会**硬砍**正在执行的那一轮 NotifyTask：\n` +
        `      已发的记了流水、没发的没记录，通知状态出现不一致。`
      );
    } else {
      notes.push(`${t.rel}：优雅停机已开启 ✓`);
    }
  }
}

// --- 交叉校验：两个服务的日志目录不能相同（否则两个进程写同一文件，滚动互相踩）---
const logPaths = [];
for (const t of TARGETS) {
  const abs = path.join(ROOT, t.rel);
  if (!fs.existsSync(abs)) continue;
  const clean = stripComments(fs.readFileSync(abs, 'utf8'));
  // LOG_PATH 通常在 env 模板里而非 properties；这里只提示不判错
  const p = readProp(clean, 'logging.file.path');
  if (p) logPaths.push({ label: t.label, p });
}
if (logPaths.length > 1) {
  const dup = logPaths.filter((x, i) => logPaths.findIndex((y) => y.p === x.p) !== i);
  for (const d of dup) {
    problems.push(
      `${d.label}：logging.file.path 与其他服务相同（${d.p}）。\n` +
      `    → 两个进程写同一文件，logback 与 logrotate 会互相踩（fd 指向已重命名的 inode）。`
    );
  }
}

if (problems.length) {
  console.error(`✗ 调度线程池配置存在 ${problems.length} 处问题：\n`);
  for (const p of problems) console.error('  · ' + p + '\n');
  process.exit(1);
}

console.log('✓ 调度线程池配置正常');
for (const n of notes) console.log('  · ' + n);
process.exit(0);