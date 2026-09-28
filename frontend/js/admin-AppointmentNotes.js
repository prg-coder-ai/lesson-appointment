 
 //admin---上课通知--3天内的课程显示-----
// ===================== 核心函数 =====================
 
let appointmentList=[];// ID,ciurseName,studentName,teacherName,dateTime(创建时间),状态、操作（预览、确认、拒绝） 

// 读筛选控件值；控件缺失（如某些页面复用本渲染但未挂对应筛选条）时返回默认值，避免整页崩溃
function elVal(id, dflt) {
  var e = document.getElementById(id);
  return e ? e.value : (dflt === undefined ? '' : dflt);
}

 // 引入分页组件js
 document.write('<script src="/js/public/pagefoot.js"></script>');
 window.refreshAppointmentNotes  = refreshAppointmentNotes ;  

 async function refreshAppointmentNotes(){
        // 通知档位文案（下拉的 noted1/noted2 与状态列共用）取自租户默认通知规则，
        // 先把档位配置拿到手再拼 HTML —— 否则下拉会先渲染成硬编码文案再"闪一下"变掉。
        await loadNotifyStageLabels();
        assignLoadobjectListFunction( loadAndShowAppointmentPage);// assign
           // 渲染数据总览面板 不显示课程搜素
        const dynamicContentCenter = document.getElementById('dynamic-content-center');
        if (!dynamicContentCenter) return;
        // ===== 结构来自各页 <template id="tpl-appointment-notes">（admin/student/teacher 均放置）=====
        // template+clone 改造（2026-09-28）：原主骨架 HTML 字符串已搬进 HTML 模板，
        // 这里只负责「取模板 -> clone -> 注入动态文案(noted1/noted2) -> 填分页骨架 -> 绑事件」。
        const tplEl = document.getElementById('tpl-appointment-notes');
        if (!tplEl) {
            console.error('[admin-AppointmentNotes] 缺少 #tpl-appointment-notes 模板，今日课程页无法渲染');
            return;
        }
        dynamicContentCenter.replaceChildren(tplEl.content.cloneNode(true));

        // 状态下拉历史档位文案（noted1/noted2）按当前通知规则动态生成，模板留空、clone 后注入
        const statusSel = document.getElementById('appoint-status-select');
        if (statusSel) {
            const fillNote = (val, n) => {
                const o = statusSel.querySelector('option[value="' + val + '"]');
                if (o) o.textContent = (typeof notifyStageLabel === 'function' ? notifyStageLabel(n) : '') + '（历史）';
            };
            fillNote('noted1', 1);
            fillNote('noted2', 2);
        }

        // 术语替换：动态注入的内容须在 clone 后补一次（既有缺陷顺手修复）
        if (typeof applyTerms === 'function') applyTerms(dynamicContentCenter);

        // 原 html += getPagebar() 的落点：分页骨架
        const appointPagebar = document.getElementById('appoint-pagebar');
        if (appointPagebar && typeof getPagebar === 'function') appointPagebar.innerHTML = getPagebar();

        bindAppointmentNotesEvents();

        loadAndShowAppointmentPage();
        // 候补提示条（仅学生有内容；非学生或查询失败时自行隐藏）
        renderWaitlistBanner();

        function bindAppointmentNotesEvents() {
            // 每次 replaceChildren 后节点都是全新的，直接绑定即可（旧节点已被销毁，不会重复挂监听）
            const $ = (id) => document.getElementById(id);
            const on = (el, ev, fn) => { if (el) el.addEventListener(ev, fn); };
            on($('btn-search-appoint'), 'click', localsearchAppoint);
            on($('btn-reset-appoint'), 'click', resetFilterAppoint);
        }
  }   
    
  async function loadAndShowAppointmentPage(){
   const renderTo = "days-appointment-admin";
   let days = 7; //TBD 选择 7天、3天、当天1
   //获取用户角色和ID
  // let  userInfo= getCurrentUserInfo();
//let userId =  userInfo.userId;
  // let userRole = userInfo.role; 
   const params = {
      pageNum: Pagination.pageNum,
      pageSize: Pagination.pageSize,
      userId:   userId,
      userRole: userRole,    
      name:   elVal('course-name-input', ''),
      days:   elVal('appoint-days-select', -1),
      status: elVal('appoint-status-select', '')
   }
    if(userRole== "admin") {
      params.userId =null;
      params.userRole = null ;
    }

    Pagination.total = 0;
    Pagination.totalPages = 0;
    appointmentList = [ ];

    if (userRole === 'teacher') {
        // teacher 端「今日课程」按排期聚合：需对「全部课次」做客户端分组 + 分页，
        // 否则服务端逐条分页会把同一排期拆到不同页，聚合行数与分页总数对不上。
        // 近7天数据量有限，循环翻页取回全部即可。
        let p = 1; const BATCH = 200;
        while (true) {
            const pr = await fetchAppointmentListPage(Object.assign({}, params, { pageNum: p, pageSize: BATCH }));
            if (!pr || !Array.isArray(pr.rows) || pr.rows.length === 0) break;
            appointmentList = appointmentList.concat(pr.rows);
            if (pr.rows.length < BATCH) break; // 已是最后一页
            p++;
        }
        // Pagination.total / totalPages 由 showAppointmentList 按聚合后的行数回填
    } else {
        const pageResult = await fetchAppointmentListPage(params);//调用后台接口获取预约列表
        if(pageResult){
         appointmentList = pageResult.rows;
         
         const pageData = pageResult;
         Pagination.total = pageData.total ;
         Pagination.totalPages = pageData.totalPages;
        }
    }
       // showAppointmentList 是 async：teacher 分支在 await 之后才把聚合后的组数写回 Pagination.total。
       // 不加 await 的话，下方 renderPagination 会同步抢跑，拿到 total=0（第132行清的初值），
       // 表现为「列表行数对、分页条显示 0 条」。故必须 await。
       await showAppointmentList( appointmentList,renderTo); //defined in appointmentNotes.js
       renderPagination( Pagination);        
      
  }

  function localsearchAppoint() {
   Pagination.pageNum = 1;
   loadAndShowAppointmentPage();
}
// 重置筛选条件
function resetFilterAppoint() {
   var cn = document.getElementById('course-name-input');   if (cn) cn.value = '';
   var ds = document.getElementById('appoint-days-select'); if (ds) ds.value = '1'; 
   var ss = document.getElementById('appoint-status-select'); if (ss) ss.value = '';
   Pagination.pageNum = 1;
   loadAndShowAppointmentPage();

}
 
