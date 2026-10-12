#!/usr/bin/env node
/**
 * DDL 漂移守卫（方案 B：静态 Entity ↔ DDL 基线比对）
 *
 * 为什么需要它：根因 C 是"DB 定义没有单一事实源"。实测中最难查的一类缺陷是
 * **实体与表结构各改各的**——实体加了一个字段却没 ALTER（读出来恒为 null，写入报
 * "Unknown column"），或表加了 NOT NULL 无默认值的列而实体没有对应字段（insert 报
 * "Field doesn't have a default value"）。这类缺陷同样**不编译失败、不启动失败**，
 * 只在真实读写那一刻炸，且报错信息往往指向 SQL 而不指向"你改了实体没改表"。
 *
 * 为什么是静态比对（方案 B）而不是连库比对（方案 A）：
 *   - 不依赖数据库可达性 → 能挂进 pre-commit（连库方案在 CI/本地无库时形同虚设，
 *     且拿"库里的表"当真相会把"忘了 ALTER"变成合法状态，守卫反而失去意义）；
 *   - 真相源固定为 api/sql/schema/*.sql，即已归档的权威建库脚本；
 *   - 代价是覆盖不到 mapper XML 里的显式列清单（实测静态解析 69 个候选里约 44 个
 *     误报，不可靠），因此本守卫**只保证实体层**，XML 层留给 CI 上的方案 A 兜底。
 *
 * 六条检查：
 *   1. 实体表存在性：@TableName（或类名驼峰推导的默认表名）必须存在于 DDL 基线。
 *      拼错表名、或表被删而实体遗留，是最难自查的一类。
 *   2. 实体字段存在性：每个持久化字段（驼峰→下划线）必须是表里的真实列。
 *      这条能直接抓出"实体加了字段忘了 ALTER"。
 *   3. 必填列覆盖：表里 NOT NULL 且无默认值的列，实体必须有对应字段。
 *      反向漂移——实体没有该字段时 MyBatis-Plus 的 insert 不会带上它，数据库直接拒绝。
 *   4. 主键一致性：@TableId 映射的列必须是该表的 PRIMARY KEY 之一，且类型族兼容。
 *      类型不兼容的典型症状是"自增主键读出来是 null"或雪花 ID 塞进 int 列溢出。
 *   5. DDL 内部引用完整性：FK 引用的表与列必须真实存在（本项目 FK 是 CASCADE，
 *      引错列＝删父行时静默带走一批子行，性质比悬空引用更隐蔽）。
 *   6. 孤儿表提示：DDL 有表但无任何实体（只提示不阻断：user_refresh_token 这类
 *      只经 XML/原生 SQL 访问的表是合法的）。
 *
 * 豁免分两级（都要**非空理由**——"决定不修"和"修不了"都得有说法，
 *   否则豁免本身会变成新的盲区，等于把守卫的发现能力悄悄关掉）：
 *   - 字段级 `// ddl-align: ignore <理由>`：上一行的字段豁免**检查 2**（实体列不存在）。
 *     典型场景：功能未落地、实体先行。
 *   - 表级   `// ddl-align: ignore-table <理由>`：类声明上方的豁免作用于整张表
 *     （抑制**检查 1** 表不存在 与 **检查 3** 必填列覆盖）。
 *     典型场景：整张表是未落地功能的占位。
 * 类声明上一行的豁免作用于整张表（用于检查 1/3 的表级问题）。
 *
 * 用法：node tools/check-ddl-entity-align.mjs
 * 退出码：0 = 全绿；1 = 有真实漂移（须修或显式豁免）
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

// 实体扫描根：booking 主服务 + message-service 微服务（两套库、两批实体）
const ENTITY_ROOTS = [
  'api/src/main/java/com/reservation/entity',
  'api/message-service/src/main/java/com/messagecenter/entity',
];
// DDL 基线（权威建库脚本，归档于 api/sql/schema）
const SCHEMA_DIR = 'api/sql/schema';

const problems = [];
const notes = [];
let stat = { entities: 0, fields: 0, tables: 0, columns: 0, fks: 0 };

function rel(p) {
  return path.relative(ROOT, p).split(path.sep).join('/');
}

function lineOf(src, index) {
  return src.slice(0, index).split('\n').length;
}

function walk(dir, filter, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, filter, acc);
    else if (filter(full)) acc.push(full);
  }
  return acc;
}

// ============================================================ 解析 DDL 基线
/**
 * 解析 mysqldump 风格建库脚本 → { 表名: { columns: Map, primaryKey: Set, autoIncrement: bool } }
 *
 * ⚠️ 列定义的判定不能只认行首反引号：`KEY`/`CONSTRAINT`/`CHECK` 也会在括号内出现，
 * 但它们各自的首关键字不同，逐行分类即可。真正要防的是**行内出现反引号**的约束行
 * （如 `KEY \`fk_booking_id\` (\`booking_id\`)`），若不排除会被误当成列。
 *
 * ⚠️ 脚本里的中文 COMMENT 存在编码脏数据（GBK/UTF-8 混杂，曾出现半个汉字丢尾字节），
 * 但列名与类型全是 ASCII，故解析不受影响，**不要**试图"修好"注释再解析。
 */
