// 统一错误响应契约守卫（第 6 批动作 28/29）
//
// 守护四条不变式：
//   ① Result.code 必须是 primitive int —— 历史上是 Integer，于是出现了 fail(null, ...)。
//      null 叠加 spring.jackson 的 default-property-inclusion=non_null，
//      序列化后整个 code 字段从JSON 里消失，响应只剩 {"message":"..."}。
//   ② 禁止 Result.fail(null, ...) 与 Result.fail(0, ...)：
//      0 既非成功码也非标准错误码；null 见①。两者都让客户端无法判定成败。
//   ③ fail() 必须有code 白名单断言（开发期把非法码暴露出来，而不是让它上线）。
//   ④ ErrorCodes 的异常→码映射必须与 GlobalExceptionHandler 的 @ExceptionHandler 保持一致，
//      否则同一个异常在"被 Controller 捕获"与"逃到 handler"两条路径下 code 不同（契约分叉）。
//
// 统一跳过后缀：SKIP_RESULT_CONTRACT=1

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JAVA_DIRS = [
  'api/src/main/java',
  'api/message-service/src/main/java',
];

function readLines(fp) {
  return fs.readFileSync(fp, 'utf8').split(/\r?\n/);
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

/**
 * 剥掉 Java 源码里的注释与字符串字面量，只留可执行结构。
 * 守卫里凡是"判断某段逻辑是否存在"的地方都要用它——否则注释里写一句
 * `// 历史用 Integer 时出现过 Result.fail(null, ...)` 就会被当成真代码，
 * 或反过来让人用改注释的方式绕过判定。
 */
function stripCommentsAndStrings(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')      // 块注释
    .replace(/\/\/[^\n]*/g, ' ')             // 行注释
    .replace(/"(?:\\.|[^"\\])*"/g, '""')     // 双引号字符串
    .replace(/'(?:\\.|[^'\\])*'/g, "''");    // 字符字面量
}

const problems = [];
let files = 0;
let failCalls = 0;

// ── ①② 扫描所有 Java 文件 ────────────────────────────────────────────────
for (const d of JAVA_DIRS) {
  for (const fp of walk(path.join(ROOT, d))) {
    files++;
    const lines = readLines(fp);
    const isResultFile = /common[\\/]Result\.java$/.test(fp);

    lines.forEach((ln, i) => {
      const at = `${rel(fp)}:${i + 1}`;

      // ⚠️ 必须跳过注释里的示例：本守卫自身在 ErrorCodes/Result 的注释里写了
      //    "历史写法 Result.fail(null,...)" 作为说明，若不跳过就会自我误报
      //    （实测踩到：3 处误报全部来自注释行）。注释不是可执行代码。
      const t = ln.trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.endsWith('*/')) return;

      // ① Result.code 必须是 primitive
      if (isResultFile && /^\s*private\s+(Integer|String|Long)\s+code\s*;/.test(ln)) {
        problems.push(
          `${at} Result.code 必须是 primitive int，不能是 ${/private\s+(\w+)/.exec(ln)[1]}。\n` +
          `      用包装类型时 fail(null,...) 编译期无法被拦；叠加 non_null 序列化会让 code 字段从 JSON 消失。`
        );
      }

      // ② 禁止 fail(null) / fail(0)
      const bad = /Result\.fail\(\s*(null|0)\s*[,)]/.exec(ln);
      if (bad) {
        problems.push(
          `${at} 禁止 Result.fail(${bad[1]}, ...)。\n` +
          `      ${bad[1] === 'null'
            ? 'null + non_null 序列化会让整个 code 字段消失，客户端读res.code 得到 undefined。'
            : '0 既非成功码（200）也非标准错误码，属于"看起来有契约、实则无意义"。'}\n` +
          `      应改为具体错误码，或用 ErrorCodes.fail(e) 由异常语义推导。`
        );
      }

      // fail(null/0) 计数（用于自检）
      if (/Result\.fail\(/.test(ln)) failCalls++;
    });
  }
}

