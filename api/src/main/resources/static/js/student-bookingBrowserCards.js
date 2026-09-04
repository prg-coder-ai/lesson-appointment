 //预约管理--预约结果详情--页面-用于学生和教师
  //展示本人的所有预约列表，提供预约详情---展示排期列表（使用“取消预约”操作）
   // student-course-appointment.js   StudentBookingBrowserCards.js
// 区别于booking页面，booking页面负责查询课程、检查排期，以便预约1个课程，
//本页面，浏览预约结果和具体时间列表
 //console .log("student appointment  page");
// ===================== 核心函数 ===================== 
/**
 *  课程预约列表（核心：原生JS操作DOM）
 * 对于学生， 显示本人预定的课程，详情显示预约排期，可设置请假、临时改期
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

   html+=`   <!-- 排期结果 -->
    <div class="section">
        <div class="section-title">排期结果（列表）</div>
        <table>
            <thead>
                <tr>
                    <th>课次</th>
                    <th>日期</th>
                    <th>时间</th>
                      <th>状态</th> 
                      <th>请假</th>
                </tr>
            </thead>
            <tbody id="resultBody"></tbody>
        </table>
    </div>

    <div class="section">
        <div class="section-title">日历视图</div>
        <div id="calendar" class="calendar"></div>
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

     if (Array.isArray(bookingList)) {
         // 用for...of+await，等待所有异步操作完成
         for (let booking of bookingList) {
            index ++ ;
            
             const scheduleObject = await fetchSchedule(booking.scheduleId);
             
             if (scheduleObject != null) {
                 let scheduleInfoStr = getScheduleInfo(scheduleObject);
                 const classObject = await getCourseById(scheduleObject.courseId);

                 const teacherName= await getUserNameById(classObject.teacherId);
                 const studentName = await getUserNameById(booking.studentId);
                 if (classObject != null) {
                     let cardItems = { 
                         index: index,
                         scheduleId:    scheduleObject.scheduleId,
                         origTz:        scheduleObject.timeZone,
                         bookingId:     booking.id,
                         className:     classObject.courseName,
                         teacherName:   teacherName,
                         studentName:   studentName,
                         scheduleInfo:  scheduleInfoStr,
                         status:        booking.status
                     }
                     let cardContent = formACourseCard(cardItems);
                  
                     bookingsHtml += cardContent;
                 }
             }
         }
     }

     // 只有在全部异步处理后再输出和渲染
     //console.info("bookingsHtml:", bookingsHtml);
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
                          : userRole === 'student' && cardInfo.status === 'booked'
                          ? `<button class="btn btn-gray" onclick="actionForButton('${cardInfo.bookingId}','cancelling')">申请取消</button>`
                          : userRole === 'student' && (cardInfo.status === 'canceling' || cardInfo.status === 'cancelling')
                          ? `<button class="btn btn-gray" onclick="actionForButton('${cardInfo.bookingId}','booked')">撤销</button>`
                          : userRole === 'student' && (cardInfo.status === 'canceled' ||  cardInfo.status === 'cancelled' )
                          ? `<button class="btn btn-gray" onclick="actionForButton('${cardInfo.bookingId}','booking')">重新申请</button>`
                          : ''
                     }

                 ${ //正在预约或者已经取消：显示计算的排期列表，否则显示排期表中的数据
                     ( cardInfo.status === 'booking' || cardInfo.status === 'canceled' ||  cardInfo.status === 'cancelled' )
                          ? `<label> </label>`
                          : `<button class="btn btn-gray" onclick="viewMyReservationDetail('${cardInfo.bookingId}','${cardInfo.origTz}')">预约详情</button>`
                     }
                     
                 </div>
             </div>
         `;
         return info;
     }
 
//更新scheduleObject相关内容 --待细化

     // 解决“找不到函数loadSchedule”问题：确保loadSchedule在window作用域下暴露
   window.previewSchedule   = previewSchedule; 
   window.viewMyReservationDetail   = viewMyReservationDetail  ;

   window.renderCalendar    = renderCalendar ; 
   //window.displaySchedule   = displaySchedule ;  
   window.actionForButton   = actionForButton ; 
   window.loadAndRenderBooking_student       = loadAndRenderBooking_student  ; 
   window.formACourseCard   = formACourseCard  ; 
   window.getAppointmentsByBookingId   = getAppointmentsByBookingId;// defined in dataFunction.js 
   
    
 
   // 预览排期--对于未确认的排期查看--已优化掉--可到预约页面查看
   async function previewSchedule(scheduleid,origTzTimeZone) { 
    // 生成排期列表 localDateTime List<Date,TIME>
    scheduleResult = await generateAppointmentList(scheduleid,userTimeZone); //courseAndBooking.js
    renderResult(scheduleResult);
    renderCalendar(scheduleResult); 
}
  
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
// 渲染排期列表-有星期
function renderResult(dateTimeList) {
    const body = document.getElementById('resultBody');
    body.innerHTML = ''; 
    // 不同状态对应的提示
            // status: active=生效, noted1/2=已通知, completed=已完成, cancelled=已改期, cancelling=申请取消
    function getAppointmentStatusLabel(status) {
        switch (status) {
            case 'active': return '生效';
            case 'noted1': return '第一次通知';
            case 'noted2': return '第二次通知';
            case 'completed': return '已完成';
            case 'cancelled': return '已改期'; 

            case 'cancelling': return '申请改期';
            case 'reject': return '拒绝改期'; 
            
            case 't-cancelling': return '老师申请改期';
            case 't-cancelled':  return '老师已改期';
            case 't-reject': return '已拒绝(T)';
            default: return status;
        }
    }
    //TBD：比较时间与当前时间，对于过去时间，2天内的，不允许延期、视为已完成
    if(dateTimeList!= null ) {
        dateTimeList.forEach(item => {
            const tr = document.createElement('tr');
            // 获取item.date的周几
            let weekday = item.weekday; 
            let statusName = getAppointmentStatusLabel(item.status);
            tr.innerHTML = `<td>${dateTimeList.indexOf(item) + 1}</td><td>${item.date} ${weekday}</td><td>${item.time}</td> <td>${statusName}</td>`;

            const canCancel= (item.status!= "completed")  && (item.status!= "cancelled") && (item.status!= "cancelling")  && item.status!= "cancelled" && item.status!= "t-cancelling";// 可延期、 如果为cancelling--则可撤回
            const applyDelayBtn = document.createElement('button');
            applyDelayBtn.className = 'btn btn-warning'; // 给按钮加一些样式，非必须可移除
            if(canCancel) {  
                applyDelayBtn.textContent = '申请延期'; 
                applyDelayBtn.onclick = function() {
                    cancellingAppointment(item.id,true);//appointmentNotes.js
                } 
            }  else if(item.status == "cancelling") {
                    applyDelayBtn.textContent = '收回申请'; 
                    applyDelayBtn.onclick = function() {
                        cancellingAppointment(item.id,false);
                    } 
            }
            const tdBtn = document.createElement('td');
            tdBtn.appendChild(applyDelayBtn);
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
 


/**
 * 学生课程预约页面：
 * 1、提供检索字段：课程名称、语言、难度、教师、时间 
 * 
 *  2、查询用户的所有预约信息，用卡片形式展示，提供取消预约、请假、详情等操作
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