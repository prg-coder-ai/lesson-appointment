  /* js for overall  admin-dataMaintainpage.js 课程管理 CRUD
 */

// 引入分页组件js
document.write('<script src="/js/public/pagefoot.js"></script>');
document.write('<script src="/js/public/datamaintain_delete.js"></script>');
/*
 创建1个页面，内部包含对模板、课程、排期、预定、预约等数据表的检索条和显示表格。
 每个数据表都具有检索条，以表格方式分页显示。
 每个数据条目显示主要字段和"删除"操作按钮和"更新下一级"按钮。
 提供函数renderDatamaintainCards()显示基本页面框架。

 1、一键删除delete数据，2、删除当前行 3 删除关联的下级元素（递归）
*/

/* ============ 数据维护页面 统一风格样式（内联注入，不依赖 admin.html 之外的 CSS） ============ */
(function injectDataMaintainStyles() {
  if (document.getElementById('dataMaintain-style')) return;
  var style = document.createElement('style');
  style.id = 'dataMaintain-style';
  style.innerHTML = `
    /* Tab 栏：紫色主题 + 舒展布局 */
    .dm-tab-bar { display: flex; gap: 12px; flex-wrap: wrap; padding: 16px 20px; border-bottom: 1px solid #f0f0f0; }
    .dm-tab-btn { padding: 8px 20px; background: #fff; color: #555; border: 1px solid #d9d9d9; border-radius: 4px; cursor: pointer; font-size: 14px; display: inline-flex; align-items: center; gap: 6px; transition: all .2s; }
    .dm-tab-btn:hover { border-color: #722ed1; color: #722ed1; background: #f9f0ff; }
    .dm-tab-btn.active { background: #722ed1; color: #fff; border-color: #722ed1; box-shadow: 0 2px 6px rgba(114,46,209,.25); }
    /* 筛选条：舒展间距、统一紫色 focus 边框 */
    .dm-filter-bar { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; padding: 16px 20px; border-bottom: 1px solid #f0f0f0; }
    .dm-filter-bar input { padding: 8px 12px; border: 1px solid #d9d9d9; border-radius: 4px; font-size: 14px; min-width: 220px; box-sizing: border-box; }
    .dm-filter-bar input:focus { outline: none; border-color: #722ed1; box-shadow: 0 0 0 2px rgba(114,46,209,.12); }
    .dm-filter-bar select { padding: 8px 12px; border: 1px solid #d9d9d9; border-radius: 4px; font-size: 14px; min-width: 140px; background: #fff; color: #555; box-sizing: border-box; }
    .dm-filter-bar select:focus { outline: none; border-color: #722ed1; box-shadow: 0 0 0 2px rgba(114,46,209,.12); }
    /* 当前登录账号那一行：淡绿底 + 「本人」标记，复选框禁用 */
    tr.dm-row-self td { background: #f6ffed; }
    .dm-self-tag { color: #389e0d; font-size: 12px; margin-left: 6px; }
    /* 刷新按钮：推到筛选条最右侧，与查询/重置区分 */
    .dm-filter-bar .filter-purge { margin-left: auto; }
    /* 分区标题：紫色 + 图标 */
    .dm-section-title { font-size: 14px; font-weight: 600; color: #333; padding: 16px 20px 8px; display: flex; align-items: center; gap: 8px; }
    .dm-section-title i { color: #722ed1; }
    /* 数据表格容器：左右留 padding + 横向滚动 */
    .dm-table-box { padding: 0 20px; overflow-x: auto; }
    .dm-data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .dm-data-table th { background: #fafafa; padding: 12px 14px; text-align: left; border-bottom: 2px solid #f0f0f0; font-weight: 600; color: #333; white-space: nowrap; }
    .dm-data-table td { padding: 12px 14px; border-bottom: 1px solid #f0f0f0; color: #555; vertical-align: middle; }
    .dm-data-table tr:hover { background: #fafafa; }
    /* 小按钮：统一尺寸与紫色风格 */
    .btn-sm { padding: 4px 10px; font-size: 12px; }
    .btn-primary.btn-sm, .btn-default.btn-sm, .btn-danger.btn-sm { line-height: 1.4; }
    /* 空态 / 加载 / 错误 */
    .dm-empty { padding: 40px 0; text-align: center; color: #999; font-size: 14px; }
    .dm-loading { padding: 40px 0; text-align: center; color: #999; font-size: 14px; }
    .dm-error { padding: 40px 0; text-align: center; color: #f5222d; font-size: 14px; }
  `;
  document.head.appendChild(style);
})();

/**
 * 数据维护页面主入口
 * 渲染模板、课程、排期、预定、预约的数据维护 tabs
 */
let objectType="template";
function renderDatamaintainCards() {
  assignLoadobjectListFunction(loadAndRenderObjectListByPage); // assign for paging footer
  const dynamicContentCenter = document.getElementById('dynamic-content-center');
  if (!dynamicContentCenter) return;

  dynamicContentCenter.innerHTML = dataMaintainPage();
  loadAndRenderObjectListByPage();
}

