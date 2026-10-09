// 跨端状态契约守卫（第 6 批动作 25）
//
// 背景：状态串历史上散落前后端各处，出现过cancelled/canceled 两套拼写并存。
// 本项目已把两端各自的定义收敛到 BookingStatus.java / bookingState.js，
// 但**两个文件之间**仍可能漂移，且其中存在**刻意保留的差异**（如前端多一个防御项
// 'deleted'）。本守卫的职责不是强行让两边相等，而是：
//
//   凡两边不一致 → 必须在 shared/domain/status-contract.json 的 registeredDiffs
//                里写明理由；未登记的差异 = 漂移 = 报错。
//
// 这样既能守住一致性，又不会因为"抹平差异"而毁掉有据可查的防御逻辑。
//
// 三条判定：
//   ① booking 的 NON_OCCUPYING 集合：后端 ⊆ 前端，且前端的超出部分必须在
//      registeredDiffs 里逐项登记且带 reason。
//   ② 前端出现的每个状态串，必须能在后端常量或登记差异里找到出处
//      （反之亦然）—— 防止"前端写了新状态但忘了后端"或"后端加了没人知道"。
//   ③ bookingStatusText 必须保留 profile 参数：跨端文案差异是已拍板的决策，
//      若有人把 profile 去掉、合成一套，就会推翻该决策。
//
// 统一跳过后缀：SKIP_STATUS_CONTRACT=1

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ');
}

const problems = [];

// ── 读契约 ────────────────────────────────────────────────────────────────
const CONTRACT_PATH = 'shared/domain/status-contract.json';
if (!fs.existsSync(path.join(ROOT, CONTRACT_PATH))) {
  console.log(`\n❪ check:status-contract 失败\n\n  · ${CONTRACT_PATH} 不存在。\n`);
  process.exit(1);
}
let contract;
try {
  contract = JSON.parse(read(CONTRACT_PATH));
} catch (e) {
  console.log(`\n❪ check:status-contract 失败\n\n  · ${CONTRACT_PATH} 不是合法 JSON：${e.message}\n`);
  process.exit(1);
}

// ── ① 载入两侧定义 ────────────────────────────────────────────────────────
const bs = contract.booking;
const backendSrc = stripComments(read(bs.backend));
const frontendSrc = stripComments(read(bs.frontend));

// 后端常量：public static final String NAME = "value"
// 要建「常量名 → 字面量」的Map（NON_OCCUPYING 里写的是常量名不是字面量），
// 正则从契约文件读来，但必须补全局标志才能用 matchAll。
const backendConsts = new Map();
for (const m of backendSrc.matchAll(new RegExp(bs.backendConstantsRegex, 'g'))) {
  backendConsts.set(m[1], m[2]);
}

// 后端 NON_OCCUPYING 列表。
//
// ⚠️ 它写的是**常量名**不是字符串字面量：List.of(WAITING, CANCELLED, ...)。
//    只认 "..." 的正则会解析成空数组，于是"后端有 5 项、前端多出 5 项"——
//    报出一堆假的漂移（实测踩到）。必须先把常量名解析回它定义时的字面量。
const boRe = /NON_OCCUPYING\s*=\s*List\.of\(([^)]*)\)/;
const boM = boRe.exec(backendSrc);
let backendNonOccupying = null;
if (boM) {
  backendNonOccupying = [...boM[1].matchAll(/"([a-zA-Z-]+)"|\b([A-Z][A-Z0-9_]*)\b/g)]
    .map(x => x[1] !== undefined ? x[1] : backendConsts.get(x[2]))
    .filter(Boolean);
  // 常量名解析不到字面量说明常量表没抓全，属守卫自身问题，要暴露而不是静默
  const unresolved = [...boM[1].matchAll(/\b([A-Z][A-Z0-9_]*)\b/g)]
    .map(x => x[1])
    .filter(n => !backendConsts.has(n));
  if (unresolved.length) {
    problems.push(
      `${bs.backend} 的 NON_OCCUPYING 引用了无法解析的常量：${unresolved.join(', ')}。\n` +
      `      守卫的常量表（backendConstantsRegex）没抓到它们的定义，请同步契约里的正则。`
    );
  }
}

// 前端 NON_OCCUPYING_STATUSES 列表
const foRe = new RegExp(bs.frontendSetRegex);
const foM = foRe.exec(frontendSrc);
const frontendNonOccupying = foM
  ? [...foM[1].matchAll(/'([a-zA-Z-]+)'/g)].map(x => x[1])
  : null;

if (!backendNonOccupying) {
  problems.push(`${bs.backend} 里找不到 NON_OCCUPYING = List.of(...) 定义。`);
}
if (!frontendNonOccupying) {
  problems.push(`${bs.frontend} 里找不到 NON_OCCUPYING_STATUSES = Object.freeze([...]) 定义。`);
}

