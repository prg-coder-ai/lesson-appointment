/**
 * 服务端通知的「行业词汇转换」效果预览（只读，不改数据）。
 *
 * 用 Node 复刻 TermService.getTermMap + renderTemplate 的取词规则：
 *   合并顺序 平台词(0,0) → 行业词(行业id,0) → 租户词(租户id,行业id)，后者覆盖前者；
 *   语言取词 zh → 无则回退该 key 任意语言。
 * 目的：一眼看到同一批模板在 教育 / 法律 / 心理 / 健身 四个行业下的实际文案，
 *      便于人工判断措辞是否通顺（这是测试断言覆盖不到的部分）。
 *
 * 模板**直接从 MessageNotifyService.java 读取**，不在本文件里复制一份——
 * 复制会漂移：改了服务端忘了改这里，预览就成了假的。
 *
 * 运行：node tests/term-render-preview.js
 */
const fs = require('fs');
const { execFileSync } = require('child_process');

const MYSQL = 'D:/program/mysql84/bin/mysql';
const DB = 'lesson_appointment';

function sql(q) {
    // --default-character-set=utf8mb4 必需，否则 Windows 上 CLI 按本地编码（GBK）输出，
    // Node 以 utf8 解码 → 词条中文全成乱码。
    const out = execFileSync(MYSQL, ['-uroot', '-p123456', '--default-character-set=utf8mb4', '-N', '-B', '-e', q],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024 });
    return out.split(/\r?\n/).filter((l) => l.length > 0).map((l) => l.split('\t'));
}

/** 取某作用域的 key -> (lang -> name) */
function loadScope(industryId, tenantId) {
    const rows = sql(`SELECT term_key, language, term_name FROM ${DB}.sys_term
                      WHERE industry_id=${industryId} AND tenant_id=${tenantId} AND status=1`);
    const m = new Map();
    for (const [k, lang, name] of rows) {
        if (!m.has(k)) m.set(k, new Map());
        m.get(k).set(lang, name);
    }
    return m;
}

/** 严格按语言取词，无该语言返回 null（不回退语言，回退交给作用域链） */
function pickLang(langMap, lang) {
    return langMap ? (langMap.get(lang) || null) : null;
}
/** 任意语言取一条（仅目标语言三级全缺时使用） */
function anyLang(langMap) {
    if (!langMap || langMap.size === 0) return null;
    return langMap.values().next().value;
}

/**
 * 复刻 TermService.getTermMap(tenantId, lang)。
 * **语言优先于作用域**：先在 租户→行业→平台 里找目标语言，三级都没有才退回任意语言。
 * （旧实现按作用域逐级 pick、层内再回退语言，会让行业层的其它语言顶掉平台层的目标语言——
 *   健身行业只有 schedule 的 en/fr，中文界面就渲染出英文 "Schedule"。）
 */
function termMap(tenantId, industryId, lang) {
    const platform = loadScope(0, 0);
    const industry = industryId > 0 ? loadScope(industryId, 0) : new Map();
    const tenant = tenantId > 0 ? loadScope(industryId, tenantId) : new Map();
    const out = {};
    const keys = new Set([...platform.keys(), ...industry.keys(), ...tenant.keys()]);
    for (const k of keys) {
        const v = pickLang(tenant.get(k), lang) || pickLang(industry.get(k), lang) || pickLang(platform.get(k), lang)
            || anyLang(tenant.get(k)) || anyLang(industry.get(k)) || anyLang(platform.get(k));
        if (v) out[k] = v;
    }
    return out;
}

/** 复刻 TermService.renderTemplate：{key} 命中取词，未命中原样保留 */
function render(tpl, vars) {
    return tpl.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
}

/* 模板从服务端源码读取（唯一来源） */
const SRC = 'C:/Users/Administrator/WorkBuddy/2026-08-30-17-19-24/api/src/main/java/'
    + 'com/reservation/service/MessageNotifyService.java';
const src = fs.readFileSync(SRC, 'utf8');
const T = {};
for (const m of src.matchAll(/private static final String\s+(\w+)\s*=\s*"([^"]*)"/g)) T[m[1]] = m[2];

const FIRST_LESSON = '2026-09-20 14:00:00';

/** 每条通知引用的模板常量名；缺常量时下面会直接报出来（说明源码被改名了） */
const NOTIFIES = [
    { scene: '学生预订 → 教师 + 管理员', title: 'BOOKING_CREATED_TITLE', body: 'BOOKING_CREATED_BODY' },
    { scene: '学生候补 → 教师 + 管理员', title: 'WAITLIST_CREATED_TITLE', body: 'WAITLIST_CREATED_BODY' },
    { scene: '学生请假 → 教师 + 管理员', title: 'LEAVE_CREATED_TITLE', body: 'LEAVE_CREATED_BODY' },
    { scene: '管理员确认预订 → 学生', title: 'STUDENT_CONFIRMED_TITLE', body: 'STUDENT_CONFIRMED_BOOKING_BODY' },
    { scene: '管理员确认请假 → 学生', title: 'STUDENT_CONFIRMED_TITLE', body: 'STUDENT_CONFIRMED_LEAVE_BODY' },
    {
        scene: '候补递补成功 → 学生', title: 'WAITLIST_PROMOTED_TITLE_LIKE',
        body: ['WAITLIST_PROMOTED_HEAD', 'WAITLIST_PROMOTED_FIRST', 'WAITLIST_PROMOTED_TAIL']
    }
];
const PROMOTE_TITLE = '候补递补成功';   // 无占位符的固定标题，服务端写法一致

const missing = [...new Set(NOTIFIES.flatMap((n) => [n.body].flat()
    .concat(n.title === 'WAITLIST_PROMOTED_TITLE_LIKE' ? [] : [n.title])))]
    .filter((k) => T[k] == null);
if (missing.length) console.log('警告：MessageNotifyService.java 里找不到常量 ' + missing.join(', '));

const tenants = sql(`SELECT t.id, t.tenant_code, t.industry_id, COALESCE(i.name,'(未配行业)')
                     FROM ${DB}.sys_tenant t LEFT JOIN ${DB}.sys_industry i ON i.id=t.industry_id
                     WHERE t.industry_id IS NOT NULL ORDER BY t.industry_id`);

for (const [tid, code, ind, indName] of tenants) {
    const vars = { ...termMap(Number(tid), Number(ind), 'zh'), firstLesson: FIRST_LESSON };
    console.log('\n═════════════════════════════════════════════');
    console.log(`租户 ${tid}  ${code}  行业=${ind} ${indName}`);
    for (const n of NOTIFIES) {
        const titleTpl = n.title === 'WAITLIST_PROMOTED_TITLE_LIKE' ? PROMOTE_TITLE : T[n.title];
        const bodyTpl = [n.body].flat().map((k) => T[k] || ('<' + k + ' 缺失>')).join('');
        console.log('\n  ── ' + n.scene);
        console.log('     标题：' + render(titleTpl || '', vars));
        console.log('     正文：' + render(bodyTpl, vars));
    }
}
console.log('\n═════════════════════════════════════════════');
console.log('（以上为按库中词条实时渲染的结果；未登录语言为 zh 时的默认形态）');
console.log('注：递补成功那条的 "首次{lessonTime}：{firstLesson}。" 在查不到课次时整句省略，此处按有课次渲染。');