// 渲染数据维护页面（统一卡片/标签/分区结构）
function dataMaintainPage() {
  return `
    <div class="card">
      <div class="card-header">
        <div class="card-title"><i class="fa fa-cogs"></i> 数据维护</div>
      </div>
      <div class="dm-tab-bar">
        <button class="dm-tab-btn active" id="tab-template-maintain" onclick="selectMaintainTab('template')"><i class="fa fa-layer-group"></i> 模板</button>
        <button class="dm-tab-btn" id="tab-course-maintain" onclick="selectMaintainTab('course')"><i class="fa fa-book"></i> <span data-term="course">课程</span></button>
        <button class="dm-tab-btn" id="tab-schedule-maintain" onclick="selectMaintainTab('schedule')"><i class="fa fa-calendar-alt"></i> 排期</button>
        <button class="dm-tab-btn" id="tab-booking-maintain" onclick="selectMaintainTab('booking')"><i class="fa fa-calendar-check"></i> 预定</button>
        <button class="dm-tab-btn" id="tab-appointment-maintain" onclick="selectMaintainTab('appointment')"><i class="fa fa-clock"></i> 预约</button>
        <button class="dm-tab-btn" id="tab-user-maintain" onclick="selectMaintainTab('user')"><i class="fa fa-users"></i> 用户</button>
        <button class="dm-tab-btn" id="tab-backend-maintain" onclick="selectMaintainTab('backend')"><i class="fa fa-server"></i> 后台信息</button>
      </div>
      <div id="maintain-content"></div>
    </div>`;
}


function loadAndRenderObjectListByPage() {
  renderMaintainTable(objectType);
}

// Tab 图标映射（用于每个表格分区标题）
var MAINTAIN_ICONS = {
  template: 'fa-layer-group',
  course: 'fa-book',
  schedule: 'fa-calendar-alt',
  booking: 'fa-calendar-check',
  appointment: 'fa-clock',
  user: 'fa-users',
  backend: 'fa-server'
};

// Tab 切换高亮 & 内容渲染
function selectMaintainTab(tab) {
  objectType = tab;
  ['template','course','schedule','booking','appointment','user','backend'].forEach(function(type) {
    var btn = document.getElementById('tab-'+type+'-maintain');
    if(btn) btn.classList.remove('active');
  });
  var btn = document.getElementById('tab-'+tab+'-maintain');
  if(btn) btn.classList.add('active');
  renderMaintainTable(tab);
}

// 主逻辑：渲染不同表格（筛选条 + 分区标题 + 表格容器 + 分页）
function renderMaintainTable(type) {
  var maintainContent = document.getElementById('maintain-content');
  if(!maintainContent) return;

  // 「后台信息」Tab：展示 booking_api / message-service 的名称、版本、构建时间
  // 该 Tab 不是数据表维护项，因此不走筛选条 + 分页的通用渲染
  if (type === 'backend') {
    renderBackendBriefInfo(maintainContent);
    return;
  }

  var tableConfigs = {
    template:    { title: "模板列表" },
    course:      { title: "课程列表" },
    schedule:    { title: "排期列表" },
    booking:     { title: "预定列表" },
    appointment: { title: "预约列表" },
    user:        { title: "用户列表" }
  };
  var cfg = tableConfigs[type];
  if(!cfg) { maintainContent.innerHTML='<div class="dm-empty">未配置表格</div>'; return; }
  var icon = MAINTAIN_ICONS[type] || 'fa-list';

  // 筛选条（舒展布局 + 紫色 focus）
  // 「用户」Tab 额外提供角色下拉：教师 / 学生 / 管理员。
  // 「平台管理员」选项只在调用方本人是 platform_admin 时才给——否则普通租户管理员点了只会 401/无权。
  var roleSelect = '';
  if (type === 'user') {
    var roleOpts = [
      { v: '', t: '全部角色' },
      { v: 'teacher', t: curTerm('teacher', '教师') },
      { v: 'student', t: curTerm('student', '学生') },
      { v: 'admin', t: '管理员' }
    ];
    if (typeof maintainIsPlatformAdmin === 'function' && maintainIsPlatformAdmin()) {
      roleOpts.push({ v: 'platform_admin', t: '平台管理员' });
    }
    roleSelect = `<select id='maintain-user-role' class='dm-role-select' onchange="Pagination.pageNum=1;loadMaintainTableData('user')">` +
      roleOpts.map(function (o) { return `<option value="${o.v}">${o.t}</option>`; }).join('') + `</select>`;
  }

  var filterHtml = `
    <div class="dm-filter-bar">
      ${roleSelect}
      <input id='maintain-filter-keyword' type='text' placeholder='${type === 'user' ? '输入姓名/账号关键词' : '输入名称关键词'}' onkeydown="if(event.key==='Enter'){Pagination.pageNum=1;loadMaintainTableData('${type}');}"/>
      <button class='btn btn-primary btn-sm' onclick="Pagination.pageNum=1;loadMaintainTableData('${type}')"><i class='fa fa-search'></i> 查询</button>
      <button class="btn btn-default btn-sm" onclick="resetFilter()"><i class="fa fa-redo"></i> 重置</button>
      <button class="btn btn-warning btn-sm filter-purge" onclick="purgeDeletedMaintain('${type}')"><i class="fa fa-eraser"></i> 清理已删</button>
      <button class="btn btn-danger btn-sm filter-delete" onclick="batchDeleteMaintain('${type}')"><i class="fa fa-trash"></i> 删除</button>
      <button class="btn btn-default btn-sm filter-refresh" onclick="Pagination.pageNum=1;loadMaintainTableData('${type}')"><i class="fa fa-sync"></i> 刷新</button>
    </div>
  `;

  var html = `
    <div class="dm-section-title"><i class="fa ${icon}"></i> ${cfg.title}</div>
    ${filterHtml}
    <div class="dm-table-box" id="maintain-table-box"></div>
  `;
  html += getPagebar();

  maintainContent.innerHTML = html;
  applyTerms(maintainContent);
  loadMaintainTableData(type);
}

