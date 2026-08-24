 //排期管理--页面 admin-schedule.js
 console.log("admin schedule page");
 document.write('<script src="/js/public/pagefoot.js"></script>');  

 //   let courseList = [];
    let currentScheduleId= "";
    let teacherId = "";
    let currentCourseIndex =-1,currentScheduleIndex=-1;
    let  conflictMessageElem =null;//conflictMessage
    let  resultBodyElem =null,resultCalendarElem=null;// id= resultBody,Id="calendar";
var localParamter ={ 
  currentPage:1,         // 当前页码（初始值由Thymeleaf渲染）
  pageSize : 10,           // 页大小
  total : 0 ,              // 总条数
  ScheduleDialogVisible: false, // 弹窗状态
  dialogTitle : '新增课程', // 弹窗标题
  currentId: '', // 当前操作的课程ID
  formEl :'', 
};
// ===================== 核心函数 ===================== 
/**
 * 渲染课程列表（核心：原生JS操作DOM）
 */
async function renderScheduleCards() {
    assignLoadobjectListFunction( loadAndRenderCourses);//
    const dynamicContentCenter = document.getElementById('dynamic-content-center');
   // console.log("renderScheduleCards:",dynamicContentCenter);
    if (!dynamicContentCenter) return; 
    // 显示加载中
   // dynamicContentCenter.innerHTML = '<div style="padding:40px 0;text-align:center;">加载中...</div>';  
    // 渲染HTML
    let html = '';
      html += `
<style>
  .dynamic-content-center { max-width: none; }
  /* 注意：三张卡片都用 .sched-card 类；CSS 选择器不再依赖父级 .sched-page，
     确保"课程检索 / 排期结果 / 日历视图"三张卡片完全使用同一套布局规则。 */
  .sched-page .sched-card,
  .sched-card {
    margin-left: 0 !important;        /* 覆盖 admin.css .card 默认的 margin-left:20px（会让部分卡片显得更窄） */
    margin-bottom: 24px;
    border-radius: 8px;
    padding: 24px 28px;
    box-shadow: 0 2px 8px rgba(0,0,0,.08);
    background: #fff;
    /* width:100% + box-sizing，确保 3 张卡片都严格撑满 dynamic-content-center 可见宽度 */
    width: 100%;
    box-sizing: border-box;
  }
  .sched-page .sched-card-title,
  .sched-card .sched-card-title {
    font-size: 16px;
    font-weight: 600;
    color: #333;
    padding: 0 0 16px 0;
    margin-bottom: 20px;
    border-bottom: 1px solid #f0f0f0;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .sched-page .sched-filter-form {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 20px;
    margin-bottom: 20px;
    padding: 16px 20px;
    background: #fafafa;
    border-radius: 6px;
    width: 100%;
    box-sizing: border-box;
  }
  .sched-page .sched-filter-form > div { display: flex; align-items: center; gap: 8px; }
  .sched-page .sched-filter-form label { font-size: 14px; color: #555; font-weight: 500; }
  .sched-page .sched-filter-form input,
  .sched-page .sched-filter-form select {
    padding: 8px 12px;
    height: 36px;
    border: 1px solid #d9d9d9;
    border-radius: 4px;
    font-size: 14px;
    min-width: 140px;
    box-sizing: border-box;
  }
  .sched-page .sched-filter-form input:focus,
  .sched-page .sched-filter-form select:focus { outline: none; border-color: #722ed1; }
  .sched-page .sched-section {
    margin: 28px 0 8px 0;
  }
  .sched-page .sched-section-title {
    font-size: 15px;
    font-weight: 600;
    color: #722ed1;
    margin: 0 0 18px 0;
    padding-left: 10px;
    border-left: 3px solid #722ed1;
  }
  .sched-page .sched-form-line {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 18px;
    flex-wrap: wrap;
  }
  .sched-page .sched-form-line label {
    width: 110px;
    flex-shrink: 0;
    text-align: right;
    font-size: 14px;
    color: #333;
    font-weight: 500;
  }
  .sched-page .sched-form-line input,
  .sched-page .sched-form-line select {
    padding: 8px 12px;
    height: 36px;
    border: 1px solid #d9d9d9;
    border-radius: 4px;
    font-size: 14px;
    box-sizing: border-box;
    min-width: 160px;
  }
  .sched-page .sched-form-line input[type="date"] { min-width: 160px; }
  .sched-page .sched-form-line input[type="time"] { min-width: 140px; }
  .sched-page .sched-form-line input[type="number"] { min-width: 100px; }
  .sched-page .sched-form-line input:focus,
  .sched-page .sched-form-line select:focus { outline: none; border-color: #722ed1; }
  .sched-page .sched-form-line input[readonly] { background: #fafafa; color: #666; }
  .sched-page .sched-btn-row {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin: 28px 0 12px 0;
    padding: 16px 20px;
    background: #fafafa;
    border-radius: 6px;
    width: 100%;
    box-sizing: border-box;
  }
  .sched-page .sched-btn-row .btn {
    padding: 9px 22px;
    height: 38px;
    border-radius: 4px;
    font-size: 14px;
  }
  .sched-page .sched-weekdays { display: flex; flex-wrap: wrap; gap: 10px; }
  .sched-page .sched-weekdays label {
    width: auto;
    text-align: left;
    font-weight: normal;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-size: 13px;
    padding: 0 2px;
  }
  .sched-page .sched-weekdays input[type="checkbox"] {
    width: 13px;
    height: 13px;
    min-width: 0;
    margin: 0;
    padding: 0;
    cursor: pointer;
  }
  /* 重复日期（每月1-31）：紧凑显示，靠 flex-wrap 自然排列 */
  .sched-page .sched-monthdays { display: flex; flex-wrap: wrap; gap: 4px 10px; max-width: 860px; }
  .sched-page .sched-monthdays label {
    width: auto;
    text-align: left;
    font-weight: normal;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-size: 13px;
    padding: 0 2px;
  }
  .sched-page .sched-monthdays input[type="checkbox"] {
    width: 13px;
    height: 13px;
    min-width: 0;
    margin: 0;
    padding: 0;
    cursor: pointer;
  }
  /* 选择排期行内的操作按钮（新建/预览/检查冲突/删除/刷新）：紧凑尺寸 */
  .sched-page .sched-form-line .btn {
    height: 34px;
    padding: 5px 12px;
    font-size: 13px;
  }
  /* 排期结果/日历视图：强制 card-body 不做额外左右 padding 缩进（避免比课程检索更窄） */
  .sched-card .card-body {
    padding: 0 !important;
    margin: 0;
    width: 100%;
    box-sizing: border-box;
  }
  .sched-page .sched-table,
  .sched-card  .sched-table {
    width: 100%;
    border-collapse: collapse;
    box-sizing: border-box;
  }
  .sched-page .sched-table th,
  .sched-page .sched-table td,
  .sched-card  .sched-table th,
  .sched-card  .sched-table td { padding: 12px 14px; font-size: 14px; }
  .sched-page .sched-pagination-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0;
    margin: 0;
    width: 100%;
    box-sizing: border-box;
  }
  .sched-page .pagination-bar {
    border-top: none !important;
    padding: 0 !important;
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    box-sizing: border-box;
  }
</style>
<div class="sched-page">
       <div class="card sched-card">
        <div class="card-title sched-card-title"><i class="fa fa-search"></i> <span data-term="course">课程</span>检索</div>
            <!-- 1. 筛选条件（横向排列） -->
            <div class="sched-filter-form">
                 <div>
                    <label><span data-term="course">课程</span>名称：</label>
                    <input type="text" id="course-name-input"  placeholder="课程名称" >
                </div>
                <div>
                    <label><span data-term="classType">语言类型</span>：</label>
                    <select id="languageType-select" >
                        <option value="">全部</option>
                        <option value="french"><span data-term="classType1">法语</span></option>
                        <option value="english"><span data-term="classType2">英语</span></option>
                        <option value="chinese"><span data-term="classType3">汉语</span></option>
                        <option value="spanish"><span data-term="classType4">西语</span></option>
                    </select>
                </div>
                <div>
                    <label>难度等级：</label>
                    <select id="difficultyLevel-select">
                        <option value="">全部</option>
                        <option value="B1"><span data-term="classLevelB1">B1入门</span></option>
                        <option value="B2"><span data-term="classLevelB2">B2初级</span></option>
                        <option value="B3"><span data-term="classLevelB3">B3中级</span></option>
                        <option value="B4"><span data-term="classLevelB4">B4高级</span></option>
                    </select>
                </div>
                 <div class="filter-item" style="display:none">
                <label>状态：</label>
                <select id="course-status-select">
                    <option value="">全部</option>
                    <option value="active">有效</option>
                    <option value="pending">挂起</option>
                </select>
                </div>
                 <button class="btn btn-primary" onclick="localsearchCourse()">
                    <i class="fa fa-search"></i> 搜索
                    </button>
                <button class="btn btn-default" onclick="resetCourseFilter()">
                <i class="fa fa-redo"></i> 重置
                </button>
            </div>
            <!-- 分隔线 -->
            <div style="border-top:1px solid #f0f0f0;margin:0 0 16px 0;"></div>
            <!-- 2. 课程列表（横向排列） -->
            <div class="sched-form-line" style="margin-bottom:16px;">
                <label>选择<span data-term="course">课程</span>：</label>
                <select id="courseSelect" onchange="loadSchedule()">
                    <option value="">请先选择<span data-term="course">课程</span></option>
                </select>
                <label><span data-term="teacher">教师</span>姓名：</label>
                <div id="teacherName" style="padding:0 8px;font-weight:500;color:#722ed1;"></div>
                <label><span data-term="classForm">班级</span>形式：</label>
                <select id="classForm" readonly>
                    <option value="">请选择</option>
                    <option value="1p1"><span data-term="classForm1p1">一对一</span></option>
                    <option value="1pN"><span data-term="classForm1pN">小班课</span></option>
                    <option value="1p2N"><span data-term="classForm1p2N">大班课</span></option>
                </select>
            </div>
            <!-- 分隔线 -->
            <div style="border-top:1px solid #f0f0f0;margin:0 0 12px 0;"></div>
            <!-- 3. 分页栏（横向排列） -->
            `
             html += `<div class="sched-pagination-bar">` + getPagebar() + `</div>`;
             html += `<hr> <!-- 课程检索卡片结束 -->`;
                        
            html += `
    <!-- 排期选择下拉 -->
    <div class="sched-form-line">
        <label>选择排期：</label>
        <select id="scheduleSelect" onchange="displySchedule()">
            <option value="">请选择排期</option>
        </select>
        <button class="btn btn-default" onclick="resetSchedule()"><i class="fa fa-plus"></i> 新建</button>
       
        <button class="btn btn-default" onclick="checkSchedule()"><i class="fa fa-exclamation-triangle"></i> 检查冲突</button>
        <button class="btn btn-danger" onclick="deleteScheduleByFrozen()"><i class="fa fa-trash"></i> 删除</button>
        <button class="btn btn-success" onclick="refreshData()"><i class="fa fa-sync-alt"></i> 刷新</button>
        <!-- 用户时间预览开关：置于"刷新"右侧，右对齐 -->
        <label for="toggleUserTimeZone" style="margin-left:auto;width:auto;text-align:left;display:inline-flex;align-items:center;gap:8px;white-space:nowrap;cursor:pointer;font-weight:500;">
            <input type="checkbox" id="toggleUserTimeZone" style="width:auto;min-width:0;height:auto;padding:0;margin:0;cursor:pointer;" onchange="document.getElementById('userTimeZoneRow').style.display=this.checked?'':'none';document.getElementById('testTimeZoneForm').style.display=this.checked?'':'none';getTestDatetime();getTestEndDatetime();">
            用户时间预览
        </label>
    </div>
    
    <div class="sched-section">
        <div class="sched-section-title">排期设置</div>
        <div class="sched-form-line" style="display:none;">
            <label>Id</label>
            <input type="text" id="scheduleId">
        </div>
        <div class="sched-form-line" style="display:none;">
            <label>cId</label>
            <input type="text" id="courseId">
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 24px;">
            <div class="sched-form-line">
                <label>排期名称：</label>
                <input type="text" id="scheduleName">
            </div>
            <div class="sched-form-line">
                <label>总席位数：</label>
                <input type="number" id="availableSites" value="1" min="1">
            </div>
            <div class="sched-form-line">
                <label>可用席位数：</label>
                <input type="number" id="now_availableSites" value="1" min="1" readonly>
            </div>
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 40px;">
           <!-- 左侧：当前逻辑 -->
           <div style="flex: 1; min-width: 400px;">
             <div class="sched-form-line">
                <label>排期时区：</label>
                <input type="text" id="timeZone" value="${userTimeZone}" readonly>
             </div>
             <div class="sched-form-line">
                  <label>开始日期：</label>
                  <input type="date" id="startDate" value="${(new Date()).toISOString().split('T')[0]}">
                  <input type="text" id="startDate_weekday" readonly style="width:52px;min-width:52px;text-align:center;padding:8px 2px;">
             </div>
              <div class="sched-form-line">
                  <label><span data-term="lessonTime">上课时间</span>：</label>
                  <input type="time" id="startTime" value="${(function(){ let d = new Date(); return d.toTimeString().slice(0,5); })()}">
              </div>
               <div class="sched-form-line">
                <label>结束日期：</label>
                <input type="date" id="endDate" value="">
                <input type="text" id="endDate_weekday" readonly style="width:52px;min-width:52px;text-align:center;padding:8px 2px;">
            </div>
           </div>
           <!-- 右侧：用户时间预览列，与左列逐行对齐 -->
           <div style="flex: 1; min-width: 400px;">
                <!-- 第1行：用户时区（与左侧"排期时区"行对齐，开关在上方"刷新"右侧） -->
                <div class="sched-form-line" id="userTimeZoneRow" style="display:none;">
                    <label>用户时区：</label>
                    <select id="testTimeZone">
                        <option value="Europe/London">伦敦 (Europe/London)</option>
                        <option value="Europe/Paris">巴黎 (Europe/Paris)</option>
                        <option value="Europe/Berlin">柏林 (Europe/Berlin)</option>
                        <option value="Europe/Moscow">莫斯科 (Europe/Moscow)</option>
                        <option value="Asia/Shanghai">上海 (Asia/Shanghai)</option>
                        <option value="Asia/Tokyo">东京 (Asia/Tokyo)</option>
                        <option value="Asia/Singapore">新加坡 (Asia/Singapore)</option>
                        <option value="Asia/Hong_Kong">香港 (Asia/Hong_Kong)</option>
                        <option value="America/New_York">纽约 (America/New_York)</option>
                        <option value="America/Chicago">芝加哥 (America/Chicago)</option>
                        <option value="America/Los_Angeles">洛杉矶 (America/Los_Angeles)</option>
                        <option value="America/Vancouver">温哥华 (America/Vancouver)</option>
                        <option value="America/Edmonton">卡尔加里 (America/Edmonton)</option>
                    </select>
                </div>
                <!-- 第2~4行：日期/时间/结束日期（与左侧"开始日期/上课时间/结束日期"逐行对齐） -->
                <div id="testTimeZoneForm" style="display:none;">
                    <div class="sched-form-line">
                        <label>开始日期：</label>
                        <input type="date" id="displayStartDate" readonly>
                        <input type="text" id="displayStartDate_weekday" readonly style="width:52px;min-width:52px;text-align:center;padding:8px 2px;">
                    </div>
                    <div class="sched-form-line">
                        <label><span data-term="lessonTime">上课时间</span>：</label>
                        <input type="time" id="displayStartTime" readonly>
                    </div>
                    <div class="sched-form-line">
                        <label>结束日期：</label>
                        <input type="date" id="displayEndDate" readonly>
                        <input type="text" id="displayEndDate_weekday" readonly style="width:52px;min-width:52px;text-align:center;padding:8px 2px;">
                    </div>
                </div>
           </div>
         </div>

        <div class="sched-form-line">
            <label>重复类型：</label>
            <select id="repeatType" onchange="onRepeatTypeChange()">
                <option value="none">不重复</option>
                <option value="day">每天</option>
                <option value="week">每周</option>
                <option value="month">每月</option>
            </select>
        </div>

        <div class="sched-form-line" id="intervalBox">
            <label>重复周期：</label>
            <input type="number" id="interval" value="1" min="1">
            <span id="repeatUnit" style="color:#555;">天</span>
        </div>

        <!-- 每周重复：星期选择 -->
        <div class="sched-form-line" id="weekDaysBox" style="display:none;">
            <label>重复星期：</label>
            <div id="weekDays" class="sched-weekdays">
                <label><input type="checkbox" value="1">周一</label>
                <label><input type="checkbox" value="2">周二</label>
                <label><input type="checkbox" value="3">周三</label>
                <label><input type="checkbox" value="4">周四</label>
                <label><input type="checkbox" value="5">周五</label>
                <label><input type="checkbox" value="6">周六</label>
                <label><input type="checkbox" value="7">周日</label>
            </div>
        </div>

        <!-- 每月重复： -->
        <div class="sched-form-line" id="monthDaysBox" style="display:none;">
            <label>重复日期：</label>
            <div id="monthDays" class="sched-monthdays">
            </div>
        </div>
       <div class="sched-form-line">
            <label>状态：</label>
           <select id="status">
                <option value="pending">待发布</option>
                <option value="inactive">已收回</option>
                <option value="active">已发布</option>
                <option value="frozen">已删除</option>
            </select>
            <div id="conflictMessage" style="color:#f5222d;"></div>
        </div>
    </div>

    <!-- 操作按钮 -->
    <div class="sched-btn-row">
      <button class="btn btn-default" onclick="previewSchedule()"><i class="fa fa-eye"></i> 预览排期</button>
       <button class="btn btn-primary" onclick="saveScheduleToDB()"><i class="fa fa-save"></i> 保存</button>
       <button class="btn btn-primary" onclick="assignStudentToSchedule()"><i class="fa fa-user-plus"></i> 指定<span data-term="student">学生</span></button>
       <select id="assignStudentSelect">
           <option value="">请选择<span data-term="student">学生</span></option>
       </select>
    </div>
     </div> <!-- 课程检索 / 排期设置 card -->

    <!-- 排期结果（与课程检索同属 .sched-page，确保完全相同的宽度 & 对齐规则） -->
    <div class="card sched-card">
        <div class="card-title sched-card-title"><i class="fa fa-list-alt"></i> 排期结果（本地时间）</div>
        <!-- 移除内联 style="padding:8px 28px 20px"：改由 CSS .sched-card > .card-body 统一管控，避免与外层 padding 叠加导致内容更窄 -->
        <div class="card-body">
        <table class="sched-table">
            <thead>
                <tr>
                    <th>课次</th>
                    <th>日期</th>
                    <th>时间</th>
                </tr>
            </thead>
            <tbody id="resultBody"></tbody>
        </table>
        </div>
    </div>

    <div class="card sched-card">
        <div class="card-title sched-card-title"><i class="fa fa-calendar-alt"></i> 日历视图</div>
        <div class="card-body">
        <div id="calendar" class="calendar"></div>
        </div>
    </div>
</div><!-- sched-page 结束：所有 3 张卡片都在同一父容器内 -->`;
        
    dynamicContentCenter.innerHTML = html;
    applyTerms(dynamicContentCenter);
        
        // 动态生成每月1-31号复选框，紧凑排列（flex-wrap 自然换行，不再强制每10个换行）
        let monthDaysHtml = '';
        for (let i = 1; i <= 31; i++) {
            monthDaysHtml += `<label><input type="checkbox" value="${i}">${i}</label>`;
              if (i % 10 === 0 && i !== 31) monthDaysHtml += '<br>';
        }
        document.getElementById('monthDays').innerHTML = monthDaysHtml;

        // 初始同步重复区域显示状态（默认"不重复"时隐藏重复周期）
        onRepeatTypeChange();
         
        // 设置默认结束日期为今天+30天       
          const endDateInput = document.getElementById("endDate");
          if (endDateInput) {
            const today = new Date();
            today.setDate(today.getDate() + 30);
            const year = today.getFullYear();
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const day = String(today.getDate()).padStart(2, '0');
            endDateInput.value = `${year}-${month}-${day}`;
          } ;
      
     
    // 关联 testTimeZone 下拉菜单与 handleTestTimeZoneChange 处理
     handleTestTimeZoneChange(); 
     loadAndRenderCourses();  //display 
    //添加学生列表 ---
    addStudentList();  
   
  window.loadSchedule = loadSchedule;
  window.previewSchedule = previewSchedule;
  window.onRepeatTypeChange = onRepeatTypeChange;
  window.renderCalendar = renderCalendar ;
  window.saveScheduleToDB = saveScheduleToDB ;
  window.displySchedule = displySchedule ;
  window.deleteScheduleByFrozen = deleteScheduleByFrozen ;

  window.resetSchedule = resetSchedule ;   
  window.refreshData = refreshData ;
  window.checkSchedule = checkSchedule ;
  window.getTestDatetime = getTestDatetime ;   
  window.getTestEndDatetime = getTestEndDatetime ;

  window.assignStudentToTheSchedule = assignStudentToTheSchedule;

  conflictMessageElem = document.getElementById('conflictMessage'); 
  resultBodyElem =document.getElementById('resultBody'); 
  resultCalendarElem=document.getElementById('calendar');;// id= resultBody,Id="calendar";
    console.log("schedule page END");
  } //renderScheduleCards

  