if (backendNonOccupying && frontendNonOccupying) {
  // ── ② 后端集合必须是前端集合的子集 ──
  const feSet = new Set(frontendNonOccupying);
  const beSet = new Set(backendNonOccupying);
  for (const v of backendNonOccupying) {
    if (!feSet.has(v)) {
      problems.push(
        `前端 NON_OCCUPYING_STATUSES 缺少后端已有的状态 "${v}"。\n` +
        `      后端不占席位，前端却判为占位 → 席位被吃掉、排期永远满员、候补递补不进来。`
      );
    }
  }

  // ── ③ 前端多出来的每一项都必须在 registeredDiffs 里登记且带 reason ──
  const registered = new Map(
    (bs.nonOccupying.registeredDiffs || []).map(d => [d.value, d])
  );
  for (const v of frontendNonOccupying) {
    if (beSet.has(v)) continue;            // 两边都有，不是差异
    const d = registered.get(v);
    if (!d) {
      problems.push(
        `前端 NON_OCCUPYING 多出 "${v}"，但未在 ${CONTRACT_PATH} 的 registeredDiffs 登记理由。\n` +
        `      未登记的差异无法复核，一律视为漂移。若确属有意，请补 { "value": "${v}", "presentIn": "frontend", "reason": "..." }。`
      );
    } else if (!d.reason || d.reason.trim().length < 20) {
      problems.push(
        `registeredDiffs 中的 "${v}" 缺 reason，或理由过短（<20 字）。\n` +
        `      "前端需要"这种无法复核的说法不合格，必须说清"为什么两边不一样、风险是什么"。`
      );
    }
  }
  // 登记了但前端已不存在的差异 → 契约过期，同样要报
  for (const v of registered.keys()) {
    if (!frontendNonOccupying.includes(v)) {
      problems.push(
        `registeredDiffs 登记了 "${v}"，但前端 NON_OCCUPYING_STATUSES 里已没有它。\n` +
        `      契约已过期，请删除该登记项（保留会让守卫失去意义）。`
      );
    }
  }
}

// ── ④ bookingStatusText 必须保留 profile 参数 ──
const bstRe = /export function bookingStatusText\s*\(([^)]*)\)/;
const bstM = bstRe.exec(frontendSrc);
if (!bstM) {
  problems.push(`${bs.frontend} 里找不到 bookingStatusText 函数定义。`);
} else if (bs.wordingDiff && bs.wordingDiff.requiredProfileParam) {
  if (!/\bopts\b/.test(bstM[1])) {
    problems.push(
      `bookingStatusText 的参数列表里没有 opts/profile，跨端文案差异将被抹平。\n` +
      `      Web=「预定待确认/预定已确认」、小程序=「待确认/已确认」是**已拍板的差异**，\n` +
      `      去掉 profile 等于把两端合成一套。`
    );
  }
  if (!/STATUS_TEXT_PROFILES/.test(frontendSrc)) {
    problems.push(`frontendSrc 里找不到 STATUS_TEXT_PROFILES，文案映射的单一来源缺失。`);
  }
}

// ── ⑤ 课次保留前缀不得被挪作他用 ──
const ap = contract.appointment;
if (ap) {
  const apFront = stripComments(read(ap.frontend));
  const reserved = Object.keys(ap.reservedPrefixes || {});
  for (const p of reserved) {
    if (!apFront.includes(`'${p}'`) && !apFront.includes(`"${p}"`)) {
      problems.push(
        `${ap.frontend} 里找不到保留前缀 "${p}"。\n` +
        `      它已被 ${ap.reservedPrefixes[p]}，不得挪作他用（整单取消尤其不可占用 t- 前缀）。`
      );
    }
  }
  // 前缀语义：s- / t- / 无前缀
  for (const [pfx, meaning] of Object.entries(ap.prefixSemantics || {})) {
    if (pfx.startsWith('_')) continue;      // 说明性字段
    if (!new RegExp(`'${pfx === 'none' ? '' : pfx}[a-z-]+'`).test(apFront)
        && pfx !== 'none') {
      problems.push(
        `${ap.frontend} 里找不到 "${pfx}" 前缀的状态串（语义：${meaning}）。\n` +
        `      前缀规则是铁律，缺失说明被误删。`
      );
    }
  }
}

// ── 输出 ──────────────────────────────────────────────────────────────────
if (problems.length) {
  console.log('\n❪ check:status-contract 失败\n');
  for (const p of problems) console.log('  · ' + p);
  console.log('');
  process.exit(1);
} else {
  console.log('✅ ① 后端 NON_OCCUPYING ⊆ 前端');
  console.log('✅ ② 前端超出项均已登记理由（registeredDiffs）');
  console.log('✅ ③ bookingStatusText 保留 profile 参数（跨端文案差异未被抹平）');
  console.log('✅ ④ 课次保留前缀在位、语义完整');
  console.log(`\n后端不占席位 ${backendNonOccupying.length} 项 / 前端 ${frontendNonOccupying.length} 项` +
              `（登记差异 ${(bs.nonOccupying.registeredDiffs || []).length} 项）`);
}