// 重置查询条件
function resetFilter() {
  document.getElementById('maintain-filter-keyword').value = '';
  Pagination.pageNum = 1;
  loadMaintainTableData(objectType);
}

// 表头复选框：点击后对当前页所有行复选框执行“反转”操作（勾选的取消、未勾选的勾上）
function invertAllMaintainRows(master) {
  var boxes = document.querySelectorAll('#maintain-table-box .dm-row-check');
  for (var i = 0; i < boxes.length; i++) {
    boxes[i].checked = !boxes[i].checked;
  }
  // 反转是瞬时动作，表头复选框自身复位为未勾选，避免与“全选”语义混淆
  master.checked = false;
}

/**
 * 数据维护页专用：按主键删除「预约」（课次）。
 *
 * 为什么不能直接复用 appointmentNotes.js 的 deleteAppointmentsById(bookingId, appId)：
 *   ① 它是**两位形参**——第一位 bookingId 只用于删后刷新学生端「预订详情」卡片，
 *      第二位 appId 才是真正拼进删除 URL 的主键。
 *      而 batchDeleteMaintain 对所有类型统一以 fn(id) 单参调用 → id 落到了第一位，
 *      appId 恒为 undefined，请求打向 /course/appointment/delete/undefined（本 bug 的根因）。
 *   ② 它删完会调 viewMyReservationDetail(bookingid)，该函数定义在
 *      student-bookingBrowserCards.js，admin.html 并未加载——即便补齐参数，
 *      删除成功后仍会 ReferenceError 落进 catch 返回 false，界面表现为"删了却报失败"。
 *
 * 这里按后端契约直连（AppointmentController.delete）：
 *   DELETE {API_BASE_URL}/course/appointment/delete/{id}
 */
async function maintainDeleteAppointment(appId) {
  if (appId === undefined || appId === null || appId === '') {
    throw new Error('预约 id 无效（未取到主键）');
  }
  var http = (typeof window.request !== 'undefined') ? window.request
           : (typeof window.axios !== 'undefined') ? window.axios : null;
  if (!http) throw new Error('请求工具未加载（缺少 request / axios）');
  var base = window.API_BASE_URL || '';
  var res = await http({
    url: base + '/course/appointment/delete/' + encodeURIComponent(appId),
    method: 'delete',
    timeout: 15000
  });
  // window.request 的拦截器在 code=200 时已解包出 data 本体；裸 axios 则是 { data: {...} }
  var payload = res;
  if (res && res.data !== undefined && res.code === undefined) payload = res.data;
  if (payload && payload.code !== undefined && payload.code !== 200) {
    throw new Error(payload.message || payload.msg || ('接口返回 code=' + payload.code));
  }
  return true;
}

// 批量删除：弹出警告确认后，删除所有勾选行
// 删除前置钩子：{ type: async (ids) => string }，返回要追加进确认框的提示文案。
// 目前只有「用户」用它——删账号前把牵涉的业务数据摆出来，避免"点完才知道删掉了什么"。
// 统计失败返回空串：拿不到影响面不该反过来阻断删除。
var PRE_DELETE_HOOKS = {
  user: async function (ids) {
    const stat = await maintainUserRelationCounts(ids);
    if (!stat) return '\n（未能统计这批账号的关联数据量，影响面未知）';
    let c = 0, b = 0, a = 0;
    ids.forEach(function (id) {
      const s = stat[id] || {};
      c += Number(s.courses) || 0;
      b += Number(s.bookings) || 0;
      a += Number(s.appointments) || 0;
    });
    if (c + b + a === 0) return '\n这批账号名下没有课程 / 预定 / 课次，删除不影响业务数据。';
    return '\n合计影响：' + c + ' 门课程、' + b + ' 条预定、' + a + ' 节课。'
         + '\n（软删只是停用账号，这些数据仍在；要彻底清除请点「清理已删」）';
  }
};

