// JSON 日期契约守卫（第6 批动作 26）
//
// 守护三条不变式：
//   ① 必须有全局日期配置（JacksonConfig 且注册为 Jackson2ObjectMapperBuilderCustomizer）。
//      历史状态：零 Jackson 配置、零 @JsonFormat —— 全靠各 DTO 自觉，靠不住。
//   ② LocalDateTime 出参必须带时区标识 Z。
//      ⚠️ 实测踩过的坑：用 `new LocalDateTimeSerializer(fmt.withZone(ZoneOffset.UTC))`
//      对 LocalDateTime **不生效**（它是无时区类型，withZone 被忽略），产出仍是裸串。
//      而前端 shared/domain/datetime.js 的 utcToZoned 只看尾部有没有 Z：
//      没有就自己补一个并按 UTC 解读 —— 对「本意是本地墙钟」的时间就是静默偏移。
//      所以这里要求源码里存在**显式拼接 Z** 的写法，而不是只检查注册了模块。
//   ③ 禁止新增裸 new ObjectMapper()（会绕过全局配置，静默产生第二种 JSON 形态）。
//      现有两处（WeChatService / TeacherPublishedProfileService）已登记豁免：
//      它们只用 readTree 做「读」，不参与序列化，故不受日期配置影响。
//
// 统一跳过后缀：SKIP_DATE_CONTRACT=1

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'api/src/main/java');

function read(fp) {
  return fs.readFileSync(fp, 'utf8');
}

/**
 * 剥掉注释，保留字符串字面量。
 *
 * <p>⚠️ 与 result-contract 守卫的 stripCommentsAndStrings **刻意不同**：
 * 那个守卫要判"某段逻辑是否存在"，所以连字符串一起剥；这里要判
 * `value.format(...) + "Z"` 这种**含字面量**的写法，若把字符串也剥成 ""，
 * 拼接 Z 就会被自己判成"没有 Z"（实测踩到：守卫对着正确代码报红）。
 *
 * <p>折中：剥注释但把字符串内容做标记保留，使其仍可被正则识别。
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ');
}

/** 完整剥离：注释 + 字符串。用于只判标识符存在性的场合。 */
function stripCommentsOnly(src) {
  return stripComments(src)
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) walk(fp, acc);
    else if (e.name.endsWith('.java')) acc.push(fp);
  }
  return acc;
}

function rel(fp) {
  return path.relative(ROOT, fp).split(path.sep).join('/');
}

const problems = [];
const checks = [];

// ── ① 全局日期配置必须存在且以正确方式注册 ───────────────────────────
const cfgPath = path.join(SRC, 'com/reservation/config/JacksonConfig.java');
if (!fs.existsSync(cfgPath)) {
  problems.push(
    'api/.../config/JacksonConfig.java 不存在。\n' +
    '      没有全局日期配置时，各 DTO 的时间格式全靠自觉；而前端已按"后端返带Z 的串"设计，\n' +
    '      一旦某个字段输出裸串就会被按 UTC 解读，造成静默时区偏移。'
  );
} else {
  const src = read(cfgPath);
  const code = stripComments(src);

  // 注册形式必须是 Jackson2ObjectMapperBuilderCustomizer。
  // 若改成 `@Bean ObjectMapper`，Spring Boot 的 builder 定制机制会被绕过：
  // 不报错，只是不生效 —— 典型静默失效。
  if (!/Jackson2ObjectMapperBuilderCustomizer/.test(code)) {
    problems.push(
      `${rel(cfgPath)} 必须通过 Jackson2ObjectMapperBuilderCustomizer 注册。\n` +
      `      改成 @Bean ObjectMapper 会绕过 Spring Boot 的 builder 定制流程：不报错，只是不生效。`
    );
  }
  if (!/builder\.modules\(/.test(code)) {
    problems.push(`${rel(cfgPath)} 没有 builder.modules(...) 注册，配置不会作用于任何类型。`);
  }
  // 出参必须显式拼 Z（withZone 对 LocalDateTime 无效，见守卫头注释）
  if (!/\+\s*"Z"/.test(code)) {
    problems.push(
      `${rel(cfgPath)} LocalDateTime 出参没有显式拼接 Z。\n` +
      `      实测：new LocalDateTimeSerializer(fmt.withZone(ZoneOffset.UTC)) 对 LocalDateTime **不生效**\n` +
      `      （它是无时区类型），产出仍是裸串 "2026-10-09T21:31:22"，前端会自行补 Z 按 UTC 解读。\n` +
      `      必须在自定义序列化器里 value.format(...) + "Z"。`
    );
  }
  // 禁掉数字时间戳
  if (!/WRITE_DATES_AS_TIMESTAMPS/.test(code)) {
    problems.push(
      `${rel(cfgPath)} 未禁用 WRITE_DATES_AS_TIMESTAMPS。\n` +
      `      数字时间戳（13 位毫秒）不带时区语义，前端无法判别是哪个时区的时间。`
    );
  }
  checks.push('① 全局日期配置存在且注册方式正确');
}

// ── ②③ 扫全部 Java：裸 new ObjectMapper ──────────────────────────────
// 已登记豁免：这两处只用 readTree（读 JSON），不参与序列化，
// 因此日期配置对它们无影响。改用 writeValueAsString 时必须摘掉豁免。
const EXEMPT = new Map([
  ['api/src/main/java/com/reservation/service/WeChatService.java',
   '只用 readTree 读微信返回的 JSON，不参与序列化'],
  ['api/src/main/java/com/reservation/service/TeacherPublishedProfileService.java',
   '只用 readTree 解析 draft_data，不参与序列化'],
]);

//豁免有效性校验：豁免的前提是"只读"。若将来这两处开始写 JSON，豁免即失效。
for (const [relPath, why] of EXEMPT) {
  const fp = path.join(ROOT, relPath);
  if (!fs.existsSync(fp)) continue;
  const code = stripComments(read(fp));
  if (/writeValueAsString|writeValue\(/.test(code)) {
    problems.push(
      `${relPath} 原以"只读"为由豁免裸 ObjectMapper，但现在出现了写操作。\n` +
      `      原豁免理由：${why}。既然开始写 JSON，就必须改为注入容器里的 ObjectMapper，\n` +
      `      否则它会绕过全局日期配置，产生第二种 JSON 形态。`
    );
  }
}

let bareCount = 0;
for (const fp of walk(SRC)) {
  const code = stripComments(read(fp));
  if (!/new\s+ObjectMapper\s*\(/.test(code)) continue;
  const r = rel(fp);
  if (EXEMPT.has(r)) continue;
  bareCount++;
  problems.push(
    `${r} 出现裸 new ObjectMapper()，会绕过全局 Jackson 配置。\n` +
    `      请改为注入容器 bean（构造注入或 @Autowired），让全局日期/序列化配置真正生效。`
  );
}
checks.push(`② LocalDateTime 出参显式带 Z（无 withZone 陷阱）`);
checks.push(`③ 无未豁免的裸 new ObjectMapper()（豁免 ${EXEMPT.size} 处只读用例）`);

// ── 输出 ───────────────────────────────────────────────────────────────
if (problems.length) {
  console.log('\n❪ check:date-contract 失败\n');
  for (const p of problems) console.log('  · ' + p);
  console.log('');
  process.exit(1);
} else {
  for (const c of checks) console.log('✅ ' + c);
  console.log(`\n豁免 ${EXEMPT.size} 处（只读用例，且已校验未出现写操作）。`);
}
