 //预约管理--预约结果详情--页面-用于学生和教师
  //展示本人的所有预约列表，提供预约详情---展示排期列表（使用“取消预约”操作）
   // student-course-appointment.js   StudentBookingBrowserCards.js
// 区别于booking页面，booking页面负责查询课程、检查排期，以便预约1个课程，
//本页面，浏览预约结果和具体时间列表
 //console .log("student appointment  page");
// ===================== 核心函数 ===================== 
/**
 *  课程预约列表（核心：原生JS操作DOM）
 * 对于学生， 显示本人预定的课程，详情显示预约排期，可设置取消课次、取消课次
 * TBD：分析与admin-booking差别，服是否可以复用，分页显示
 */
// 引入分页组件js
document.write('<script src="/js/public/pagefoot.js"></script>');
 
//  div默认就是上下排列，如果用flex布局也可通过设置flex-direction: column实现。

async function renderStudentBookingBrowserCards() {

    assignLoadobjectListFunction( loadAndRenderBooking_student);// assign

    const dynamicContentCenter = document.getElementById('dynamic-content-center');
    if (!dynamicContentCenter) return; 
        // 渲染HTML
    let html = '';
     
    html += `       
    <div class="card">
             ` 
    html += `    
         <div class="card-header">
         <div>
            <div class="card-title"><i class="fa fa-calendar-alt"></i>预订列表</div>
      <!-- 筛选条件 -->
              <div class="filter-bar">  
                <div class="filter-item" >
                  <label><span data-term="course">课程</span>名称：</label>
                  <input type="text" id="course-name-input" placeholder="课程名称">
                </div>
                        
                <div class="filter-item">
                  <label>状态：</label>
                  <select id="booking-status-select">
                    <option value="">全部</option>
                    <option value="booking">预定待确认</option>
                    <!-- status=waiting（候补预订）：名额已满时的候补申请，与 appointment 的状态机无关 -->
                    <option value="waiting">候补</option>
                    <option value="cancelling">取消待确认</option>
                    <option value="booked">预定已确认</option>
                    <option value="cancelled">已取消</option>
                    <option value="delete">已删除</option> 
                  </select>
                </div> 
                <button class="btn btn-default" onclick="localsearchAppoint_student()">
                  <i class="fa fa-search"></i> 搜索
                </button>
                <button class="btn btn-default" onclick="resetFilterAppoint_student()">
                  <i class="fa fa-redo"></i> 重置
                </button>
              </div> 
           </div>
         </div>
    <!-- 预约状态显示和选择 -->            
              <div id="my-bookings">
       
              </div>   
        `  ;

   html += getPagebar();
   html += ` </div> ` 

   html+=`   <!-- 排期结果（卡片标题）/ 日历视图：同一份 scheduleResult 的两种视图，用 card 内 tab 切换（方案Y） -->
    <div class="card">
        <div class="card-title" style="margin-bottom:8px;"><i class="fa fa-calendar-alt"></i> 排期结果</div>
        <style>
          .student-button-bar{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 10px;align-items:center;}
          .student-button-bar .student-bar-label{color:#888;font-size:13px;margin-right:4px;}
          .student-button-bar .student-btn{padding:4px 10px;border:1px solid #d0d0d0;background:#fff;border-radius:14px;cursor:pointer;font-size:13px;}
          .student-button-bar .student-btn:hover,.student-button-bar .student-btn.active{background:#f2f6ff;border-color:#7aa2ff;color:#1f3a8a;font-weight:600;}
          .student-apt-detail{margin-top:10px;padding:10px 12px;border:1px dashed #d0d0d0;border-radius:6px;background:#fafbff;}
          .student-apt-title{font-weight:600;margin-bottom:6px;}
          .student-apt-empty{color:#999;}
          .student-apt-table{width:100%;border-collapse:collapse;margin-top:4px;}
          .student-apt-table th,.student-apt-table td{border:1px solid #e6e6e6;padding:4px 8px;text-align:left;font-size:13px;}
          .student-apt-table th{background:#f3f5f9;}
        </style>
        <div class="student-button-bar" id="studentButtonBar"><span class="student-bar-label">学员课次：</span></div>
        <div class="result-tabs">
            <button type="button" class="result-tab active" data-tab="list" onclick="switchResultTab('list')">日期列表</button>
            <button type="button" class="result-tab" data-tab="calendar" onclick="switchResultTab('calendar')">日历视图</button>
        </div>
        <div class="result-panel" id="resultPanelList">
        <table>
            <thead>
                <tr>
                    <th>课次</th>
                    <th>日期</th>
                    <th>时间</th>
                      <th>状态</th> 
                      <th><span data-term="leave">取消课次</span></th>
                </tr>
            </thead>
            <tbody id="resultBody"></tbody>
        </table>
        </div>

        <div class="result-panel" id="resultPanelCalendar" style="display:none;">
        <div id="calendar" class="calendar"></div>
        </div>
        <div class="student-apt-detail" id="studentAptDetail" style="display:none;"></div>
    </div>`;
    
    dynamicContentCenter.innerHTML = html; 
    applyTerms(dynamicContentCenter);
    loadAndRenderBooking_student();   
    } 


