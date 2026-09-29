/*
 * P0 Web 桥接行为一致性回归。
 * 验证：生成器产出的 frontend/js/shared-domain-bridge.js 与共享领域层 shared/domain 行为一致，
 * 且 termsFunction.js / admin-refund-rule.js 委托后对外行为不变（termText / formatRefundMinutes 等）。
 *
 * 运行：NODE_PATH=<workspace>/node_modules node tests/check_shared_bridge.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

let pass = 0, fail = 0;
function eq(name, actual, expected) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a === b) { pass++; }
  else { fail++; console.error('  ✗ ' + name + ' | actual=' + a + ' expected=' + b); }
}

async function main() {
  const ROOT = path.resolve(__dirname, '..');
  const BRIDGE = path.join(ROOT, 'frontend', 'js', 'shared-domain-bridge.js');
  const GEN = path.join(ROOT, 'frontend', 'tools', 'gen-shared-bridge.js');

  // 1) 确保桥接产物是最新（直接调用生成器）
  require(GEN).generateSharedBridge();
  if (!fs.existsSync(BRIDGE)) { console.error('桥接产物未生成:', BRIDGE); process.exit(1); }
  const bridgeCode = fs.readFileSync(BRIDGE, 'utf8');
  eq('桥接产物含 window.TermDomain 赋值', /window\.TermDomain\s*=/.test(bridgeCode), true);
  eq('桥接产物含 window.RefundRuleDomain 赋值', /window\.RefundRuleDomain\s*=/.test(bridgeCode), true);
  eq('桥接产物已剥离 ESM export 关键字', /^\s*export\s+/m.test(bridgeCode), false);

  // 2) 桥接产物行为 == 领域层（权威源）行为：在 fake window 里 eval 桥接，并与动态 import 的领域层逐一对比
  const TermDomain = await import(pathToFileURL(path.join(ROOT, 'shared', 'domain', 'term.js')).href);
  const RefundDomain = await import(pathToFileURL(path.join(ROOT, 'shared', 'domain', 'refundRule.js')).href);

  const fakeWin = {};
  // eslint-disable-next-line no-new-func
  const exposed = new Function('window', bridgeCode + '\nreturn { T: window.TermDomain, R: window.RefundRuleDomain };')(fakeWin);
  const T = exposed.T, R = exposed.R;
  eq('桥接 TermDomain 存在', typeof T, 'object');
  eq('桥接 RefundRuleDomain 存在', typeof R, 'object');

  eq('termText legal', T.termText('teacher', { industry: 'legal' }), TermDomain.termText('teacher', { industry: 'legal' }));
  eq('termText education', T.termText('teacher', { industry: 'education' }), TermDomain.termText('teacher', { industry: 'education' }));
  eq('termText 缺词回退 key', T.termText('not_exist_key', {}), TermDomain.termText('not_exist_key', {}));
  eq('getTerms 合并 serverMap', JSON.stringify(T.getTerms({ industry: 'legal', serverMap: { teacher: '大律师' } })),
     JSON.stringify(TermDomain.getTerms({ industry: 'legal', serverMap: { teacher: '大律师' } })));
  eq('getOptions 关联', JSON.stringify(T.getOptions('classForm', [{ value: '1p1', code: '1p1', defaultText: '1对1' }], { industry: 'education' })),
     JSON.stringify(TermDomain.getOptions('classForm', [{ value: '1p1', code: '1p1', defaultText: '1对1' }], { industry: 'education' })));
  eq('formatRefundMinutes 1440', R.formatRefundMinutes(1440), RefundDomain.formatRefundMinutes(1440));
  eq('formatRefundMinutes 90', R.formatRefundMinutes(90), RefundDomain.formatRefundMinutes(90));
  eq('refundRuleToMinutes 2hour', R.refundRuleToMinutes(2, 'hour'), RefundDomain.refundRuleToMinutes(2, 'hour'));
  eq('refundRuleFromMinutes 120', JSON.stringify(R.refundRuleFromMinutes(120, 'hour')), JSON.stringify(RefundDomain.refundRuleFromMinutes(120, 'hour')));
  eq('refundRuleZoneText', R.refundRuleZoneText(1440, 720, 50), RefundDomain.refundRuleZoneText(1440, 720, 50));
  eq('validateRefundRule ok', R.validateRefundRule(1440, 720, 50), RefundDomain.validateRefundRule(1440, 720, 50));
  eq('validateRefundRule bad', R.validateRefundRule(720, 1440, 50), RefundDomain.validateRefundRule(720, 1440, 50));
  eq('resolveEffectiveRule 课程优先', R.resolveEffectiveRule({ id: 1 }, { id: 2 }), RefundDomain.resolveEffectiveRule({ id: 1 }, { id: 2 }));
  eq('REFUND_BUILT_IN_FALLBACK', JSON.stringify(R.REFUND_BUILT_IN_FALLBACK), JSON.stringify(RefundDomain.REFUND_BUILT_IN_FALLBACK));

  // 3) jsdom 集成：真实加载 termsFunction.js / admin-refund-rule.js，验证委托后对外行为不变
  let jsdom;
  try { jsdom = require('jsdom'); } catch (e) { console.log('  (jsdom 不可用，跳过集成段)'); }
  if (jsdom) {
    const { JSDOM } = jsdom;
    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { runScripts: 'outside-only', url: 'http://localhost/' });
    const win = dom.window;
    // jsdom 的 window.localStorage 是 getter，需用 defineProperty 覆盖为可控桩
    const store = {};
    Object.defineProperty(win, 'localStorage', {
      configurable: true,
      value: {
        getItem: k => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: k => { delete store[k]; }
      }
    });
    win.eval(bridgeCode); // 挂 window.TermDomain / RefundRuleDomain
    eq('jsdom: TermDomain 已挂载', typeof win.TermDomain, 'object');

    const termsFunc = fs.readFileSync(path.join(ROOT, 'frontend', 'js', 'public', 'termsFunction.js'), 'utf8');
    win.eval(termsFunc);
    store['industry'] = 'legal';
    eq('jsdom: 委托后 termText(legal) = 律师', win.termText('teacher'), '律师');
    store['industry'] = 'education';
    eq('jsdom: 委托后 termText(education) = 教师', win.termText('teacher'), '教师');
    eq('jsdom: getTerms(education) 含 course', win.getTerms().course, '课程');

    const adminRefund = fs.readFileSync(path.join(ROOT, 'frontend', 'js', 'admin-refund-rule.js'), 'utf8');
    win.eval(adminRefund);
    eq('jsdom: 委托后 formatRefundMinutes(1440) = 1 天', win.formatRefundMinutes(1440), RefundDomain.formatRefundMinutes(1440));
    eq('jsdom: 委托后 formatRefundMinutes(90) = 1 小时 30 分钟', win.formatRefundMinutes(90), RefundDomain.formatRefundMinutes(90));
    eq('jsdom: window.formatRefundMinutes 仍导出', typeof win.formatRefundMinutes, 'function');

    // 4) appointmentNotes.js 退改预览对话框：档位求值收敛到 evaluateRefund
    const notes = fs.readFileSync(path.join(ROOT, 'frontend', 'js', 'public', 'appointmentNotes.js'), 'utf8');
    win.eval(notes);
    eq('jsdom: refundHintToEval 已导出', typeof win.refundHintToEval, 'function');

    // 复用会话内的 appointmentId（仅回填字段，求值不依赖它）
    const rule = { freeBeforeMinutes: 1440, partialBeforeMinutes: 720, partialRefundPercent: 50 };
    // minutesAhead 取服务端的权威提前量；now 由 refundHintToEval 反推
    const cases = [
      { level: 'free',    minutesAhead: 1500, expectLevel: 'free',    expectPercent: 100 },
      { level: 'partial', minutesAhead: 1000, expectLevel: 'partial', expectPercent: 50  },
      { level: 'none',    minutesAhead: 100,  expectLevel: 'none',    expectPercent: 0   },
      { level: 'past',    minutesAhead: -30,  expectLevel: 'past',    expectPercent: 0   }
    ];
    cases.forEach(function (c) {
      const hint = {
        level: c.level, levelText: 'x', refundPercent: c.expectPercent, aheadText: 'y',
        minutesAhead: c.minutesAhead, lessonTime: '2026-10-01 10:00',
        freeBeforeMinutes: rule.freeBeforeMinutes, partialBeforeMinutes: rule.partialBeforeMinutes,
        partialRefundPercent: rule.partialRefundPercent
      };
      const ev = win.refundHintToEval(hint);
      eq('refundHintToEval ' + c.level + ' 命中领域层 level', ev.level, c.expectLevel);
      eq('refundHintToEval ' + c.level + ' 命中领域层 percent', ev.percent, c.expectPercent);
      eq('refundHintToEval ' + c.level + ' 与服务端 level 一致', ev.level, c.level);
      // 复现服务端档位：直接拿规则+时间+反推 now 调 evaluateRefund 应得同一结果
      const apptMs = new Date(hint.lessonTime.replace(' ', 'T')).getTime();
      const now = new Date(apptMs - c.minutesAhead * 60000);
      const direct = win.RefundRuleDomain.evaluateRefund(rule, hint.lessonTime, now);
      eq('refundHintToEval ' + c.level + ' == evaluateRefund 直调', ev.level, direct.level);
      eq('refundHintToEval ' + c.level + ' == evaluateRefund percent', ev.percent, direct.percent);
    });

    // 时间未知（服务端 level 为 null）→ null，走「只摆规则」分支
    eq('refundHintToEval 时间未知返回 null', win.refundHintToEval({ level: null, lessonTime: null }), null);

    // 领域层缺失时回退：返回 null，对话框改用服务端字段
    const savedDomain = win.RefundRuleDomain;
    win.RefundRuleDomain = undefined;
    eq('领域层缺失时回退为 null', win.refundHintToEval(cases[1]), null);
    win.RefundRuleDomain = savedDomain;
  }

  console.log('\n[check_shared_bridge] ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
