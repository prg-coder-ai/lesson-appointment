/**
 * 平台端「在线课堂」菜单组 + 「课堂监视」页回归守卫（2026-11-20）
 *
 * 拦的四类静默退化：
 *   ① 菜单归属回退 —— 有人把「课堂实例」搬回「平台运营」，或删掉独立的「在线课堂」组；
 *   ② 路由漏接 —— 加了菜单项但 loadAdminPageContent 没有对应 case，点了白屏；
 *   ③ 授权漏登记 —— 新端点没进 AuthzRules，兜底 denyAll 直接 403，
 *      前端表现为「无权限访问该资源」（这个坑 2026-11-19 刚踩过一次）；
 *   ④ 渲染口径错 —— 实例不可达时把「没采集到」渲染成 0，运营会误以为该实例空着。
 *
 * 用 vm 沙箱而非 jsdom：被测模块是零依赖纯函数式渲染，只需要一个能接收 innerHTML 的
 * 假 DOM；jsdom 在这里只会带来 window.location 不可重定义之类的噪音。
 *
 * 用法：node tests/check_eclassroom_monitor_guard.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let failed = 0;
let total = 0;

function ok(name) { total++; console.log('  ✓ ' + name); }
function fail(name, detail) {
  total++; failed++;
  console.log('  ✗ ' + name + (detail ? ('\n      ' + detail) : ''));
}
function check(name, cond, detail) { cond ? ok(name) : fail(name, detail); }

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

/** 取 HTML 里某个菜单组的内容（从 group-title 到下一个 group-title 之间） */
function menuGroupBody(html, title) {
  const marker = 'menu-group-title">' + title + '<';
  const i = html.indexOf(marker);
  if (i < 0) return null;
  const rest = html.indexOf('menu-group-title">', i + marker.length);
  return html.slice(i, rest < 0 ? html.length : rest);
}

/* ==================== ① 菜单归属 ==================== */
console.log('\n[菜单归属]');
const adminHtml = read('frontend/platform_admin.html');

const classGroup = menuGroupBody(adminHtml, '在线课堂');
check('存在「在线课堂」菜单组', classGroup !== null);

if (classGroup !== null) {
  check('「在线课堂」组内含「课堂实例」', classGroup.includes('key="eclassroom_instances"'),
    '组内没找到 eclassroom_instances —— 菜单项被搬走后组就空了');
  check('「在线课堂」组内含「课堂监视」', classGroup.includes('key="eclassroom_monitor"'));
  check('「课堂监视」文案正确', classGroup.includes('课堂监视'));
}

const opsGroup = menuGroupBody(adminHtml, '平台运营');
check('「平台运营」组已不含「课堂实例」', opsGroup !== null && !opsGroup.includes('eclassroom_instances'),
  '「课堂实例」同时出现在两个组里，或又被搬回平台运营');

/* ==================== ② 路由接线 ==================== */
console.log('\n[路由接线]');
check('loadAdminPageContent 有 eclassroom_monitor 分支',
  /case\s+"eclassroom_monitor"\s*:/.test(adminHtml));
check('分支调用 renderEclassroomMonitorPage',
  /case\s+"eclassroom_monitor"\s*:[\s\S]{0,300}renderEclassroomMonitorPage/.test(adminHtml));
check('原有 eclassroom_instances 分支仍在',
  /case\s+"eclassroom_instances"\s*:/.test(adminHtml));

const js = read('frontend/js/platform-admin-eclassroom.js');
check('页面模块导出 renderEclassroomMonitorPage',
  /window\.renderEclassroomMonitorPage\s*=\s*renderEclassroomMonitorPage/.test(js));
check('模块请求 /eclassroom/monitor/instances',
  /url:\s*'\/eclassroom\/monitor\/instances'/.test(js));

/* ==================== ③ 后端授权与实现 ==================== */
console.log('\n[后端]');
const authz = read('api/src/main/java/com/reservation/config/AuthzRules.java');
check('AuthzRules 登记 /api/v1/eclassroom/monitor/instances',
  /"\/api\/v1\/eclassroom\/monitor\/instances"/.test(authz));
check('该规则限定 PLATFORM_ONLY',
  /"\/api\/v1\/eclassroom\/monitor\/instances"\s*,\s*PLATFORM_ONLY/.test(authz));

const ctrl = read('api/src/main/java/com/reservation/controller/EclassroomController.java');
check('Controller 暴露 GET /monitor/instances',
  /@GetMapping\("\/monitor\/instances"\)/.test(ctrl));
check('该端点先做平台管理员校验',
  /@GetMapping\("\/monitor\/instances"\)[\s\S]{0,400}checkPlatformAdmin/.test(ctrl));

const svc = read('api/src/main/java/com/reservation/service/EclassroomService.java');
check('Service 实现 instanceMonitor()', /public List<Map<String, Object>> instanceMonitor\(\)/.test(svc));
check('非「正常」状态不发起采集（避免误导性 0）',
  /Integer\.valueOf\(1\)\.equals\(inst\.getStatus\(\)\)/.test(svc));
check('API 地址为空/空串也跳过采集',
  /getApiHost\(\)\s*==\s*null\s*\|\|\s*inst\.getApiHost\(\)\.isBlank\(\)/.test(svc));
check('采集失败落到行内而非抛全局',
  /row\.put\("reachable",\s*false\)/.test(svc));