//按照条件，按页加载预定数据，called by admin、student/techer
async function loadAndRenderBooking_student(){
    //search current pendding booking items ,and dispaly here /pendingBooking   
    // let  userInfo= getCurrentUserInfo();
    // let userId = userInfo.userId;
    // let userRole = userInfo.userRole; 
     const params = {
       pageNum: Pagination.pageNum,
       pageSize: Pagination.pageSize,
       // 可预留 future 参数，比如 userRole, status 等，如有需要可加上
       userId:   userId,
       userRole: userRole,    
       courseName:     document.getElementById('course-name-input').value.trim(),//TBD      
       status: document.getElementById('booking-status-select').value  
  
     };
     if(userRole== "admin") {
      params.userId   = null;
      params.userRole = null ;
    }
    //console.error("page:",params);
     let result = await getBookingListPage( params);
    
     if(result){
         const pageData = result;  
         Pagination.total = pageData.total ;
         Pagination.totalPages = pageData.totalPages;           
         renderBooking_student( pageData.rows); 
        // 渲染分页栏,带入分页参数
        renderPagination( Pagination);    
     }  else {
        Pagination.total = 0;
        Pagination.totalPages = 0;      
        renderBooking_student( null); 
        renderPagination( Pagination);          
    } 
}
 async function renderBooking_student( bookingList){

     let bookingsHtml = "";
     var index=(Pagination.pageNum-1)*Pagination.pageSize;//记录序号

     // teacher 端“预订管理”：按 scheduleId 聚合，同一排期只展示一张卡片，学员名拼成字符串
     let renderRows = bookingList;
     if (userRole === 'teacher' && Array.isArray(bookingList)) {
       const groups = new Map();
       for (const b of bookingList) {
         if (!b || !b.scheduleId) continue;
         if (!groups.has(b.scheduleId)) groups.set(b.scheduleId, []);
         groups.get(b.scheduleId).push(b);
       }
     renderRows = [];
     for (const items of groups.values()) {
       const rep = Object.assign({}, items[0]);
       // 保持 studentId 与 bookingId 的「成对对齐」：先成对收集再各自取出，
       // 避免分别 .filter(Boolean) 后下标错位（极端情况下某条缺字段会导致学员名/bookingId 错配）。
       const pairs = items
         .map(it => ({ studentId: it.studentId, bookingId: it.bookingId || it.id }))
         .filter(s => s.studentId && s.bookingId);
       rep.__groupStudents = pairs;                                  // [{studentId, bookingId}]
       rep.__groupStudentIds = pairs.map(s => s.studentId);
       rep.__groupBookingIds = pairs.map(s => s.bookingId);
       renderRows.push(rep);
     }
     }

     if (Array.isArray(renderRows)) {
         // 用for...of+await，等待所有异步操作完成
         for (let booking of renderRows) {
            index ++ ;

             const scheduleObject = await fetchSchedule(booking.scheduleId);

             if (scheduleObject != null) {
                 let scheduleInfoStr = getScheduleInfo(scheduleObject);
                 const classObject = await getCourseById(scheduleObject.courseId);

                 const teacherName= await getUserNameById(classObject.teacherId);
                 if (classObject != null) {
                    if (booking.__groupStudentIds) {
                        // 聚合卡片：解析组内所有学员名，拼成字符串；同时按「学员」维度成对 zip
                        // 出 {studentId, studentName, bookingId}，供「查看排期」后按学员下钻看课次状态。
                        const names = [];
                        const students = [];
                        for (const s of (booking.__groupStudents || [])) {
                            const nm = await getUserNameById(s.studentId);
                            if (nm) {
                                names.push(nm);
                                students.push({ studentId: s.studentId, studentName: nm, bookingId: s.bookingId });
                            }
                        }
                        const scheduleStatusStr =
                            scheduleObject.status === 'pending' ? '待发布' :
                            scheduleObject.status === 'active' ? '已发布' :
                            scheduleObject.status === 'inactive' ? '已收回' :
                            scheduleObject.status === 'frozen' ? '已删除' :
                            (scheduleObject.status || '未知');
                       let cardItems = {
                            index: index,
                            scheduleId:    scheduleObject.scheduleId,
                            origTz:        scheduleObject.timeZone,
                            className:     classObject.courseName,
                            teacherName:   teacherName,
                            studentNames:  names,
                            students:      students,
                            bookingIds:    booking.__groupBookingIds || [],
                            scheduleInfo:  scheduleInfoStr,
                            scheduleStatus:scheduleStatusStr
                        };
                         bookingsHtml += formScheduleGroupCard(cardItems);
                     } else {
                         const studentName = await getUserNameById(booking.studentId);
                         let cardItems = {
                             index: index,
                             scheduleId:    scheduleObject.scheduleId,
                             origTz:        scheduleObject.timeZone,
                             // 后端实体 Booking 的主键字段是 bookingId（@TableId），**没有 id**；
                             // 分页接口 /course/booking/page 返回的行也是 bookingId。原写 booking.id 恒为 undefined，
                             // 会让卡片上的「撤销 / 申请取消 / 重新申请 / 撤销候补」都带着字符串 "undefined" 提交
                             //（后端 updateStatus 按 id 更新，查不到就静默无事发生，页面看不到报错）。
                             bookingId:     booking.bookingId || booking.id || '',
                             className:     classObject.courseName,
                             teacherName:   teacherName,
                             studentName:   studentName,
                             scheduleInfo:  scheduleInfoStr,
                             status:        booking.status
                         };
                         bookingsHtml += formACourseCard(cardItems);
                     }
                 }
             }
         }
     }

     // 只有在全部异步处理后再输出和渲染
     let bookingContainer = document.getElementById("my-bookings");
     if (bookingContainer) {
         bookingContainer.innerHTML = `<div class="bookings-list">${bookingsHtml}</div>`;
     }
 }
 /*
 async function  testGetList(courseId){
    const conditionJson = { 
        courseId:courseId,
      teacherId:"",
      templateId:"",
      status:"" 
    };
   const rlist = await fetchCourseList(conditionJson);
   const one = await getCourseById(courseId);
   }
 */
   /*cardInfo的数据形式：
     cardContent ={
    bookingId:"",
    className:"",
    teacherName:"",
    scheduleInfo:"",
    status:""
   }*/
     /**
      * 生成课程卡片的HTML字符串
      * @param {Object} cardInfo - 课程卡片数据对象
      * 语法分析：
      * - function formACourseCard(cardInfo){}：声明一个函数，参数是cardInfo对象。
      * - 内部用模板字符串``拼接HTML，插值用${}的方式，安全前提是数据已消毒，涉及属性有cardInfo.className等。
      * - .course-card等类用于样式分块，结构内嵌various div用于分组信息、按钮区域。
      * - “取消预约”与“查看详情”按钮的点击事件调用window作用域下函数，参数是cardInfo.bookingId，直接插值。
      * - 最终返回拼接好的HTML字符串，并通过console输出调试信息。
      */
     function formACourseCard(cardInfo) {

         const info = `
             <div class="course-card">
                 <div class="course-info">
                     <h4>${cardInfo.index} ${cardInfo.className} </h4>
                     <p>教师：${cardInfo.teacherName} | 学生：${cardInfo.studentName} | 预约时间：${cardInfo.scheduleInfo} | 状态：${
                        {
                            none: "无预约",
                            booking: "已预约,待确认",
                            waiting: "候补",
                            booked: "预约成功",
                            cancelling: "取消待确认",
                            cancelled: "已取消",
                            canceling: "取消待确认",
                            canceled: "已取消",
                            completed: "已完成"
                        }[cardInfo.status] || cardInfo.status
                     }</p>
                
                 </div>
                 <div class="course-actions">
                     ${
                        userRole === 'student' && cardInfo.status === 'booking'
                          ? `<button class="btn btn-gray" onclick="actionForButton('${cardInfo.bookingId}','none')">撤销</button>`
                          : userRole === 'student' && cardInfo.status === 'waiting'
                          // 候补：学生只能撤销候补（置为已取消）。候补转正由管理员在预订列表点「确认候补」，
                          // 学生侧不提供"直接确认"入口，避免绕过名额校验。
                          ? `<button class="btn btn-gray" onclick="actionForButton('${cardInfo.bookingId}','cancelled')">撤销候补</button>`
                          : userRole === 'student' && cardInfo.status === 'booked'
                          ? `<button class="btn btn-gray" onclick="actionForButton('${cardInfo.bookingId}','cancelling')">取消预约</button>`
                          : userRole === 'student' && (cardInfo.status === 'canceling' || cardInfo.status === 'cancelling')
                          ? `<button class="btn btn-gray" onclick="actionForButton('${cardInfo.bookingId}','booked')">撤销</button>`
                          : userRole === 'student' && (cardInfo.status === 'canceled' ||  cardInfo.status === 'cancelled' )
                          ? `<button class="btn btn-gray" onclick="actionForButton('${cardInfo.bookingId}','booking')">重新申请</button>`
                          : ''
                     }

                 ${ //正在预约或者已经取消：显示计算的排期列表，否则显示排期表中的数据
                     // 候补（waiting）也列入"不显示详情"：它还没有 appointment 行，
                     // 点详情必然是空表 —— 空面板比没有按钮更让人困惑。
                     ( cardInfo.status === 'booking' || cardInfo.status === 'waiting' || cardInfo.status === 'canceled' ||  cardInfo.status === 'cancelled' )
                          ? `<label> </label>`
                          : `<button class="btn btn-gray" onclick="viewMyReservationDetail('${cardInfo.bookingId}','${cardInfo.origTz}')">预约详情</button>`
                     }
                     
                 </div>
             </div>
         `;
         return info;
     }

     /**
      * teacher 端“预订管理”聚合卡片：同一排期下多名学员合并为一张卡片。
      * 学员名拼成“、”分隔字符串并附人数，操作入口改为“查看排期”（按 scheduleId）。
      */
     function formScheduleGroupCard(cardInfo) {
         const names = (Array.isArray(cardInfo.studentNames) ? cardInfo.studentNames : []).join('、') || '—';
         const count = Array.isArray(cardInfo.studentNames) ? cardInfo.studentNames.length : 0;
         return `
             <div class="course-card">
                 <div class="course-info">
                     <h4>${cardInfo.index} ${cardInfo.className}</h4>
                     <p>教师：${cardInfo.teacherName} | 学员：${names}（共 ${count} 人） | 排期状态：${cardInfo.scheduleStatus} | 预约时间：${cardInfo.scheduleInfo}</p>
                 </div>
                <div class="course-actions">
                    <button class="btn btn-gray" onclick="previewScheduleGroup('${cardInfo.scheduleId}','${cardInfo.origTz}',${JSON.stringify(cardInfo.students || [])})">查看排期</button>
                </div>
             </div>`;
     }
 