// 筛选与操作联动
// 搜索按钮：重置为第1页再查询
function localsearchCourse() {
    Pagination.pageNum = 1;
    loadAndRenderCourses();
  }

  
  // 重置筛选条件
  function resetCourseFilter() {
    document.getElementById('course-name-input').value = '';//TBD
    document.getElementById('languageType-select').value = '';
    document.getElementById('course-status-select').value = '';
    document.getElementById('difficultyLevel-select').value = '';
    Pagination.pageNum = 1;
    loadAndRenderCourses();
  }
  
    //选择学生，添加到学生列表
       async function addStudentList() {
        //判断是否有空位，没有则提示用户
        const availableSites = document.getElementById('now_availableSites').value;
        if(availableSites <= 0){
            alert("当前班级已无空位，无法指定学生");
            return ;
        }
        const conditionJson = { role: 'student' };//TBD:当前admin所属的群组等过滤条件
        const students = await fetchUserList(conditionJson);
        if(students){ 
         if (Array.isArray(students)) {
            const select = document.getElementById('assignStudentSelect');
            if (select) {
                select.innerHTML = ""; // 清空原有选项
                students.forEach(student => {
                    // student.name 及 student.userId 假设后端数据结构如此命名（如需改名字请调整）
                    const option = document.createElement('option');
                    option.value = student.userId || '';
                    option.text = student.name || '';
                    select.appendChild(option);
                });
            }
        }
        }
        return ;
       }

          /*
        * assignStudentToTheSchedule: 指定学生studentId预约排期scdid，并生成对应的appointment数据，保障原子性。
        * 由于JS前端不具备数据库事务能力，此处通过调用后端API完成实际的事务创建。
        * 若失败则友好提示。
        */    
 
