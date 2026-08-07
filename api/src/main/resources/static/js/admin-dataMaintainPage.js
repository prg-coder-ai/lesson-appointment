  /* js for overall  admin-dataMaintainpage.js 课程管理 CRUD
  */ 
 
 // 引入分页组件js
 document.write('<script src="/js/public/pagefoot.js"></script>');
 document.write('<script src="/js/public/datamaintain_delete.js"></script>');
 /*
  创建1个页面，内部包含对模板、课程、排期、预定、预约等数据表的检索条和显示表格。
  每个数据表都具有检索条，以表格方式分页显示。
  每个数据条目显示主要字段和"删除"操作按钮和“更新下一级”按钮。
  提供函数renderDatamaintainCards()显示基本页面框架。 

  1、一键删除delete数据，2、删除当前行 3 删除关联的下级元素（递归）
*/
 
/**
 * 数据维护页面主入口
 * 渲染模板、课程、排期、预定、预约的数据维护 tabs
 */
/**
 * 渲染课程列表（核心：原生JS操作DOM）
 */
let objectType="templete";
function renderDatamaintainCards() {  
  assignLoadobjectListFunction( loadAndRenderObjectListByPage);// assign for paging footer
  const dynamicContentCenter = document.getElementById('dynamic-content-center'); 
  if (!dynamicContentCenter) return; 

     if(dynamicContentCenter) {
      dynamicContentCenter.innerHTML =  dataMaintainPage();  
      loadAndRenderObjectListByPage();
   }
// 页面渲染完成后，加载第一页数据
   
 }

function dataMaintainPage() {
  // 顶部tab切换
  return `
    <div class="card">
      <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;">
        <div class="card-title"><i class="fa fa-cogs"></i> 数据维护</div>
      </div>
      <div class="tab-bar" style="display:flex; gap:16px; margin-bottom:16px;">
        <button class="tab-btn" id="tab-template-maintain" onclick="selectMaintainTab('template')">模板</button>
        <button class="tab-btn" id="tab-course-maintain" onclick="selectMaintainTab('course')">课程</button>
        <button class="tab-btn" id="tab-schedule-maintain" onclick="selectMaintainTab('schedule')">排期</button>
        <button class="tab-btn" id="tab-booking-maintain" onclick="selectMaintainTab('booking')">预定</button>
        <button class="tab-btn" id="tab-appointment-maintain" onclick="selectMaintainTab('appointment')">预约</button>
      </div>
      <div id="maintain-content">
      
      </div>
    </div>`;
}


function  loadAndRenderObjectListByPage()
{
  renderMaintainTable(objectType);
}// assign
 


      // Tab 切换高亮 & 内容渲染
      function selectMaintainTab(tab) {

        objectType = tab;
        // 移除所有tab高亮
        ['template','course','schedule','booking','appointment'].forEach(function(type) {
          var btn = document.getElementById('tab-'+type+'-maintain');
          if(btn) btn.classList.remove('active');
        });
        // 高亮当前tab
        var btn = document.getElementById('tab-'+tab+'-maintain');
        if(btn) btn.classList.add('active');
        // 渲染对应内容
        renderMaintainTable(tab);
      }

      // 主逻辑：渲染不同表格
      function renderMaintainTable(type) {
        var maintainContent = document.getElementById('maintain-content');
        if(!maintainContent) return;
       
        // 可用的数据对象，每项形如：{title, api, columns, delFunc}
        var tableConfigs = {
          template: {
            title: "模板列表",
        //    url: "/course/template/list",
            columns: [
              {key: "templateId", label: "ID"},
              {key: "name", label: "名称"},
              {key: "languageType", label: "语言类型"},
              {key: "difficultyLevel", label: "难度等级"},
              {key: "status", label: "状态"}
            ],
            delFunc: "deleteTemplate" // 需全局已定义
          },
          course: {
            title: "课程列表",
          },
          schedule: {
            title: "排期列表",
           },
          booking: {
            title: "预定列表",
            },
          appointment: {
            title: "预约列表"
          }
        };

        // 选择table配置
        var cfg = tableConfigs[type];
        if(!cfg) { maintainContent.innerHTML='未配置表格'; return;}

        // 渲染查询条(只简单支持名称搜索)
        var filterHtml = `
          <div style='margin-bottom:12px;'>
            <input id='maintain-filter-keyword' type='text' placeholder='输入名称关键词' style='padding: 4px 8px;'/>
            <button class='btn btn-sm' onclick='loadMaintainTableData("${type}")'><i class='fa fa-search'></i> 查询</button>
          </div>
        `;
        // 占位表格
        let html = 
         `
          <div style="margin-bottom:8px;"><strong>${cfg.title}</strong></div>
          ${filterHtml}
          <div id="maintain-table-box"></div>
        `;
        html += getPagebar();

        maintainContent.innerHTML =html;
        // 请求并渲染表格
        loadMaintainTableData(type);
      }
 

