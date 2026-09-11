/**
 * 递补成功通知的「行业词汇转换」效果预览（只读，不改数据）。
 *
 * 用 Node 复刻 TermService.getTermMap + renderTemplate 的取词规则：
 *   合并顺序 平台词(0,0) → 行业词(行业id,0) → 租户词(租户id,行业id)，后者覆盖前者；
 *   语言取词 zh → 无则回退该 key 任意语言。
 * 目的：一眼看到同一段模板在 教育 / 法律 / 心理 / 健身 四个行业下的实际文案，
 *      便于人工判断措辞是否通顺（这是测试断言覆盖不到的部分）。
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

function pick(langMap, lang) {
    if (!langMap || langMap.size === 0) return null;
    if (langMap.has(lang)) return langMap.get(lang);
    if (langMap.has('zh')) return langMap.get('zh');
    return langMap.values().next().value;
}

/** 复刻 TermService.getTermMap(tenantId, lang) */
function termMap(tenantId, industryId, lang) {
    const platform = loadScope(0, 0);
    const industry = industryId > 0 ? loadScope(industryId, 0) : new Map();
    const tenant = tenantId > 0 ? loadScope(industryId, tenantId) : new Map();
    const out = {};
    const keys = new Set([...platform.keys(), ...industry.keys(), ...tenant.keys()]);
    for (const k of keys) {
        const v = pick(tenant.get(k), lang) || pick(industry.get(k), lang) || pick(platform.get(k), lang);
        if (v) out[k] = v;
    }
    return out;
}

/** 复刻 TermService.renderTemplate：{key} 命中取词，未命中原样保留 */
function render(tpl, vars) {
    return tpl.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
}

// 与 MessageNotifyService 中的三个模板常量逐字一致（改模板时这里要同步）
const HEAD = '恭喜！你申请的候补已递补成功，正式获得该{course}名额，系统已为你生成时间表。';
const FIRST = '首次{lessonTime}：{firstLesson}。';
const TAIL = '请在「今日{course}」中查看并按时{lesson}。';
const TITLE = '候补递补成功';

const tenants = sql(`SELECT t.id, t.tenant_code, t.industry_id, COALESCE(i.name,'(未配行业)')
                     FROM ${DB}.sys_tenant t LEFT JOIN ${DB}.sys_industry i ON i.id=t.industry_id
                     WHERE t.industry_id IS NOT NULL ORDER BY t.industry_id`);
const FIRST_LESSON = '2026-09-20 14:00:00';

for (const [tid, code, ind, indName] of tenants) {
    const vars = { ...termMap(Number(tid), Number(ind), 'zh'), firstLesson: FIRST_LESSON };
    const body = render(HEAD, vars) + render(FIRST, vars) + render(TAIL, vars);
    console.log('\n─────────────────────────────────────────────');
    console.log(`租户 ${tid}  ${code}  行业=${ind} ${indName}`);
    console.log(`  标题：${TITLE}`);
    console.log(`  正文：${body}`);
}
console.log('\n─────────────────────────────────────────────');
console.log('（以上为按库中词条实时渲染的结果；未登录语言为 zh 时的默认形态）');
