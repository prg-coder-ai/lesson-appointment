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
        <button class="dm-tab-btn" id="tab-course-maintain" onclick="selectMaintainTab('course')"><i class="fa fa-book"></i> 课程</button>
        <button class="dm-tab-btn" id="tab-schedule-maintain" onclick="selectMaintainTab('schedule')"><i class="fa fa-calendar-alt"></i> 排期</button>
        <button class="dm-tab-btn" id="tab-booking-maintain" onclick="selectMaintainTab('booking')"><i class="fa fa-calendar-check"></i> 预定</button>
        <button class="dm-tab-btn" id="tab-appointment-maintain" onclick="selectMaintainTab('appointment')"><i class="fa fa-clock"></i> 预约</button>
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
  appointment: 'fa-clock'
};

// Tab 切换高亮 & 内容渲染
function selectMaintainTab(tab) {
  objectType = tab;
  ['template','course','schedule','booking','appointment'].forEach(function(type) {
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

  var tableConfigs = {
    template:    { title: "模板列表" },
    course:      { title: "课程列表" },
    schedule:    { title: "排期列表" },
    booking:     { title: "预定列表" },
    appointment: { title: "预约列表" }
  };
  var cfg = tableConfigs[type];
  if(!cfg) { maintainContent.innerHTML='<div class="dm-empty">未配置表格</div>'; return; }
  var icon = MAINTAIN_ICONS[type] || 'fa-list';

  // 筛选条（舒展布局 + 紫色 focus）
  var filterHtml = `
    <div class="dm-filter-bar">
      <input id='maintain-filter-keyword' type='text' placeholder='输入名称关键词' onkeydown="if(event.key==='Enter'){Pagination.pageNum=1;loadMaintainTableData('${type}');}"/>
      <button class='btn btn-primary btn-sm' onclick="Pagination.pageNum=1;loadMaintainTableData('${type}')"><i class='fa fa-search'></i> 查询</button>
      <button class="btn btn-default btn-sm" onclick="resetFilter()"><i class="fa fa-redo"></i> 重置</button>
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

// 动态加载数据并渲染表格
window.loadMaintainTableData = async function(type){
  var cfg = {
    template:    { api: fetchTemplateListPage,                                         delFunc: "deleteTemplate" },
    course:      { api: fetchCourseListPage || (async () => ({rows: [], total: 0, totalPages: 0})), delFunc: "deleteCourse" },
    schedule:    { api: fetchScheduleListPage,                                         delFunc: "deleteSchedule" },
    booking:     { api: fetchBookingListPage,                                          delFunc: "deleteBooking" },
    appointment: { api: datamaintain_fetchAppointmentListPage,                         delFunc: "deleteAppointmentsById" }
  }[type];

  var columns = {
    template: [
      {key: "templateId", label: "编号"},
      {key: "languageType", label: "语言类型"},
      {key: "difficultyLevel", label: "难度等级"},
      {key: "classForm", label: "课程形式"},
      {key: "classFee", label: "课时费(元)"},
      {key: "status", label: "状态"}
    ],
    course: [
      {key: "courseId", label: "编号"},
      {key: "courseName", label: "课程名"},
      {key: "content", label: "内容"},
      {key: "feature", label: "特色"},
      {key: "tempInfo", label: "模板"},
      {key: "teacherInfo", label: "教师"},
      {key: "status", label: "状态"}
    ],
    schedule: [
      {key: "courseName", label: "课程名"},
      {key: "name", label: "排期"},
      {key: "startDate", label: "开始日期"},
      {key: "startTime", label: "上课时间"},
      {key: "timeZone", label: "时区"},
      {key: "status", label: "状态"}
    ],
    booking: [
      {key: "bookingId", label: "编号"},
      {key: "studentName", label: "学生"},
      {key: "courseName", label: "课程"},
      {key: "scheduleName", label: "排期"},
      {key: "teacherName", label: "教师"},
      {key: "bookingStatus", label: "状态"}
    ],
    appointment: [
      {key: "id", label: "编号"},
      {key: "studentName", label: "学生"},
      {key: "teacherName", label: "教师"},
      {key: "courseName", label: "课程"},
      {key: "scheduleName", label: "排期"},
      {key: "classIndex", label: "序号"},
      {key: "appointmentTime", label: "时间"},
      {key: "appointmentStatus", label: "状态"}
    ]
  }[type];

  if(!cfg || !columns) return;

  var tableBox = document.getElementById('maintain-table-box');
  if(!tableBox) return;
  tableBox.innerHTML = '<div class="dm-loading"><i class="fa fa-spinner fa-spin"></i> 加载中...</div>';

  var kw = document.getElementById('maintain-filter-keyword')?.value?.trim();
  if(kw) { /* name 关键词会作为 conditionJson 之外的参数注入，此处保留 */ }

  const conditionJson = {
    pageSize: Pagination.pageSize,
    pageNum:  Pagination.pageNum
  };
  if (kw) conditionJson.name = kw;

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
    columns.forEach(col => html += `<th>${col.label}</th>`);
    html += '<th style="width:80px;">操作</th></tr></thead><tbody>';

    if (list.length === 0) {
      var colSpan = columns.length + 2;
      html += `<tr><td colspan="${colSpan}" class="dm-empty" style="border-bottom:none;">暂无数据</td></tr>`;
    } else {
      list.forEach(item => {
        index++;
        var firstKey = item[columns[0].key] ?? '';
        html += '<tr>';
        html += `<td>${index}</td>`;
        columns.forEach(col => {
          var val = item[col.key];
          html += `<td>${(val === null || val === undefined) ? '' : val}</td>`;
        });
        html += `<td>
          <button class="btn btn-danger btn-sm" onclick="(typeof ${cfg.delFunc}==='function')?${cfg.delFunc}('${firstKey}'):(typeof window.${cfg.delFunc}==='function'?window.${cfg.delFunc}('${firstKey}'):null)"><i class="fa fa-trash"></i> 删除</button>
        </td>`;
        html += '</tr>';
      });
    }
    html += '</tbody></table>';
    tableBox.innerHTML = html;
  } catch(e) {
    console.error('loadMaintainTableData 失败:', e);
    tableBox.innerHTML = '<div class="dm-error"><i class="fa fa-exclamation-circle"></i> 加载失败：' + (e.message || String(e)) + '</div>';
  }
}
 
// 初始自动选中模板Tab
setTimeout(function(){
  selectMaintainTab('template');
}, 0);


 // 搜索按钮：重置为第1页再查询
function localsearchCourse() {
  Pagination.pageNum = 1;

  loadAndRenderObjectListByPage();
}

// 重置筛选条件
function resetCourseFilter() {
  //document.getElementById('course-name-input').value = '';
  //document.getElementById('language-select').value = '';
  //.getElementById('course-status-select').value = '';
 // document.getElementById('difficulty-level-select').value = '';
  
  Pagination.pageNum = 1;
  loadAndRenderObjectListByPage();
}
 
  