//更新scheduleObject相关内容 --待细化

    // 解决“找不到函数”问题：确保相关函数在 window 作用域下暴露（onclick 字符串里调用的都是全局函数）
  window.previewScheduleGroup   = previewScheduleGroup; 
  window.viewMyReservationDetail   = viewMyReservationDetail  ;

  window.renderCalendar    = renderCalendar ; 
  //window.displaySchedule   = displaySchedule ;  
  window.actionForButton   = actionForButton ; 
  window.loadAndRenderBooking_student       = loadAndRenderBooking_student  ; 
  window.formACourseCard   = formACourseCard  ; 
  window.getAppointmentsByBookingId   = getAppointmentsByBookingId;// defined in dataFunction.js 
  window.switchResultTab   = switchResultTab;

  // teacher「查看排期」排期结果卡片：对单个日期整次课次批量「申请改期 / 取消改期」，成功后就地刷新预览卡片
  async function teacherRescheduleOccurrence(aptIds, bApply) {
      await bulkSetAppointmentStatus(aptIds, bApply ? 't-cancelling' : 'active');
      if (_lastPreview) previewScheduleGroup(_lastPreview.scheduleId, _lastPreview.origTz, _lastPreview.students);
  }
  window.teacherRescheduleOccurrence = teacherRescheduleOccurrence;
   
    
 
   // teacher「查看排期」下钻时携带的 preview 上下文，供「改期」成功后就地刷新卡片
  let _lastPreview = null;
  // teacher「查看排期」按学员维度下钻的预览上下文（学员名 + 该学员全部课次及状态），供学员按钮下钻
  let _lastPreviewStudents = null;

  // 简单 HTML 转义，避免学员名/文案里的 < > & " ' 破坏渲染或被注入
  function escapeHtml(str) {
      if (str == null) return '';
      return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
  }

  // teacher「预订管理」聚合卡片下钻：查看排期（按 scheduleId）。
  // 注意：本函数已从全局 previewSchedule 改名为 previewScheduleGroup，避免与
  // student-bookingCards.js / admin-schedule.js 里的 0 参 previewSchedule() 互相覆盖
  // （否则 student.html / admin-schedule.html 最后加载本文件会顶掉学生/管理员的 0 参版，导致崩溃）。
  //
  // 数据源：直接读取组内学生 appointment（真实课次），而非 generateAppointmentList。
  // 原因：generateAppointmentList 内部 scheduleInfo.startTime.split(' ') 在 pending 排期
  //（startTime 为空）时会 TypeError，正是教师点「查看排期」报错的根因。
  // 同一排期下所有学生共享相同日期，读任一个学生的 appointment 即可拿到完整日期列表；
  // 这里汇总所有学生 bookingId 的 appointment，按日期聚合 aptIds，支持「同一日期整组一起改期」。
  async function previewScheduleGroup(scheduleid, origTzTimeZone, students) {
    const studentList = Array.isArray(students) ? students : [];
    const bookingList = studentList.map(s => s.bookingId).filter(Boolean);

    // —— 段一：整组日期列表（维持「同一日期整组一起改期」能力）——
    const dateAptMap = new Map(); // date(yyyy-MM-dd) -> [{id, status, time}]
    for (const bid of bookingList) {
        let appts = [];
        try { appts = await getAppointmentsByBookingId(bid) || []; } catch (e) { appts = []; }
        if (!Array.isArray(appts)) continue;
        for (const a of appts) {
            const d = (a.date || '').slice(0, 10);
            if (!d) continue;
            if (!dateAptMap.has(d)) dateAptMap.set(d, []);
            dateAptMap.get(d).push({ id: a.id, status: a.status, time: a.time });
        }
    }

    const dates = Array.from(dateAptMap.keys()).sort();
    scheduleResult = dates.map(d => {
        const matched = dateAptMap.get(d);
        const aptIds = matched.map(x => x.id).filter(x => x != null && x !== '');
        // 同日期课次中只要有「教师申请取消 / 取消待确认」即视为 pending → 按钮显示「取消改期」
        const pending = matched.some(x => x.status === 't-cancelling' || x.status === 'cancelling');
        const status = aptIds.length
            ? (pending ? 't-cancelling' : (matched[0].status || 'active'))
            : 'active';
        return {
            id:      aptIds.length ? aptIds[0] : null,
            date:    d,
            time:    matched[0] ? (matched[0].time || '') : '',
            weekday: deriveWeekday(d),
            status:  status,
            aptIds:  aptIds
        };
    });

    // —— 段二：按学员维度下钻数据（学员名 + 该学员全部课次及状态，已转用户时区）——
    const studentsData = [];
    for (const s of studentList) {
        const appts = [];
        try {
            const raw = await getAppointmentsByBookingId(s.bookingId) || [];
            if (Array.isArray(raw)) {
                for (const a of raw) {
                    const dt = (a.date || '') + ' ' + (a.time || '');
                    let newDate = a.date, newTime = a.time, weekday = deriveWeekday(a.date);
                    // 与 viewMyReservationDetail 一致：把原始排期时区转到用户时区，跨时区显示才正确
                    if (a.date && a.time && origTzTimeZone && typeof tzSwitchTo === 'function') {
                        try {
                            const conv = await tzSwitchTo(origTzTimeZone, dt, userTimeZone);
                            if (conv && conv.dateTime) {
                                newDate = conv.dateTime.split(' ')[0];
                                newTime = conv.dateTime.split(' ')[1];
                                weekday = conv.weekday || weekday;
                            }
                        } catch (e) { /* 转时区失败则退回原始值 */ }
                    }
                    appts.push({ id: a.id, date: newDate, time: newTime, weekday, status: a.status });
                }
            }
        } catch (e) { /* 单个学员取数失败不影响其它学员 */ }
        studentsData.push({ studentName: s.studentName, bookingId: s.bookingId, appointments: appts });
    }
    _lastPreviewStudents = studentsData;

    _lastPreview = { scheduleId: scheduleid, origTz: origTzTimeZone, students: studentList };
    renderResult(scheduleResult);
    renderCalendar(scheduleResult);
    switchResultTab('list');

    // 标题区注入「学员课次」按钮条（点击下钻该学员课次列表）
    const bar = document.getElementById('studentButtonBar');
    if (bar) {
        bar.innerHTML = '<span class="student-bar-label">学员课次：</span>';
        studentsData.forEach((s, i) => {
            const btn = document.createElement('button');
            btn.className = 'btn btn-default student-btn';
            btn.type = 'button';
            btn.textContent = s.studentName || ('学员' + (i + 1));
            // 用闭包捕获 index，彻底避开内联字符串里的名字转义/注入问题
            btn.onclick = () => showStudentAppointments(i);
            bar.appendChild(btn);
        });
    }
    // 切换排期时收起上一个学员的详情面板
    const detail = document.getElementById('studentAptDetail');
    if (detail) { detail.style.display = 'none'; detail.innerHTML = ''; }
    // 默认选择第一个学生，直接展示其课次（教师端多人预订同一排期时默认看第一位学员）
    if (studentsData.length) {
        showStudentAppointments(0);
    }
  }

  // teacher「查看排期」：点击标题区某学员按钮，下钻显示该学员在本排期下所有课次的日期/时间/状态
  function showStudentAppointments(index) {
      // 同步高亮当前选中的学员按钮，让「选择学生」的状态一目了然
      const bar = document.getElementById('studentButtonBar');
      if (bar) {
        const btns = bar.querySelectorAll('.student-btn');
        btns.forEach((b, i) => { b.classList.toggle('active', i === index); });
      }
      const detail = document.getElementById('studentAptDetail');
      if (!detail) return;
      const arr = _lastPreviewStudents || [];
      const s = arr[index];
      if (!s) { detail.style.display = 'none'; detail.innerHTML = ''; return; }
      if (!s.appointments || !s.appointments.length) {
          detail.style.display = '';
          detail.innerHTML = '<div class="student-apt-title">' + escapeHtml(s.studentName) +
              ' 的预约课次</div><div class="student-apt-empty">暂无课次（可能已取消或候补未转）</div>';
          return;
      }
      let rows = '';
      for (const a of s.appointments) {
          const wd = a.weekday || deriveWeekday(a.date);
          const label = getAppointmentStatusLabel(a.status);
          rows += '<tr><td>' + escapeHtml(a.date) + ' ' + escapeHtml(wd) + '</td><td>' +
              escapeHtml(a.time) + '</td><td>' + escapeHtml(label) + '</td></tr>';
      }
      detail.style.display = '';
      detail.innerHTML = '<div class="student-apt-title">' + escapeHtml(s.studentName) +
          ' 的预约课次（共 ' + s.appointments.length + ' 次）</div>' +
          '<table class="student-apt-table"><thead><tr><th>日期</th><th>时间</th><th>状态</th></tr></thead>' +
          '<tbody>' + rows + '</tbody></table>';
  }
  window.showStudentAppointments = showStudentAppointments;
  
