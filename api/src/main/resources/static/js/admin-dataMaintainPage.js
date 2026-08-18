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
// 渲染数据维护页面,TBD：用高亮色表示当前选项
function dataMaintainPage() {
  // 顶部tab切换
  return `
    <div class="card">
      <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;">
        <div class="card-title"><i class="fa fa-cogs"></i> 数据维护</div>
      </div>
      <div class="tab-bar" style="display:flex; gap:16px; margin:16px;">
        <button class="tab-btn active" id="tab-template-maintain" onclick="selectMaintainTab('template')">模板</button>
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
          <div style='align-items:right;padding-left:20px;margin-bottom:12px;'>
            <input id='maintain-filter-keyword' type='text' placeholder='输入名称关键词' style='padding: 4px 8px;'/>
            <button class='btn btn-sm' onclick='loadMaintainTableData("${type}")'><i class='fa fa-search'></i> 查询</button>
         
            <button class="btn btn-default" onclick="resetFilter()"> 
                <i class="fa fa-redo"></i>重置
                </button>
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
  

      // 重置查询条件
      function resetFilter() {
        document.getElementById('maintain-filter-keyword').value = '';
        loadMaintainTableData(objectType);
      }
// 动态加载数据并渲染表格
window.loadMaintainTableData = async function(type){
  var cfg = {
    template: {
      api: fetchTemplateListPage,//"/course/template/list",
      delFunc: "deleteTemplate"
    },
    course: {
      api: fetchCourseListPage || (async () => ({rows: [], total: 0, totalPages: 0})),
      delFunc: "deleteCourse"
    },
    schedule: { 
      api: fetchScheduleListPage,
      delFunc: "deleteSchedule"
    },
    booking: {
      api: fetchBookingListPage,
      delFunc: "deleteBooking"
    },
    appointment: {
      api: datamaintain_fetchAppointmentListPage,//datamaintain_delete.js
      delFunc: "deleteAppointmentsById"
    }
  }[type];
  // 配置columns
  var columns = {
    template: [
       {key: "templateId", label: "编号"},      
      {key: "languageType", label: "语言类型"},
      {key: "difficultyLevel", label: "难度等级"},
       {key:"classForm",label:"课程形式"},
       {key:"classFee" ,label:"课时费(元)"},
      {key: "status", label: "状态"}
    ],
    course: [ 
        {key: "courseId", label: "编号"},
        {key: "courseName", label: "课程名"},
        {key: "content", label: "内容"},
        {key: "feature", label: "特色"},
        {key:"tempInfo",label:"模板"},
        {key:"teacherInfo",label:"教师"},
        {key: "status", label: "状态"}
      ], 
    schedule: [
     // {key: "scheduleId", label: "排期号"},
      {key: "courseName", label: "课程名"},//用id显示课程名
      {key: "name", label: "排期"},
     //  {key: "teacherInfo", label: "教师"},
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
    // 添加超时机制确保等待函数完全返回，避免请求无限挂起
    const REQUEST_TIMEOUT = 30000; // 30秒超时
    var pageResult = await Promise.race([
      cfg.api(conditionJson),
      
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('请求超时，请稍后重试')), REQUEST_TIMEOUT)
      )
    ]);
    
    console.log("pageResult----:",pageResult);
    const pageData = pageResult;
    Pagination.total = pageData.total ;
    Pagination.totalPages = pageData.totalPages;
    renderPagination( Pagination);  

     // 兼容res.data, res.obj等
    var list =  pageData.rows;  //  res?.list || res?.data || res?.obj || res || [];
    // 渲染表
    let html = '<table class="data-table" style="width:100%;border-collapse:collapse;text-align:left;">';
    html += '<thead><tr>';
    console.log("list:",list);

    var index=(Pagination.pageNum-1)*Pagination.pageSize;//记录序号let index = 0;

    html += '<th style="border-bottom:1px solid #eee;padding:6px 8px;">序号</th>';
    columns.forEach(col=> html += `<th style="border-bottom:1px solid #eee;padding:6px 8px;">${col.label}</th>`);
    html += '<th style="border-bottom:1px solid #eee;padding:6px 8px;">操作</th></tr></thead><tbody>';
    if(list.length===0) {
      html += '<tr><td colspan="${columns.length+1}" style="padding:24px;text-align:center;">暂无数据</td></tr>';
    } else {
      list.forEach(item=>{
        if(item.hasOwnProperty('scheduleId')) {
// 深度调试：排查 courseName 存在但 Object.keys 不显示的原因
console.log('--- 调试 index:', index, '---');
console.log('item 完整对象:', item);
console.log('Object.keys(item):', Object.keys(item));
console.log('item.hasOwnProperty("courseName"):', item.hasOwnProperty('courseName'));
console.log('item.courseName 直接访问:', item.courseName);
console.log('Object.getOwnPropertyNames(item):', Object.getOwnPropertyNames(item));
// 检查属性描述符，排查是否为 getter/setter 或不可枚举属性
try {
  const desc = Object.getOwnPropertyDescriptor(item, 'courseName');
  console.log('courseName 属性描述符:', desc);
} catch(e) {
  console.log('获取 courseName 描述符失败:', e);
}
// 遍历原型链查找 courseName
let proto = Object.getPrototypeOf(item);
while (proto) {
  if (proto.hasOwnProperty('courseName')) {
    console.log('courseName 存在于原型上:', proto.constructor.name);
    console.log('原型上的 courseName 值:', proto.courseName);
  }
  proto = Object.getPrototypeOf(proto);
}
// 使用 for...in 检查可枚举属性
const enumerableKeys = [];
for (let k in item) {
  enumerableKeys.push(k);
}
console.log('for...in 可枚举属性列表:', enumerableKeys);
// 比较 JSON 序列化与对象自身属性的差异
console.log('JSON.stringify(item):', JSON.stringify(item));
console.log('Object.entries(item):', Object.entries(item));
        }
        index ++ ;
        html += '<tr>';
        html += `<td>${index}</td>`;
     //   console.log('item所有键:', Object.keys(item), '| item完整数据:', JSON.stringify(item));
        
        columns.forEach(col=>{ 
            if(item.hasOwnProperty('scheduleId')) {
           console.log(index, col.key, item[col.key]);
            }
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
 
  