/* ========== 防重复 addEventListener：仅首次注册；后续调用直接跳过 ========== */
window.__adminSchedule_tzListenersAttached = window.__adminSchedule_tzListenersAttached || false;

// 处理下拉菜单"testTimeZone"的变更，读取表单的timeZone、startDate、startTime及新选择的时区，调用后端获取转换后的时间和日期
function handleTestTimeZoneChange() {
    if (window.__adminSchedule_tzListenersAttached) return; // 幂等：已注册直接返回
    window.__adminSchedule_tzListenersAttached = true;

    const attachOnce = function (id, handler) {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', handler);
    };

    attachOnce('toggleUserTimeZone', function () { getTestDatetime(); getTestEndDatetime(); }); // 勾选/取消开关本身也要立即刷新
    attachOnce('testTimeZone',       function () { getTestDatetime(); getTestEndDatetime(); });
    attachOnce('timeZone',           function () { getTestDatetime(); getTestEndDatetime(); }); // 原时区变化也要重算
    attachOnce('startDate',          function () { getTestDatetime(); });
    attachOnce('startTime',          function () { getTestDatetime(); });
    attachOnce('endDate',            function () { getTestEndDatetime(); });
}

/* ========== 异步竞态防护：getTestDatetime / getTestEndDatetime 各自维护 reqId 计数器 ========== */
window.__adminSchedule_tzReqSeq = window.__adminSchedule_tzReqSeq || { start: 0, end: 0 };

