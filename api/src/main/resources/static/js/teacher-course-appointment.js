 /* /教师预约管理--预约结果详情--页面
  //展示与教师本人相关的所有预约列表，提供预约详情---展示排期列表（使用“取消预约”操作）
   // teacher-course-appointment.js
// 区别于：学生booking页面，booking页面负责查询课程、检查排期，以便预约1个课程，
          admin-course-schedule页面：负责课程排期--创建、维护

//本页面，浏览预约结果和具体时间列表，管理学生的booking，确认后，把具体时间表添加到appointment数据表中
*/
 console.log("teacher appointment  page");  

/*
let courseList = [];       // 课程列表
let scheduleObject=null;       // 排期
let scheduleList =[];
let bookingList=[];
let currentCourseId=null;
let selectedScheuleId = null;
let currentCourseIndex =-1,currentScheduleIndex =-1;
let    lastCourseIndex =-1,   lastScheduleIndex =-1;
 */
// ===================== 核心函数 ===================== 
/**
 *  检索本人的所有预约课程，点击列举具体时间表，确认后，创建预约时间表----列举所有预约
 */
   

async function renderTeacherAppointmentBrowserCards() {
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
    }
    dynamicContentCenter.innerHTML = html; 
    refreshData();   
    }

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
    //读取并显示与教师相关的--学生预定
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

                  //  testGetList(scheduleObject.courseId);
                    //TBD teacherId + user库--》teacherName
                    //console.log("classObject:", classObject);
                    if (classObject != null) {
                        let cardItems = {
                            bookingId: booking.id,
                            className: classObject.courseName,
                            studentName: booking.studentId,//-->name/phone/email
                            teacherName:booking.teacherId,
                            scheduleInfo: scheduleInfoStr,
                            status: booking.status
                        }
                        let cardContent = formACourseCardForTeacher(cardItems);
                    
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
     function formACourseCardForTeacher(cardInfo) {
         console.log("cardInfo:", cardInfo);

         const info = `
             <div class="course-card">
                 <div class="course-info">
                     <h4>${cardInfo.className}</h4>
                     <p>学生：${cardInfo.studentName} 老师：${cardInfo.teacherName} | 预约时间：${cardInfo.scheduleInfo} | 状态：${cardInfo.status}</p>
                 </div>
                 <div class="course-actions">
                     <button class="btn btn-gray" onclick="validReservation('${cardInfo.bookingId}')">确认预约</button>
                     <button class="btn btn-gray" onclick="viewMyReservationDetail('${cardInfo.scheduleInfo ? cardInfo.scheduleInfo.split(' ')[0] : ''}')">查看详情</button>
                
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
    /* 
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
  
   // 预览排期--TBD：带入createDTO，而不是form--调入时保存
   async function previewSchedule(courseScheduleCreateDTO) {
    //courseScheduleCreateDTO的样式：
    /*let form = {
        courseId:  scheduleObject.courseId ,
               scheduleId:scheduleObject.courseId  ,
               startDate:  scheduleObject.startDate,
               startTime: scheduleObject.startTime,
               repeatType:  scheduleObject.repeatType,
               interval:  
               status:   
               timeZone:  
               userTimeZone:  
               repeatDays: []
               endDate:  
           };*/
    // 生成排期列表 localDateTime List<Date,TIME>
    scheduleResult = await generateScheduleListFromServer(courseScheduleCreateDTO); 
    renderResult();
    renderCalendar(); 
}
 
 
async function getBookingData( userRole, useid,status) { 
    console.log("getBookingData:","userRole:",userRole, "useid:",useid,"status:",status)
    return await getBookingList(userRole, useid,status);
}
 
//读取排期时间表，显示在排期时间列表和日历上. 待appointment数据库完成TBD
async function viewMyReservationDetail(scheduleId){
    //
   // 通过scheduleId获取排期信息
   // 依赖: getScheduleInfoById、renderResult、renderCalendar
         // 返回结构示例: { scheduleId, times: [{date: "2026-04-19", time: "14:15:00"}, ...] }
           const scheduleInfo = await fetchSchedule(scheduleId);

           console.log("sInfo:",scheduleInfo);

           let ScheduleGenerateDTO= {
            courseId:  scheduleInfo.courseId,
            scheduleId:  scheduleInfo.scheduleId,
            startDate:  scheduleInfo.startTime.split(' ')[0], 
            startTime: scheduleInfo.startTime.split(' ')[1],
       
            repeatType: (function(val) {
                if (val == 0 || val === "0" || val === "none") return "none";
                if (val == 1 || val === "1" || val === "day") return "day";
                if (val == 2 || val === "2" || val === "week") return "week";
                if (val == 3 || val === "3" || val === "month") return "month";
                return val; // fallback
            })(scheduleInfo.repeatType),
       
            interval:  scheduleInfo.repeatInterval,
            status:    scheduleInfo.status,
            timeZone:  scheduleInfo.timeZone,
            userTimeZone:userTimeZone,
            repeatDays: scheduleInfo.repeatDays
              ? scheduleInfo.repeatDays.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n))
              : [],
       
            endDate:  scheduleInfo.endTime.split(" ")[0]
           }
console.log("ScheduleGenerateDTO:",ScheduleGenerateDTO);
       const appointmentResults = await generateScheduleListFromServer(ScheduleGenerateDTO); 
       console.log("appointmentResults:",appointmentResults);
  /* let scheduleResult = [ { date:"2026-4-19",time:"14:15:00"},
    { date:"2026-4-20",time:"14:15:00"}  
   ] ;*/// 日期时间-》转为用户当前时区

   renderResult(appointmentResults);
   renderCalendar(appointmentResults);
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
  if(dateTimeList == null )
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
 
  //判断预约状态，如果是booking、canceling，可确认
  // 其中，booking-》booked --》创建预约事件列表
  //     canceling-->canceled ,把预约时间列表各项的状态修改为取消 ，
  // ”删除命令“则删除bookID对应的booking、及对应的所有预约事件列表

  async function validReservation(bookingid) { 
     const formData = getBookFormData();  
    //await operateBookingStatus( bookingid,formData.status != "booked"?"canceled":"canceling");  
 if(formData.status == "booking")
 { // 获取时间列表
    scheduleResult = await generateScheduleListFromServer(courseScheduleCreateDTO);
     // 遍历scheduleResult数组的每个元素，添加到appointment_datetime中
     let appointmentDateTimeList = [];
     if (Array.isArray(scheduleResult)) {
         scheduleResult.forEach(item => {
             // 假设item中有appointment_datetime字段，如果不是可根据实际字段名调整
             // 这里假设item就是约定的预约时间对象或类似格式
             if (item.appointment_datetime) {
                 appointmentDateTimeList.push(item.appointment_datetime);
             } else {
                 appointmentDateTimeList.push(item); // 如果就是字符串时间戳
             }
         });
     }
     let AppointmentData ={
       bookingId:bookingid,
       scheduleId:formData.scheduleId,
       studentId:formData.studentId,
       courseId: formData.courseId,
       teacherId: formData.teacherId,
       timeZone: formData.timeZone,// 排期所用的时区
       appointmemnt_datetime:null,
       last_datetime:null,
       lessenIndex:0,

     }

    await operateBookingStatus( bookingid, "booked");
 } else {

    await operateBookingStatus( bookingid, "canceled") ;
 }

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
    
       async function cancelBooking(bookingid){


            }

            async function validBooking(bookingid){


            }
     // 解决“找不到函数loadSchedule”问题：确保loadSchedule在window作用域下暴露
     window.previewSchedule   = previewSchedule; 
     window.renderCalendar    = renderCalendar ; 
     window.getBookingList  = getBookingList ;  
     window.cancelBooking   = cancelBooking ; 
     window.validBooking   = validBooking ; 
     window.refreshData   = refreshData  ; 
     window.formACourseCardForTeacher   = formACourseCardForTeacher  ;  
     
     window.viewMyReservationDetail   = viewMyReservationDetail  ; 
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