// ── ③ Result.fail 必须有断言 ─────────────────────────────────────────────
for (const fp of [
  path.join(ROOT, 'api/src/main/java/com/reservation/common/Result.java'),
  path.join(ROOT, 'api/message-service/src/main/java/com/messagecenter/common/Result.java'),
]) {
  if (!fs.existsSync(fp)) {
    problems.push(`${rel(fp)} 不存在，无法校验错误码契约。`);
    continue;
  }
  const src = fs.readFileSync(fp, 'utf8');
  const failBody = /public static <T> Result<T> fail\([^)]*\)\s*\{([\s\S]*?)\n    \}/.exec(src);
  if (!failBody) {
    problems.push(`${rel(fp)} 未找到 fail() 方法体，无法校验是否含错误码断言。`);
    continue;
  }
  const body = failBody[1];

  // ⚠️ 不要用 /code\s*==\s*null/ 这类**文本匹配**判断有没有断言。
  // 实测踩到：把 `if (code == null)` 改成 `if (false)` 后，文本匹配仍然命中
  // ALLOWED_CODES 等其它词，守卫报绿 —— 而 fail(null) 已经在静默返回。
  // 正确做法：先剥掉注释与字符串字面量（避免注释里的示例干扰），
  // 再要求存在 null 分支且该分支内确有 throw。
  const bodyCode = stripCommentsAndStrings(body);

  // ③-1 必须显式判过 null，且分支里必须抛
  const nullBranch = /if\s*\(\s*code\s*==\s*null\s*\)\s*\{([\s\S]*?)\}/.exec(bodyCode);
  if (!nullBranch) {
    problems.push(
      `${rel(fp)} fail() 没有校验 code == null。\n` +
      `      入参是 Integer，fail(null) 能编译通过；不显式拦截就会造出无code 的失败响应。`
    );
  } else if (!/throw\s/.test(nullBranch[1])) {
    problems.push(
      `${rel(fp)} fail() 的 code == null 分支里没有 throw。\n` +
      `      只判断不抛等于放行；该分支必须抛异常让开发期立刻暴露。`
    );
  }

  // ③-2 必须有白名单校验（挡住0 这类"看起来合法"的错码）
  const wl = /ALLOWED_CODES[\s\S]*?Arrays\.asList\(([^)]*)\)/.exec(src);
  if (!wl) {
    problems.push(`${rel(fp)} 未找到 ALLOWED_CODES 白名单定义（应为 Arrays.asList 形式）。`);
  } else {
    if (/\b0\b/.test(wl[1])) {
      problems.push(`${rel(fp)} ALLOWED_CODES 白名单里出现了 0，必须移除。`);
    }
    if (!/return\s+500\s*;/.test(bodyCode) && !/ALLOWED_CODES\.contains/.test(bodyCode)) {
      problems.push(`${rel(fp)} fail() 未对白名单做实际校验（缺少 ALLOWED_CODES.contains 调用）。`);
    }
  }
}

// ── ④ ErrorCodes 映射必须与 GlobalExceptionHandler 一致 ───────────────────
{
  const ecPath = path.join(ROOT, 'api/src/main/java/com/reservation/common/ErrorCodes.java');
  const gehPath = path.join(ROOT, 'api/src/main/java/com/reservation/exception/GlobalExceptionHandler.java');
  if (!fs.existsSync(ecPath)) {
    problems.push('common/ErrorCodes.java 不存在：Controller 就地捕获异常时无法按语义给码。');
  } else {
    const ec = fs.readFileSync(ecPath, 'utf8');
    const geh = fs.readFileSync(gehPath, 'utf8');

    // 权威表：GlobalExceptionHandler 里 每个 @ExceptionHandler 对应的 Result.fail(码, ...)
    // 只校验有明确 @ExceptionHandler 的类型，纯 500兜底 不参与比对。
    const PAIRS = [
      ['UnLoginException', 401],
      ['NoPermissionException', 403],
      ['BusinessException', 400],
      ['UserNotFoundException', 404],
      ['ResourceNotFoundException', 404],
    ];
    for (const [exc, code] of PAIRS) {
      // GlobalEnvironmentHandler 侧：该 handler 后面紧跟的 Result.fail(码, ...)
      //
      // @ExceptionHandler 有两种写法，都要认：
      //   @ExceptionHandler(Foo.class)               单类
      //   @ExceptionHandler({Foo.class, Bar.class})  数组（404 的两个异常就是合并写的）
      // 实测踩到：正则原本只支持单类形式，把合并写法判成"缺失 handler"，属守卫误报。
      const h = new RegExp(
        `@ExceptionHandler\\([^)]*${exc}\\.class[^)]*\\)[\\s\\S]{0,600}?Result\\.fail\\(\\s*${code}\\b`
      );
      if (!h.test(geh)) {
        problems.push(
          `GlobalExceptionHandler 中 ${exc} 应对应 ${code}，未匹配到。\n` +
          `      若确已改过，请同步更新本守卫或 ErrorCodes 的映射表。`
        );
      }
      // ErrorCodes 侧：instanceof 判断后 return 该码
      const e = new RegExp(`instanceof\\s+${exc}\\b[\\s\\S]{0,200}?return\\s+${code}\\s*;`);
      if (!e.test(ec)) {
        problems.push(
          `ErrorCodes 缺少 ${exc} → ${code} 的映射，或映射位置不对。\n` +
          `      缺失会让该异常落到 500，与 GlobalExceptionHandler 的${code} 分叉。`
        );
      }
    }

    // IllegalArgumentException 必须映射 400（Controller 里大量直接catch 它）
    if (!/instanceof\s+IllegalArgumentException\b[\s\S]{0,200}?return\s+400\s*;/.test(ec)) {
      problems.push(
        'ErrorCodes 缺少 IllegalArgumentException → 400 的映射。\n' +
        '      BookingController#create 直接 catch 它并 fail(400)，若走 ErrorCodes 就会落到 500。'
      );
    }
  }
}

// ── 输出 ────────────────────────────────────────────────────────────────
if (problems.length) {
  console.log('\n❪ check:result-contract 失败\n');
  for (const p of problems) console.log('  · ' + p);
  console.log(`\n扫描 ${files} 个 Java 文件，${failCalls} 处 Result.fail 调用。`);
  console.log('修复或确属例外时使用 SKIP_RESULT_CONTRACT=1 跳过（不推荐长期依赖）。\n');
  process.exit(1);
} else {
  console.log('✅ ① Result.code 为 primitive int');
  console.log('✅ ② 无 Result.fail(null/0)');
  console.log('✅ ③ fail() 含错误码断言且白名单无 0');
  console.log('✅ ④ ErrorCodes 与 GlobalExceptionHandler 映射一致');
  console.log(`\n扫描 ${files} 个 Java 文件，${failCalls} 处 Result.fail 调用。`);
}