// 安全写值：DOM 元素不存在 / 只读报错时都不会打断流程
function safeSetInputValue(id, value) {
    try { const el = document.getElementById(id); if (el) el.value = value == null ? '' : value; } catch (_) {}
}

// 按照左侧 的时间和日期，同步修改右侧指定时区的显示
async function getTestDatetime() {
    const toggle = document.getElementById('toggleUserTimeZone');
    const startDateInput = document.getElementById('startDate');
    const startTimeInput = document.getElementById('startTime');
    const displayTzInput = document.getElementById('testTimeZone');
    const timeZoneInput = document.getElementById('timeZone');
    if (!displayTzInput || !startDateInput || !startTimeInput) return;

    const startDate = startDateInput.value || "";
    const startTime = startTimeInput.value || "";
    const fromZone  = (timeZoneInput && timeZoneInput.value) ? timeZoneInput.value : ((window.formData && window.formData.timeZone) || "");
    const toTz      = displayTzInput.value || "";

    const dateTimeStr = (startDate && startTime)
        ? `${startDate} ${startTime.length === 5 ? startTime + ":00" : startTime}`
        : "";

    // 先同步写本地时区对应的 weekday（无论是否开启切换预览）
    safeSetInputValue('startDate_weekday', dateTimeStr ? getWeekdayFromDateTime(dateTimeStr) : "");

    // 未勾选开关时：清空用户时区显示区（避免残留旧值）
    if (!toggle || !toggle.checked) {
        safeSetInputValue('displayStartDate', "");
        safeSetInputValue('displayStartTime', "");
        safeSetInputValue('displayStartDate_weekday', "");
        return;
    }
    if (!dateTimeStr || !fromZone || !toTz) {
        safeSetInputValue('displayStartDate', "");
        safeSetInputValue('displayStartTime', "");
        safeSetInputValue('displayStartDate_weekday', "");
        return;
    }

    const myReqId = ++window.__adminSchedule_tzReqSeq.start;
    try {
        const newTzDateTime = await tzSwitchTo(fromZone, dateTimeStr, toTz);
        // 防竞态：后续已经有新请求发起，则丢弃本次写入
        if (myReqId !== window.__adminSchedule_tzReqSeq.start) return;

        const newDateTime = (newTzDateTime && newTzDateTime.dateTime) ? newTzDateTime.dateTime : "";
        if (typeof newDateTime === "string" && newDateTime.trim() !== "" && newDateTime.includes(" ")) {
            const [newDate, newTime] = newDateTime.split(" ");
            safeSetInputValue('displayStartDate', newDate);
            safeSetInputValue('displayStartTime', newTime);
            safeSetInputValue('displayStartDate_weekday', newDate ? getWeekdayFromDateTime(newDate) : "");
        } else {
            safeSetInputValue('displayStartDate', "");
            safeSetInputValue('displayStartTime', "");
            safeSetInputValue('displayStartDate_weekday', "");
        }
    } catch (err) {
        if (myReqId === window.__adminSchedule_tzReqSeq.start) {
            console.error("[getTestDatetime] tzSwitchTo 失败:", err);
        }
    }
}