//预览排期--对于已确认的排期查看 读取排期时间表，显示在排期时间列表和日历上.  
async function viewMyReservationDetail(bookingId,origTzTimeZone){
   // 北京: "Asia/Shanghai"
   // 巴黎: "Europe/Paris"
   // 卡尔加里: "America/Edmonton"

   scheduleResult = await getAppointmentsByBookingId(bookingId);// dataFunction.js 日期时间-》转为用户当前时区
   // origTzTimeZone,userTimeZOne 
   // 遍历scheduleResult，处理每一项（此处仅做遍历，如果要具体操作可添加逻辑）
   let restlts=[];// date:xx,time:xx
  // const testTz = "Asia/Shanghai"; 
   // forEach + async 会导致 restlts.push(newDt) 并发执行、顺序不可靠，需改为顺序执行，保证渲染和restlts填充完成
   if (Array.isArray(scheduleResult)) {
       restlts = [];
       for (let i = 0; i < scheduleResult.length; i++) {
           const item = scheduleResult[i];
           const dateTime = item.date + " " + item.time;
           const userDateTime = await tzSwitchTo(origTzTimeZone, dateTime, userTimeZone);
           const newDate = userDateTime.dateTime.split(' ')[0];
           const newTime = userDateTime.dateTime.split(' ')[1];
           const newDt = {id:item.id, date: newDate, time: newTime, weekday: userDateTime.weekday, status: item.status }
           restlts.push(newDt);
       }
   }
   renderResult(restlts);
   renderCalendar(restlts);
} 
// 由 yyyy-MM-dd 推导中文星期几（generateAppointmentList 不返回 weekday 时的兜底）
function deriveWeekday(dateStr) {
    if (!dateStr) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
    if (!m) return '';
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (isNaN(d.getTime())) return '';
    const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return names[d.getDay()];
}