// SELECT * FROM lesson_appointment.appointment 
// WHERE appointment_datetime BETWEEN '2026-06-14 00:19:45' AND '2026-06-21 00:19:45'
// ORDER BY id, appointment_datetime;
// INSERT_YOUR_CODE

// 解释：在MySQL命令行直接执行该SQL（包含毫秒部分），能正常查出数据；但是后台mapper中的执行结果有时不一致，常见原因有：
// 1. MySQL中的DATETIME类型默认精度为到秒，小数点后7位会被截断，BETWEEN筛选实际是以'2026-06-14 00:19:45' ~ '2026-06-21 00:19:45'对比。
// 2. 后台传入的时间参数类型如果是java.util.Date或LocalDateTime，默认只到秒，毫秒部分失效；或者数据本身在DB里没毫秒。
// 3. Mapper用字符串参数且包含小数秒时，某些驱动或MyBatis配置处理不一致，导致where条件失效或自动截断等。

// 建议：
// - 检查数据库appointment_datetime字段类型（建议DATETIME/无毫秒，TIMESTAMP有秒级）
// - 后台Mapper SQL建议参数用标准格式字符串'yyyy-MM-dd HH:mm:ss'，不要包含小数点后的部分
// - 入库和查询都统一为不带毫秒的时间字符串
// - 如需精度到毫秒，数据库字段需为DATETIME(3)/TIMESTAMP(3)且前后端参数都精准传递

// 示例后端MyBatis参数（去掉毫秒，再查询）
// select * from lesson_appointment.appointment 
// where appointment_datetime between #{startTime} and #{endTime}
// （#{}的传参建议为'yyyy-MM-dd HH:mm:ss'格式、无毫秒）

/* ============================================================
 * 顶部「刷新」按钮：注册页内刷新
 * ------------------------------------------------------------
 * 之前本页没有注册，点刷新会走「整页重渲染」兜底 —— 表现上就是筛选条件（天数/状态）
 * 和当前页码被重置。本页表格本来就依赖筛选栏的取值渲染，故只重载表格即可。
 * 容器不在了（页面已切走）返回 false，交回通用逻辑兜底。
 * ============================================================ */
function refreshLessonNoticeTable() {
    if (!document.getElementById('days-appointment-admin')) return false;
    loadAndShowAppointmentPage();
    return true;
}
if (typeof registerPageRefresh === 'function') {
    registerPageRefresh('lesson_notice', refreshLessonNoticeTable);
}