async function getTestEndDatetime() {
    const toggle = document.getElementById('toggleUserTimeZone');
    const endDateInput = document.getElementById('endDate');
    const startTimeInput = document.getElementById('startTime');
    const displayTzInput = document.getElementById('testTimeZone');
    const timeZoneInput = document.getElementById('timeZone');
    if (!displayTzInput || !endDateInput || !startTimeInput) return;

    const endDate   = endDateInput.value || "";
    const startTime = startTimeInput.value || "";
    const fromZone  = (timeZoneInput && timeZoneInput.value) ? timeZoneInput.value : "";
    const toTz      = displayTzInput.value || "";

    const dateTimeStr = (endDate && startTime)
        ? `${endDate} ${startTime.length === 5 ? startTime + ":00" : startTime}`
        : "";

    safeSetInputValue('endDate_weekday', dateTimeStr ? getWeekdayFromDateTime(dateTimeStr) : "");

    if (!toggle || !toggle.checked) {
        safeSetInputValue('displayEndDate', "");
        safeSetInputValue('displayEndDate_weekday', "");
        return;
    }
    if (!dateTimeStr || !fromZone || !toTz) {
        safeSetInputValue('displayEndDate', "");
        safeSetInputValue('displayEndDate_weekday', "");
        return;
    }

    const myReqId = ++window.__adminSchedule_tzReqSeq.end;
    try {
        const res = await tzSwitchTo(fromZone, dateTimeStr, toTz);
        if (myReqId !== window.__adminSchedule_tzReqSeq.end) return;

        const newDateTime = (res && res.dateTime) ? res.dateTime : "";
        if (typeof newDateTime === "string" && newDateTime.trim() !== "" && newDateTime.includes(" ")) {
            const [newDate] = newDateTime.split(" ");
            safeSetInputValue('displayEndDate', newDate);
            safeSetInputValue('displayEndDate_weekday', newDate ? getWeekdayFromDateTime(newDate) : "");
        } else {
            safeSetInputValue('displayEndDate', "");
            safeSetInputValue('displayEndDate_weekday', "");
        }
    } catch (err) {
        if (myReqId === window.__adminSchedule_tzReqSeq.end) {
            console.error("[getTestEndDatetime] tzSwitchTo 失败:", err);
        }
    }
} 

 // 1. 加载、显示课程列表
   async function loadAndRenderCourses() { 
            
        // 拼接请求参数
        const params = new URLSearchParams({
            pageNum: Pagination.pageNum,
            pageSize: Pagination.pageSize,
            courseName: document.getElementById('course-name-input').value.trim(),
            languageType: document.getElementById('languageType-select').value,
            difficultyLevel: document.getElementById('difficultyLevel-select').value,
            //teacherId：
            status: document.getElementById('course-status-select').value
        });
   
    try {         
        const result = await request({url:`/course/page?${params.toString()}` });
        
        if (result ) {
        const pageData = result;//.data;
        // 更新分页状态
        Pagination.total = pageData.total;
        Pagination.totalPages = pageData.totalPages;
        courseList =  pageData.rows;
        } else {
        Pagination.total = 0;
        Pagination.totalPages = 0;
        courseList = [ ];     
        }
   } catch (e) {
       // 模拟数据
      courseList = [ ];     
   }
      renderCourseToList(courseList);      
      renderPagination( Pagination);
}
      

//把courseList列在下拉框中
function renderCourseToList(clist) {
  const sel = document.getElementById('courseSelect');
  sel.innerHTML = '<option value="">请选择<span data-term="course">课程</span></option>';
  clist.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.courseId;
      opt.innerText = item.courseName;
     
      opt.setAttribute('data-teacher-id', item.teacherId || '');
      sel.appendChild(opt);
  });
   
}
  // 加载课程排期，在课程选择后，加载该课程对应的所有排期显示在下拉列表中
    async function loadSchedule() { 
        
      const cid = document.getElementById('courseSelect').value;      
      if (!cid) return;
      currentCourseIndex = cid;
       
        // 把页面的courseId节点内容设置为cid
        const courseIdElem = document.getElementById('courseId');
        if (courseIdElem) {
            courseIdElem.value = cid;
        }
        // 把页面的teacherName节点内容设置为教师姓名
        const teacherNameElem = document.getElementById('teacherName');
        if (teacherNameElem) {
            teacherNameElem.innerHTML = '';
             
            const sel = document.getElementById('courseSelect'); 
            if (sel && sel.value) {
                 const selectedOption = sel.options[sel.selectedIndex];
                if (selectedOption) {
                    teacherId = selectedOption.getAttribute('data-teacher-id') || "";
                  }
             } 
            console.log("teacherId:", teacherId);
            if (!teacherId) return;
            const teacherName= await request({url:`/user/name/${teacherId}` });
            console.log("teacherName:", teacherName);
            if (!teacherName) return;
            teacherNameElem.innerHTML = teacherName || '';
        }

       let classForm = document.getElementById('classForm');
       let formFromtemplate= await getCourseFormByCourseId(cid);
       console.log("formFromtemplate课程形式:", formFromtemplate);
       if (formFromtemplate) {
           classForm.value = formFromtemplate;
         //设置classForm的默认值,只和课程（模板）相关
        }else{
          classForm.selectedIndex = 1;//1p1
        }

      try {
        scheduleList = await fetchScheduleList(cid);
           // console.log(scheduleList );
            // 补全默认状态
            scheduleList.forEach(item => {
                if (!item.status) item.status = 'active';
            });
          if (scheduleList && scheduleList.length > 0) {
            // 把scheduleList列表按scheduleId值添加到scheduleSelect下拉列表中
            const scheduleSelect = document.getElementById('scheduleSelect');
            if (scheduleSelect) {
                // 先清空原有选项
                scheduleSelect.innerHTML = '<option value="">请选择<span data-term="course">课程</span>排期</option>';
                scheduleList.forEach(schedule => {
                    // scheduleId和排期信息（可展示更多）
                    const opt = document.createElement('option');
                    opt.value = schedule.scheduleId;
                    // 展示排期信息，如果有startDate等可拼接
                    let displayText = `排期: ${schedule.name}`;
                    if (schedule.startDate && schedule.startTime) {
                        displayText += ` / ${schedule.startDate} ${schedule.startTime}`;
                    } else if (schedule.startDate) {
                        displayText += ` / ${schedule.startDate}`;
                    }
                    opt.innerText = displayText;
                    scheduleSelect.appendChild(opt);
                });             
            }
           
            //更新排期的显示
            if(currentScheduleIndex==-1)
              if(scheduleList.length>0)
                currentScheduleIndex =0;
            scheduleSelect.index = currentScheduleIndex;
          }
          return;
      } catch (e) {
          alert("加载排期失败",e);
      }       
  }
  //保存时，获取课程总数，用于计算可预约人数--保存时，根据课程形式，设置可预约人数为课程总数
async function getCourseFormByCourseId(cid) {
    try {
        const result = await request({url:`/course/classform?courseId=${cid}` });
        console.log("getCourseFormByCourseId",cid,result);
        return result;
    } catch (e) {
        alert("获取课程形式失败",e);
        return null;
    }
}

