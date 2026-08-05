  /* js for overall  admin-dataMaintainpage.js 课程管理 CRUD
  */ 
 
 // 引入分页组件js
 document.write('<script src="/js/public/pagefoot.js"></script>');
 /*
  创建1个页面，内部包含对模板、课程、排期、预定、预约等数据表的检索条和显示表格。
  每个数据表都具有检索条，以表格方式分页显示。
  每个数据条目显示主要字段和"删除"操作按钮和“更新下一级”按钮。
  提供函数renderDatamaintainCards()显示基本页面框架。 
*/

// INSERT_YOUR_CODE

/**
 * 数据维护页面主入口
 * 渲染模板、课程、排期、预定、预约的数据维护 tabs
 */
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
      <div id="maintain-content"></div>
    </div>
    <script>
      // Tab 切换高亮 & 内容渲染
      function selectMaintainTab(tab) {
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
            api: "/course/template/list",
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
            api: "/course/list",
            columns: [
              {key: "courseId", label: "ID"},
              {key: "name", label: "课程名"},
              {key: "languageType", label: "语言"},
              {key: "difficultyLevel", label: "难度"},
              {key: "status", label: "状态"}
            ],
            delFunc: "deleteCourse"
          },
          schedule: {
            title: "排期列表",
            api: "/course/schedule/list",
            columns: [
              {key: "scheduleId", label: "ID"},
              {key: "courseName", label: "课程"},
              {key: "startDate", label: "开始日期"},
              {key: "startTime", label: "上课时间"},
              {key: "timeZone", label: "时区"},
              {key: "status", label: "状态"}
            ],
            delFunc: "deleteSchedule"
          },
          booking: {
            title: "预定列表",
            api: "/booking/list",
            columns: [
              {key: "bookingId", label: "ID"},
              {key: "studentName", label: "学生"},
              {key: "courseName", label: "课程"},
              {key: "teacherName", label: "教师"},
              {key: "bookingStatus", label: "状态"}
            ],
            delFunc: "deleteBooking"
          },
          appointment: {
            title: "预约列表",
            api: "/appointment/list",
            columns: [
              {key: "appointmentId", label: "ID"},
              {key: "studentName", label: "学生"},
              {key: "courseName", label: "课程"},
              {key: "appointmentDate", label: "预约日期"},
              {key: "status", label: "状态"}
            ],
            delFunc: "deleteAppointment"
          }
        };

        // 选择table配置
        var cfg = tableConfigs[type];
        if(!cfg) { maintainContent.innerHTML='未配置表格'; return;}

        // 渲染查询条(只简单支持名称搜索)
        var filterHtml = `
          <div style="margin-bottom:12px;">
            <input id="maintain-filter-keyword" type="text" placeholder="输入名称关键词" style="padding: 4px 8px;"/>
            <button class="btn btn-sm" onclick="loadMaintainTableData('${type}')"><i class="fa fa-search"></i> 查询</button>
          </div>
        `;
        // 占位表格
        maintainContent.innerHTML = `
          <div style="margin-bottom:8px;"><strong>${cfg.title}</strong></div>
          ${filterHtml}
          <div id="maintain-table-box"></div>
        `;
        // 请求并渲染表格
        loadMaintainTableData(type);
      }

      // 动态加载数据并渲染表格
      window.loadMaintainTableData = async function(type){
        var cfg = {
          template: {
            api: "/course/template/list",
            delFunc: "deleteTemplate"
          },
          course: {
            api: "/course/list",
            delFunc: "deleteCourse"
          },
          schedule: {
            api: "/course/schedule/list",
            delFunc: "deleteSchedule"
          },
          booking: {
            api: "/booking/list",
            delFunc: "deleteBooking"
          },
          appointment: {
            api: "/appointment/list",
            delFunc: "deleteAppointment"
          }
        }[type];
        // 配置columns
        var columns = {
          template: [
            {key: "templateId", label: "ID"},
            {key: "name", label: "名称"},
            {key: "languageType", label: "语言类型"},
            {key: "difficultyLevel", label: "难度等级"},
            {key: "status", label: "状态"}
          ],
          course: [
            {key: "courseId", label: "ID"},
            {key: "name", label: "课程名"},
            {key: "languageType", label: "语言"},
            {key: "difficultyLevel", label: "难度"},
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
        try{
          // 请求数据
          let res = await request({
            url: API_BASE_URL + cfg.api,
            method: "GET",
            params: param
          });
          // 兼容res.data, res.obj等
          var list = res?.list || res?.data || res?.obj || res || [];
          // 渲染表
          let html = '<table class="data-table" style="width:100%;border-collapse:collapse;text-align:left;">';
          html += '<thead><tr>';
          columns.forEach(col=> html += `<th style="border-bottom:1px solid #eee;padding:6px 8px;">${col.label}</th>`);
          html += '<th style="border-bottom:1px solid #eee;padding:6px 8px;">操作</th></tr></thead><tbody>';
          if(list.length===0) {
            html += `<tr><td colspan="${columns.length+1}" style="padding:24px;text-align:center;">暂无数据</td></tr>`;
          } else {
            list.forEach(item=>{
              html += '<tr>';
              columns.forEach(col=>{
                html += `<td style="border-bottom:1px solid #f5f5f5;padding:6px 8px;">${item[col.key]??''}</td>`;
              });
              html += `<td>
                <button class="btn btn-danger btn-sm" onclick="${cfg.delFunc} && window.${cfg.delFunc} && window.${cfg.delFunc}('${item[columns[0].key]}')"><i class="fa fa-trash"></i> 删除</button>
                <button class="btn btn-default btn-sm" onclick="maintainUpdateLower('${type}', '${item[columns[0].key]}')"><i class="fa fa-angle-double-down"></i> 更新下一级</button>
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

      // “更新下一级”按钮逻辑占位
      window.maintainUpdateLower = function(type, id) {
        alert('功能占位：' + type + ' - ' + id + ' “更新下一级”');
      };

      // 初始自动选中模板Tab
      setTimeout(function(){
        selectMaintainTab('template');
      }, 0);
    </script>
  `;
}


/**
 * 渲染课程列表（核心：原生JS操作DOM）
 */
   function renderDatamaintainCards() {  
    assignLoadobjectListFunction( loadAndRenderCourseListByPage);// assign
    const dynamicContentCenter = document.getElementById('dynamic-content-center'); 
    if (!dynamicContentCenter) return; 

       if(dynamicContentCenter) {
        dynamicContentCenter.innerHTML =  dataMaintainPage();  
       // loadAndRenderCourseListByPage();
     }
  // 页面渲染完成后，加载第一页数据
     
   }
 // 搜索按钮：重置为第1页再查询
function localsearchCourse() {
  Pagination.pageNum = 1;
  loadAndRenderCourseListByPage();
}

// 重置筛选条件
function resetCourseFilter() {
  document.getElementById('course-name-input').value = '';
  document.getElementById('language-select').value = '';
  document.getElementById('course-status-select').value = '';
  document.getElementById('difficulty-level-select').value = '';
  Pagination.pageNum = 1;
  loadAndRenderCourseListByPage();
}
 
  