// 动态加载数据并渲染表格
window.loadMaintainTableData = async function(type){
  var cfg = {
    template: {
      api: fetchTemplateListPage,//"/course/template/list",
      delFunc: "deleteTemplate"
    },
    course: {
      api: fetchCourseListPage,
      delFunc: "deleteCourse"
    },
    schedule: { //TBD---
      api: fetchScheduleListPage,
      delFunc: "deleteSchedule"
    },
    booking: {
      api: getBookingListPage,
      delFunc: "deleteBooking"
    },
    appointment: {
      api: getAppointmentListPage,
      delFunc: "deleteAppointment"
    }
  }[type];
  // 配置columns
  var columns = {
    template: [
       {key: "templateId", label: "ID"},      
      {key: "languageType", label: "语言类型"},
      {key: "difficultyLevel", label: "难度等级"},
       {key:"classForm",lable:"课程形式"},
       {key:"classFee" ,label:"课时费(元)"},
      {key: "status", label: "状态"}
    ],
    course: [ 
        {key: "courseId", label: "ID"},
        {key: "courseName", label: "课程名"},
        {key: "content", label: "内容"},
        {key: "feature", label: "特色"},
        {key:"tempInfo",label:"模板"},
        {key:"teacherInfo",label:"教师"},
        {key: "status", label: "状态"}
      ], 
    schedule: [
      {key: "scheduleId", label: "ID"},
      {key: "courseName", label: "课程"},
      {key: "startDate", label: "开始日期"},
      {key: "startTime", label: "上课时间"},
      {key: "timeZone", label: "时区"},
      {key: "status", label: "状态"}
    ],
    booking: [
      {key: "bookingId", label: "ID"},
      {key: "studentName", label: "学生"},
      {key: "courseName", label: "课程"},
      {key: "teacherName", label: "教师"},
      {key: "bookingStatus", label: "状态"}
    ],
    appointment: [
      {key: "appointmentId", label: "ID"},
      {key: "studentName", label: "学生"},
      {key: "courseName", label: "课程"},
      {key: "appointmentDate", label: "预约日期"},
      {key: "status", label: "状态"}
    ]
  }[type];

  if(!cfg || !columns) return;

  var tableBox = document.getElementById('maintain-table-box');
  if(!tableBox) return;
  tableBox.innerHTML = '<div style="padding:24px;text-align:center;">加载中...</div>';

  // 查询参数
  var kw = document.getElementById('maintain-filter-keyword')?.value?.trim();
  var param = {};
  if(kw) {
    // 优先支持name关键词模糊匹配
    param.name = kw;
  }
  const conditionJson = {
   /* languageType:       document.getElementById('languageType-select').value,
    difficultyLevel:    document.getElementById('difficultyLevel-select').value,
    name:    document.getElementById('name-input').value,
    */
    pageSize:Pagination.pageSize,
    pageNum: Pagination.pageNum
};
  try{
    // 请求数据
    var pageResult = await cfg.api(conditionJson);
     console.log("pageResult:",pageResult);

    const pageData = pageResult;
    Pagination.total = pageData.total ;
    Pagination.totalPages = pageData.totalPages;
    renderPagination( Pagination);  

     // 兼容res.data, res.obj等
    var list =  pageData.rows;  //  res?.list || res?.data || res?.obj || res || [];
    // 渲染表
    let html = '<table class="data-table" style="width:100%;border-collapse:collapse;text-align:left;">';
    html += '<thead><tr>';
    
    var index=(Pagination.pageNum-1)*Pagination.pageSize;//记录序号let index = 0;
    html += '<th style="border-bottom:1px solid #eee;padding:6px 8px;">序号</th>';
    columns.forEach(col=> html += `<th style="border-bottom:1px solid #eee;padding:6px 8px;">${col.label}</th>`);
    html += '<th style="border-bottom:1px solid #eee;padding:6px 8px;">操作</th></tr></thead><tbody>';
    if(list.length===0) {
      html += '<tr><td colspan="${columns.length+1}" style="padding:24px;text-align:center;">暂无数据</td></tr>';
    } else {
      list.forEach(item=>{
        console.log(item);
        index ++ ;
        html += '<tr>';
        html += `<td>${index}</td>`;
        columns.forEach(col=>{
          html += `<td style="border-bottom:1px solid #f5f5f5;padding:6px 8px;">${item[col.key] ?? ''}</td>`;
        });
        html += `<td>
          <button class="btn btn-danger btn-sm" onclick="${cfg.delFunc} && window.${cfg.delFunc} && window.${cfg.delFunc}('${item[columns[0].key]}')"><i class="fa fa-trash"></i> 删除</button>        
          </td>`;
        html += '</tr>';
   
      })
    }
    html += '</tbody></table>';
    tableBox.innerHTML = html;
  }catch(e){
    tableBox.innerHTML = '<div style="color:red;padding:24px;text-align:center;">加载失败</div>';
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
 
  