//更新scheduleObject相关内容 --待细化 --TBD page display
async function renderSchedule() {
     if (!scheduleObject) return;
     // console.log("renderSchedule",scheduleObject);
     //更新已预约人数
const totalBooked = await getBookingCountByScheduleId(scheduleObject.scheduleId);
      console.log("totalBooked",totalBooked,"for"   ,   scheduleObject.scheduleId);

       // 刷新开始日期
       if (scheduleObject.scheduleId) {
        document.getElementById('scheduleId').value = scheduleObject.scheduleId; 
    } else {
        document.getElementById('scheduleId').value = '';
    }

     document.getElementById('availableSites').value = scheduleObject.availableSites;
     document.getElementById('now_availableSites').value =  scheduleObject.availableSites-totalBooked;

     document.getElementById('scheduleName').value = scheduleObject.name || '';

     // 时区回填（跨时区排期时 fromZone 必须正确）
     const tzEl = document.getElementById('timeZone');
     if (tzEl) { tzEl.value = (scheduleObject.timeZone && String(scheduleObject.timeZone).trim()) ? scheduleObject.timeZone : (userTimeZone || ''); }

     // 刷新开始日期
     if (scheduleObject.startDate) {
         document.getElementById('startDate').value = scheduleObject.startDate;
     } else {
         document.getElementById('startDate').value = '';
     }

     // 刷新开始时间
     if (scheduleObject.startTime) {
         document.getElementById('startTime').value = scheduleObject.startTime;
     } else {
         document.getElementById('startTime').value = '';
     }

     // 刷新重复类型
     if (scheduleObject.repeatType !== undefined && scheduleObject.repeatType !== null && scheduleObject.repeatType !== '') {
         document.getElementById('repeatType').value = scheduleObject.repeatType;
     } else {
         document.getElementById('repeatType').value = 'none';
     }

     // 刷新重复间隔
     if (scheduleObject.interval) {
         document.getElementById('interval').value = scheduleObject.interval;
     } else {
         document.getElementById('interval').value = 1;
     }

     if (scheduleObject.status) {
        document.getElementById('status').value = scheduleObject.status;
    } else {
        document.getElementById('status').value = "pending";
    }

     // 刷新结束日期
     if (scheduleObject.endDate) {
         document.getElementById('endDate').value = scheduleObject.endDate;
     } else {
         document.getElementById('endDate').value = '';
     }

     // 获取下拉框（修正：repeatType 改为值匹配而不是 selectedIndex=数字；因为 HTML value 是 none/day/week/month）
     const sel = document.getElementById('repeatType');
     if (sel != null) {
         const v = scheduleObject.repeatType;
         const valMap = { 0: 'none', 1: 'day', 2: 'week', 3: 'month' };
         sel.value = (typeof v === 'number') ? (valMap[v] || 'none') : (v || 'none');
     }

     // 刷新每周/每月重复星期（如有）
     if ((scheduleObject.repeatType === 2 || String(scheduleObject.repeatType) === 'week') && Array.isArray(scheduleObject.repeatDays)) {
         const checkboxes = document.querySelectorAll('#weekDays input[type="checkbox"]');
         checkboxes.forEach(cb => { cb.checked = scheduleObject.repeatDays.includes(Number(cb.value)); });
     } else if ((scheduleObject.repeatType === 3 || String(scheduleObject.repeatType) === 'month') && Array.isArray(scheduleObject.repeatDays)) {
         const checkboxes = document.querySelectorAll('#monthDays input[type="checkbox"]');
         checkboxes.forEach(cb => { cb.checked = scheduleObject.repeatDays.includes(Number(cb.value)); });
     }

     onRepeatTypeChange();

     // ===== P0 关键修复：renderSchedule 回填完成后，立即兜底重算时区（不依赖 change 事件）=====
     try {
         if (typeof getTestDatetime === 'function') getTestDatetime();
         if (typeof getTestEndDatetime === 'function') getTestEndDatetime();
     } catch (e) { console.error("[renderSchedule] refresh tz error:", e); }
}
 

    // 切换重复类型:更新复选的重复天数：周一~7，月（1-31）
    function onRepeatTypeChange() {
      const type = document.getElementById('repeatType').value;
      const unit = { none: "", day: "天", week: "周", month: "月" };
      document.getElementById('repeatUnit').innerText = unit[type];
      document.getElementById('weekDaysBox').style.display = ( type === 'week') ? 'flex' : 'none';
      document.getElementById('monthDaysBox').style.display = ( type === 'month') ? 'flex' : 'none';
      // 重复类型为"不重复"时，隐藏"重复周期"行
      const intervalBox = document.getElementById('intervalBox');
      if (intervalBox) intervalBox.style.display = ( type === 'none') ? 'none' : 'flex';
  }
     // INSERT_YOUR_CODE
   
   //将当前排期数值为初始值，方便修改
   function resetSchedule(){
    resetScheduleObject();
    renderSchedule();
    // 新建时：结束日期默认设置为当前日期 + 30 天
    const endDateInput = document.getElementById("endDate");
    if (endDateInput) {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        endDateInput.value = `${y}-${m}-${dd}`;
    }
   }
   
   function resetScheduleObject(){
  // 清理scheduleObject的各个字段
  scheduleObject = {
    scheduleId: "",
    name:"",
    courseId: currentCourseId,
    courseName: "",
    //teacherId: "",
    teacherName: "",
    startDate: (function() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    })(),

    endDate: (function() {
        // repeatEndDate = startDate + 30 days
        let startDate = new Date();
        startDate.setDate(startDate.getDate() + 30);
        // 格式化为YYYY-MM-DD
        let month = String(startDate.getMonth() + 1).padStart(2, '0');
        let day = String(startDate.getDate()).padStart(2, '0');
        return `${startDate.getFullYear()}-${month}-${day}`;
    })(),

    startTime: (function() {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    })(),
    endTime: (function() {
        const now = new Date();
        now.setHours(now.getHours() + 1);
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    })(),

    repeatType: 0,
    interval: 1,
    repeatDays: [],
    status: "pending", 
    timeZone:userTimeZone,
    userTimeZone:userTimeZone ,    
     availableSites : getDefaultAvailableSites(), 
     now_availableSites :  getDefaultAvailableSites()

};  
return ;
   }
   //根据班级类型，默认可用座位数
   function getDefaultAvailableSites(){
     const classform = document.getElementById('classForm');
     const selectindex = classform.value;
     if(selectindex == null){
        return 0;
     }
    const sites = { "1p1":1,
        "1pN":5,
        "1p2N":10,
    }
     const availableSites = sites[selectindex];
     return availableSites;     
   }

   
   
// 统一刷新用户时区预览（避免在多处复制判断逻辑；即使内部未勾选开关也会自动清空残留旧值）
function refreshUserTzPreview() {
    try {
        if (typeof getTestDatetime === 'function')    getTestDatetime();
        if (typeof getTestEndDatetime === 'function') getTestEndDatetime();
    } catch (e) { console.error("[refreshUserTzPreview] error:", e); }
}

  //当排期列表选择变化时，检查参数，重新显示排期计划
   function displySchedule() {
    // 先做一次兜底刷新：无论后续是否 early return，都避免左侧选择变化后右侧还显示上次切走残留的值
    refreshUserTzPreview();

    if(! checkCourseAndSchedule(true,true)) return;

    if (conflictMessageElem) {
        conflictMessageElem.textContent = '';
    }
   if(resultCalendarElem)  {
    resultCalendarElem.hidden = true;
    resultCalendarElem.innerHTML='';
   }
   if(resultBodyElem) {
      resultBodyElem.hidden = true;
   }
   // 查询scheduleSelect下拉框的当前，获取数据，调用 renderSchedule 更新当前选择
   const scheduleSelect = document.getElementById('scheduleSelect');
   if (!scheduleSelect) return;
   const selectedId = scheduleSelect.value;

   if (!selectedId) return;
   currentScheduleId = selectedId;

   // 在 scheduleList 中查找对应的排期对象
   const selectedSchedule = scheduleList.find(s => String(s.scheduleId) === String(selectedId));
   if (selectedSchedule) {
       scheduleObject = selectedSchedule;
   } else {
       resetScheduleObject();
   }
    if (typeof renderSchedule === 'function') {
        renderSchedule(); // renderSchedule 内部已在末尾兜底调用 refreshUserTzPreview
    } else {
        // renderSchedule 不可用时，仍然按兜底逻辑刷新一次
        refreshUserTzPreview();
    }
   }
  //读取排期个字段的输入/选择值
   function  getFormData(){
    const form = {
        name: document.getElementById('scheduleName').value,
        courseId: document.getElementById('courseId').value,
        availableSites: document.getElementById('availableSites').value,

        scheduleId: document.getElementById('scheduleId').value,
        startDate: document.getElementById('startDate').value,
        startTime: document.getElementById('startTime').value,
        repeatType: document.getElementById('repeatType').value,
        interval: document.getElementById('interval').value,
        status:  document.getElementById('status').value,
        timeZone: document.getElementById('timeZone').value, //保持原始时区---排期的时区
        userTimeZone:userTimeZone, //输出时间的时区
        // 根据选择获取repeatDays的数组
        repeatDays: (() => {
            // 仅当repeatType为week/month时读取，其他情况为空数组
            const repeatTypeVal = document.getElementById('repeatType').value;
            if (repeatTypeVal === 'week' ) {
                const weekDayInputs = document.querySelectorAll('#weekDays input[type=checkbox]');
                let arr = [];
                weekDayInputs.forEach(cb => { 
                    if (cb.checked) arr.push(Number(cb.value));
                });
                return arr;
            } else  if ( repeatTypeVal === 'month' ) {

                const weekDayInputs = document.querySelectorAll('#monthDays input[type=checkbox]');
                console.log("days",weekDayInputs);
                let arr = [];
                weekDayInputs.forEach(cb => { 
                    if (cb.checked) arr.push(Number(cb.value));
                });
                console.log("days arr",arr);
                return arr;
            } else {
                return [];
            }
        })(),
        endDate: document.getElementById('endDate').value  
    }; 
    
    console.log("form:",form);
    return form;
   }
   
   // 预览排期--列出排期的所有时间及日历
   async function previewSchedule() {
     if(! checkCourseAndSchedule(false,true))
       return ; //对于新建排期，不需要检查scheduleID
     const form = getFormData();
      console.log("form:",form) ;
    // 生成排期列表 localDateTime List<Date,TIME>
     scheduleResult = await generateScheduleListFromServer(form);
     console.log("result:",scheduleResult) ;
     if(resultCalendarElem)  {
        resultCalendarElem.hidden = false;
       }
       if(resultBodyElem) {
          resultBodyElem.hidden = false;
       }
    renderResult();
    renderCalendar();
    //alert("预览成功");
}

 
  