async function batchDeleteMaintain(type) {
  var delFuncMap = {
    template: 'deleteTemplate',
    course: 'deleteCourseById',
    schedule: 'deleteScheduleById',
    booking: 'deleteBooking',
    appointment: 'maintainDeleteAppointment',
    // 用户是**软删**（status → 'delete'），不是物理删除：
    // 物理清理要另行点「清理已删」，走 /data-maintain/purge/user。
    // 「不能删自己」由后端 UserService.assertNoAdminSelfLock 权威拦截（返回 400）。
    user: 'maintainSoftDeleteUser'
  };
  var fnName = delFuncMap[type];
  if (!fnName) { alert('该类型暂不支持批量删除'); return; }
  var checks = document.querySelectorAll('#maintain-table-box .dm-row-check:checked');
  if (checks.length === 0) {
    alert('请先勾选要删除的行');
    return;
  }
  // 逐行取主键：这里必须显式过滤空值——早前「预约」每行都拼出 undefined 的删除 URL，
  // 却因为后端按路径变量吞了异常而毫无提示，界面看起来"点了删除没反应"。
  var ids = [];
  var emptyCount = 0;
  for (var i = 0; i < checks.length; i++) {
    var v = checks[i].value;
    if (v === '' || v === 'undefined' || v === 'null' || v === null || v === undefined) {
      emptyCount++;
      continue;
    }
    ids.push(v);
  }
  if (ids.length === 0) {
    alert('未能取到有效的数据 id（' + emptyCount + ' 行缺少主键），本次未执行删除。请刷新列表后重试。');
    return;
  }
  var tip = '确定要删除选中的 ' + ids.length + ' 条数据吗？此操作不可恢复！';
  if (emptyCount > 0) tip += '\n（另有 ' + emptyCount + ' 行未取到主键，将被跳过）';
  // 类型专属前置提示（目前是用户的影响面统计）；失败不影响删除本身
  if (PRE_DELETE_HOOKS[type]) {
    try {
      tip += (await PRE_DELETE_HOOKS[type](ids)) || '';
    } catch (e) {
      console.error('删除前置钩子失败（已忽略）:', e);
    }
  }
  if (!confirm(tip)) {
    return;
  }
  var fn = (typeof window[fnName] === 'function') ? window[fnName] : null;
  if (!fn) { alert('删除函数未找到：' + fnName); return; }
  var tasks = ids.map(function (id) { return Promise.resolve(fn(id)); });
  Promise.all(tasks).then(function () {
    loadMaintainTableData(type);
  }).catch(function (err) {
    console.error('批量删除失败:', err);
    // 带上真实原因：后端自锁（不能删自己）等关键拦截的文案必须让用户看见，
    // 只说"删除失败"会让人反复重试。
    var reason = (err && err.message) ? ('\n\n原因：' + err.message) : '';
    alert('部分数据删除失败，请刷新后查看' + reason);
    loadMaintainTableData(type);
  });
}

/** 角色枚举 → 展示文案（student/teacher 走行业词；两类管理员固定） */
function userRoleLabel(role) {
  var map = {
    student: curTerm('student', '学生'),
    teacher: curTerm('teacher', '教师'),
    admin: '管理员',
    platform_admin: '平台管理员'
  };
  return map[role] || role || '';
}

/** 账号状态枚举 → 展示文案（口径：只有 active 能登录；delete 是数据维护写的软删标记） */
function userStatusLabel(status) {
  var map = {
    active: '启用',
    pending: '待审核',
    frozen: '已禁用',
    inactive: '已停用',
    delete: '已删除'
  };
  return map[status] || status || '';
}

