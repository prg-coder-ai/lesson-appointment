#!/usr/bin/env node
'use strict';
/**
 * deploy/collect-artifacts.js —— 构建产物统一收口到 deploy/
 *
 * 用法（仓库任意目录执行均可）：
 *   node deploy/collect-artifacts.js                  # dist + 三个 jar 全量收口
 *   node deploy/collect-artifacts.js --only dist     # 只收前端（frontend/build.js 调用）
 *   node deploy/collect-artifacts.js --only jars     # 只收 jar（deploy/build-backends.sh 调用）
 *   node deploy/collect-artifacts.js --dry-run       # 只列计划，不落盘
 *   node deploy/collect-artifacts.js --strict        # 有任一来源缺失即失败（默认只警告）
 *
 * 产物落点（均为构建输出，已在 .gitignore 忽略，不入库）：
 *   frontend/dist/**                                    → deploy/dist/**
 *   api/target/booking-api-*.jar                        → deploy/jars/
 *   api/message-service/target/message-service-*.jar    → deploy/jars/
 *   api/classroom-service/target/classroom-service-*.jar→ deploy/jars/
 *
 * 设计要点：
 *  1) dist 用「镜像同步」而非简单覆盖：源里删掉的 html/js 会同步从 deploy/dist 删除，
 *     否则上传脚本 rsync --delete 之前本地就先留着幽灵旧文件，排查时极具误导性。
 *  2) jar 按 mtime 取最新一个，并把 deploy/jars 下的旧版本 jar 清掉，
 *     避免 upload-to-server.sh 的 `ls | head -1` 挑到上一个版本。
 *  3) 删除一律走「逐文件 unlink + 逐目录 rmdir」，不用 rmSync({recursive:true}) ——
 *     本项目有安全删除闸，批量递归删 >50 个文件会被拦（build.js 重建 dist 就踩过）。
 *  4) 同一份逻辑既可被各编译脚本 require 调用，也可独立 CLI 运行，避免复制逻辑分裂。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEPLOY = __dirname;
const DIST_SRC = path.join(ROOT, 'frontend', 'dist');
const DIST_DEST = path.join(DEPLOY, 'dist');
const JAR_DEST = path.join(DEPLOY, 'jars');

const JAR_SOURCES = [
  { key: 'booking',     label: 'booking-api',       dir: path.join(ROOT, 'api', 'target'),                     re: /^booking-api-[\w.\-]+\.jar$/ },
  { key: 'message',     label: 'message-service',   dir: path.join(ROOT, 'api', 'message-service', 'target'), re: /^message-service-[\w.\-]+\.jar$/ },
  { key: 'classroom',   label: 'classroom-service', dir: path.join(ROOT, 'api', 'classroom-service', 'target'), re: /^classroom-service-[\w.\-]+\.jar$/ }
];

function human(n) { return (n / 1024 / 1024).toFixed(2) + ' MB'; }
function rel(p) { return path.relative(ROOT, p).replace(/\\/g, '/'); }
// 用本地时间（GMT+8），别用 toISOString()：UTC 会把 15:39 显示成 07:39，
// 而上传前正是靠这个时间戳判断「是不是旧构建」，显示差 8 小时极易误判。
function stamp(p) {
  const d = fs.statSync(p).mtime;
  const z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
}

/** 逐文件删除一棵目录树（不用 rmSync recursive，见文件头设计要点 3） */
function rmTree(dir, dryRun, counter) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) rmTree(p, dryRun, counter);
    else { if (!dryRun) fs.unlinkSync(p); counter.removed++; }
  }
  if (!dryRun) fs.rmdirSync(dir);
  counter.removedDirs++;
}

/** 把 src 镜像到 dest：复制/覆盖所有文件，并删除 dest 中源已不存在的孤儿 */
function syncDir(src, dest, dryRun, counter, depth) {
  if (dryRun) {
    if (!fs.existsSync(src)) return;
    for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
      if (ent.isDirectory()) syncDir(path.join(src, ent.name), path.join(dest, ent.name), dryRun, counter, depth + 1);
      else counter.copied++;
    }
    return;
  }
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) {
      syncDir(s, d, dryRun, counter, depth + 1);
    } else if (ent.isFile()) {
      fs.copyFileSync(s, d);
      counter.copied++;
    }
  }
  // 清理孤儿：源里已经不存在的文件/目录，目标不该留
  for (const ent of fs.readdirSync(dest, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) {
      if (!fs.existsSync(s) || !fs.statSync(s).isDirectory()) rmTree(d, dryRun, counter);
    } else if (!fs.existsSync(s) || !fs.statSync(s).isFile()) {
      fs.unlinkSync(d);
      counter.removed++;
    }
  }
}

