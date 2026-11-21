/**
 * 课堂实例「容量」从记录字段变成真约束的回归守卫（2026-11-20）
 *
 * 对应文档 doc-develop/08-电子课堂/课堂实例容量字段现状分析与实现建议-20261120.md 第六节。
 * 拦的是"看起来做了、其实没生效"的几类退化：
 *   ① 错误码没进 Result 白名单 → fail(40908) 在 Result 内部抛 IllegalStateException → 全变 500；
 *   ② 准入漏接在开课路径上（判了但没抛/没拦），或未配置时静默不限制（这次要根治的就是静默）；
 *   ③ 自动开课对满载记 error → 满载期间每 30 秒刷一批 error，把真故障淹没；
 *   ④ 参数与绑定校验被删掉 → 又可以把租户绑到空地址/停用实例上；
 *   ⑤ current_load 又变回"永远 0"（采集后不回写）。
 *
 * 用法：node tests/check_instance_capacity_guard.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let failed = 0;
let total = 0;

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function ok(n) { total++; console.log('  ✓ ' + n); }
function fail(n, d) { total++; failed++; console.log('  ✗ ' + n + (d ? ('\n      ' + d) : '')); }
function check(n, c, d) { c ? ok(n) : fail(n, d); }

/* ==================== ① 错误码契约 ==================== */
console.log('\n[错误码契约]');
const errCodes = read('api/classroom-service/src/main/java/com/classroom/common/ErrorCodes.java');
const resultCls = read('api/classroom-service/src/main/java/com/classroom/common/Result.java');

check('ErrorCodes 定义 CLASSROOM_CAPACITY_EXCEEDED = 40908',
  /CLASSROOM_CAPACITY_EXCEEDED\s*=\s*40908/.test(errCodes));
check('40908 已进 Result 允许下发白名单（否则 fail() 内部抛异常变 500）',
  /ALLOWED_CODES[\s\S]{0,2000}ErrorCodes\.CLASSROOM_CAPACITY_EXCEEDED/.test(resultCls));

/* ==================== ② 课堂服务准入 ==================== */
console.log('\n[课堂服务准入]');
const capPath = 'api/classroom-service/src/main/java/com/classroom/service/InstanceCapacityService.java';
check('新增 InstanceCapacityService', fs.existsSync(path.join(ROOT, capPath)));
const cap = fs.existsSync(path.join(ROOT, capPath)) ? read(capPath) : '';

check('启动时报告是否启用（@PostConstruct）', /@PostConstruct/.test(cap) && /reportOnStartup/.test(cap));
check('未配置 instance-code 时打 WARN，不静默',
  /instanceCode\s*==\s*null\s*\|\|\s*instanceCode\.isBlank\(\)[\s\S]{0,400}log\.warn/.test(cap));
check('未配置上限时 fail-open（不阻止开课）',
  /max\s*==\s*null\s*\|\|\s*max\s*<=\s*0\)\s*return false/.test(cap));
check('按 instance_code 认领自己（不用 IP/端口）',
  /selectByInstanceCode/.test(cap) && !/getApiHost\(\)\s*\.equals/.test(cap));
check('并发口径与平台端一致：今日 + LIVE',
  /LocalDate\.now\(\)\.atStartOfDay\(\)/.test(cap) && /eq\(Classroom::getStatus,\s*"LIVE"\)/.test(cap));
