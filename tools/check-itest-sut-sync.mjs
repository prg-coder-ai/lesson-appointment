// itest 被测系统快照（_sut/_sut_login）同步守卫
//
// 背景（薄弱环节报告 2026-10-10 N1/P0-2）：tests/miniprogram-itest 的 _sut* 是
// logic.mjs / login-flow.mjs 每次运行时从 miniprogram/ 拷出的 ESM 副本。
// 历史上 _sut_login 曾被整目录误提交入库（26 个生成文件），且 cpSync 只覆盖不删除、
// 源码移除的模块会在副本里残留成幽灵文件。本守卫钉住三条不变式：
//   ① _sut* 必须在 .gitignore 中，且 git 不跟踪任何 _sut 文件；
//   ② 每个引用 _sut 的测试 harness 必须自带「先删后拷」自重建块
//      （rmSync(SUT,...) + cpSync(join(SRC,...)），剥注释后匹配——
//      只覆盖不删除的旧写法判红；
//   ③ harness 必须只从 SUT 副本 import 被测模块（不允许 import 源目录，
//      否则 wx mock 与副本加载双轨并存，测试口径分裂）。
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ITEST = join(ROOT, 'tests', 'miniprogram-itest');
const errors = [];

// 剥 // 行注释与 /* */ 块注释（保守：不动字符串内容，本目录文件无含注释符号的字符串路径）
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

// ── ① gitignore + git 不跟踪 ──────────────────────────────────────────
const gitignore = readFileSync(join(ROOT, '.gitignore'), 'utf8');
if (!/^tests\/miniprogram-itest\/_sut\*/m.test(gitignore)) {
  errors.push('① .gitignore 缺少 tests/miniprogram-itest/_sut* 条目');
}
// git ls-files 走子进程在本机会 EBUSY（项目已知约束），改为同进程扫 .git/index 二进制：
// index v2 中路径以明文存储，_sut 字样出现即说明 git 跟踪了生成文件。
const indexPath = join(ROOT, '.git', 'index');
if (existsSync(indexPath)) {
  const idx = readFileSync(indexPath);
  if (idx.includes(Buffer.from('miniprogram-itest/_sut'))) {
    errors.push('① git index 跟踪了生成的 _sut 文件（历史回归，需 git rm --cached 后重提交）');
  }
} else {
  errors.push('① 未找到 .git/index，无法核验 git 跟踪状态');
}

// ── ②③ 每个引用 _sut 的 harness 必须自重建且只 import 副本 ────────────
const harnesses = readdirSync(ITEST).filter(f => f.endsWith('.mjs'));
for (const f of harnesses) {
  const raw = readFileSync(join(ITEST, f), 'utf8');
  const code = stripComments(raw);
  if (!code.includes('_sut')) continue; // 不消费副本的文件（如 static.mjs）跳过

  const hasRm = /rmSync\(SUT\s*,\s*\{[^}]*recursive\s*:\s*true/.test(code);
  const hasCp = /cpSync\(join\(SRC/.test(code);
  if (!hasRm || !hasCp) {
    errors.push(`② ${f} 缺少「先删后拷」自重建块（rmSync(SUT,{recursive:true}) + cpSync(join(SRC...)）` +
      (hasRm ? '' : ' [缺 rmSync]') + (hasCp ? '' : ' [缺 cpSync]'));
  }
  // import 源目录 = 绕过副本：from import(...SRC...) 或相对路径直指 miniprogram
  if (/import\([^)]*SRC[^)]*\)/.test(code)) {
    errors.push(`③ ${f} 直接从源目录 import 被测模块，必须只从 SUT 副本加载`);
  }
}

if (!existsSync(ITEST)) {
  errors.push('tests/miniprogram-itest 目录不存在');
}

if (errors.length) {
  console.error('❌ check:itest-sut 守卫未通过：');
  for (const e of errors) console.error('   - ' + e);
  process.exit(1);
}
console.log('✅ ① _sut* 已 gitignore 且 git 零跟踪');
console.log('✅ ② 全部 _sut 消费 harness 自带先删后拷自重建块');
console.log('✅ ③ harness 仅从 SUT 副本加载被测模块');
console.log(`\n扫描 ${harnesses.length} 个 itest harness 文件。`);
process.exit(0);