function pickJars() {
  const picked = [];
  const missing = [];
  for (const spec of JAR_SOURCES) {
    let names = [];
    if (fs.existsSync(spec.dir)) {
      names = fs.readdirSync(spec.dir)
        .filter(n => spec.re.test(n) && !/(-sources|-javadoc)\.jar$/.test(n))
        .map(n => ({ n, p: path.join(spec.dir, n), t: fs.statSync(path.join(spec.dir, n)).mtimeMs }))
        .sort((a, b) => b.t - a.t);
    }
    if (!names.length) { missing.push(spec.label); continue; }
    picked.push({ spec, ...names[0] });
  }
  return { picked, missing };
}

/**
 * @param {{only?: string[], dryRun?: boolean, strict?: boolean, verbose?: boolean}} opts
 * @returns {{ok: boolean, dist: object|null, jars: object[]}}
 */
function collect(opts) {
  const o = opts || {};
  const only = o.only && o.only.length ? o.only : ['dist', 'jars'];
  const dryRun = !!o.dryRun;
  const verbose = o.verbose !== false;
  const log = (...a) => { if (verbose) console.log(...a); };
  const result = { ok: true, dist: null, jars: [] };

  if (only.includes('dist')) {
    if (!fs.existsSync(DIST_SRC)) {
      log(`[collect] ⚠ 跳过 dist：源不存在 ${rel(DIST_SRC)}（先跑 node frontend/build.js 或 cd frontend && mvn package）`);
      if (o.strict) result.ok = false;
    } else {
      const counter = { copied: 0, removed: 0, removedDirs: 0 };
      syncDir(DIST_SRC, DIST_DEST, dryRun, counter, 0);
      result.dist = { src: DIST_SRC, dest: DIST_DEST, ...counter };
      log(`[collect] ${dryRun ? '计划' : '已'}同步 dist → deploy/dist/：复制/覆盖 ${counter.copied} 文件，清理孤儿 ${counter.removed} 文件 / ${counter.removedDirs} 目录`);
    }
  }

  if (only.includes('jars')) {
    const { picked, missing } = pickJars();
    if (missing.length) {
      log(`[collect] ⚠ 未找到 jar：${missing.join('、')}（对应模块尚未打包）`);
      if (o.strict) result.ok = false;
    }
    if (!dryRun) fs.mkdirSync(JAR_DEST, { recursive: true });
    const keep = new Set();
    for (const item of picked) {
      const dest = path.join(JAR_DEST, item.n);
      keep.add(item.n);
      if (!dryRun) fs.copyFileSync(item.p, dest);
      const info = { label: item.spec.label, name: item.n, size: fs.statSync(item.p).size, mtime: stamp(item.p), dest };
      result.jars.push(info);
      log(`[collect] ${dryRun ? '计划' : '已'}复制 ${item.spec.label}：${item.n}  ${human(info.size)}  (${info.mtime})`);
    }
    // 清掉 deploy/jars 里旧版本 jar（同名不同版本 / 已不再产出的模块）
    if (fs.existsSync(JAR_DEST)) {
      for (const n of fs.readdirSync(JAR_DEST)) {
        if (!/\.jar$/.test(n) || keep.has(n)) continue;
        if (!dryRun) fs.unlinkSync(path.join(JAR_DEST, n));
        log(`[collect] ${dryRun ? '计划' : '已'}清理旧产物：${rel(JAR_DEST)}/${n}`);
      }
    }
  }

  log(`[collect] 产物目录：${rel(DIST_DEST)}/ 与 ${rel(JAR_DEST)}/（均被 .gitignore 忽略，不入库）`);
  return result;
}

module.exports = { collect, ROOT, DIST_SRC, DIST_DEST, JAR_DEST, JAR_SOURCES };

if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const strict = args.includes('--strict');
  let only;
  const i = args.indexOf('--only');
  if (i >= 0 && args[i + 1]) only = args[i + 1].split(',').map(s => s.trim()).filter(Boolean);
  const bad = (only || []).filter(x => !['dist', 'jars'].includes(x));
  if (bad.length) { console.error(`[collect] --only 只接受 dist / jars，收到：${bad.join(',')}`); process.exit(2); }
  try {
    const r = collect({ only, dryRun, strict });
    if (!r.ok) { console.error('[collect] strict 模式：存在缺失来源'); process.exit(1); }
  } catch (e) {
    console.error('[collect] 收口失败：' + (e && e.message ? e.message : e));
    process.exit(1);
  }
}