check('拒绝文案带「进行中 N / 上限 M」',
  /进行中\s*" \+ live \+ " \/ 上限 " \+ max/.test(cap));

const svc = read('api/classroom-service/src/main/java/com/classroom/service/ClassroomService.java');
check('startClass 里调用容量判断', /capacityService\.isFull\(\)/.test(svc));
check('满则抛 40908（不是 40901）',
  /CLASSROOM_CAPACITY_EXCEEDED/.test(svc) && /throw new ClassroomBizException\(ErrorCodes\.CLASSROOM_CAPACITY_EXCEEDED/.test(svc));
check('准入判在状态校验之后（不对同一节课重复计数）',
  svc.indexOf('当前状态不可开课') < svc.indexOf('capacityService.isFull()'));

const sched = read('api/classroom-service/src/main/java/com/classroom/scheduler/ClassroomScheduler.java');
check('自动开课对 40908 记 warn 而非 error',
  /CLASSROOM_CAPACITY_EXCEEDED[\s\S]{0,400}log\.warn\("\[自动开课\] 实例并发已满/.test(sched));

/* ==================== ③ 配置项 ==================== */
console.log('\n[配置]');
check('application.properties 暴露 classroom.instance-code',
  /classroom\.instance-code=\$\{INSTANCE_CODE:\}/.test(read('api/classroom-service/src/main/resources/application.properties')));
check('classroom.env.template 有 INSTANCE_CODE 说明',
  /^INSTANCE_CODE=/m.test(read('deploy/classroom.env.template')));

/* ==================== ④ booking 侧校验与回写 ==================== */
console.log('\n[booking 侧]');
const es = read('api/src/main/java/com/reservation/service/EclassroomService.java');
check('createInstance 校验容量', /createInstance[\s\S]{0,200}validateMaxCapacity/.test(es));
check('updateInstance 校验容量', /updateInstance[\s\S]{0,200}validateMaxCapacity/.test(es));
check('容量必须为正整数（<=0 拒绝）',
  /validateMaxCapacity[\s\S]{0,400}maxCapacity <= 0[\s\S]{0,200}BusinessException/.test(es));
check('绑定时校验 api_host 非空', /bindTenantClassroom[\s\S]{0,900}getApiHost\(\)\.isBlank\(\)/.test(es));
check('绑定时校验 status == 1', /bindTenantClassroom[\s\S]{0,1600}Integer\.valueOf\(1\)\.equals\(instance\.getStatus\(\)\)/.test(es));
check('采集成功后回写 current_load',
  /persistCurrentLoad\(instanceId,\s*stats\.get\("liveClasses"\)\)/.test(es));
check('回写只动单列（updateById + 部分字段）',
  /persistCurrentLoad[\s\S]{0,500}setCurrentLoad[\s\S]{0,200}instanceMapper\.updateById/.test(es));

/* ==================== ⑤ 前端 ==================== */
console.log('\n[前端]');
const js = read('frontend/js/platform-admin-eclassroom.js');
check('实例列表有「当前负载」列', /<th>当前负载<\/th>/.test(js));
check('列表 colspan 已从 9 改为 10',
  (js.match(/colspan="10"/g) || []).length >= 3, '三处空态/错误态都要改，漏一处表格会错位');
check('表单最大容量带 min=1', /min="1"/.test(js));
check('提交前校验正整数', /最大容量必须为正整数/.test(js));
check('绑定下拉有可用性判断', /function isInstanceUsable/.test(js) && /disabled/.test(js));
check('可用性口径含 status 与 apiHost', /Number\(inst\.status\) !== 1\) return false[\s\S]{0,200}apiHost/.test(js));

/* ==================== ⑥ 渲染行为（vm） ==================== */
console.log('\n[渲染行为]');

const INSTANCES = [
  {
    id: 5, instanceCode: 'default-local', instanceName: '华东课堂服务-1',
    apiHost: '127.0.0.1', apiPort: 8092, apiBasePath: '/api/v1',
    wsHost: '', wsPort: null, wsBasePath: '', region: 'cn-east-1',
    maxCapacity: 200, currentLoad: 3, status: 1
  },
  {
    id: 6, instanceCode: 'eclass2cluster', instanceName: '测试集群',
    apiHost: '', apiPort: 8092, apiBasePath: '/api/v1',
    wsHost: '', wsPort: null, wsBasePath: '', region: 'cn_ca',
    maxCapacity: 5, currentLoad: 0, status: 1
  }
];

function buildSandbox(rows) {
  const elements = {};
  function el(id) { if (!elements[id]) elements[id] = { id: id, innerHTML: '' }; return elements[id]; }
  const sandbox = {
    window: {
      escapeHtml: function (s) {
        if (s == null) return '';
        return String(s).replace(/[&<>"']/g, function (c) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
      }
    },
    document: { getElementById: el, querySelectorAll: function () { return []; } },
    console: console,
    setInterval: function () { return 1; },
    clearInterval: function () {},
    setTimeout: setTimeout,
    alert: function () {},
    confirm: function () { return false; },
    request: function () { return Promise.resolve(rows); }
  };
  sandbox.window.document = sandbox.document;
  vm.createContext(sandbox);
  vm.runInContext(js, sandbox, { filename: 'platform-admin-eclassroom.js' });
  return { sandbox: sandbox, elements: elements };
}

(async function () {
  const built = buildSandbox(INSTANCES);
  built.sandbox.window.renderEclassroomInstancesPage();
  await new Promise(function (r) { setTimeout(r, 0); });
  const html = built.elements['eclassroom-instance-body'].innerHTML;

  check('渲染出两个实例', html.includes('华东课堂服务-1') && html.includes('测试集群'));
  check('当前负载渲染为 3（原先这列恒为 0）', /<td>3<\/td>/.test(html));
  check('容量与负载并列渲染', /<td>200<\/td><td>3<\/td>/.test(html));
  check('每行 10 个单元格',
    (html.match(/<tr>[\s\S]*?<\/tr>/g) || []).every(function (row) {
      return (row.match(/<td>/g) || []).length === 10;
    }), '列数与表头不一致会让数据错位到别的列下面');
})()
  .catch(function (e) {
    fail('渲染用例异常', e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n') : String(e));
  })
  .then(function () {
    console.log('\n' + (failed ? ('❌ 失败 ' + failed + ' / ' + total) : ('✓ 全部通过 ' + total + ' 项')));
    process.exit(failed ? 1 : 0);
  });