function parseSchema(sql) {
  const tables = new Map();
  const lines = sql.split('\n');
  let cur = null;
  for (const raw of lines) {
    const line = raw.trim();
    const open = line.match(/^CREATE TABLE `([^`]+)`/i);
    if (open) {
      cur = {
        name: open[1],
        columns: new Map(), // col -> {type, notNull, hasDefault, autoIncrement}
        primaryKey: new Set(),
        autoIncrement: false,
        line: lineOf(sql, sql.indexOf(raw)) || 0,
      };
      tables.set(cur.name, cur);
      continue;
    }
    if (!cur) continue;
    if (/^\)/.test(line)) { cur = null; continue; }

    if (/^PRIMARY KEY/i.test(line)) {
      for (const m of line.matchAll(/`([^`]+)`/g)) cur.primaryKey.add(m[1]);
      continue;
    }
    if (/^(UNIQUE\s+)?(KEY|INDEX|FULLTEXT|CONSTRAINT|CHECK|FOREIGN KEY)/i.test(line)) continue;

    // 列定义：行首反引号列名
    const cm = line.match(/^`([^`]+)`\s+([A-Za-z]+)/);
    if (!cm) continue;
    const col = cm[1];
    const type = cm[2].toLowerCase();
    const notNull = /\bNOT NULL\b/i.test(line);
    const autoIncrement = /\bAUTO_INCREMENT\b/i.test(line);
    // ⚠️ AUTO_INCREMENT 列必须当作"有默认值"：MySQL 插入时会自动填值，
    // 若按字面判成"NOT NULL 且无默认值"，会给每个自增主键表产出一条**假告警**
    // （首轮实测 appointment.id / course_check_in.check_in_id 全是这样）。
    const hasDefault = /\bDEFAULT\b/i.test(line) || autoIncrement;
    if (autoIncrement) cur.autoIncrement = true;
    cur.columns.set(col, { type, notNull, hasDefault, autoIncrement });
  }
  return tables;
}

// 全量加载 DDL 基线
const allTables = new Map();
const schemaDirAbs = path.join(ROOT, SCHEMA_DIR);
if (!fs.existsSync(schemaDirAbs)) {
  console.error('✗ 找不到 DDL 基线目录：' + rel(schemaDirAbs) + '（无法校验实体与表结构是否一致）');
  process.exit(1);
}
const schemaFiles = fs.readdirSync(schemaDirAbs).filter((f) => f.endsWith('.sql')).sort();
if (schemaFiles.length === 0) {
  console.error('✗ ' + rel(schemaDirAbs) + ' 下没有任何 .sql 基线脚本，守卫无法工作（空基线会让所有检查静默通过）');
  process.exit(1);
}
const schemaFileOf = new Map(); // 表名 -> 所属脚本
for (const f of schemaFiles) {
  const t = parseSchema(fs.readFileSync(path.join(schemaDirAbs, f), 'utf8'));
  for (const [name, def] of t) {
    // 两套库表名不冲突（lesson_appointment 用裸名，message_center 统一 msg_ 前缀）。
    // 若真冲突，宁可判红也不要静默取先到的那份。
    if (allTables.has(name)) {
      problems.push(`DDL 基线冲突：表 \`${name}\` 在 ${schemaFileOf.get(name)} 与 ${f} 中重复定义，必须消歧后再校验`);
      continue;
    }
    allTables.set(name, def);
    schemaFileOf.set(name, f);
    stat.tables++;
    stat.columns += def.columns.size;
  }
}

