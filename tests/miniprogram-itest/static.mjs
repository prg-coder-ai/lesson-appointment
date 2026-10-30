// 小程序静态健康扫描（无浏览器）：
// 1) 全部 .js 按 ESM 语法校验（node --check，拷为 .mjs）
// 2) 全部 .json 解析校验
// 3) app.json 注册页四件套(api.js/json/wxml/wxss 至少前三)齐全
// 4) 各页 json 的 usingComponents 引用均存在
// 仅读取，不修改任何产品文件。
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../../../miniprogram');
const TMP = 'C:/Temp/mpstatic';
const node = process.execPath;

const results = [];
function ck(name, ok, detail = '') { results.push({ name, ok, detail }); }

function walk(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

// 1) JS 语法（ESM）
const jsFiles = walk(ROOT).filter(f => f.endsWith('.js'));
let jsPass = 0, jsFail = 0;
for (const f of jsFiles) {
  const rel = relative(ROOT, f).replace(/\\/g, '/');
  const tmp = join(TMP, rel + '.mjs');
  mkdirSync(dirname(tmp), { recursive: true });
  writeFileSync(tmp, readFileSync(f));
  try {
    execSync(`"${node}" --check "${tmp}"`, { stdio: 'pipe' });
    jsPass++;
  } catch (e) {
    jsFail++;
    ck('JS语法 ' + rel, false, String(e.stderr || e.message).split('\n').slice(0, 3).join(' | '));
  }
}
ck(`JS 语法全量 (${jsFiles.length} 个)`, jsFail === 0, `通过 ${jsPass} / 失败 ${jsFail}`);

// 2) JSON 解析
const jsonFiles = walk(ROOT).filter(f => f.endsWith('.json'));
let jsonFail = 0;
for (const f of jsonFiles) {
  const rel = relative(ROOT, f).replace(/\\/g, '/');
  try { JSON.parse(readFileSync(f, 'utf8')); }
  catch (e) { jsonFail++; ck('JSON ' + rel, false, e.message); }
}
ck(`JSON 解析全量 (${jsonFiles.length} 个)`, jsonFail === 0, `失败 ${jsonFail}`);

// 3)+4) 注册页四件套 + usingComponents
const appJson = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8'));
const pages = [...(appJson.pages || [])];
for (const sp of (appJson.subPackages || appJson.subpackages || [])) {
  const root = sp.root.replace(/\/$/, '');
  for (const p of (sp.pages || [])) pages.push(root + '/' + p.replace(/^\//, ''));
}
let pageBad = 0, compBad = 0;
for (const pg of pages) {
  const base = join(ROOT, pg);
  const need = ['.js', '.json', '.wxml'];
  for (const ext of need) {
    if (!existsSync(base + ext)) { pageBad++; ck('页面缺文件 ' + pg + ext, false); }
  }
  // usingComponents
  const jf = base + '.json';
  if (existsSync(jf)) {
    let j; try { j = JSON.parse(readFileSync(jf, 'utf8')); } catch { j = null; }
    if (j && j.usingComponents) {
      const dir = dirname(base);
      for (const [name, cp] of Object.entries(j.usingComponents)) {
        // 小程序规则：以 '/' 开头 = 相对项目根(miniprogram/)；否则相对当前页目录
        const target = cp.startsWith('/')
          ? join(ROOT, cp + '.json')
          : resolve(dir, cp + '.json');
        if (!existsSync(target)) { compBad++; ck(`组件缺失 ${pg} -> ${name}(${cp})`, false); }
      }
    }
  }
}
ck(`注册页四件套 (${pages.length} 页)`, pageBad === 0, `缺文件 ${pageBad}`);
ck('usingComponents 引用完整性', compBad === 0, `缺失 ${compBad}`);

const bad = results.filter(r => !r.ok);
for (const r of results) console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.ok ? '' : '  -> ' + r.detail));
console.log(`\n==== STATIC: ${results.length - bad.length} PASS / ${bad.length} FAIL ====`);
process.exit(bad.length ? 1 : 0);