// 动态加载数据并渲染表格
window.loadMaintainTableData = async function(type){
  var cfg = {
    template:    { api: fetchTemplateListPage,                                         delFunc: "deleteTemplate",     idKey: "templateId" },
    course:      { api: fetchCourseListPage || (async () => ({rows: [], total: 0, totalPages: 0})), delFunc: "deleteCourseById", idKey: "courseId" },
    schedule:    { api: fetchScheduleListPage,                                         delFunc: "deleteScheduleById", idKey: "scheduleId" },
    booking:     { api: fetchBookingListPage,                                          delFunc: "deleteBooking",      idKey: "bookingId" },
    // 注意 delFunc 与 batchDeleteMaintain.delFuncMap 必须同名，且全部只接受单个主键形参：
    // 预约原用 appointmentNotes 的 deleteAppointmentsById(bookingId, appId)，两位形参导致主键错位。
    appointment: { api: datamaintain_fetchAppointmentListPage,                         delFunc: "maintainDeleteAppointment", idKey: "id" },
    // 用户复用已存在的分页接口（role 精准 + name 模糊），idKey 是 String 型的 userId
    user:        { api: fetchUserListPageForMaintain,                                  delFunc: "maintainSoftDeleteUser",   idKey: "userId" }
  }[type];

  var columns = {
    template: [
      {key: "templateId", label: "编号"},
      {key: "languageType", label: "课程/咨询类型", fmt: function (v) { return courseTypeCellHtml(v); }, term: {key: "classType", anchor: "语言类型"}},
      // 授课语言（work_language）：用哪种语言上课，固定枚举+租户自定义，不随行业变。
      // 与上面 languageType（classType 的 code，legal 行业下会显示「劳动」）是两回事。
      {key: "workLanguage", label: "授课语言", fmt: function (v) { return workLanguageCellHtml(v); }},
      {key: "difficultyLevel", label: "难度等级", fmt: function (v) { return enumTermCellHtml('classLevel', v); }, term: {key: "classLevel", anchor: "难度等级"}},
      {key: "classForm", label: "课程形式", fmt: function (v) { return enumTermCellHtml('classForm', v); }, term: {key: "course", anchor: "课程", suffix: "形式"}},
      {key: "classFee", label: "课时费(元)", term: {key: "lessonFee", anchor: "课时费", suffix: "(元)"}},
      {key: "status", label: "状态"}
    ],
    course: [
      {key: "courseId", label: "编号"},
      {key: "courseName", label: "课程名", term: {key: "course", anchor: "课程", suffix: "名"}},
      {key: "content", label: "内容"},
      {key: "feature", label: "特色"},
      {key: "tempInfo", label: "模板"},
      {key: "workLanguage", label: "授课语言", fmt: function (v) { return workLanguageCellHtml(v); }},
      {key: "teacherInfo", label: "教师", term: {key: "teacher", anchor: "教师"}},
      {key: "status", label: "状态"}
    ],
    schedule: [
      {key: "courseName", label: "课程名", term: {key: "course", anchor: "课程", suffix: "名"}},
      {key: "name", label: "排期", term: {key: "schedule", anchor: "排期"}},
      {key: "startDate", label: "开始日期"},
      {key: "startTime", label: "上课时间", term: {key: "lessonTime", anchor: "上课时间"}},
      {key: "timeZone", label: "时区"},
      {key: "workLanguage", label: "授课语言", fmt: function (v) { return workLanguageCellHtml(v); }},
      {key: "status", label: "状态"}
    ],
    booking: [
      {key: "bookingId", label: "编号"},
      {key: "studentName", label: "学生", term: {key: "student", anchor: "学生"}},
      {key: "courseName", label: "课程", term: {key: "course", anchor: "课程"}},
      {key: "scheduleName", label: "排期", term: {key: "schedule", anchor: "排期"}},
      {key: "teacherName", label: "教师", term: {key: "teacher", anchor: "教师"}},
      {key: "bookingStatus", label: "状态"}
    ],
    appointment: [
      {key: "id", label: "编号"},
      {key: "studentName", label: "学生", term: {key: "student", anchor: "学生"}},
      {key: "teacherName", label: "教师", term: {key: "teacher", anchor: "教师"}},
      {key: "courseName", label: "课程", term: {key: "course", anchor: "课程"}},
      {key: "scheduleName", label: "排期", term: {key: "schedule", anchor: "排期"}},
      {key: "classIndex", label: "序号"},
      {key: "appointmentTime", label: "时间"},
      {key: "appointmentStatus", label: "状态"}
    ],
    user: [
      {key: "account", label: "账号"},
      {key: "name", label: "姓名"},
      {key: "role", label: "角色", fmt: function (v) { return userRoleLabel(v); }},
      {key: "phone", label: "手机"},
      {key: "email", label: "邮箱"},
      {key: "status", label: "状态", fmt: function (v) { return userStatusLabel(v); }},
      {key: "orgName", label: "机构"}
    ]
  }[type];

  if(!cfg || !columns) return;

  var tableBox = document.getElementById('maintain-table-box');
  if(!tableBox) return;
  tableBox.innerHTML = '<div class="dm-loading"><i class="fa fa-spinner fa-spin"></i> 加载中...</div>';

  var kw = document.getElementById('maintain-filter-keyword')?.value?.trim();

  // 各类型查询关键词对应的后端 DTO 字段名（此前统一传 name，但只有模板 DTO 认 name，
  // 导致课程/排期/预定/预约的查询事实上全部失效）。按类型映射到后端真实字段：
  //  - template  -> name        （TemplateQueryPage.name 已支持模糊匹配）
  //  - course    -> courseName  （CourseQueryPage.courseName，CourseMapper 已 LIKE）
  //  - schedule  -> scheduleName（ScheduleQueryPage.scheduleName，本次补 SQL 过滤）
  //  - booking   -> courseName  （BookingQueryPage.courseName，BookingMapper 已 LIKE）
  //  - appointment -> 后端 listByPage 仅用 status 过滤，名称搜索需 join 改造，暂不支持
  var nameFieldByType = {
    template: 'name',
    course: 'courseName',
    schedule: 'scheduleName',
    booking: 'courseName',
    // 用户：后端 UserQueryPage.name 支持模糊匹配（加密字段由内存解密后 contains 过滤）
    appointment: null,
    user: 'name'
  };
  var nameField = nameFieldByType[type];

  const conditionJson = {
    pageSize: Pagination.pageSize,
    pageNum:  Pagination.pageNum
  };
  if (kw && nameField) conditionJson[nameField] = kw;

  // 用户 Tab：角色下拉的值额外带上（空=全部角色；platform_admin 会切到平台专用分页）
  if (type === 'user') {
    var roleEl = document.getElementById('maintain-user-role');
    if (roleEl && roleEl.value) conditionJson.role = roleEl.value;
  }

  try {
    const REQUEST_TIMEOUT = 30000;
    var pageResult = await Promise.race([
      cfg.api(conditionJson),
      new Promise((_, reject) => setTimeout(() => reject(new Error('请求超时，请稍后重试')), REQUEST_TIMEOUT))
    ]);

    const pageData = pageResult;
    Pagination.total = pageData.total;
    Pagination.totalPages = pageData.totalPages;
    renderPagination(Pagination);

    var list = pageData.rows || [];
    var index = (Pagination.pageNum - 1) * Pagination.pageSize;

    // 渲染表（改用统一 dm-data-table 类，去掉内联 style）
    let html = '<table class="dm-data-table">';
    html += '<thead><tr>';
    html += '<th>序号</th>';
    columns.forEach(col => {
      if (col.term) {
        html += `<th><span data-term="${col.term.key}">${col.term.anchor}</span>${col.term.suffix || ''}</th>`;
      } else {
        html += `<th>${col.label}</th>`;
      }
    });
    html += '<th style="width:50px; text-align:center;">选择<br><input type="checkbox" id="dm-select-all" title="点击反转本页所有行的勾选状态" onclick="invertAllMaintainRows(this)"></th></tr></thead><tbody>';

    if (list.length === 0) {
      var colSpan = columns.length + 2;
      html += `<tr><td colspan="${colSpan}" class="dm-empty" style="border-bottom:none;">暂无数据</td></tr>`;
    } else {
      list.forEach(item => {
        index++;
        var firstKey = item[cfg.idKey || columns[0].key] ?? '';
        // 用户 Tab：当前登录账号不可勾选。后端 UserService.assertNoAdminSelfLock 会再拦一道，
        // 这里只是让用户一眼看出"这行删不了"，而不是点了才被 400 拒绝。
        var selfRow = false;
        if (type === 'user') {
          var loginId = (typeof maintainCurrentUserId === 'function') ? maintainCurrentUserId() : '';
          selfRow = !!loginId && String(firstKey) === String(loginId);
        }
        html += '<tr' + (selfRow ? ' class="dm-row-self"' : '') + '>';
        html += `<td>${index}</td>`;
        columns.forEach(col => {
          // 支持列级格式化：枚举字段（语言类型/难度等级/课程形式）经 enumTerms.js 转成行业词
          var raw = item[col.key];
          var val = (typeof col.fmt === 'function') ? col.fmt(raw) : raw;
          html += `<td>${(val === null || val === undefined) ? '' : val}</td>`;
        });
        html += `<td style="text-align:center;">
          <input type="checkbox" class="dm-row-check" value="${firstKey}"${selfRow ? ' disabled title="当前登录账号，不能删除自己"' : ''} />
          ${selfRow ? '<span class="dm-self-tag">本人</span>' : ''}
        </td>`;
        html += '</tr>';
      });
    }
    html += '</tbody></table>';
    tableBox.innerHTML = html;
    applyTerms(tableBox); // 动态注入的表头/单元格 data-term 需在渲染后刷新，否则不随行业切换
  } catch(e) {
    console.error('loadMaintainTableData 失败:', e);
    tableBox.innerHTML = '<div class="dm-error"><i class="fa fa-exclamation-circle"></i> 加载失败：' + (e.message || String(e)) + '</div>';
  }
}
 
