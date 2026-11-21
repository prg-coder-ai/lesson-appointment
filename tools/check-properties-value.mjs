#!/usr/bin/env node
/**
 * 配置值纯净守卫（properties / env 模板）
 * ======================================
 * 背景（2026-11-20 事故）：提交 10772866 编辑 application.properties 时，old_string 带了行尾
 * 换行、new_string 没带，结果把下一段注释「# 过期数据保留（天）」**粘到了值后面**：
 *
 *     classroom.rollcall-timeout-minutes=2# 过期数据保留（天）
 *
 * properties 只认**行首**的 `#` 是注释，于是值变成 `2# 过期数据保留（天）`。
 * 后果不是"配置不生效"，而是**服务起不来**：
 *
 *     Failed to convert value of type 'java.lang.String' to required type 'int';
 *     For input string: "2#..."
 *
 * 这类损坏有三个特点，正好是自动化能补、人工补不上的：
 *   ① 编译通过、打包通过、`git diff` 里看起来只是"少了一行空行"；
 *   ② 报错指向 `@Value` 注入点（ClassroomScheduler.rollcallTimeoutMinutes），
 *      不指向 properties 的那一行，顺着栈最远只到 SpringApplication.run；
 *   ③ 注释是中文时，报错里是一串乱码（值被按 ISO-8859-1 读入），肉眼几乎无法反推原文。
 *
 * 因此本守卫检查两件事：
 *
 *   R1 值里不得出现 `#`（引号内除外）
 *      → 命中即"注释被吞进值"，服务下次启动必挂。
 *
 *   R2 properties 的值里不得出现中文 / 全角标点
 *      → .properties 由 Spring 按 ISO-8859-1 读取，中文值运行期一定是乱码；
 *        而中文注释是安全的（不参与取值）。所以中文出现在**值**里 = 几乎必然是吞了注释，
 *        或者把本该写在注释里的说明写成了值。两种都得改。
 *        真要写中文值，在该行末尾加 `# props-guard:cjk-ok` 显式声明（目前全仓 0 处）。
 *
 * env 模板（deploy/*.env.template）由 systemd 读取，UTF-8 中文值合法，故只查 R1。
 *
 * 紧急跳过：SKIP_PROPS=1 git commit ...
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 扫描目录时整段跳过的目录名（构建产物与依赖） */
const SKIP_DIRS = new Set(['node_modules', 'target', 'dist', '.git', 'logs', 'data']);

/** 中文与全角标点：落在值里就是异常 */
const CJK = /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uff00-\uffef]/;

function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(path.join(dir, e.name), out);
    } else if (e.isFile()) {
      out.push(path.join(dir, e.name));
    }
  }
  return out;
}

/** 收集待检查文件：各服务的 resources 下 *.properties + deploy 下的 env 模板 */
function collect() {
  const files = [];
  for (const svc of ['api', 'api/message-service', 'api/classroom-service']) {
    const res = path.join(ROOT, svc, 'src/main/resources');
    for (const f of walk(res, [])) {
      if (f.endsWith('.properties')) files.push({ file: f, kind: 'properties' });
    }
  }
  const deploy = path.join(ROOT, 'deploy');
  for (const f of walk(deploy, [])) {
    if (f.endsWith('.env.template')) files.push({ file: f, kind: 'env' });
  }
  return files;
}

/**
 * 拆出「键 / 原始值」。
 * properties 的连续行（行尾 `\`）合并处理，避免把多行值误判成键；env 模板不处理续行
 * （shell 里 `\` 续行极少用于 KEY=VALUE，且写错了 shell 自己也起不来）。
 */
function* iterEntries(text, kind) {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    let raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (kind === 'properties') {
      if (trimmed.startsWith('#') || trimmed.startsWith('!')) continue;
    } else {
      if (trimmed.startsWith('#')) continue;
    }
    // 合并续行（properties 才有语义意义，env 也顺手支持，不会误伤）
    let buf = raw;
    while (/\\\s*$/.test(buf) && i + 1 < lines.length) {
      buf = buf.replace(/\\\s*$/, '') + lines[++i].trim();
    }
    const m = buf.match(/^\s*([^=:#\s][^=:]*?)\s*[=:]\s*(.*)$/);
    if (!m) continue;
    yield { line: i + 1, key: m[1].trim(), value: m[2] };
  }
}

/** 值里是否有引号外的 `#` */
function unquotedHash(value) {
  let quote = null;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '#') {
      return i;
    }
  }
  return -1;
}

const problems = [];
const notes = [];
let fileCount = 0;
let entryCount = 0;

for (const { file, kind } of collect()) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  fileCount++;
  let n = 0;
  for (const { line, key, value } of iterEntries(fs.readFileSync(file, 'utf8'), kind)) {
    n++;
    entryCount++;
    const v = value.trim();

    const h = unquotedHash(value);
    if (h >= 0) {
      problems.push(
        `${rel}:${line}  值里出现 #（注释被吞进值）\n` +
        `      键：${key}\n` +
        `      值：${v}\n` +
        `      修：把 "#" 之后的内容拆回独立的一行注释。properties 只认行首的 # 是注释，\n` +
        `          粘在值后面会整段进入取值 → 数值键直接启动失败（NumberFormatException）。`
      );
      continue;
    }

    if (kind === 'properties' && CJK.test(v) && !/#\s*props-guard:cjk-ok/.test(value)) {
      problems.push(
        `${rel}:${line}  properties 的值里出现中文 / 全角标点\n` +
        `      键：${key}\n` +
        `      值：${v}\n` +
        `      修：properties 按 ISO-8859-1 读取，中文值运行期必成乱码；中文通常说明注释被吞进值了。\n` +
        `          要保留中文说明请拆成独立注释行；确实需要中文值就在该行末尾加 "# props-guard:cjk-ok"。`
      );
    }
  }
  notes.push(`${rel}：${n} 条键值`);
}

if (problems.length) {
  console.error(`✗ 配置值纯净检查发现 ${problems.length} 处问题：\n`);
  for (const p of problems) console.error('  · ' + p + '\n');
  console.error('  说明：这类损坏编译不报错、打包不报错，只在下次启动时炸，且报错指向 @Value 注入点。');
  process.exit(1);
}

console.log(`✓ 配置值纯净：${fileCount} 个文件 / ${entryCount} 条键值，值内无 # 、properties 值内无中文`);
for (const n of notes) console.log('  · ' + n);
process.exit(0);
