 //预约管理--预约结果详情--页面
  //展示本人的所有预约列表，提供预约详情---展示排期列表（使用“取消预约”操作）
   // student-course-appointment.js
// 区别于booking页面，booking页面负责查询课程、检查排期，以便预约1个课程，
//本页面，浏览预约结果和具体时间列表
 console.log("student appointment  page"); 
// ===================== 核心函数 ===================== 
/**
 *  课程预约列表（核心：原生JS操作DOM）
 * 对于学生， 显示本人预定的课程，详情显示预约排期，可设置请假、临时改期
 */
async function renderStudentBookingBrowserCards() {
    const dynamicContentCenter = document.getElementById('dynamic-content-center');
    //console.log("container:",dynamicContentCenter);
    if (!dynamicContentCenter) return; 
    // 显示加载中
    dynamicContentCenter.innerHTML = '<div style="padding:40px 0;text-align:center;">加载中...</div>';  
    // 渲染HTML
    let html = '';
    { 
      html += `  
    <!-- 预约状态显示和选择 TBD -->
   <div class="card">
              <h3><i class="fa fa-calendar-check-o"></i> 我的全部预约</h3>
              <div id="my-bookings">

              </div>      
    </div>
    <!-- 排期结果 -->
    <div class="section">
        <div class="section-title">排期结果（列表）</div>
        <table>
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

    <div class="section">
        <div class="section-title">日历视图</div>
        <div id="calendar" class="calendar"></div>
    </div>`;
    
    dynamicContentCenter.innerHTML = html; 
    refreshData();   
    
 /**
  * 问题分析：
  * 程序第94行为：console.info("bookingsHtml:",bookingsHtml);
  * 但实际在页面运行时，bookingsHtml 可能一直为空字符串，导致未显示课程卡片。
  * 进一步排查发现代码的主要问题如下：
  * 
  * 1. forEach(async (booking) => {...}) 并不会等待异步操作完成，也就是 bookingList.forEach 不能与 async/await 配合“同步执行”。
  * 2. bookingsHtml 的累加基于一系列异步操作，但实际的 bookingsHtml += cardContent; 在 then 之后才赋值，而外层 forEach 并不会等待它们结束。
  * 3. 由于 forEach 不等待异步返回，forEach 后面马上执行 console.info("bookingsHtml:",bookingsHtml)，这时 bookingsHtml 还没填充任何 cardContent。
  * 4. bookingContainer.innerHTML 也在 forEach 之后立即执行，导致页面展现为空。
  * 
  * 所以第94行始终打不出最终内容。
  * 
  * 解决方案：使用 for...of 循环+await，或者 Promise.all 并在 then 内赋值，保证异步结果全部收集后再渲染。
  */

 async function refreshData(){
     let status = null; //不限制状态
     bookingList = await getBookingData(userRole, userId, status);

     let bookingsHtml = "";

     if (Array.isArray(bookingList)) {
         // 用for...of+await，等待所有异步操作完成
         for (let booking of bookingList) {
           //  console.log("booking:", bookingList.indexOf(booking), booking);
             const scheduleObject = await fetchSchedule(booking.scheduleId);
             //console.log("scheduleObject:", scheduleObject);
             if (scheduleObject != null) {
                 let scheduleInfoStr = getScheduleInfo(scheduleObject);
                 const classObject = await getCourseById(scheduleObject.courseId);

                 testGetList(scheduleObject.courseId);
                 //TBD teacherId + user库--》teacherName
                 //console.log("classObject:", classObject);
                 if (classObject != null) {
                     let cardItems = {
                         scheduleId:scheduleObject.scheduleId,
                         bookingId: booking.id,
                         className: classObject.courseName,
                         teacherName: classObject.teacherId,
                         scheduleInfo: scheduleInfoStr,
                         status: booking.status
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
 
 async function getCourseById( courseId) {
    const token = getToken();
    if (!token) return;

    try {
        // Axios GET请求（修复response.json()错误，Axios已自动解析）
        const response = await axios.get(`${API_BASE_URL}/course/${courseId}`, {
            headers: { "Authorization": "Bearer " + token },
           // params: conditionJson // 筛选条件通过params传递
        });
        const res = response.data; 
        if (res && res.code === 200) {
           console.info("data.courses:",res.data);   
           return  res.data ; 
        } else {
           // alert(res?.message || '获取课程列表失败');
            return  null;
        }
    } catch (e) {
        //alert("网络错误，获取课程列表失败");
        console.error(e);
        return   null;
    }
 }
 async function  testGetList(courseId){
    const conditionJson = { 
        courseId:courseId,
      teacherId:"",
      templateId:"",
      status:"" 
    };
   const rlist = await fetchCourseList(conditionJson);
   const one = await getCourseById(courseId);
  console.log(one,rlist);
   }
 
 //TBD To Be test ,if the conditionJson tooked infact.
async function fetchCourseList(conditionJson) {
    const token = getToken();
    if (!token) return;

    try {
        // Axios GET请求（修复response.json()错误，Axios已自动解析）
        const response = await axios.get(`${API_BASE_URL}/course/list`, {
            headers: { "Authorization": "Bearer " + token },
            params: conditionJson // 筛选条件通过params传递
        });
        const res = response.data;
        //console.info("fetchCourseList:",res);
        if (res && res.code === 200) {
           console.info("data.courses:",res.data);   
           return  res.data|| []; 
        } else {
           // alert(res?.message || '获取课程列表失败');
            return   [];
        }
    } catch (e) {
        //alert("网络错误，获取课程列表失败");
        console.error(e);
        return   [];
    }
}

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
         //console.log("cardInfo:", cardInfo);

         const info = `
             <div class="course-card">
                 <div class="course-info">
                     <h4>${cardInfo.className}</h4>
                     <p>授课教师：${cardInfo.teacherName} | 预约时间：${cardInfo.scheduleInfo} | 状态：${
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
                        cardInfo.status === 'booking'
                          ? `<button class="btn btn-gray" onclick="actionForButton('${cardInfo.bookingId}','none')">撤销</button>`
                          : cardInfo.status === 'booked'
                          ? `<button class="btn btn-gray" onclick="actionForButton('${cardInfo.bookingId}','cancelling')">申请取消</button>`
                          : (cardInfo.status === 'canceling' || cardInfo.status === 'cancelling')
                          ? `<button class="btn btn-gray" onclick="actionForButton('${cardInfo.bookingId}','booked')">撤销</button>`
                          : (cardInfo.status === 'canceled' ||  cardInfo.status === 'cancelled' )
                          ? `<button class="btn btn-gray" onclick="actionForButton('${cardInfo.bookingId}','booking')">重新申请</button>`
                          : ''
                     }

                 ${ //正在预约或者已经取消：显示计算的排期列表，否则显示排期表中的数据
                     ( cardInfo.status === 'booking' || cardInfo.status === 'canceled' ||  cardInfo.status === 'cancelled' )
                          ? `<button class="btn btn-gray" onclick="previewSchedule('${cardInfo.scheduleId}')">预览详情</button>`
                          : `<button class="btn btn-gray" onclick="viewMyReservationDetail('${cardInfo.bookingId}')">查看详情</button>`
                     }
                     
                 </div>
             </div>
         `;
        // console.log("cardContent:", info);
         return info;
     }
 
//更新scheduleObject相关内容 --待细化
//可简化为：日期范围，时间，排期计划
function getScheduleInfo(scheduleObject) {
    if (!scheduleObject) return;
     let info="";

      // TBD:替代为排期名称
      if (scheduleObject.scheduleId)          info += scheduleObject.scheduleId;

    // 起始日期、结束日期和上课时间组成一句简洁文字
    if (scheduleObject.startTime || scheduleObject.endTime ) {
        let dateStr = '';
        if (scheduleObject.startTime && scheduleObject.endTime && scheduleObject.startTime !== scheduleObject.endTime) {
            // 截取日期部分（假设startTime/endTime为"yyyy-MM-dd HH:mm:ss"格式，仅取日期部分）
            const startDate = scheduleObject.startTime ? scheduleObject.startTime.split(" ")[0] : "";
            const endDate = scheduleObject.endTime ? scheduleObject.endTime.split(" ")[0] : "";
            const startTime =  scheduleObject.startTime?scheduleObject.startTime.split(" ")[1] : "";
            dateStr = `${startDate} ~ ${endDate} ${startTime}`;
    
        } else if (scheduleObject.startTime) {
            dateStr = scheduleObject.startTime;
        } 
        
        info += dateStr ? ` ${dateStr}` : '';
    }

    // 刷新重复类型 
    info += getRepeatDescription(scheduleObject.repeatType, scheduleObject.interval);
   //TBD:每x周 xx/xx/xx 或者每x月 xx/xx/xx/ 
        return info;
}
 
     // 解决“找不到函数loadSchedule”问题：确保loadSchedule在window作用域下暴露
   window.previewSchedule   = previewSchedule; 
   window.viewMyReservationDetail   = viewMyReservationDetail  ;

   window.renderCalendar    = renderCalendar ; 
   window.displaySchedule   = displaySchedule ;  
   window.actionForButton   = actionForButton ; 
   window.refreshData       = refreshData  ; 
   window.formACourseCard   = formACourseCard  ; 
   window.getAppointmentsByBookingId   = getAppointmentsByBookingId;// defined in dataFunction.js 
   
   
    /*
    /**
     * 生成重复周期的说明语句
     * @param {string} repeatType - 重复类型，可为 "none", "day", "week", "month"
     * @param {number} interval - 重复周期，如每几天/周/月一次
     * @returns {string} - 周期说明语句
     */
    function getRepeatDescription(repeatType, interval) {
        switch (repeatType) {
            case "none":
                return "单次课";
            case "day":
                return `每${interval > 1 ? interval : ''}天一次`;
            case "week":
                return `每${interval > 1 ? interval : ''}周一次`;
            case "month":
                return `每${interval > 1 ? interval : ''}月一次`;
            default:
                return "";
        }
    }
     
 
   // 预览排期--对于未确认的排期查看
   async function previewSchedule(scheduleid) { 
      console.log("previewSchedule",scheduleid);
    // 生成排期列表 localDateTime List<Date,TIME>
    scheduleResult = await generateAppointmentList(scheduleid,userTimeZone); //courseAndBooking.js
    renderResult(scheduleResult);
    renderCalendar(scheduleResult); 
}
 
 
async function getBookingData( userRole, useid,status) { 
    console.log("getBookingData:","userRole:",userRole, "useid:",useid,"status:",status)
    return await getBookingList(userRole, useid,status);
}
 
//预览排期--对于已确认的排期查看 读取排期时间表，显示在排期时间列表和日历上.  
async function viewMyReservationDetail(bookingId){

     scheduleResult = await getAppointmentsByBookingId(bookingId);// 日期时间-》转为用户当前时区
   //
   //时区变换----TBD
   renderResult(scheduleResult);
   renderCalendar(scheduleResult);
}
// 渲染排期列表
function renderResult(dateTimeList) {
    const body = document.getElementById('resultBody');
    body.innerHTML = '';
    if(dateTimeList!= null ) {
        dateTimeList.forEach(item => {
        const tr = document.createElement('tr');
        
        tr.innerHTML = `<td>${dateTimeList.indexOf(item) + 1}</td><td>${item.date}</td><td>${item.time}</td>`;
   
        body.appendChild(tr);
    });
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
      console.log('firstDateVar:', firstDateVar);
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
 
  //判断预约状态，如果是booking则可直接取消，如果是booked,则设置为canceling，等待确认
  async function actionForButton(bookingid,newStatus) { 
     //const formData = getBookFormData();  
     await operateBookingStatus( bookingid, newStatus);  
  }

    //在状态变化时，更新预约状态， --指定元素名称--约定-ID = bk-${bookingid}
    async function  reloadBooking(bookingid){ 
         //const bidItem = document.getElementById("bookingId");
         //bidItem.value = bookingid;
         if(selectedScheuleId != null) {
            const bookingObjectList =    await getBookingInfo(selectedScheuleId,userRole,userId); 
             
            if(bookingObjectList!= null && bookingObjectList.length >0)
            { renderStudentBookingStatus(bookingObjectList[0]);  //获取 用户的预定信息
            } else {  
                renderStudentBookingStatus(null);
            }
         }
            }//
        }
    
     
   // console.log("schedule page END");
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