// 初始自动选中模板Tab
setTimeout(function(){
  selectMaintainTab('template');
}, 0);

/* ==================== 后台信息 Tab（名称 / 版本 / 构建时间） ==================== */

/**
 * 两个后端程序的 getApiInfo 探测目标。
 *
 * url/prefix 是**契约数据**（prefix 决定前端站点分流：message-service 必须带 /message 前缀
 * 才会被转发到 8090；写成 /api/v1/system/info 会被当成 booking 接口转发走）。
 * 权威源：shared/apiPaths.js 的 BACKEND_PROBES，经桥接挂到 window.ApiPaths。
 *
 * 下方数组是**降级快照**（桥接未加载时兜底），不是第二权威源——
 * tools/check-endpoints-refs.mjs 会逐字校验它与权威源一致，防止再次漂移。
 * desc 属界面文案，口径与平台端不同，故意各自自持。
 */
var BACKEND_BRIEF_SOURCES = ((window.ApiPaths && window.ApiPaths.BACKEND_PROBES) || [
  { key: 'booking', label: 'booking_api',     url: '/system/info',         prefix: '/api/v1' },
  { key: 'message', label: 'message-service', url: '/message/system/info', prefix: '/api/v1/message' }
]).map(function (p) {
  return {
    label: p.label,
    url: p.url,
    prefix: p.prefix,
    desc: (p.key === 'message') ? '消息中心（:8090）' : '业务后台（:8081）'
  };
});

