// tests/domain/term.test.mjs
// 术语领域层零 DOM 单测。直接 node 运行：node tests/domain/term.test.mjs
// 验证：分级回退 / 服务端合并覆盖 / 选项关联 / 课程类型归一；运行时零 DOM。
import assert from 'node:assert';
import * as T from '../../shared/domain/term.js';

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.error('  ✗ ' + name); } }
function eq(name, a, b) { try { assert.strictEqual(a, b); pass++; } catch (e) { fail++; console.error('  ✗ ' + name + ' -> 期望 ' + JSON.stringify(b) + ' 实得 ' + JSON.stringify(a)); } }

console.log('== 术语领域层 ==');

// --- 零 DOM 守卫 ---
ok('运行时无 document', typeof document === 'undefined');
ok('运行时无 window', typeof window === 'undefined');

// --- getTerms 分级 ---
eq('getTerms 默认education', T.getTerms({ industry: 'education' }).course, '课程');
eq('getTerms legal覆盖', T.getTerms({ industry: 'legal' }).course, '咨询话题');
eq('getTerms 未知行业回落education', T.getTerms({ industry: 'nope' }).teacher, '教师');
ok('getTerms 服务端map覆盖', T.getTerms({ industry: 'education', serverMap: { teacher: '师' } }).teacher === '师');

// --- termText 回退链 ---
eq('termText legal', T.termText('teacher', { industry: 'legal' }), '律师');
eq('termText education', T.termText('teacher', { industry: 'education' }), '教师');
eq('termText 命中服务端map', T.termText('teacher', { industry: 'education', serverMap: { teacher: '师' } }), '师');
eq('termText 未知key回退key本身', T.termText('nonexistent', { industry: 'education' }), 'nonexistent');
eq('termText 空key返回空串', T.termText('', { industry: 'education' }), '');

// --- getOptions 选项关联（标签词 + '.' + 选项编码）---
// 本地词典用无点键（classForm1p1），查不到 classForm.1p1 → 走 defaultText 回退（既有行为）
eq('getOptions 本地缺词回退', T.getOptions('classForm', [{ value: '1p1', code: '1p1', defaultText: '1对1' }], { industry: 'education' })[0].text, '1对1');
// 服务端 map 提供点号键时命中（证明 hit 路径可用）
eq('getOptions 服务端命中', T.getOptions('classForm', [{ value: '1p1', code: '1p1', defaultText: '1对1' }], { industry: 'education', serverMap: { 'classForm.1p1': '一对一' } })[0].text, '一对一');
// 缺词回退 defaultText：courseType.french 在词典里不存在 → 回退 '法语'
eq('getOptions 缺词回退', T.getOptions('courseType', [{ value: 'french', code: 'french', defaultText: '法语' }], { industry: 'education' })[0].text, '法语');

// --- normalizeCourseType 归一 ---
eq('normalize fr', T.normalizeCourseType('fr'), 'french');
eq('normalize 法语', T.normalizeCourseType('法语'), 'french');
eq('normalize EN', T.normalizeCourseType('EN'), 'english');
eq('normalize 未知保持', T.normalizeCourseType('xyz'), 'xyz');
eq('normalize 空', T.normalizeCourseType(''), '');

// --- courseTypeText ---
eq('courseTypeText french', T.courseTypeText('french', { industry: 'education' }), '法语');
eq('courseTypeText 空返回空', T.courseTypeText('', { industry: 'education' }), '');

// --- enumTermText ---
eq('enumTermText 命中', T.enumTermText('classLevel', 'B1', { industry: 'education' }), 'B1入门');
eq('enumTermText 缺词回退code', T.enumTermText('classLevel', 'Z9', { industry: 'education' }), 'Z9');

console.log(`术语: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