// 渲染排期列表-有星期
// 预约课次状态 → 用户可见文案（模块级，renderResult 与学员下钻弹层共用同一套，避免文案漂移）
function getAppointmentStatusLabel(status) {
    switch (status) {
        case 'active': return '生效';
        // noted1 / noted2 是通知标记寄存在 appointment.status 时期的遗留值（不再产生）。
        // 对用户只说「已提醒」——「第一次通知/第二次通知」是在替系统解释实现细节。
        case 'noted1':
        case 'noted2': return '已提醒';
        case 'completed': return '已完成';
        case 'cancelled': return '已取消';

        case 'cancelling': return '取消待确认';
        case 'reject': return '已拒绝';

        case 't-cancelling': return '教师申请取消';
        case 't-cancelled':  return '教师已取消';
        case 't-reject': return '已拒绝(T)';
        // 排期自身状态（previewSchedule 预览槽占位用）：pending/active/inactive/frozen
        case 'pending':   return '待发布';
        case 'inactive':  return '已收回';
        case 'frozen':    return '已删除';
        default: return status || '—';
    }
}
function renderResult(dateTimeList) {
    const body = document.getElementById('resultBody');
    body.innerHTML = ''; 
    // 不同状态对应的提示（getAppointmentStatusLabel 已上浮为模块级函数，见上方定义）
    //TBD：比较时间与当前时间，对于过去时间，2天内的，不允许延期、视为已完成
    if(dateTimeList!= null ) {
        dateTimeList.forEach(item => {
            const tr = document.createElement('tr');
            // 获取item.date的周几（previewSchedule 预览槽可能只带 date，用本地推导兜底）
            let weekday = item.weekday || deriveWeekday(item.date);
            let statusName = getAppointmentStatusLabel(item.status);
            tr.innerHTML = `<td>${dateTimeList.indexOf(item) + 1}</td><td>${item.date} ${weekday}</td><td>${item.time}</td> <td>${statusName}</td>`;

            // 纯预览槽（previewSchedule）没有 appointment id，cancellingAppointment(id) 会提交 undefined 而静默失败，
            // 故无 id 时不渲染「取消课次/撤回申请」按钮，避免给出会失效的操作入口。
            const hasId = item.id != null && item.id !== '';
            const tdBtn = document.createElement('td');
            console.log("item.id:",item.id,"hasId:",hasId,"status:",item.status);
            if (hasId) {
                const canCancel= (item.status!= "completed")  && (item.status!= "cancelled") && (item.status!= "cancelling") && item.status!= "cancelled" && item.status!= "t-cancelling";// 可延期、 如果为cancelling--则可撤回
                const applyDelayBtn = document.createElement('button');
                applyDelayBtn.className = 'btn btn-warning'; // 给按钮加一些样式，非必须可移除
                if(canCancel) {
                    applyDelayBtn.textContent = termText('leave');
                    applyDelayBtn.onclick = function() {
                        cancellingAppointment(item.id,true);//appointmentNotes.js
                    }
                }  else if(item.status == "cancelling") {
                        applyDelayBtn.textContent = '撤回申请';
                        applyDelayBtn.onclick = function() {
                            cancellingAppointment(item.id,false);
                        }
                }
                tdBtn.appendChild(applyDelayBtn);
            }
        //    tr.appendChild(tdBtn);

            // 「改期」列：teacher 下钻预览时按日期匹配到真实课次（aptIds），整次课次批量「申请改期 / 取消改期」
            const aptIds = Array.isArray(item.aptIds) ? item.aptIds : [];
            const tdResch = document.createElement('td');
            console.log("aptIds:",aptIds,"item.status:",item.status);
            if (aptIds.length) {
                const pending = item.status === 't-cancelling' || item.status === 'cancelling';
                const reschBtn = document.createElement('button');
                reschBtn.className = 'btn btn-warning';
                if (pending) {
                    reschBtn.textContent = '取消改期';
                    reschBtn.onclick = function() { teacherRescheduleOccurrence(aptIds, false); };
                } else {
                    reschBtn.textContent = '申请改期';
                    reschBtn.onclick = function() { teacherRescheduleOccurrence(aptIds, true); };
                }
                tdBtn.appendChild(reschBtn);
            }
            tr.appendChild(tdBtn);

            body.appendChild(tr);
        });
        } else {
            body.innerHTML = '<div> 暂无数据 </div>'; 
        }
  }

 // 渲染日历
 function renderCalendar(dateTimeList) {
        const cal = document.getElementById('calendar');
        cal.innerHTML = '';
        if(scheduleResult == null )
            return;

        const dateSet = new Set(dateTimeList.map(i => i.date));
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
            if (dateSet.has(dateStr)) div.classList.add('marked');//TBD: 取消cancelled、cancelling
            div.innerText = d.getDate();
            cal.appendChild(div);
        }
    }   
 
  //判断预约状态，如果是booking则可直接取消，如果是booked,则设置为canceling，等待确认
  async function actionForButton(bookingid,newStatus) { 
     //const formData = getBookFormData();  
     await operateBookingStatus( bookingid, newStatus);
     loadAndRenderBooking_student();
  }
 
 