/** 当前前端所在站点地址（origin），如 http://152.136.254.127 或 http://localhost:8080 */
function backendSiteOrigin() {
  try {
    if (window.location && window.location.origin && window.location.origin !== 'null') {
      return window.location.origin;
    }
    if (window.location) {
      return window.location.protocol + '//' + window.location.host;
    }
  } catch (e) { /* 非浏览器环境，走兜底 */ }
  return '';
}

/** 前端实际请求该服务的地址（站点 origin + 转发前缀） */
function backendEndpointOf(src) {
  return backendSiteOrigin() + (src && src.prefix ? src.prefix : '');
}

/**
 * 服务实际监听地址：优先 connection.listenAddress:listenPort（本进程真实绑定，
 * 0.0.0.0 表示监听全部网卡）；无 connection 时回退 hostAddress:port（主机网卡 IP）。
 */
function backendListenAddressOf(info) {
  var conn = (info && info.connection) ? info.connection : null;
  if (conn && conn.listenAddress) {
    return conn.listenPort ? (conn.listenAddress + ':' + conn.listenPort) : conn.listenAddress;
  }
  var host = (info && info.hostAddress) ? info.hostAddress : '';
  var port = (info && info.port) ? info.port : '';
  if (!host) return '-';
  return port ? (host + ':' + port) : host;
}

/** 实际连过去的 IP：后端解析 Host 头得到；没有时回退 Host 头本身 */
function backendConnectedIpOf(info) {
  var conn = (info && info.connection) ? info.connection : null;
  if (!conn) return '-';
  return conn.requestHostIp || conn.requestHost || '-';
}

/**
 * 统一解包 —— 与 platform-admin-backend-info.js 的 unwrapPayload 同逻辑：
 * window.request 的响应拦截器在 code=200 时已把 data 解包（payload 即 ServiceInfo 本体），
 * 旧实现固定 `res.data` 再 `.data` 会在这种形态下得到空对象 {}，表现为"接口有数据但页面空白"。
 */
function unwrapBackendPayload(payload) {
  var p = payload;
  if (p && p.data && typeof p.data === 'object' && (p.status !== undefined || p.config)) {
    p = p.data;
  }
  if (p && typeof p === 'object' && p.code !== undefined && ('data' in p)) {
    if (p.code !== 200) {
      throw new Error(p.message || p.msg || ('接口返回 code=' + p.code));
    }
    return p.data || {};
  }
  return p || {};
}

/** 调用 getApiInfo（匿名接口），返回 data 对象 */
async function fetchBackendBriefInfo(url) {
  var http = (typeof window.request !== 'undefined') ? window.request
           : (typeof window.axios !== 'undefined') ? window.axios : null;
  if (!http) throw new Error('请求工具未加载（缺少 request / axios）');
  var res = await http.get(url, { timeout: 15000 });
  var info = unwrapBackendPayload(res);
  if (!info || typeof info !== 'object' || Object.keys(info).length === 0) {
    throw new Error('接口未返回数据（解包后为空）');
  }
  return info;
}

/** 读取前端静态包构建信息（build-info.json / window.__BUILD_INFO__）
 *  构建时 build.js 已把 dist/build-info.json 的同一份数据烤进每个 html 页面的
 *  window.__BUILD_INFO__——存在即直接读取，零网络请求、不依赖任何后端接口。
 *  仅当页面未烤入（旧构建产物）才回退读取同源静态文件 build-info.json
 *  （注意：这是读前端静态包自己的文件，不是请求后台接口），
 *  并用 AbortController 限时 5s 兜底，防止异常环境（如被路由到慢后端）挂起渲染。
 */
async function fetchFrontendBuildInfo() {
  if (window.__BUILD_INFO__) return window.__BUILD_INFO__;
  try {
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 5000) : null;
    var r = await fetch('build-info.json', { cache: 'no-cache', signal: ctrl ? ctrl.signal : undefined });
    if (timer) clearTimeout(timer);
    if (r.ok) return await r.json();
  } catch (e) { /* 超时或文件不存在 → 回退 null */ }
  return null;
}

