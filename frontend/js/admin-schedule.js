 //排期管理--页面 admin-schedule.js
 document.write('<script src="/js/public/pagefoot.js"></script>');  

 //   let courseList = [];
    let currentScheduleId= "";
    let teacherId = "";
    let activeCourseId = null, currentScheduleIndex=-1;
    let  conflictMessageElem =null;//conflictMessage
    let  resultBodyElem =null,resultCalendarElem=null;// id= resultBody,Id="calendar";
    // 轻量 toast 提示：不阻断操作、自动消失；ok=true 绿色(成功) / 其它红色(提示或错误)
    function toast(msg, ok){
      let t = document.getElementById('msg-toast');
      if(!t){
        t = document.createElement('div');
        t.id = 'msg-toast';
        t.style.cssText = 'position:fixed;right:20px;bottom:20px;padding:10px 16px;border-radius:6px;color:#fff;z-index:99999;box-shadow:0 2px 8px rgba(0,0,0,.25);font-size:14px;max-width:340px;line-height:1.5;';
        document.body.appendChild(t);
      }
      t.style.background = ok ? '#28a745' : '#dc3545';
      t.textContent = msg;
      t.style.display = 'block';
      clearTimeout(t._timer);
      t._timer = setTimeout(function(){ t.style.display='none'; }, 2800);
    }

    // P1：Tab 切换（排期设置 / 排期结果 / 候补·指定学生）
    function switchTab(name) {
        const tabs = document.querySelectorAll('.sched-tab-btn');
        const panels = document.querySelectorAll('.tab-panel');
        tabs.forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-tab') === name); });
        panels.forEach(function(p){ p.classList.toggle('active', p.id === name); });
    }
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
  /* P1：Tab 化导航 + 面板（排期设置 / 排期结果 / 候补·指定学生） */
  .sched-tabs {
    display: flex;
    gap: 8px;
    margin: 0 0 16px 0;
    border-bottom: 1px solid #f0f0f0;
    padding-bottom: 10px;
    flex-wrap: wrap;
  }
  .sched-tab-btn {
    padding: 8px 18px;
    border: 1px solid #e3e0d8;
    background: #fff;
    border-radius: 6px 6px 0 0;
    cursor: pointer;
    font-size: 14px;
    color: #555;
    transition: all .15s;
  }
  .sched-tab-btn:hover { border-color: #722ed1; color: #722ed1; }
  .sched-tab-btn.active {
    background: #722ed1;
    color: #fff;
    border-color: #722ed1;
    font-weight: 600;
  }
  .tab-panel { display: none; }
  .tab-panel.active { display: block; }
  /* P2-B：指定学生 modal 弹窗 */
  .modal-mask {
    position: fixed; inset: 0; background: rgba(0,0,0,.35);
    display: none; align-items: center; justify-content: center; z-index: 9999;
  }
  .modal-box {
    background: #fff; border-radius: 8px; width: 360px; max-width: 92vw;
    box-shadow: 0 8px 30px rgba(0,0,0,.18); overflow: hidden;
  }
  .modal-title { padding: 14px 16px; font-weight: 600; border-bottom: 1px solid #f0f0f0; }
  .modal-body { padding: 16px; }
  .modal-body select { width: 100%; padding: 8px 10px; border: 1px solid #d9d6cf; border-radius: 6px; }
  .modal-foot { padding: 12px 16px; border-top: 1px solid #f0f0f0; display: flex; justify-content: flex-end; gap: 8px; }
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
                    <label><span data-term="course">课程</span>：</label>
                    <input type="text" id="course-name-input"  placeholder="输入名称" >
                </div>
                <div>
                    <label><span data-term="classType">语言类型</span>：</label>
                    <select id="languageType-select" >
                        <option value="">全部</option>
                        ${courseTypeOptionsHtml('', { empty: '全部' })}
                    </select>
                </div>
                <div>
                    <label><span data-term="classLevel">难度等级</span>：</label>
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
                 <button class="btn btn-primary" onclick="localsearchCourse_sch()">
                    <i class="fa fa-search"></i> 搜索
                    </button>
                <button class="btn btn-default" onclick="resetCourseFilter_sch()">
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
                <label><span data-term="classForm">班级形式</span>：</label>
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
        <!-- L2：复制 / 批量。三个入口都只读写既有接口，不引入新后端端点。
             原「检查冲突」按钮已删除：saveScheduleToDB() 保存前自动查一次并内联提示，
             那个按钮是同一件事的第二个入口，且两处拼提示文案的分隔符还不一样。 -->
        <button class="btn btn-default" onclick="schedCopyCurrentSchedule()" title="复制当前选中的排期，起止日期各顺延 7 天"><i class="fa fa-copy"></i> 复制此排期</button>
        <button class="btn btn-default" onclick="schedCopyFromLastWeek()" title="把该课程上周起排的排期各顺延 7 天批量新建；目标起始日已存在则跳过"><i class="fa fa-calendar-plus"></i> 从上周复制</button>
        <button class="btn btn-default" onclick="schedOpenBatchSlots()" title="一次填多行（星期 + 时间 + 员额），串行创建"><i class="fa fa-table"></i> 批量时段</button>
        <button class="btn btn-danger" onclick="deleteScheduleByFrozen()"><i class="fa fa-trash"></i> 删除</button>
        <button class="btn btn-success" onclick="refreshData()"><i class="fa fa-sync-alt"></i> 刷新</button>
        <!-- 用户时间预览开关：置于"刷新"右侧，右对齐 -->
        <label for="toggleUserTimeZone" style="margin-left:auto;width:auto;text-align:left;display:inline-flex;align-items:center;gap:8px;white-space:nowrap;cursor:pointer;font-weight:500;">
            <input type="checkbox" id="toggleUserTimeZone" style="width:auto;min-width:0;height:auto;padding:0;margin:0;cursor:pointer;" onchange="document.getElementById('userTimeZoneRow').style.display=this.checked?'':'none';document.getElementById('testTimeZoneForm').style.display=this.checked?'':'none';getTestDatetime();getTestEndDatetime();">
            用户时间预览
        </label>
    </div>
  </div> <!-- 常驻：课程检索 / 选择排期 card 结束 -->
  <div class="sched-tabs">
    <button type="button" class="sched-tab-btn active" data-tab="tab-set" onclick="switchTab('tab-set')"><i class="fa fa-edit"></i> 排期设置</button>
    <button type="button" class="sched-tab-btn" data-tab="tab-result" onclick="switchTab('tab-result')"><i class="fa fa-list-alt"></i> 排期结果</button>
    <button type="button" class="sched-tab-btn" data-tab="tab-advanced" onclick="switchTab('tab-advanced')"><i class="fa fa-user-plus"></i> 候补 / 指定学生</button>
  </div>
  <div class="tab-panel active" id="tab-set">
    <div class="sched-section">
        <div style="display: flex; flex-wrap: wrap; gap: 24px;">
            <div class="sched-form-line">
                <label>排期名称：</label>
                <!-- data-auto="1" 表示名称还是系统建议值：用户一旦手改就置 0，之后不再自动覆盖 -->
                <input type="text" id="scheduleName" data-auto="1" placeholder="自动生成，如：英语·周三 19:00" oninput="schedMarkNameManual()">
            </div>
            <div class="sched-form-line">
                <label>员额：</label>
                <input type="number" id="availableSites" value="1" min="1">
            </div>
            <div class="sched-form-line">
                <label>剩余员额：</label>
                <input type="text" id="now_availableSites" value="1" readonly>
            </div>
            <!-- 教学语言 / 课时长度：默认由课程带入（课程又来自模板），
                 这里可以按本条排期覆盖——同一门课中外教分班、试听 25 分钟都是真实场景 -->
            <div class="sched-form-line">
                <label>教学语言：</label>
                <select id="schedLanguageType">
                    <option value="">跟随课程</option>
                    ${courseTypeOptionsHtml('')}
                </select>
            </div>
            <div class="sched-form-line">
                <label>课时长度：</label>
                <input type="number" id="schedClassDuration" min="15" max="600" step="5" placeholder="跟随课程" style="width:92px;">
                <span style="color:#8c8c8c;font-size:12px;">分钟</span>
            </div>
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 40px;">
           <!-- 左侧：当前逻辑 -->
           <div style="flex: 1; min-width: 400px;">
             <div class="sched-form-line">
                <label>排期时区：</label>
                <input type="text" id="timeZone" value="${userTimeZone}" readonly>
             </div>
             <!-- L1：先勾上课星期 → 开始日期自动跳到「下一个该星期几」，并自动勾进重复星期。
                  这样排「周一三五 19:00」时不用对着日历数日子，也不用在 7 个复选框里手动挑。 -->
             <div class="sched-form-line">
                <label>上课星期：</label>
                <div id="quickWeekday" class="sched-weekdays" style="display:inline-flex;flex-wrap:wrap;gap:4px;margin:0;">
                    <label><input type="checkbox" value="1" onchange="schedQuickWeekdayChange(this)">周一</label>
                    <label><input type="checkbox" value="2" onchange="schedQuickWeekdayChange(this)">周二</label>
                    <label><input type="checkbox" value="3" onchange="schedQuickWeekdayChange(this)">周三</label>
                    <label><input type="checkbox" value="4" onchange="schedQuickWeekdayChange(this)">周四</label>
                    <label><input type="checkbox" value="5" onchange="schedQuickWeekdayChange(this)">周五</label>
                    <label><input type="checkbox" value="6" onchange="schedQuickWeekdayChange(this)">周六</label>
                    <label><input type="checkbox" value="7" onchange="schedQuickWeekdayChange(this)">周日</label>
                </div>
             </div>
             <div class="sched-form-line">
                  <label>开始日期：</label>
                  <!-- 默认值必须走 schedLocalToday()：原先写 (new Date()).toISOString()，
                       那是 UTC —— 东八区本地 00:00~07:59 打开页面，默认日期是"昨天" -->
                  <input type="date" id="startDate" value="${schedLocalToday()}" onchange="schedSyncWeekdayFromStartDate();schedSuggestName();">
                  <input type="text" id="startDate_weekday" readonly style="width:52px;min-width:52px;text-align:center;padding:8px 2px;">
             </div>
              <div class="sched-form-line">
                  <label><span data-term="lessonTime">上课时间</span>：</label>
                  <!-- 默认"下一个整点"，而不是当前分钟：排课几乎总是整点/半点开始 -->
                  <input type="time" id="startTime" value="${schedNextHour()}" onchange="schedSuggestName()">
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
                <option value="active">已发布</option>
                <option value="pending">待发布</option>
                <option value="inactive">已收回</option>
                <option value="frozen">已删除</option>
            </select>
            <div id="conflictMessage" style="color:#f5222d;"></div>
        </div>
    </div>

    <!-- L1：预览结果内联在这里，不再强制跳「排期结果」Tab 让人切回来 -->
    <div id="schedPreviewSummary" style="display:none;margin:0 0 12px 0;padding:10px 14px;border-radius:6px;background:#f6ffed;border:1px solid #b7eb8f;color:#237804;font-size:13px;line-height:1.7;"></div>

    <!-- 操作按钮 -->
    <div class="sched-btn-row">
      <button class="btn btn-default" onclick="previewSchedule()"><i class="fa fa-eye"></i> 预览排期</button>
       <button class="btn btn-primary" onclick="saveScheduleToDB()"><i class="fa fa-save"></i> 保存并发布</button>
       <button class="btn btn-default" onclick="switchTab('tab-result')" title="查看课次列表与日历"><i class="fa fa-list-alt"></i> 看完整结果</button>
    </div>

   </div> <!-- tab-set panel 结束 -->

   <div class="tab-panel" id="tab-result">
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
   </div><!-- tab-result 结束 -->
   <div class="tab-panel" id="tab-advanced">
     <!-- 候补队列 / 递补（从排期设置卡片移出，独立为高级 Tab） -->
     <div class="sched-section" id="waitlistSection" style="display:none;">
        <div class="sched-section-title">
            候补队列
            <span id="waitlistSummary" style="font-weight:400;color:#888780;font-size:13px;margin-left:8px;"></span>
        </div>
        <div id="waitlistBody" style="font-size:13px;color:#5F5E5A;"></div>
     </div>
    <div class="sched-btn-row">
      <button class="btn btn-primary" onclick="openAssignStudentModal()"><i class="fa fa-user-plus"></i> 指定<span data-term="student">学生</span></button>
    </div>
    <!-- 指定学生 modal：#assignStudentSelect 仍常驻 DOM，供课程检索后填充(643)与深链预选(707) -->
    <div class="modal-mask" id="assignStudentModal">
      <div class="modal-box">
        <div class="modal-title">指定<span data-term="student">学生</span>到当前排期</div>
        <div class="modal-body">
          <select id="assignStudentSelect">
            <option value="">请选择<span data-term="student">学生</span></option>
          </select>
        </div>
        <div class="modal-foot">
          <button class="btn" onclick="closeAssignStudentModal()">取消</button>
          <button class="btn btn-primary" onclick="confirmAssignStudent()">确定</button>
        </div>
      </div>
    </div>
   </div><!-- tab-advanced 结束 -->
</div><!-- sched-page 结束：所有 tab 面板都在同一父容器内 -->`;
        
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
     // 课程列表与学生列表并行加载；深链需等两者都完成后再处理
     await Promise.all([loadAndRenderCourses(), addStudentList()]);

    // ====== 深链处理：/booking?scdid=&sid= 落地 ======
    if (window.pendingDeepLink) {
        try {
            await handleAdminDeepLink(window.pendingDeepLink);
        } catch (e) {
            console.error('深链处理异常:', e);
        }
        window.pendingDeepLink = null;
        history.replaceState(null, '', location.pathname);
    }

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
  } //renderScheduleCards

  
// 筛选与操作联动
// 搜索按钮：重置为第1页再查询
function localsearchCourse_sch() {
    Pagination.pageNum = 1;
    loadAndRenderCourses();
  }

  
  // 重置筛选条件
  function resetCourseFilter_sch() {

    document.getElementById('course-name-input').value = '';//TBD
    document.getElementById('languageType-select').value = '';
  //  document.getElementById('course-status-select').value = '';
    document.getElementById('difficultyLevel-select').value = '';
    Pagination.pageNum = 1;
    loadAndRenderCourses();
  }
  
    //选择学生，添加到学生列表
       async function addStudentList() {
        //判断是否有空位，没有则提示用户
        const availableSites = getNowAvailableSitesRaw();
        if(availableSites <= 0){
            toast("当前班级已无空位，无法指定学生");
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

  // ====== 管理员端深链处理 ======
  // dl: { scdid, sid }，来自 /booking 入口的 URL 参数
  // 显示 scdid 对应的排期，并在学生列表中预选 sid 对应的学生
  async function handleAdminDeepLink(dl) {
      // 1. 获取排期详情（含 courseId）
      const schedule = await fetchSchedule(dl.scdid);
      if (!schedule) {
          toast('排期不存在');
          return;
      }
      const courseId = schedule.courseId;
      if (!courseId) {
          toast('排期数据异常：缺少课程ID');
          return;
      }

      // 2. 在课程下拉框中选中该课程
      const courseSelect = document.getElementById('courseSelect');
      let courseFound = false;
      for (let i = 0; i < courseSelect.options.length; i++) {
          if (String(courseSelect.options[i].value) === String(courseId)) {
              courseSelect.selectedIndex = i;
              courseFound = true;
              break;
          }
      }
      if (!courseFound) {
          toast('排期所属课程不在当前课程列表中（可能不在第一页），请调整筛选后重试');
          return;
      }

      // 3. 加载该课程的排期列表
      await loadSchedule();

      // 4. 在排期下拉框中选中目标排期
      if (!reselectScheduleOption(dl.scdid)) {
          toast('未在课程排期列表中找到指定排期');
          return;
      }

      // 5. 显示排期详情
      // 必须 await：displySchedule 内部要查后端算剩余席位、再渲染候补队列，
      // 不 await 的话 handleAdminDeepLink 会先返回，调用方紧接着就清掉 pendingDeepLink，
      // 外观上像是"深链带过来了但候补面板迟迟不定"（且随网络快慢时有时无）。
      await displySchedule();

      // 6. 预选学生
      if (dl.sid) {
          const studentSelect = document.getElementById('assignStudentSelect');
          if (studentSelect && studentSelect.options.length > 0) {
              let sidFound = false;
              for (let i = 0; i < studentSelect.options.length; i++) {
                  if (String(studentSelect.options[i].value) === String(dl.sid)) {
                      studentSelect.selectedIndex = i;
                      sidFound = true;
                      break;
                  }
              }
              if (!sidFound) {
                  toast('指定学生不在学生列表中');
              }
          }
      }

      // 滚动定位到排期设置区域
      const schedSection = document.querySelector('.sched-section');
      if (schedSection) schedSection.scrollIntoView({ behavior: 'smooth' });
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
      activeCourseId = cid;
        // 把页面的teacherName节点内容设置为教师姓名（仅展示用，失败不得阻断排期加载）
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
            if (teacherId) {
                try {
                    const teacherName = await request({url:`/user/name/${teacherId}` });
                    teacherNameElem.innerHTML = teacherName || '';
                } catch (e) {
                    teacherNameElem.innerHTML = '';
                }
            }
        }

       let classForm = document.getElementById('classForm');
       let formFromtemplate= await getCourseFormByCourseId(cid);
       if (formFromtemplate) {
           classForm.value = formFromtemplate;
         //设置classForm的默认值,只和课程（模板）相关
        }else{
          classForm.selectedIndex = 1;//1p1
        }

       // 切课程后：语言/时长跟着换，员额跟着班级形式换，名称建议也重算。
       // 这一串原先要用户手动改，现在换课程就自动对齐。
       await schedLoadTeachingProps(cid);
       const sitesEl = document.getElementById('availableSites');
       if (sitesEl) {
           const dft = getDefaultAvailableSites();
           if (dft) sitesEl.value = dft;
       }
       schedSuggestName();

      try {
        scheduleList = await fetchScheduleList(cid);
            // 补全默认状态
            scheduleList.forEach(item => {
                if (!item.status) item.status = 'active';
            });
            // 始终渲染下拉框：先放占位项，避免“选中课程后下拉完全空白”的观感
            const scheduleSelect = document.getElementById('scheduleSelect');
            if (scheduleSelect) {
                scheduleSelect.innerHTML = '<option value="">请选择<span data-term="course">课程</span>排期</option>';
                if (scheduleList && scheduleList.length > 0) {
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
                    //更新排期的显示
                    if (currentScheduleIndex == -1) currentScheduleIndex = 0;
                    scheduleSelect.selectedIndex = currentScheduleIndex >= 0 ? currentScheduleIndex : 0;
                } else {
                    // 该课程确实没有排期：给出明确提示，而不是留空
                    const emptyOpt = document.createElement('option');
                    emptyOpt.value = '';
                    emptyOpt.innerText = '该课程暂无排期';
                    emptyOpt.disabled = true;
                    scheduleSelect.appendChild(emptyOpt);
                }
            }
            return;
      } catch (e) {
          toast("加载排期失败：" + (e&&e.message?e.message:e), false);
      }       
  }
  //保存时，获取课程总数，用于计算可预约人数--保存时，根据课程形式，设置可预约人数为课程总数
async function getCourseFormByCourseId(cid) {
    try {
        const result = await request({url:`/course/classform?courseId=${cid}` });
        return result;
    } catch (e) {
        toast("获取课程形式失败：" + (e&&e.message?e.message:e), false);
        return null;
    }
}

//更新scheduleObject相关内容 --待细化 --TBD page display
async function renderSchedule() {
     if (!scheduleObject) return;
     //更新已预约人数
const totalBooked = await getBookingCountByScheduleId(scheduleObject.scheduleId);

     document.getElementById('availableSites').value = scheduleObject.availableSites;
     setNowAvailableSitesDisplay(scheduleObject.availableSites - totalBooked);

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

    // 刷新重复间隔（后端 ScheduleCreateDTO 返回字段为 repeatInterval；兼容旧字段名 interval）
    const repeatIntervalVal = (scheduleObject.repeatInterval != null) ? scheduleObject.repeatInterval
                            : (scheduleObject.interval != null ? scheduleObject.interval : null);
    if (repeatIntervalVal) {
        document.getElementById('interval').value = repeatIntervalVal;
    } else {
        document.getElementById('interval').value = 1;
    }

     if (scheduleObject.status) {
        document.getElementById('status').value = scheduleObject.status;
    } else {
        document.getElementById('status').value = "active";
    }

     // 教学语言 / 课时长度回填：空字符串表示"跟随课程"，不要写成 "null"/"undefined"
     const langEl = document.getElementById('schedLanguageType');
     if (langEl) langEl.value = scheduleObject.languageType || '';
     const durEl = document.getElementById('schedClassDuration');
     if (durEl) durEl.value = (scheduleObject.classDuration != null && scheduleObject.classDuration !== '')
         ? scheduleObject.classDuration : '';

     // 名称是排期已有数据，标记为"非自动"，避免被建议值覆盖
     const nameEl = document.getElementById('scheduleName');
     if (nameEl && scheduleObject.name) nameEl.setAttribute('data-auto','0');

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

     // 快捷「上课星期」与真实重复星期对齐（打开已有排期时两者必须一致，
     // 否则用户看到快捷区没勾、以为数据丢了）
     schedSyncQuickFromWeekDays();

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
   //将当前排期数值为初始值，方便修改
   async function resetSchedule(){
    resetScheduleObject();
    // 必须 await：renderSchedule 里要先查已预订数（网络请求），
    // 不 await 就去填"跟随课程"的语言/时长，会被它随后写回的空值覆盖 —— 竞态。
    await renderSchedule();
    // 新建：把「选择排期」下拉复位到默认第一项（请选择课程排期，value=""）
    const scheduleSelect = document.getElementById('scheduleSelect');
    if (scheduleSelect) {
        scheduleSelect.value = "";
    }
    currentScheduleIndex = -1;
    // 新建时：结束日期默认设置为当前日期 + 30 天（本地口径）
    const endDateInput = document.getElementById("endDate");
    if (endDateInput) {
        endDateInput.value = schedShiftDate(schedLocalToday(), 30);
    }
    // 快捷「上课星期」清空：新排期不该带着上一条的星期
    document.querySelectorAll('#quickWeekday input[type="checkbox"]').forEach(function(b){ b.checked = false; });
    // 名称回到"自动建议"状态
    const nameEl = document.getElementById('scheduleName');
    if (nameEl) nameEl.setAttribute('data-auto','1');
    // 教学语言 / 课时长度：现查课程（课程又来自模板）
    await schedLoadTeachingProps(activeCourseId);
    schedSuggestName();
    const summary = document.getElementById('schedPreviewSummary');
    if (summary) summary.style.display = 'none';
   }
   
   function resetScheduleObject(){
  // 清理scheduleObject的各个字段
  // 日期/时间一律走 sched* 系列（本地口径 + 下一个整点）：
  // 原先这里是本地分量、而页面初始值用 toISOString()（UTC），两套口径并存早晚出事。
  const _today = schedLocalToday();
  scheduleObject = {
    scheduleId: "",
    name:"",
    courseId: activeCourseId,
    courseName: "",
    //teacherId: "",
    teacherName: "",
    startDate: _today,
    endDate: schedShiftDate(_today, 30),
    startTime: schedNextHour(),
    endTime: schedNextHour(),

    repeatType: 0,
    interval: 1,
    repeatDays: [],
    // 默认"已发布"：排期建出来就是要让学生能约的，
    // 原先默认 pending，用户必须再改一次状态、再存一次才生效。
    status: "active",
    timeZone:userTimeZone,
    userTimeZone:userTimeZone ,
     availableSites : (getDefaultAvailableSites() || 1),
     now_availableSites :  (getDefaultAvailableSites() || 1),
     // 教学语言 / 课时长度留空 = 跟随课程；resetSchedule() 之后会现查课程接口填上
     languageType: "",
     classDuration: null

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

   // ==================== L1/L2 排期操作简化（2026-10-25） ====================
   // 所有新增函数统一 sched 前缀：本文件是全局脚本（未包 IIFE），
   // 与其它页面脚本同名会被 JS 静默覆盖，命名空间是最好的防线。

   /** 本地时区的今天（yyyy-MM-dd）。**禁止用 toISOString()**：那是 UTC，
    *  东八区本地 00:00~07:59 会得到"昨天"，而本文件另有一处用本地分量取值，两份口径必然打架。 */
   function schedLocalToday(){ return schedLocalDateStr(new Date()); }

   function schedLocalDateStr(d){
       const y = d.getFullYear();
       const m = String(d.getMonth()+1).padStart(2,'0');
       const day = String(d.getDate()).padStart(2,'0');
       return y + '-' + m + '-' + day;
   }

   /** 下一个整点（HH:mm）。排课几乎总是整点/半点开始，取当前分钟只会让人每次手动改。 */
   function schedNextHour(){
       const d = new Date();
       d.setHours(d.getHours()+1, 0, 0, 0);
       return String(d.getHours()).padStart(2,'0') + ':00';
   }

   const SCHED_WEEK_NAME = {1:'周一',2:'周二',3:'周三',4:'周四',5:'周五',6:'周六',7:'周日'};

   /** 读 yyyy-MM-dd 的星期几（1=周一 … 7=周日）。
    *  必须按年月日分量构造：new Date('2026-10-24') 会按 UTC 解析，正好错反方向。 */
   function schedWeekdayOf(dateStr){
       if (!dateStr || String(dateStr).length < 10) return 0;
       const p = String(dateStr).split('-');
       const d = new Date(Number(p[0]), Number(p[1])-1, Number(p[2]));
       if (isNaN(d.getTime())) return 0;
       const jsDay = d.getDay();
       return jsDay === 0 ? 7 : jsDay;
   }

   /** 从 fromDateStr 起（含当天）往后找最近的星期 target，返回 yyyy-MM-dd。 */
   function schedNextWeekdayDate(fromDateStr, target){
       const p = String(fromDateStr || schedLocalToday()).split('-');
       let d = new Date(Number(p[0]), Number(p[1])-1, Number(p[2]));
       if (isNaN(d.getTime())) d = new Date();
       for (let i=0;i<7;i++){
           const jsDay = d.getDay();
           const w = (jsDay === 0) ? 7 : jsDay;
           if (w === Number(target)) return schedLocalDateStr(d);
           d = new Date(d.getFullYear(), d.getMonth(), d.getDate()+1);
       }
       return schedLocalDateStr(d);
   }

   /** 日期加减天数（本地口径）。 */
   function schedShiftDate(dateStr, days){
       if (!dateStr || String(dateStr).length < 10) return '';
       const p = String(dateStr).split('-');
       const d = new Date(Number(p[0]), Number(p[1])-1, Number(p[2]));
       if (isNaN(d.getTime())) return '';
       d.setDate(d.getDate() + Number(days||0));
       return schedLocalDateStr(d);
   }

   /** 快捷区「上课星期」当前勾了哪几天。 */
   function schedPickedWeekdays(){
       const out = [];
       document.querySelectorAll('#quickWeekday input[type="checkbox"]').forEach(function(cb){
           if (cb.checked) out.push(Number(cb.value));
       });
       return out;
   }

   /** 「上课星期」快捷区 → 驱动重复类型 / 开始日期 / 重复星期。
    *  这是 L1 里最省事的一步：先想"周几上课"，日期交给系统算。 */
   function schedQuickWeekdayChange(cb){
       const typeEl = document.getElementById('repeatType');
       if (typeEl && typeEl.value !== 'week') {
           typeEl.value = 'week';
           if (typeof onRepeatTypeChange === 'function') onRepeatTypeChange();
       }
       const picked = schedPickedWeekdays();
       const sd = document.getElementById('startDate');
       if (picked.length > 0 && sd) {
           // 开始日期取「今天（或已填的较晚日期）之后最近的被选星期」
           const today = schedLocalToday();
           const base = (sd.value && sd.value > today) ? sd.value : today;
           let best = '';
           picked.forEach(function(w){
               const cand = schedNextWeekdayDate(base, w);
               if (!best || cand < best) best = cand;
           });
           if (best) sd.value = best;
           // 真正提交的是下面那组复选框，必须同步
           document.querySelectorAll('#weekDays input[type="checkbox"]').forEach(function(b){
               b.checked = picked.indexOf(Number(b.value)) >= 0;
           });
       }
       schedSyncWeekdayFromStartDate();
       schedEnsureEndDate();
       schedSuggestName();
   }

   /** 开始日期变化 → 补星期显示；每周重复时自动勾上开始日期那天。
    *  原先不自动勾，用户设了"每周"却没勾星期，预览出来是空表，还找不到原因。 */
   function schedSyncWeekdayFromStartDate(){
       const sd = document.getElementById('startDate');
       const w = schedWeekdayOf(sd && sd.value);
       const label = document.getElementById('startDate_weekday');
       if (label) label.value = w ? SCHED_WEEK_NAME[w] : '';

       const typeEl = document.getElementById('repeatType');
       if (!typeEl || typeEl.value !== 'week' || !w) return;
       const boxes = document.querySelectorAll('#weekDays input[type="checkbox"]');
       let anyChecked = false;
       boxes.forEach(function(b){ if (b.checked) anyChecked = true; });
       // 只在"一个都没勾"时补，避免把用户已经勾好的多天覆盖成单天
       if (!anyChecked) {
           boxes.forEach(function(b){ b.checked = (Number(b.value) === w); });
       }
       schedSyncQuickFromWeekDays();
   }

   /** 重复星期 → 回填到快捷区（打开已有排期时让快捷区状态与真实数据一致）。 */
   function schedSyncQuickFromWeekDays(){
       const picked = [];
       document.querySelectorAll('#weekDays input[type="checkbox"]').forEach(function(b){
           if (b.checked) picked.push(Number(b.value));
       });
       document.querySelectorAll('#quickWeekday input[type="checkbox"]').forEach(function(b){
           b.checked = picked.indexOf(Number(b.value)) >= 0;
       });
   }

   /** 结束日期为空或早于开始日期时，补成开始日期 + 30 天。 */
   function schedEnsureEndDate(){
       const sd = document.getElementById('startDate');
       const ed = document.getElementById('endDate');
       if (!sd || !ed || !sd.value) return;
       if (!ed.value || ed.value < sd.value) {
           ed.value = schedShiftDate(sd.value, 30);
       }
       const label = document.getElementById('endDate_weekday');
       if (label) {
           const w = schedWeekdayOf(ed.value);
           label.value = w ? SCHED_WEEK_NAME[w] : '';
       }
   }

   /** 用户手改过名称就停掉自动建议，别把人家起的名字改回去。 */
   function schedMarkNameManual(){
       const el = document.getElementById('scheduleName');
       if (el) el.setAttribute('data-auto','0');
   }

   /** 建议排期名称：课程名 · 周三 19:00。仅在名称仍是自动值时覆盖。 */
   function schedSuggestName(){
       const el = document.getElementById('scheduleName');
       if (!el || el.getAttribute('data-auto') !== '1') return;
       const sd = document.getElementById('startDate');
       const st = document.getElementById('startTime');
       const w = schedWeekdayOf(sd && sd.value);
       const sel = document.getElementById('courseSelect');
       let courseName = '';
       if (sel && sel.value) {
           const opt = sel.options[sel.selectedIndex];
           courseName = opt ? String(opt.innerText || '').trim() : '';
       }
       const parts = [];
       if (courseName) parts.push(courseName);
       if (w) parts.push(SCHED_WEEK_NAME[w]);
       if (st && st.value) parts.push(st.value);
       el.value = parts.join(' · ');
   }

   /** 读课时长度输入框：空 → null（表示跟随课程）。 */
   function schedReadDuration(){
       const el = document.getElementById('schedClassDuration');
       if (!el || el.value === '') return null;
       const n = Number(el.value);
       return (isNaN(n) || n <= 0) ? null : n;
   }

   /** 拉取课程的教学语言 / 课时长度 / 课程形式，填入排期表单。
    *  为什么不从课程下拉的 data 属性取：下拉可能来自几分钟前的检索结果，
    *  课时长度一旦是旧值，保存排期就会把冲突检查用的时长写错。这里按 courseId 现查。 */
   async function schedLoadTeachingProps(cid){
       const langEl = document.getElementById('schedLanguageType');
       const durEl  = document.getElementById('schedClassDuration');
       if (!langEl && !durEl) return;
       if (!cid) {
           if (langEl) langEl.value = '';
           if (durEl)  durEl.value  = '';
           return;
       }
       try {
           const props = await request({ url: `/course/teachingProps?courseId=${encodeURIComponent(cid)}` });
           if (langEl) langEl.value = (props && props.languageType) ? props.languageType : '';
           if (durEl)  durEl.value  = (props && props.classDuration) ? props.classDuration : '';
       } catch (e) {
           if (langEl) langEl.value = '';
           if (durEl)  durEl.value  = '';
       }
   }

   /** 内联预览摘要（替代"预览后自动跳 Tab"）。 */
   function schedRenderPreviewSummary(){
       const box = document.getElementById('schedPreviewSummary');
       if (!box) return;
       const list = Array.isArray(scheduleResult) ? scheduleResult : [];
       box.style.display = 'block';
       if (list.length === 0) {
           box.style.background = '#fff1f0';
           box.style.borderColor = '#ffa39e';
           box.style.color = '#cf1322';
           box.innerHTML = '<i class="fa fa-exclamation-circle"></i> 按当前设置展开后没有任何课次，请检查开始/结束日期与重复星期。';
           return;
       }
       const head = list.slice(0, 3).map(function(x){ return x.date + ' ' + x.time; }).join('　');
       const more = list.length > 3 ? ('　… 共 ' + list.length + ' 个课次') : '';
       box.style.background = '#f6ffed';
       box.style.borderColor = '#b7eb8f';
       box.style.color = '#237804';
       box.innerHTML = '<i class="fa fa-check-circle"></i> 已生成 <b>' + list.length + '</b> 个课次：' + head + more;
   }

   // ---------------- L2：复制 / 批量 ----------------

   /** 用一条已有排期拼出「新建」用的 DTO（scheduleId 清空 = 走 create）。 */
   function schedBuildDtoFromSchedule(src, overrides){
       const o = overrides || {};
       const rt = (typeof src.repeatType === 'number') ? src.repeatType : Number(src.repeatType || 0);
       return {
           scheduleId: '',
           courseId: src.courseId || activeCourseId || '',
           startDate: o.startDate || src.startDate || '',
           startTime: src.startTime || '',
           endDate: o.endDate || src.endDate || '',
           endTime: src.endTime || src.startTime || '',
           repeatType: isNaN(rt) ? 0 : rt,
           repeatInterval: src.repeatInterval || src.interval || 1,
           repeatDays: Array.isArray(src.repeatDays) ? src.repeatDays.slice() : [],
           timeZone: src.timeZone || userTimeZone,
           availableSites: src.availableSites || 1,
           status: src.status || 'active',
           name: src.name || '',
           languageType: src.languageType || '',
           classDuration: src.classDuration || null
       };
   }

   /** 单条落库：先查冲突，再创建。返回 true/false，供批量循环汇总。 */
   async function schedPersistOne(dto, label){
       try {
           const conflicts = await checkScheduleConflict(dto);
           if (Array.isArray(conflicts) && conflicts.length > 0) {
               const names = conflicts.map(function(x){
                   return (x && typeof x === 'object' && x.name) ? x.name : String(x);
               }).join('，');
               toast(label + ' 时间冲突，已跳过（与：' + names + '）', false);
               return false;
           }
           const res = await saveScheduleToServer(false, dto);
           if (res && (res.Id || res.id)) {
               toast(label + ' 创建成功', true);
               return true;
           }
           toast(label + ' 创建失败', false);
           return false;
       } catch (e) {
           toast(label + ' 创建异常：' + (e && e.message ? e.message : e), false);
           return false;
       }
   }

   /** 复制当前选中的排期，起止日期各 +7 天。 */
   async function schedCopyCurrentSchedule(){
       if (!scheduleObject || !scheduleObject.scheduleId) {
           toast('请先在下拉里选中一条排期，再点复制', false);
           return;
       }
       if (!activeCourseId) { toast('请先选择课程', false); return; }
       const src = scheduleObject;
       if (!src.startDate) { toast('该排期没有开始日期，无法复制', false); return; }
       const newStart = schedShiftDate(String(src.startDate), 7);
       const newEnd = src.endDate ? schedShiftDate(String(src.endDate), 7) : newStart;
       const msg = '将复制排期「' + (src.name || '(未命名)') + '」为新的排期：\n\n'
                 + '开始：' + src.startDate + ' → ' + newStart + '\n'
                 + '结束：' + (src.endDate || '—') + ' → ' + newEnd + '\n\n确定继续？';
       if (!confirm(msg)) return;
       const dto = schedBuildDtoFromSchedule(src, { startDate: newStart, endDate: newEnd });
       if (await schedPersistOne(dto, '复制 → ' + newStart)) {
           await loadSchedule();
       }
   }

   /** 把该课程「上周（今天-7 ~ 今天-1）起排」的排期各顺延 7 天，批量新建。 */
   async function schedCopyFromLastWeek(){
       if (!activeCourseId) { toast('请先选择课程', false); return; }
       if (!Array.isArray(scheduleList) || scheduleList.length === 0) {
           toast('该课程还没有任何排期，无法"从上周复制"', false);
           return;
       }
       const today = schedLocalToday();
       const from = schedShiftDate(today, -7);
       const to   = schedShiftDate(today, -1);
       const existStarts = {};
       scheduleList.forEach(function(s){ if (s && s.startDate) existStarts[String(s.startDate)] = true; });

       const candidates = scheduleList.filter(function(s){
           const sd = String((s && s.startDate) || '');
           if (!sd || sd < from || sd > to) return false;
           // 已删除（frozen）的排期不参与复制：用户明确删过的东西不该被复制回来
           if (String((s && s.status) || '') === 'frozen') return false;
           return true;
       });
       if (candidates.length === 0) {
           toast('上周（' + from + ' ~ ' + to + '）没有可复制的排期', false);
           return;
       }
       // 目标起始日已有排期的跳过：这个按钮点两次不该造出一堆重复排期
       const toCreate = candidates.filter(function(s){
           const target = schedShiftDate(String(s.startDate), 7);
           return !existStarts[target];
       });
       const skipped = candidates.length - toCreate.length;
       if (toCreate.length === 0) {
           toast('上周 ' + candidates.length + ' 条排期的下一周都已有排期，无需复制', false);
           return;
       }
       const msg = '将上周（' + from + ' ~ ' + to + '）的 ' + toCreate.length + ' 条排期各顺延 7 天新建'
                 + (skipped ? ('（另有 ' + skipped + ' 条因目标日期已有排期而跳过）') : '')
                 + '。\n\n注意：若某条排期本身是"一条规则重复多周"，复制的是这条规则（日期+7），不是拆开的课次。\n\n确定继续？';
       if (!confirm(msg)) return;

       let ok = 0, fail = 0;
       for (let i = 0; i < toCreate.length; i++) {
           const src = toCreate[i];
           const dto = schedBuildDtoFromSchedule(src, {
               startDate: schedShiftDate(String(src.startDate), 7),
               endDate: src.endDate ? schedShiftDate(String(src.endDate), 7) : ''
           });
           if (await schedPersistOne(dto, '顺延 ' + dto.startDate)) ok++; else fail++;
       }
       toast('复制完成：成功 ' + ok + ' 条' + (fail ? ('，失败/跳过 ' + fail + ' 条') : ''), ok > 0);
       await loadSchedule();
   }

   /** 批量时段弹窗：一次填多行（星期 + 时间 + 员额），串行创建。 */
   function schedOpenBatchSlots(){
       if (!activeCourseId) { toast('请先选择课程', false); return; }
       let mask = document.getElementById('schedBatchMask');
       if (!mask) {
           mask = document.createElement('div');
           mask.id = 'schedBatchMask';
           mask.className = 'modal-mask';
           mask.style.display = 'flex';
           mask.innerHTML =
               '<div class="modal-box" style="max-width:720px;">'
             + '  <div class="modal-title">批量时段'
             + '    <span class="modal-close" onclick="schedCloseBatchSlots()"><i class="fa fa-times"></i></span>'
             + '  </div>'
             + '  <div class="modal-body">'
             + '    <div style="color:#8c8c8c;font-size:12px;margin-bottom:10px;">每行生成一条「每周重复」的排期：星期由行内选择，开始日期自动取「当前开始日期之后最近的该星期」。教学语言 / 课时长度沿用上方表单。</div>'
             + '    <div id="schedBatchRows"></div>'
             + '    <button class="btn btn-default" onclick="schedAddBatchRow()" style="margin-top:6px;"><i class="fa fa-plus"></i> 再加一行</button>'
             + '  </div>'
             + '  <div class="modal-foot">'
             + '    <button class="btn" onclick="schedCloseBatchSlots()">取消</button>'
             + '    <button class="btn btn-primary" onclick="schedSubmitBatch()"><i class="fa fa-save"></i> 批量创建</button>'
             + '  </div>'
             + '</div>';
           document.body.appendChild(mask);
       }
       mask.style.display = 'flex';
       const body = document.getElementById('schedBatchRows');
       if (body && body.children.length === 0) {
           schedAddBatchRow(); schedAddBatchRow(); schedAddBatchRow();
       }
   }

   function schedCloseBatchSlots(){
       const mask = document.getElementById('schedBatchMask');
       if (mask) mask.style.display = 'none';
   }

   function schedAddBatchRow(){
       const body = document.getElementById('schedBatchRows');
       if (!body) return;
       const row = document.createElement('div');
       row.className = 'sched-batch-row';
       row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:8px;';
       const opts = Object.keys(SCHED_WEEK_NAME).map(function(k){
           return '<option value="' + k + '">' + SCHED_WEEK_NAME[k] + '</option>';
       }).join('');
       const st = (document.getElementById('startTime') || {}).value || '19:00';
       const sites = (document.getElementById('availableSites') || {}).value || 1;
       row.innerHTML =
           '<select class="batch-weekday" style="flex:0 0 110px;">' + opts + '</select>'
         + '<input type="time" class="batch-time" value="' + st + '" style="flex:0 0 130px;">'
         + '<input type="number" class="batch-sites" min="1" value="' + sites + '" style="flex:0 0 90px;" title="员额">'
         + '<button class="btn btn-default" onclick="this.parentNode.remove()"><i class="fa fa-times"></i></button>';
       body.appendChild(row);
   }

   async function schedSubmitBatch(){
       if (!activeCourseId) { toast('请先选择课程', false); return; }
       const rows = document.querySelectorAll('#schedBatchRows .sched-batch-row');
       if (!rows.length) { toast('请至少填一行', false); return; }
       const today = schedLocalToday();
       const startDate = ((document.getElementById('startDate') || {}).value) || today;
       const formEnd   = ((document.getElementById('endDate') || {}).value) || '';
       const lang = ((document.getElementById('schedLanguageType') || {}).value) || '';
       const dur  = schedReadDuration();
       const status = ((document.getElementById('status') || {}).value) || 'active';
       const tz = ((document.getElementById('timeZone') || {}).value) || userTimeZone;
       const sel = document.getElementById('courseSelect');
       let courseName = '';
       if (sel && sel.value) {
           const opt = sel.options[sel.selectedIndex];
           courseName = opt ? String(opt.innerText || '').trim() : '';
       }

       const lines = [];
       rows.forEach(function(r){
           const w = Number((r.querySelector('.batch-weekday') || {}).value || 0);
           const t = (r.querySelector('.batch-time') || {}).value || '';
           const sites = Number((r.querySelector('.batch-sites') || {}).value || 1);
           if (w && t) lines.push({ w: w, t: t, sites: sites });
       });
       if (!lines.length) { toast('没有有效行（需星期 + 时间）', false); return; }
       if (!confirm('将创建 ' + lines.length + ' 条排期，确定继续？')) return;

       let ok = 0, fail = 0;
       for (let i = 0; i < lines.length; i++) {
           const line = lines[i];
           const sd = schedNextWeekdayDate(startDate, line.w);
           const dto = {
               scheduleId: '',
               courseId: activeCourseId,
               startDate: sd,
               startTime: line.t,
               endDate: (formEnd && formEnd >= sd) ? formEnd : schedShiftDate(sd, 90),
               endTime: line.t,
               repeatType: 2,          // 2 = 每周
               repeatInterval: 1,
               repeatDays: [line.w],
               timeZone: tz,
               availableSites: line.sites,
               status: status,
               name: (courseName ? (courseName + ' · ') : '') + SCHED_WEEK_NAME[line.w] + ' ' + line.t,
               languageType: lang,
               classDuration: dur
           };
           if (await schedPersistOne(dto, SCHED_WEEK_NAME[line.w] + ' ' + line.t)) ok++; else fail++;
       }
       toast('批量创建完成：成功 ' + ok + ' 条' + (fail ? ('，失败/跳过 ' + fail + ' 条') : ''), ok > 0);
       schedCloseBatchSlots();
       await loadSchedule();
   }

   // 可用席位数显示：满额(<=0)时显示“约满”，并在 data-value 保留原始数值供逻辑读取
   function setNowAvailableSitesDisplay(n) {
       const el = document.getElementById('now_availableSites');
       if (!el) return;
       const num = Number(n) || 0;
       el.setAttribute('data-value', String(num));
       if (num <= 0) {
           el.value = '满额';
           el.style.color = '#C0392B';
           el.style.fontWeight = '600';
       } else {
           el.value = String(num);
           el.style.color = '';
           el.style.fontWeight = '';
       }
   }
   // 读取真实剩余座位数（满额时返回 0，而非“约满”文本）
   function getNowAvailableSitesRaw() {
       const el = document.getElementById('now_availableSites');
       if (!el) return 0;
       const raw = el.getAttribute('data-value');
       return raw === null ? (Number(el.value) || 0) : (Number(raw) || 0);
   }

   
   
// 统一刷新用户时区预览（避免在多处复制判断逻辑；即使内部未勾选开关也会自动清空残留旧值）
function refreshUserTzPreview() {
    try {
        if (typeof getTestDatetime === 'function')    getTestDatetime();
        if (typeof getTestEndDatetime === 'function') getTestEndDatetime();
    } catch (e) { console.error("[refreshUserTzPreview] error:", e); }
}

  //当排期列表选择变化时，检查参数，重新显示排期计划
   async function displySchedule() {
    // 先做一次兜底刷新：无论后续是否 early return，都避免左侧选择变化后右侧还显示上次切走残留的值
    refreshUserTzPreview();

    if(! checkCourseAndSchedule(true,true)) { hideWaitlistPanel(); return; }

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

   if (!selectedId) { hideWaitlistPanel(); return; }
   currentScheduleId = selectedId;

   // 在 scheduleList 中查找对应的排期对象
   const selectedSchedule = scheduleList.find(s => String(s.scheduleId) === String(selectedId));
   if (selectedSchedule) {
       scheduleObject = selectedSchedule;
   } else {
       resetScheduleObject();
   }
    if (typeof renderSchedule === 'function') {
        // 必须 await：renderSchedule 内部要查后端算已预订数，
        // 不 await 就去读 now_availableSites，读到的还是上一排期的残值
        // （候补面板会据此判断“是否还有空位”，读残值就会给出错误的可递补状态）
        await renderSchedule(); // renderSchedule 内部已在末尾兜底调用 refreshUserTzPreview
    } else {
        // renderSchedule 不可用时，仍然按兜底逻辑刷新一次
        refreshUserTzPreview();
    }

    // 候补队列与「剩余席位」必须同源同一时刻：上面 await 之后再渲染
    await renderWaitlistPanel(selectedId);
   }
  //读取排期个字段的输入/选择值
   function  getFormData(){
    const form = {
        name: document.getElementById('scheduleName').value,
        courseId: activeCourseId,
        availableSites: document.getElementById('availableSites').value,

        scheduleId: scheduleObject.scheduleId,
        startDate: document.getElementById('startDate').value,
        startTime: document.getElementById('startTime').value,
        repeatType: document.getElementById('repeatType').value,
        interval: document.getElementById('interval').value,
        status:  document.getElementById('status').value,
        timeZone: document.getElementById('timeZone').value, //保持原始时区---排期的时区
        userTimeZone:userTimeZone, //输出时间的时区
        // 教学语言 / 课时长度：空值一律给空串/null，让后端回落"课程 → 默认"，
        // 不要在这里填 60，否则"跟随课程"这个语义就没了
        languageType: (function(){
            const el = document.getElementById('schedLanguageType');
            return el ? String(el.value || '').trim() : '';
        })(),
        classDuration: schedReadDuration(),
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
                let arr = [];
                weekDayInputs.forEach(cb => { 
                    if (cb.checked) arr.push(Number(cb.value));
                });
                return arr;
            } else {
                return [];
            }
        })(),
        endDate: document.getElementById('endDate').value  
    }; 
    
    return form;
   }
   
   // 预览排期--列出排期的所有时间及日历
   async function previewSchedule() {
     if(! checkCourseAndSchedule(false,true))
       return ; //对于新建排期，不需要检查scheduleID
     const form = getFormData();
    // 生成排期列表 localDateTime List<Date,TIME>
     scheduleResult = await generateScheduleListFromServer(form);
     if(resultCalendarElem)  {
        resultCalendarElem.hidden = false;
       }
       if(resultBodyElem) {
          resultBodyElem.hidden = false;
       }
    renderResult();
    renderCalendar();
    // L1：不再自动切到「排期结果」Tab。来回切 Tab 是整条流程里最影响手感的一步，
    // 摘要内联在表单下方，要看完整列表点「看完整结果」。
    schedRenderPreviewSummary();
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
    toast("请选择课程！");
    return;
    }
    //判断结束日期不能早于开始日期
    if (formData.endDate < formData.startDate) {
      toast("结束日期不能早于开始日期！");
      return;
    }
  
    let createdto = toScheduleCreateDto(formData);      

    // 并入保存：保存前自动查冲突，有冲突则内联提示并阻止保存
    const conflictMsgEl = document.getElementById('conflictMessage');
    if (conflictMsgEl) conflictMsgEl.textContent = '正在检查冲突…';
    const conflictList = await checkScheduleConflict(createdto);
    if (!conflictList) {
        toast('检测排期冲突时发生错误！', false);
        return;
    }
    if (Array.isArray(conflictList) && conflictList.length > 0) {
        let cmsg = '与以下排期存在冲突：';
        conflictList.forEach(function(item){
            if (typeof item === 'object' && item.name) cmsg += item.name + '，';
            else if (typeof item === 'string') cmsg += item + '，';
            else cmsg += JSON.stringify(item) + '，';
        });
        cmsg = cmsg.replace(/，\s*$/, '');
        if (conflictMsgEl) { conflictMsgEl.style.color = 'red'; conflictMsgEl.textContent = cmsg; }
        toast('存在排期冲突，已阻止保存，请先处理。', false);
        return;
    } else if (conflictMsgEl) {
        conflictMsgEl.style.color = 'green';
        conflictMsgEl.textContent = '该排期没有时间冲突。';
    }

    let bExists = formData.scheduleId && formData.scheduleId !== "";
// 返回当前或新增的schedule的id
    let result = await saveScheduleToServer(bExists , createdto);
       // 4.  响应处理 响应成功/失败 result.data.id = new id 
         
        if ((typeof result === "undefined") || result == null) { 
            toast(bExists ? '编辑失败' : '新增失败', false); 
        }else {
            currentScheduleId = result.Id;
            toast(bExists ? '编辑成功' : '新增成功', true); 
        } 
}

async function assignStudentToSchedule( ) {
     
    if(! checkCourseAndSchedule(true,true))
        {  
            toast("请选择有效的课程和排期！");
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
        toast("请选择学生！");
        return;
      }
   
       
        const ret = await assignStudentToTheSchedule(scdid,assignStudentId,teacherId);
        if ( ret  ) {
            toast("学生成功分配排期的课程并完成预约！", true);
            // 可选：刷新界面或数据 
        } else {
            toast("学生分配排期失败: " + "请检查后端接口与数据。");
        }  
        return ;
}

/* P2-B：指定学生改为 modal 弹窗交互；核心分配逻辑仍由 assignStudentToSchedule() 复用 */
async function openAssignStudentModal() {
  if (!checkCourseAndSchedule(true, true)) { toast("请先选择有效的课程和排期！"); return; }
  if (typeof switchTab === 'function') switchTab('tab-advanced');
  const m = document.getElementById('assignStudentModal');
  if (m) m.style.display = 'flex';
}
function closeAssignStudentModal() {
  const m = document.getElementById('assignStudentModal');
  if (m) m.style.display = 'none';
}
async function confirmAssignStudent() {
  const sel = document.getElementById('assignStudentSelect');
  if (!sel || !sel.value) { toast("请选择学生！"); return; }
  await assignStudentToSchedule();
  closeAssignStudentModal();
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
         if (Array.isArray(res)) {
          for (const booking of res) {
              if (booking && booking.id) {
                await  operateBookingStatus(  booking.id,'frozen');
                   // 更新本地对象的状态
              //  booking.status = 'frozen';
              }
          }
      }

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
   (async function(){
       // 注意：checkScheduleConflict 应当是 async，返回 {code, message, data}
       let clist = await checkScheduleConflict(createdto);
       if (!clist) {
          toast("检测排期冲突时发生错误！", false);
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
          // toast(msg);
           if (conflictMessageElem) {  
            // 把msg中的首尾的字符@@去掉，把中间的@@更换为逗号
            msg = msg.replace(/^@@|@@$/g, ''); // 去除首尾@@
            msg = msg.replace(/@@/g, '，');    // 替换中间的@@为逗号
 

            conflictMessageElem.style.color = 'red';
            conflictMessageElem.textContent = msg; 
         }
       } else {
          // toast("该排期与该课程的其它排期没有冲突。");
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

/**
 * 隐藏 DIV 元素但仍可通过 JS 访问其内容/属性的常用方法：
 * 1. 使用 style="display:none" —— DIV 不可见且不占位，但仍保留在 DOM，可通过 JS 读写 innerText/innerHTML 等。
 * 2. 使用 style="visibility:hidden" —— DIV 不可见但仍占位，也可被 JS 正常访问内容。
 * 3. 用页面外定位：如 style="position:absolute; left:-9999px;"，视觉上不可见但依然在 DOM，也可聚焦/访问内容。
 * 4. 用 aria-hidden="true" 属性 —— 仅影响无障碍，不影响 JS 获取内容。
 * 5. 用 CSS 类控制显示：通过添加/删除特定类名来控制元素的显示状态。
 * 结论：只要元素还在DOM树中，display:none不会影响JS用value/innerText等API访问或修改其内容。
 * */