function localsearchAppoint_student() {
    Pagination.pageNum = 1;
    loadAndRenderBooking_student();
 }
 // 重置筛选条件
 function resetFilterAppoint_student() {
   document.getElementById('course-name-input').value = '';   
   document.getElementById('booking-status-select').value = '';
   Pagination.pageNum = 1;
   loadAndRenderBooking_student(); 
}

// 排期结果 / 日历视图：card 内 tab 切换（同一份数据的两种展现，二选一不重复占竖向空间）
function switchResultTab(tab) {
    const tabs = document.querySelectorAll('.result-tab');
    tabs.forEach(t => {
        if (t.getAttribute('data-tab') === tab) t.classList.add('active');
        else t.classList.remove('active');
    });
    const listPanel = document.getElementById('resultPanelList');
    const calPanel = document.getElementById('resultPanelCalendar');
    if (tab === 'list') {
        listPanel.style.display = '';
        calPanel.style.display = 'none';
    } else {
        listPanel.style.display = 'none';
        calPanel.style.display = '';
    }
}
 


/**
 * 学生课程预约页面：
 * 1、提供检索字段：课程名称、语言、难度、教师、时间 
 * 
 *  2、查询用户的所有预约信息，用卡片形式展示，提供取消预约、取消课次、详情等操作
 * 点击详情则显示（详情已经确认的预约来自appointment列表，新建的预约，详情数据来自后台计算，待确认）： 
 *    2.3 排期结果显示区域：
 *    2.3.1 列表显示：年月日、时分
 *    2.3.2 日历显示：在日历上标记所有的排期日期 
 * 
 * 状态："bookingStatus"：
                <option value="none">无预约</option>
                <option value="booking">已预约,待确认</option>
                <option value="booked">预约成功</option>
                <option value="canceling">取消待确认</option>
                <option value="canceled">已取消</option>
                 <option value="completed">已完成</option>  
 * **/  