const sysCtrl = read('api/classroom-service/src/main/java/com/classroom/controller/SystemEclassroomController.java');
check('课堂服务暴露 /instance-stats', /@GetMapping\("\/instance-stats"\)/.test(sysCtrl));
check('instance-stats 限 system / platform_admin',
  /RoleConst\.SYSTEM\.equals\(role\)\s*\|\|\s*RoleConst\.isPlatformAdmin\(role\)/.test(sysCtrl));

const monitor = read('api/classroom-service/src/main/java/com/classroom/service/MonitorService.java');
check('MonitorService 有 instanceSummary()', /public Map<String, Object> instanceSummary\(\)/.test(monitor));
check('instanceSummary 统计 LIVE 与 READY 的在线数',
  /"LIVE"\.equals\(s\)[\s\S]{0,200}"READY"\.equals\(s\)[\s\S]{0,200}onlineTotal \+= countOnline/.test(monitor));

/* ==================== ④ 渲染行为（vm 沙箱） ==================== */
console.log('\n[渲染行为]');

function buildSandbox(rows) {
  const elements = {};
  function el(id) {
    if (!elements[id]) elements[id] = { id: id, innerHTML: '' };
    return elements[id];
  }
  const sandbox = {
    window: {
      escapeHtml: function (s) {
        if (s == null) return '';
        return String(s).replace(/[&<>"']/g, function (c) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
      }
    },
    document: { getElementById: el },
    console: console,
    setInterval: function () { return 1; },
    clearInterval: function () {},
    setTimeout: setTimeout,
    request: function () { return Promise.resolve(rows); }
  };
  sandbox.window.document = sandbox.document;
  vm.createContext(sandbox);
  vm.runInContext(js, sandbox, { filename: 'platform-admin-eclassroom.js' });
  return { sandbox: sandbox, elements: elements };
}

const SAMPLE = [
  {
    id: 5, instanceCode: 'default-local', instanceName: '华东课堂服务-1', region: 'cn-east-1',
    status: 1, maxCapacity: 200, apiBaseUrl: 'http://127.0.0.1:8092/api/v1',
    reachable: true, todayClasses: 42, liveClasses: 3, readyClasses: 2, onlineUsers: 128,
    tenantCount: 3, tenants: [
      { tenantId: 1, tenantCode: 'fbKxQRAd', orgName: '甲培训机构', enabled: 1 },
      { tenantId: 3, tenantCode: 'demo', orgName: '乙培训机构', enabled: 1 },
      { tenantId: 18, tenantCode: 't18', orgName: '丙培训机构', enabled: 0 }
    ]
  },
  {
    id: 6, instanceCode: 'eclass2cluster', instanceName: '测试集群', region: 'cn_ca',
    status: 0, maxCapacity: 5, apiBaseUrl: 'http://:8092/api/v1',
    reachable: false, error: '实例状态为「停用」，未采集',
    tenantCount: 0, tenants: []
  }
];

(async function runRenderCases() {
  const built = buildSandbox(SAMPLE);
  built.sandbox.window.renderEclassroomMonitorPage();
  const centerHtml = built.elements['dynamic-content-center'].innerHTML;

  check('页面渲染出「课堂监视」标题', centerHtml.includes('课堂监视'));
  ['所属租户', '今日课程', '进行中', '待开始', '实时在线', '容量'].forEach(function (h) {
    check('表头含「' + h + '」', centerHtml.includes('<th>' + h + '</th>'));
  });

  await built.sandbox.window.loadEclassroomMonitor(true);
  const body = built.elements['eclassroom-monitor-body'].innerHTML;

  check('渲染出可达实例的名称', body.includes('华东课堂服务-1'));
  check('渲染出实例编码', body.includes('default-local'));
  check('今日课程数渲染为 42', /<td>42<\/td>/.test(body));
  check('进行中渲染为 3', /<td>3<\/td>/.test(body));
  check('实时在线渲染为 128', /<td>128<\/td>/.test(body));
  check('容量渲染为 200', /<td>200<\/td>/.test(body));
  check('租户数量渲染为「共 3 个」', body.includes('共 3 个'));
  check('租户名摘要只列前两个', body.includes('甲培训机构、乙培训机构 等'));
  check('禁用绑定带标注', body.includes('丙培训机构（已禁用）'));
  check('完整租户名单进 title', body.includes('title="甲培训机构、乙培训机构、丙培训机构（已禁用）"'));

  check('不可达实例展示原因', body.includes('实例状态为「停用」，未采集'));
  check('不可达实例统计格显示「—」而非 0',
    (body.match(/<span style="color:#c0c0c0;">—<\/span>/g) || []).length >= 4,
    '不可达行的统计列没有全部显示破折号 —— 会把"没采集"误读成"0 节课"');
  check('未绑定租户显示「未绑定」', body.includes('未绑定'));

  const empty = buildSandbox([]);
  empty.sandbox.window.renderEclassroomMonitorPage();
  await empty.sandbox.window.loadEclassroomMonitor(true);
  check('无实例时给空态文案',
    empty.elements['eclassroom-monitor-body'].innerHTML.includes('暂无课堂实例'));
})()
  .catch(function (e) {
    fail('渲染用例执行异常', e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n') : String(e));
  })
  .then(function () {
    console.log('\n' + (failed ? ('❌ 失败 ' + failed + ' / ' + total) : ('✓ 全部通过 ' + total + ' 项')));
    process.exit(failed ? 1 : 0);
  });