/** 渲染「后台信息」Tab 内容 */
async function renderBackendBriefInfo(container) {
  if (!container) return;
  container.innerHTML = `
    <style>
      .dm-endpoint { font-family: Consolas, Monaco, monospace; font-size: 12px; color: #2c3e50; word-break: break-all; }
    </style>
    <div class="dm-section-title"><i class="fa fa-server"></i> 程序信息</div>
    <div class="dm-table-box" id="backend-brief-box">
      <div class="dm-loading"><i class="fa fa-spinner fa-spin"></i> 加载中...</div>
    </div>
    <div style="padding: 8px 20px 16px;">
      <button class="btn btn-default btn-sm" id="backend-brief-refresh"><i class="fa fa-refresh"></i> 刷新</button>
    </div>`;

  var refreshBtn = document.getElementById('backend-brief-refresh');
  if (refreshBtn) refreshBtn.onclick = function () { renderBackendBriefInfo(container); };

  var box = document.getElementById('backend-brief-box');
  if (!box) return;

  // 前端构建信息先行并行发起：只读本地（window.__BUILD_INFO__ / 同源静态 build-info.json），
  // 不依赖任何后端接口；后端行失败/超时各自显示错误，不影响前端行展示。
  var fbPromise = fetchFrontendBuildInfo().catch(function () { return null; });

  // 并发取两个服务，单个失败不影响另一个（各自 15s 超时，超时行显示获取失败）
  var results = await Promise.all(BACKEND_BRIEF_SOURCES.map(async function (src) {
    try {
      return { src: src, info: await fetchBackendBriefInfo(src.url), error: null };
    } catch (e) {
      return { src: src, info: null, error: (e && e.message) ? e.message : String(e) };
    }
  }));

  const fb = await fbPromise;

  var html = '<table class="dm-data-table"><thead><tr>' +
             '<th>程序</th><th>名称</th><th>版本</th><th>构建时间</th>' +
             '<th>前端调用地址</th><th>实际连接 IP</th><th>服务监听地址</th><th>说明</th>' +
             '</tr></thead><tbody>';

  results.forEach(function (r) {
    html += '<tr>';
    html += '<td>' + r.src.label + '</td>';
    if (r.error) {
      html += '<td colspan="3" class="dm-error" style="border-bottom:none;">获取失败：' + r.error + '</td>';
      // 调用地址不依赖接口返回，即使失败也能显示，便于排查"连的是哪个地址"
      html += '<td class="dm-endpoint">' + backendEndpointOf(r.src) + '</td>';
      html += '<td>-</td><td>-</td>';
      html += '<td>' + r.src.desc + '</td>';
    } else {
      html += '<td>' + (r.info.appName || '-') + '</td>';
      html += '<td>' + (r.info.version || '-') + '</td>';
      html += '<td>' + (r.info.buildTime || '-') + '</td>';
      html += '<td class="dm-endpoint">' + backendEndpointOf(r.src) + '</td>';
      html += '<td class="dm-endpoint">' + backendConnectedIpOf(r.info) + '</td>';
      html += '<td class="dm-endpoint">' + backendListenAddressOf(r.info) + '</td>';
      html += '<td>' + (r.info.description || r.src.desc) + '</td>';
    }
    html += '</tr>';
  });

  {
    // 始终渲染前端行：拿不到数据时显示原因，而不是整行消失
    var pkg = (fb && fb.mode === 'source') ? '源码直出' : 'dist';
    var fbDesc;
    if (!fb) {
      fbDesc = '（不可用：页面未烤入 __BUILD_INFO__，且 build-info.json 请求失败/不存在）';
    } else if (fb.gitCommit) {
      fbDesc = fb.gitCommit + (fb.gitBranch ? (' @ ' + fb.gitBranch) : '') + (fb.gitDirty ? '（工作区脏）' : '');
      if (fb.mode === 'source') fbDesc += '（dev 代理合成，源码当前 git 状态）';
    } else {
      fbDesc = '（build-info.json 无 git 信息）';
    }
    html += '<tr><td>前端(静态包)</td><td>' + pkg + '</td><td>-</td><td>' + ((fb && fb.buildTime) || '-') + '</td><td>-</td><td>-</td><td>-</td><td>' + fbDesc + '</td></tr>';
  }
  html += '</tbody></table>';

  // 链路摘要：把「客户端 → 访问域名(解析IP) → 对端 → 本服务监听」整串展示出来
  var summaries = results.filter(function (r) {
    return !r.error && r.info && r.info.connection && r.info.connection.summary;
  }).map(function (r) {
    return '<div><b>' + r.src.label + '</b>：' + r.info.connection.summary + '</div>';
  });
  if (summaries.length) {
    html += '<div class="dm-endpoint" style="padding:10px 12px;color:#666;">' + summaries.join('') + '</div>';
  }

box.innerHTML = html;
}

/*原localsearchCourse() / resetCourseFilter() 已删除（2026-10-09）。
 *
 * 这两个函数在本文件内**从未被调用**（无任何 onclick= 或 JS 调用点），
 * 但它们与 admin-course.js 的同名顶层函数冲突：本文件在 admin.html 里
 * 后加载，于是静默覆盖了 admin-course.js 的实现 —— 课程管理页的
 * 「搜索 / 重置」按钮实际会调到本文件的 loadAndRenderObjectListByPage()，
 * 而非它自己页面用的 loadAndRenderCourseListByPage()。
 *
 * 症状不是报错而是"点了没反应 / 列表刷错"，因此比语法错更难查。
 * 浏览器不会对同名 function 声明报错，只会静默覆盖 —— 这类问题由
 * tools/check-global-collide.mjs 的「情况③：同名顶层 function」拦截。
 */
 
  