// 渲染排期时间列表
function renderResult() {
    const body = document.getElementById('resultBody');
    body.innerHTML = '';
    if(scheduleResult!= null ) {
    scheduleResult.forEach(item => {

        const tr = document.createElement('tr');        
        tr.innerHTML = `<td>${scheduleResult.indexOf(item) + 1}</td><td>${item.date}</td><td>${item.time}</td>`;
        body.appendChild(tr);
    });
        }
  }
 // 渲染日历
 function renderCalendar() {
  const cal = document.getElementById('calendar');
  cal.innerHTML = '';
  if(scheduleResult == null )
    return;

  const dateSet = new Set(scheduleResult.map(i => i.date));
  // 将dateSet的第一项（若存在）转为日期变量
  let firstDateVar = null;
  if (dateSet.size > 0) {
      const firstDateStr = Array.from(dateSet)[0];
      // 假设格式为'yyyy-MM-dd'
      const [year, month, day] = firstDateStr.split('-');
      firstDateVar = new Date(Number(year), Number(month) - 1, Number(day));
     // console.log('firstDateVar:', firstDateVar);
  }

  // startDate设置为dateSet第一项表示的日期（如果有），否则用今天
  let startDate;
  if (firstDateVar) {
      startDate = new Date(firstDateVar); // 已在本地，0点时间
  } else {
      startDate = new Date();
  }
 
  const dayOfWeek = startDate.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
  const diffToMonday = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
  startDate.setDate(startDate.getDate() + diffToMonday);

  // 显示35天，横向排列，每行7天
  const daysToShow = 35;

  const today = new Date(startDate);
  today.setHours(0, 0, 0, 0); // 本地0点
  for (let i = 0; i <= daysToShow; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      // 保证是本地时区的年月日
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      const div = document.createElement('div');
      div.className = 'calendar-day';
      if (dateSet.has(dateStr)) div.classList.add('marked');
      div.innerText = d.getDate();
      cal.appendChild(div);
  }
} 

 
    // 发布--修改当前的排期状态并保存 
  // 保存 update or insert 
  //判断是否需要:assignStudentToTheSchedule
  async function saveScheduleToDB() {
    if(! checkCourseAndSchedule(false,true))//排期在新建时不判断
        return ;
    //TBD :判断排期是否已经存在---
   // const token = getToken();
    const formData = getFormData();
    console.log("save form:",formData); 

    // 引用ScheduleCreateDTO, 把formData赋值到dto对象
    // 注意：前端js中无class，直接构造一个对象与后端ScheduleCreateDTO字段一致即可 
  const sel = document.getElementById('courseSelect'); 
    // 读取sel的当前选择，并读取其中的teacherId 
    if (sel && sel.value) {
      const selectedOption = sel.options[sel.selectedIndex];
      if (selectedOption) {
        teacherId = selectedOption.getAttribute('data-teacher-id') || "";
      }
    } else {
    // INSERT_YOUR_CODE
    alert("请选择课程！");
    return;
    }
    //判断结束日期不能早于开始日期
    if (formData.endDate < formData.startDate) {
      alert("结束日期不能早于开始日期！");
      return;
    }
  
    let createdto = toScheduleCreateDto(formData);      
    
    let bExists = formData.scheduleId && formData.scheduleId !== "";
      console.log("save createdto:",createdto,bExists);
// 返回当前或新增的schedule的id
    let result = await saveScheduleToServer(bExists , createdto);
    //  console.log("saveScheduleToServer return  :", result ); 
       // 4.  响应处理 响应成功/失败 result.data.id = new id 
         
        if ((typeof result === "undefined") || result == null) { 
            alert(bExists ? '编辑失败' : '新增失败'); 
        }else {
            currentScheduleId = result.Id;
            alert(bExists ? '编辑成功' : '新增成功'); 
        } 
}

async function assignStudentToSchedule( ) {
     
    if(! checkCourseAndSchedule(true,true))
        {  
            alert("请选择有效的课程和排期！");
            return ;
        } 
    let scdid = currentScheduleId;
      
    let assignStudentId ="";
    // 判断id="assignStudentCheckbox"的是否勾选 
      // 赋值选中的学生id
      const assignStudentSelect = document.getElementById("assignStudentSelect");
      if (assignStudentSelect && assignStudentSelect.value) {
         assignStudentId = assignStudentSelect.value;
      } else 
      {
        alert("请选择学生！");
        return;
      }
   
      //  console.log("当前选择的学生ID", assignStudentId);
       
        const ret = await assignStudentToTheSchedule(scdid,assignStudentId,teacherId);
        if ( ret  ) {
            alert("学生成功分配排期的课程并完成预约！");
            // 可选：刷新界面或数据 
        } else {
            alert("学生分配排期失败: " + "请检查后端接口与数据。");
        }  
        return ;
}
  // 删除
  //检查是否存在对应的预订----提示是否一起删除。
  //删除--预定及其全部预约
  async function deleteScheduleByFrozen() {

    if(! checkCourseAndSchedule(true,true))
        return ;
    
    const formData = getFormData();
    const scheduleId = formData.scheduleId;

    //检查是否存在相关的booking
   if(hasBookingForScheduleId(scheduleId)){
    // INSERT_YOUR_CODE
        const userChoice = confirm('该排期存在预订，是否继续删除？继续将删除该项目下的全部预订。点击“确定”继续，点击“取消”放弃删除。');
        if (!userChoice) {
            return;
        }
        //删除该排期的全部预定
            await deleteBookingsByScheduleIdByFrozen(scheduleId);            
        }

     await operateSchedule(scheduleId,"frozen");  
  }

  //把指定排期id的预定booking设置为frozen状态
   async function deleteBookingsByScheduleIdByFrozen(scheduleId){

    if (!scheduleId) {
        console.warn('排期ID不能为空');
        return false;
    }
  
    try {
      // 查询并批量将该排期下所有预约（appointment）状态设为"frozen" 
      const res = await request({
          url: `/course/booking/ListByScheduleId/${scheduleId}`,
          method: 'GET'           
      });
      console.log("lsitBySchid",res);
         if (Array.isArray(res)) {
          for (const booking of res) {
              if (booking && booking.id) {
                await  operateBookingStatus(  booking.id,'frozen');
                   // 更新本地对象的状态
              //  booking.status = 'frozen';
              }
          }
      }

    //  console.log(`预约已全部设为frozen:`, res);
      return res;
  } catch (error) {
      console.error('批量设置预约为frozen失败:', error);
      return false;
  }

  }