// ============================================================ 解析 Java 实体
/**
 * 剥掉**行尾** `//` 注释（字符串字面量内的不算）。
 *
 * ⚠️ 这一步不能省：本仓库实体的字段普遍带行尾注释，
 * `private String bookingId;  // 对应的预订Id` 若按"整行必须以 ; 结尾"匹配就会**整条丢失**
 * —— 首轮实测就是这样：32 条告警全在说"Booking 没有 booking_id 字段"，
 * 而 Booking 明明有 bookingId。误报率 100% 的守卫等于没有守卫。
 */
function stripLineComment(line) {
  let inStr = false;
  for (let i = 0; i < line.length - 1; i++) {
    const ch = line[i];
    if (inStr) {
      if (ch === '\\') { i++; continue; }
      if (ch === '"' || ch === "'") inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'") { inStr = true; continue; }
    if (ch === '/' && line[i + 1] === '/') return line.slice(0, i);
  }
  return line;
}

/**
 * 解析实体类 → { className, table, classIgnore, fields:[{java, column, pk, line, ignore, type}] }
 *
 * 不整体 stripComments，而是**逐行跟踪块注释状态**：本仓库实体内嵌了大段
 * `/* create table ... *\/` 建表草稿，里面有 `private Integer id;` 这类文本，
 * 整体剥注释会误伤，但逐行剥又拿不到"上一行的豁免注释"。故两者都要：
 * 用状态机区分"代码行"与"注释行"，豁免判定只在注释行里找标记。
 */
function parseEntity(src) {
  const lines = src.split('\n');
  let inBlock = false;
  let table = null;
  let className = null;
  let classIgnore = '';
  let pendingComment = []; // 当前字段上方累积的注释行
  let pendingAnnotations = [];
  const fields = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();
    // 结构判定（class / 字段声明）必须用**剥掉行尾注释后**的文本；
    // 注释归集仍用原始 t，否则豁免标记会被自己剥掉。
    let code = stripLineComment(raw).trim();

    if (inBlock) {
      if (t.includes('*/')) {
        inBlock = false;
        // 结束行之后可能还有代码（如 *\/ 后面直接跟字段），此时要接着解析那部分。
        // ⚠️ 但 `*/` 单独成行时**必须保留**已累积的注释：Javadoc 的最后一行是 ` */`，
        // 若在这里清空 pendingComment，类级/字段级豁免写在 Javadoc 里就永远读不到
        // （首轮实测：写在 javadoc 内的 ignore-table 完全不生效）。
        const rest = stripLineComment(raw.slice(raw.indexOf('*/') + 2)).trim();
        if (!rest) continue; // 保留 pendingComment 交给后续 class/字段判定
        code = rest;
      } else {
        pendingComment.push(t);
        continue;
      }
    }

    if (t.startsWith('/*')) {
      if (!t.includes('*/')) { inBlock = true; pendingComment.push(t); continue; }
      pendingComment.push(t);
      continue;
    }
    if (t.startsWith('//') || t.startsWith('*')) { pendingComment.push(t); continue; }
    if (code.startsWith('@')) { pendingAnnotations.push(code); continue; }
    if (code === '') { pendingComment = []; continue; }

    // ⚠️ @TableName 必须**先于** class 行处理：@TableName 紧贴在 class 声明上方
    //（本仓库 22 个实体全是这个写法），若在 class 分支里清空 pendingAnnotations，
    // 表名就丢了 → 守卫会去查类名推导出来的默认表名，报"表不存在"，
    // 同时把真实存在的表误列进"孤儿表"提示（首轮实测 sys_industry/msg_inbox 全中此坑）。
    const tn = pendingAnnotations.find((a) => a.startsWith('@TableName'));
    if (tn) {
      const m = tn.match(/@TableName\(\s*(?:value\s*=\s*)?"([^"]+)"/);
      if (m) table = m[1];
    }

    const classM = code.match(/\bclass\s+(\w+)/);
    if (classM) {
      className = classM[1];
      // 用 '\n' 连接而非 ' '：理由抽取按行匹配（只取标记所在行），
      // 一旦压成单行，标记行后面所有 Javadoc 行都会被当成理由的一部分。
      classIgnore = pendingComment.join('\n').replace(/\*\//g, '');
      pendingComment = [];
      pendingAnnotations = [];
      continue;
    }

    // 字段声明：private/protected/public [static|final|transient] <类型> <名字> [=值] ;
    // 修饰符单独捕获：static/transient 字段不是表列，必须排除
    //（不能靠"正则前缀已吃掉 static"来判断——那样 `private static String x;`
    //  会被解析成 类型=static? 不，会变成 类型=x 名字缺失或误配，必须显式捕获）。
    const fm = code.match(/^(?:private|protected|public)\s+((?:(?:static|final|transient|volatile)\s+)*)([\w.<>\[\], ?]+?)\s+(\w+)\s*(?:=[^;]*)?;\s*$/);
    if (fm) {
      const modifiers = fm[1].trim();
      const type = fm[2].trim();
      const java = fm[3];
      const isStaticOrTransient = /\b(static|transient)\b/.test(modifiers);
      if (java !== 'serialVersionUID' && !isStaticOrTransient) {
        const ann = pendingAnnotations.join(' ');
        // 字段级豁免来源有二：**上方注释行**与**本行行尾注释**。
        // 只认上方注释会导致 `private String x; // ddl-align: ignore 理由` 静默不豁免
        // —— 而行尾写法恰好是本仓库最自然的注释位置。
        const ignoreComment = pendingComment.join('\n') + '\n' +
          (stripLineComment(raw).length < raw.length ? raw.slice(stripLineComment(raw).length) : '');
        const isExistFalse = /@TableField\(\s*(?:value\s*=\s*"[^"]*"\s*,\s*)?exist\s*=\s*false/.test(ann);
        if (!isExistFalse) {
          // 列名：@TableField("x") 优先；否则驼峰→下划线；本身含下划线的原样保留
          const explicit = ann.match(/@TableField\(\s*(?:value\s*=\s*)?"([^"]+)"/);
          // ⚠️ `(?!-table)` 不能省：`ignore-table` 也以 `ignore` 开头，
          // 不加负向断言会把表级豁免误当成字段豁免。
          const igm = extractIgnoreReason(ignoreComment);
          const column = explicit ? explicit[1] : camelToColumn(java);
          fields.push({
            java,
            column,
            type,
            pk: /@TableId/.test(ann),
            autoId: /@TableId\(\s*type\s*=\s*IdType\.AUTO/.test(ann),
            line: i + 1,
            ignore: igm || '',
            // 有豁免标记但没写理由 = 形同虚设的豁免，单独标记出来让守卫能判红
            ignoreMarkerNoReason: hasIgnoreMarker(ignoreComment) && !igm,
            ignoreLine: i,
          });
        }
      }
    }
    pendingComment = [];
    pendingAnnotations = [];
  }

  // 无 @TableName 时按 MyBatis-Plus 默认策略推导：类名下划线化
  if (!table && className) table = defaultTableName(className);
  // 表级豁免：类声明上方的注释里有 `ddl-align: ignore-table <理由>`
  const classTableIgnore = extractTableIgnoreReason(classIgnore);
  return {
    className,
    table,
    tableIgnore: classTableIgnore || '',
    fields,
  };
}

/** 抽取 `ddl-align: ignore-table <理由>`（同样只取标记所在行） */
function extractTableIgnoreReason(comment) {
  for (const line of String(comment).split('\n')) {
    const m = /ddl-align:\s*ignore-table\s*(.*)/.exec(line);
    if (m) return m[1].replace(/^\s*\*+\s*/, '').trim();
  }
  return null;
}

/**
 * 从注释文本里抽取 `ddl-align: ignore <理由>` 的**理由**。
 *
 * ⚠️ 只取**标记所在那一行**的剩余部分，不能取整段 join 后的全文：
 * 写在 Javadoc 里的豁免若按全文取，理由会变成"标记行 + 后面所有行"，
 * 输出里每个字段都重复一整段（首轮实测刷了 8 行几乎一样的长句）。
 * 同时清掉 Javadoc 的行首 `*`，否则理由里全是 ` * ` 噪声。
 */
function extractIgnoreReason(comment) {
  for (const line of String(comment).split('\n')) {
    const m = /ddl-align:\s*ignore(?!-table)\s*(.*)/.exec(line);
    if (m) return m[1].replace(/^\s*\*+\s*/, '').trim();
  }
  return null;
}

/** 判断注释里是否出现了 `ddl-align: ignore` 标记（无论是否带理由） */
function hasIgnoreMarker(comment) {
  return /ddl-align:\s*ignore(?!-table)\b/.test(String(comment));
}

/**
 * 驼峰 → 下划线（列名推导）。
 *
 * ⚠️ 算法必须与 MyBatis-Plus 的 `StringUtils.camelToUnderline` **逐字符等价**：
 *    它是"每个大写字母前都插下划线并转小写"，**不做**"连续大写视为一个词"的合并。
 *    反例（本守卫第一版的错）：`scheduleID` 用合并式正则得到 `schedule_id`，
 *    但 MP 实际得到 `schedule_i_d` → 守卫判绿而运行期 Unknown column。
 *    这类"守卫比运行时更宽容"的错最危险：它给出的绿是假的。
 *    判据：宁可"误报一个不存在的列"，也不能"漏报一个 MP 会当成别的列的字段"。
 *
 * 本身含下划线的字段名（Java 允许，如 update_time）原样保留 —— 这是本仓库既有写法，
 * 不是驼峰，走另一分支。
 */
function camelToColumn(name) {
  if (name.includes('_')) return name.toLowerCase();
  let out = '';
  for (let i = 0; i < name.length; i++) {
    const ch = name[i];
    if (ch >= 'A' && ch <= 'Z') {
      if (i > 0) out += '_';
      out += ch.toLowerCase();
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * 无 @TableName 时的**默认表名**推导。
 *
 * ⚠️ 忠实还原 MyBatis-Plus `TableInfoHelper.initTableNameWithDbConfig` 的两步：
 *      camelToUnderline(类名) → capitalMode ? toUpperCase : firstToLowerCase
 *   本项目用默认配置（tableUnderline=true、capitalMode=false，见 application.properties
 *   未覆盖 mybatis-plus.global-config.db-config），故 firstToLowerCase 幂等。
 *   写成两步是为了让人一眼看出"这依赖全局配置"——若有人开了 capitalMode，
 *   守卫的推导就要跟着改，而这类改动**不会**体现在任何编译错误里。
 */
function defaultTableName(className) {
  const under = camelToColumn(className);
  return under.charAt(0).toLowerCase() + under.slice(1);
}

// Java 类型 → 允许的 MySQL 类型族
const TYPE_FAMILIES = {
  string: new Set(['char', 'varchar', 'tinytext', 'text', 'mediumtext', 'longtext', 'enum', 'set', 'json']),
  int: new Set(['tinyint', 'smallint', 'mediumint', 'int', 'integer', 'bigint', 'bit', 'decimal', 'numeric', 'double', 'float']),
  bigint: new Set(['tinyint', 'smallint', 'mediumint', 'int', 'integer', 'bigint', 'decimal', 'numeric', 'double', 'float', 'bit']),
  bool: new Set(['tinyint', 'bit', 'boolean', 'char', 'varchar']),
  datetime: new Set(['datetime', 'timestamp', 'date']),
  date: new Set(['date', 'datetime', 'timestamp']),
  decimal: new Set(['decimal', 'numeric', 'double', 'float', 'int', 'integer', 'bigint', 'smallint', 'tinyint', 'mediumint']),
};

function javaTypeFamily(t) {
  const s = t.replace(/\s+/g, '');
  if (/^(String)$/.test(s)) return 'string';
  if (/^(Integer|int|Short|short|Byte|byte|Long|long)$/.test(s)) {
    return /[Ll]ong$/.test(s) ? 'bigint' : 'int';
  }
  if (/^(Boolean|boolean)$/.test(s)) return 'bool';
  if (/^(LocalDateTime|LocalTime|Date|Timestamp|java\.sql\.Date|java\.sql\.Timestamp)$/.test(s)) return 'datetime';
  if (/^(LocalDate)$/.test(s)) return 'date';
  if (/^(BigDecimal|Double|double|Float|float)$/.test(s)) return 'decimal';
  return null; // 集合/自定义类型：无法静态判定类型族，交由 exist=false 排除
}

// ============================================================ 收集实体
const entities = [];
for (const r of ENTITY_ROOTS) {
  const dir = path.join(ROOT, r);
  const files = walk(dir, (f) => f.endsWith('.java') && !f.endsWith('VO.java'));
  if (files.length === 0) {
    notes.push(`${r} 下没有找到任何实体类（路径是否变了？守卫会漏检 ${r}）`);
  }
  for (const f of files) {
    const e = parseEntity(fs.readFileSync(f, 'utf8'));
    if (!e.className || !e.table) continue;
    e.file = rel(f);
    e.abs = f;
    entities.push(e);
    stat.entities++;
    stat.fields += e.fields.length;
    if (e.tableIgnore) {
      notes.push(`${e.file} 实体 ${e.className}（表 \`${e.table}\`）已整表豁免：${e.tableIgnore}`);
    }
  }
}

// ============================================================ 检查 1~4：实体 → DDL
const tableExempt = [];
for (const e of entities) {
  const def = allTables.get(e.table);
  if (!def) {
    if (!e.tableIgnore) {
      problems.push(
        `${e.file} 实体 ${e.className} 映射的表 \`${e.table}\` 在 DDL 基线中不存在\n` +
        `    → 表可能还没建、或已改名/删除。基线来源：${rel(schemaDirAbs)}/*.sql` +
        `（确知如此在该实体类声明上方写 "// ddl-align: ignore-table <理由>"）`);
    }
    continue;
  }
  // 检查 3：NOT NULL 且无默认值的列，实体必须有对应字段
  const fieldByCol = new Map(e.fields.map((f) => [f.column, f]));
  for (const [col, cd] of def.columns) {
    if (cd.notNull && !cd.hasDefault && !fieldByCol.has(col)) {
      if (!e.tableIgnore) {
        problems.push(
          `${e.file} 表 \`${e.table}\` 的列 \`${col}\` NOT NULL 且无默认值，但实体 ${e.className} 没有对应字段\n` +
          `    → MyBatis-Plus 的 insert 只写实体映射到的列，数据库必然报 ` +
          `"Field '${col}' doesn't have a default value"。补字段，或给列加默认值/改 nullable`);
      }
    }
  }

  for (const f of e.fields) {
    // 检查 2：字段存在性
    const cd = def.columns.get(f.column);
    if (f.ignoreMarkerNoReason) {
      problems.push(
        `${e.file}:${f.line} 字段 ${f.java} 写了 ddl-align 豁免但**没给理由**\n` +
        `    → 豁免必须写清"为什么不修"，否则它只是把发现能力悄悄关掉`);
    }
    if (!cd) {
      // 整表豁免的字段逐条列出会把同一段理由重复 N 遍；只留一行汇总。
      if (e.tableIgnore && !f.ignore) tableExempt.push(`${e.table}.${f.column}(${f.java})`);
      else if (f.ignore) {
        notes.push(`${e.file}:${f.line} 字段 ${f.java} → 列 \`${f.column}\` 不存在（已豁免：${f.ignore}）`);
      } else {
        problems.push(
          `${e.file}:${f.line} 实体字段 ${f.java} 映射的列 \`${e.table}.${f.column}\` 在 DDL 基线中不存在\n` +
          `    → 读该字段恒为 null、写该字段报 Unknown column。八成是实体加了字段忘了 ALTER，` +
          `或列名拼错；确属遗留请在上一行写 "// ddl-align: ignore <理由>"`);
      }
      continue;
    }
    // 检查 4：主键一致性
    if (f.pk) {
      if (!def.primaryKey.has(f.column)) {
        problems.push(
          `${e.file}:${f.line} @TableId 字段 ${f.java} 映射的列 \`${f.column}\` 不是表 \`${e.table}\` 的主键\n` +
          `    → 该表主键为 ${[...def.primaryKey].join(',') || '（无）'}；主键配错会导致 update/delete 条件为空或全表命中`);
      }
      const fam = javaTypeFamily(f.type);
      if (fam && !TYPE_FAMILIES[fam].has(cd.type)) {
        problems.push(
          `${e.file}:${f.line} 主键列 \`${f.column}\` DDL 类型 ${cd.type} 与 Java 类型 ${f.type} 不兼容`);
      }
      if (f.autoId && !cd.autoIncrement) {
        problems.push(
          `${e.file}:${f.line} @TableId(type = IdType.AUTO) 但 \`${e.table}.${f.column}\` 没有 AUTO_INCREMENT\n` +
          `    → 插入后主键取不到值；应改用 ASSIGN_ID（雪花）或给列加 AUTO_INCREMENT`);
      }
      // 注：AUTO_INCREMENT 列的主键字段声明为 String 这类错，由上面的
      // 「DDL 类型 vs Java 类型不兼容」一条拦住（bigint 不在 string 族里），
      // 无需再写一条特例分支 —— 曾写过一条 `!autoId && autoIncrement && String`，
      // 但它**不可达**：没有 @TableId 时 f.pk 为 false，根本进不到这里。
      // 反向测试就是靠这条把它抓出来的（死检查与真检查在输出里长得一样）。
    }
  }
}
if (tableExempt.length) {
  // 汇总成一行，避免同一理由被重复 N 遍
  notes.push(`整表豁免的实体字段（列在表中不存在）：${tableExempt.join('、')}`);
}

// ============================================================ 检查 5：DDL 内部引用完整性（FK）
{
  let sawFkSection = false;
  for (const f of schemaFiles) {
    const sql = fs.readFileSync(path.join(schemaDirAbs, f), 'utf8');
    // FK 都在表体内，逐表扫描：先定位表名，再在该表段落内找 FOREIGN KEY
    const re = /CREATE TABLE `([^`]+)` \(/g;
    let tm;
    while ((tm = re.exec(sql)) !== null) {
      const tname = tm[1];
      const start = tm.index + tm[0].length;
      // 括号配平取表体
      let depth = 1;
      let j = start;
      while (j < sql.length && depth > 0) {
        if (sql[j] === '(') depth++;
        else if (sql[j] === ')') depth--;
        j++;
      }
      const body = sql.slice(start, j - 1);
      for (const line of body.split('\n')) {
        const fkm = line.match(/CONSTRAINT\s+`([^`]+)`\s+FOREIGN KEY\s*\(([^)]+)\)\s*REFERENCES\s+`([^`]+)`\s*\(([^)]+)\)/i);
        if (!fkm) continue;
        sawFkSection = true;
        stat.fks++;
        const [, fkName, localCols, refTable, refCols] = fkm;
        const local = [...localCols.matchAll(/`([^`]+)`/g)].map((x) => x[1]);
        const remote = [...refCols.matchAll(/`([^`]+)`/g)].map((x) => x[1]);
        const self = allTables.get(tname);
        for (const c of local) {
          if (self && !self.columns.has(c)) {
            problems.push(`${f} 中 \`${tname}\` 的外键 ${fkName} 引用了不存在的本地列 \`${c}\``);
          }
        }
        const target = allTables.get(refTable);
        if (!target) {
          problems.push(`${f} 中外键 ${fkName}（表 \`${tname}\`）引用了不存在的表 \`${refTable}\``);
          continue;
        }
        for (const c of remote) {
          if (!target.columns.has(c)) {
            problems.push(`${f} 中外键 ${fkName} 引用了 \`${refTable}\` 中不存在的列 \`${c}\`\n` +
              `    → 本项目 FK 是 ON DELETE CASCADE，引错列会在删父行时静默带走无关子行`);
          }
        }
      }
    }
  }
  if (!sawFkSection && stat.tables > 0) {
    notes.push(`未在 ${rel(schemaDirAbs)}/*.sql 中解析到任何 FOREIGN KEY，请确认解析规则是否失效（否则检查 5 形同虚设）`);
  }
}

// ============================================================ 检查 6：孤儿表（只提示）
{
  const used = new Set(entities.map((e) => e.table));
  const orphan = [...allTables.keys()].filter((t) => !used.has(t));
  if (orphan.length) {
    notes.push(`DDL 有表但无对应实体（${orphan.length} 张，只经 XML/原生 SQL 访问属正常）：` +
      orphan.sort().join(', '));
  }
}

// ============================================================ 输出
console.log('DDL 漂移守卫：实体 %d 个 / 字段 %d 个；DDL 基线 %d 脚本 / %d 表 / %d 列 / %d 外键',
  stat.entities, stat.fields, schemaFiles.length, stat.tables, stat.columns, stat.fks);

if (notes.length) {
  console.log('\n提示：');
  for (const n of notes) console.log('  · ' + n);
}

if (problems.length) {
  console.log('\n✗ 发现 %d 个 Entity↔DDL 漂移：', problems.length);
  for (const p of problems) console.log('  - ' + p);
  process.exit(1);
}

console.log('\n✓ 实体与 DDL 基线一致：字段、主键、必填列、外键引用均对齐');
process.exit(0);