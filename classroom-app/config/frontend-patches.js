/**
 * 前端改动记录清单（唯一事实源）
 * ==================================================================
 * 课堂独立一码多端方案 · 所有「需要改动原前端」的点都记录在这里。
 *
 * ★ 核心纪律：原 frontend/ 目录一个字节都不改。
 *   - mode='rewrite' / 'inject' 的条目，由 scripts/patch.js 在构建期
 *     打到 classroom-app/www/ 的「副本」上，原文件只读。
 *   - mode='record-only' 的条目只记录、不自动应用，留给上游人工修改
 *     （涉及 shared/ 跨端共享或后续阶段 P1/P2）。
 *
 * 每条含 anchor（锚点原文）+ replacement（替换文本），构建时会校验锚点
 * 存在且唯一；锚点漂移立即报错，避免上游改了代码后补丁静默失效。
 *
 * 参考方案：doc-develop/08-电子课堂/课堂独立一码多端解决方案-20261124.md
 */
'use strict';

const PATCHES = [
  // ---------------- P0：构建期自动应用到 www 副本 ----------------
  {
    id: 'FP-001',
    title: '课堂 role 只认登录态，拒绝 URL 参数冒充',
    target: 'js/classroom/classroom-main.js',
    mode: 'rewrite',
    priority: 'P0',
    status: 'active',
    anchor: "role: this._getParam('role') || user.role,",
    replacement: "role: user.role, // [FP-001] 只认登录态，忽略 URL role 参数",
    reason:
      '原逻辑 role = URL 参数 || 登录态，攻击者可用 ?role=admin 冒充管理员。' +
      '后端 accessGuard 虽能兜底，但前端不应给出越权 UI。',
    docRef: '方案 §6.3 / 附录A classroom-main.js:87',
    verify: "补丁后 classroom-main.js 不应再出现 \"this._getParam('role') || user.role\""
  },
  {
    id: 'FP-002',
    title: '课堂页注入入口守卫（token / 角色 / 租户一致性）',
    target: 'classroom.html',
    mode: 'inject',
    priority: 'P0',
    status: 'active',
    marker: '<!-- FP-002:app-entry-guard -->',
    inject: '<script src="app-entry-guard.js"></script>',
    position: 'beforeHeadClose',
    reason:
      '原课堂页只有 guardClassroom() 查租户开关，没有 token/角色/tCode 一致性校验。' +
      '独立 App 用统一入口，在进入课堂前补一道守卫，失败退回登录页。' +
      'guard 脚本是新工程文件，此处只在 www 副本的 HTML 里加一行引用。',
    docRef: '方案 §6.3 / 附录A classroom.js:49, feature-flags.js:225',
    verify: '补丁后 www/classroom.html 应包含 app-entry-guard.js 引用'
  },

  // ---------------- P0/P1：仅记录，待上游人工修改（不动原文件） ----------------
  {
    id: 'FP-003',
    title: '课堂端点登记进 shared/apiPaths.js',
    target: 'shared/apiPaths.js',
    mode: 'record-only',
    priority: 'P1',
    status: 'deferred',
    reason:
      '/classrooms/{sid}/start、/enter、monitorClassrooms、remoteEndClass 目前是' +
      'frontend/js/public/api.js:1123/1136 的字面量，未进 apiPaths.js，端点守卫扫不到。' +
      '涉及 shared/ 跨端共享（小程序镜像 + bridge 白名单），需走四步同步，不宜在构建期篡改。',
    docRef: '方案 §6.6 / 附录A api.js:1123,1136',
    verify: '上游修改后应执行 sync-miniprogram-shared → check-shared-sync → gen-shared-bridge → frontend/build.js'
  },
  {
    id: 'FP-004',
    title: '课堂双基址覆盖（getClassroomApiBaseUrl / getClassroomWsBaseUrl）',
    target: '（新工程桥接层承担，不改原前端）',
    mode: 'record-only',
    priority: 'P0',
    status: 'deferred',
    reason:
      '现有 student-app/src/core/app-bridge.js 只 patch 了 ApiPaths.normalizeUrl，' +
      '未覆盖课堂专属双基址。local 模式下这两个函数返回空串（回环归一）会打错地址。' +
      '课堂上独立 App 后改由 classroom-app/src/core/app-bridge.js 覆盖，属新工程实现，不动原文件。',
    docRef: '方案 §7.3 缺口 / 附录A feature-flags.js:107-133',
    verify: 'local 模式下 getClassroomApiBaseUrl() 应返回 classroomApiOrigin 绝对地址'
  },
  {
    id: 'FP-005',
    title: '引入能力表（capability map）收口角色 UI',
    target: 'js/classroom/classroom-controls.js 等',
    mode: 'record-only',
    priority: 'P1',
    status: 'deferred',
    reason:
      '教师/学生模块在每个课堂页都 init，仅靠 CSS 隐藏，误触面大且包体浪费。' +
      '建议上游把角色能力抽成统一 map，按 role 决定加载哪些模块。' +
      '涉及课堂本体结构，风险高，不在独立 App 首期自动 patch。',
    docRef: '方案 §6.3 / 附录A classroom-main.js:295-311',
    verify: '上游重构后各角色只见自己能力对应的按钮'
  },
  {
    id: 'FP-006',
    title: 'admin 管理动作前端 role 校验加固',
    target: 'js/classroom/classroom-admin.js',
    mode: 'record-only',
    priority: 'P1',
    status: 'deferred',
    reason:
      'forceEnd 的 ctx.role !== admin 是纯前端判断，可绕过。' +
      '独立 App 保留后端 accessGuard 作为最终边界即可；前端加固列为上游 P1。',
    docRef: '方案 §6.3 / 附录A classroom-admin.js:64',
    verify: '上游加固后非 admin 不应看到强制结束按钮'
  }
];

module.exports = { PATCHES };