/**
 * 判断是否存在指定排期的booking
 * @param {string|number} scheduleId 排期ID
 * @returns {Promise<boolean>} 是否存在booking
 */
async function hasBookingForScheduleId(scheduleId) {
    if (!scheduleId) {
        console.warn('排期ID不能为空');
        return false;
    }
    try {
        // 假设后端有对应的API接口: /api/schedule/{scheduleId}/bookings/count
        const result = await request({ url:`/course/booking/countByScheduleId/${scheduleId}`, 
            method: 'GET'
        }); 
        // result是Integer类型，判断是否为0
        // result 预期为返回预约数量
        return Array.isArray(result) && result > 0;     
    } catch (error) {
        console.error('请求排期booking时出错:', error);
        return true;
    }
}
//读取已经预约的次数，用于判断是否可以删除，是否可以分配学生
 async  function getBookingCountByScheduleId(scheduleId) {

    if (!scheduleId) {
        console.warn('排期ID不能为空');
        return 0;
    }
    try { 
        const result = await request({ url:`/course/booking/countByScheduleId/${scheduleId}`, 
            method: 'GET'
        }); 
         // result 预期为返回预约数量
        return  result? result : 0; 
    } catch (error) {
        console.error('请求排期booking数量时出错:', error);
        return 0;
    }
  }

 function refreshData(){
    //再次读取排期数据并显示
    loadSchedule(); 
 }

 function checkSchedule(){ 
   // 检查排期冲突返回 clist
   // 由于 clist = checkScheduleConflict(cto); 是异步函数，应加 await 并处理返回值
   
   const conflictMessageElem = document.getElementById('conflictMessage');
   if (conflictMessageElem) {
      conflictMessageElem.textContent = '正在检查';
   }
   const createdto = toScheduleCreateDto(getFormData());
   console.log("checkSchedule:",createdto) ;
   (async function(){
       // 注意：checkScheduleConflict 应当是 async，返回 {code, message, data}
       let clist = await checkScheduleConflict(createdto);
       console.log("checkSchedule:",clist);
       if (!clist) {
          alert("检测排期冲突时发生错误！");
          return;
       }
       // clist  预期为冲突列表，Map<String,String>，通常为 array of {id, name}  
       // 分情况处理冲突列表
       let conflictData = clist ;
       if (conflictData && Array.isArray(conflictData) && conflictData.length > 0) {
           // 解析id与name
           let msg = "与以下排期存在冲突：\n";
           conflictData.forEach(item => {                
               // 可能是对象{id,name}，也可能是字符串 item.id 
               if (typeof item === "object" && item.name ) {
                 msg += `${item.name}`+ "@@";
               } else if (typeof item === "string") {
                 msg += item + "@@";
               } else {
                 msg += JSON.stringify(item)  ;
               }
           });
          // alert(msg);
           if (conflictMessageElem) { 
            // INSERT_YOUR_CODE
            // 把msg中的首尾的字符@@去掉，把中间的@@更换为逗号
            msg = msg.replace(/^@@|@@$/g, ''); // 去除首尾@@
            msg = msg.replace(/@@/g, '，');    // 替换中间的@@为逗号
 

            conflictMessageElem.style.color = 'red';
            conflictMessageElem.textContent = msg; 
         }
       } else {
          // alert("该排期与该课程的其它排期没有冲突。");
           if (conflictMessageElem) {
            conflictMessageElem.style.color = 'green';
            conflictMessageElem.textContent = "该排期没有时间冲突。";
         }
       }
   })(); 
 }
 
 //这个render过程结束
/**
 * 排期管理页面：
 * 1、课程选择：提供检索字段：课程名称、语言、难度、教师
 *     1.1 用下拉菜单显示检索到的课程列表，单选
 *     
 *  2、根据选择的课程，查询对应的排期，显示排期参数（允许修改）：
 *    2.1 开始日期，开始时间
 *        重复类型：下拉菜单：不重复、每天、每周、每月
 *        重复间隔：N（天、周、月)
 *        重复时间： 周一~周日（每周）或者 月初到月末（每月）
 *        结束日期： 
 *    2.2 显示操作按钮：预览、发布、保留、删除
 *    2.3 排期结果显示区域：
 *    2.3.1 列表显示：年月日、时分
 *    2.3.2 日历显示：在日历上标记所有的排期日期
 * 
 * 
 **/
// INSERT_YOUR_CODE
/**
/**
 * 隐藏 DIV 元素但仍可通过 JS 访问其内容/属性的常用方法：
 * 1. 使用 style="display:none" —— DIV 不可见且不占位，但仍保留在 DOM，可通过 JS 读写 innerText/innerHTML 等。
 * 2. 使用 style="visibility:hidden" —— DIV 不可见但仍占位，也可被 JS 正常访问内容。
 * 3. 用页面外定位：如 style="position:absolute; left:-9999px;"，视觉上不可见但依然在 DOM，也可聚焦/访问内容。
 * 4. 用 aria-hidden="true" 属性 —— 仅影响无障碍，不影响 JS 获取内容。
 *
 * 示例：
 * <div id="a" style="display:none">foo</div>
 * <div id="b" style="visibility:hidden">bar</div>
 * <div id="c" style="position:absolute;left:-9999px;">baz</div>
 * <div id="d" aria-hidden="true">hidden by aria</div>
 * // JS:
 * console.log(
 *   document.getElementById('a').innerText,
 *   document.getElementById('b').innerText,
 *   document.getElementById('c').innerText,
 *   document.getElementById('d').innerText
 * );
 *
 * // 只要 DIV 未从 DOM 移除，其内容都能通过 JavaScript 获取和修改。
 */
 // INSERT_YOUR_CODE

// 示例：在display:none的DIV中包含一个input，依然可以通过JS读取其值

// 假设有如下HTML
// <div id="hiddenDiv" style="display:none;">
//   <input type="text" id="hiddenInput" value="隐藏的值">
// </div>

// 通过JS读取和设置input的值
/*function readHiddenInputValue() {
    var input = document.getElementById('hiddenInput');
    if (input) {
        console.log("隐藏的input值:", input.value);
        // 也可以赋新值
        input.value = "新值";
        console.log("赋新值后:", input.value);
    }
}*/
// 调用示例
// readHiddenInputValue();

// 结论：只要元素还在DOM树中，display:none不会影响JS用value/innerText等API访问或修改其内容