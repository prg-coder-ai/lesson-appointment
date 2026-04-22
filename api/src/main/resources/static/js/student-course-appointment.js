 //预约管理--页面
 //展示本人的所有预约列表，提供预约详情---展示排期列表（使用“取消预约”操作）
 // student-course-appointment.js
 console.log("student appointment  page");
   
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
    
 async function refreshData(){
         let status=null;//不限制状态
         bookingList = await getBookingData( userRole, userId,status);
         console.log("books:",bookingList);

        // 遍历bookingList，对每个元素查询其scheduleId，获取排期信息scheduleInfo
        let bookingsHtml ="";
        if (Array.isArray(bookingList)) {
            bookingList.forEach(async (booking) => {
            // 查询排期信息，假设有 getScheduleInfoById 方法返回 Promise
            
                const scheduleObject = await fetchSchedule(booking.scheduleId);
                if(scheduleObject != null) {
                        let scheduleInfoStr =  getScheduleInfo(scheduleObject);
                        const classObject = await getCourseById(scheduleObject.courseId) ;
                        //TBD teacherId + user库--》teacherName
                        let cardItems = {
                            bookingId: booking.id,
                            className:classObject.className,
                            teacherName:classObject.teacherId,
                            scheduleInfo:scheduleInfoStr,
                            status:booking.status
                        }
                        let cardContent = formACourseCard(cardItems);
                        bookingsHtml += cardContent; 
                    }
            });
      }
      let bookingContainer =  document.getElementById("my-bookings");
 if (bookingContainer) {
     // 清空并插入新的内容
     bookingContainer.innerHTML = `<div class="bookings-list">${bookingsHtml}</div>`;
 }
    
 }
 
 async function getCourseById( courseId) {
    const conditionJson = { 
        courseId:courseId,
      teacherId:"",
      templateId:"",
      status:"" 
    };

    objList= await   fetchCourseList(conditionJson);
    
 }
 
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
        console.info("get response data:",res);
        if (res && res.code === 200) {
          //console.info("data.courses:",res.courses);  .courses
            CourseList = res.data|| []; 
        } else {
            alert(res?.message || '获取课程列表失败');
        }
    } catch (e) {
        alert("网络错误，获取模板列表失败");
        console.error(e);
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
     function  formACourseCard(cardInfo){
         return `
         <div class="course-card">
                  <div class="course-info">
                    <h4>${cardInfo.className}</h4>
                    <p>授课教师：${cardInfo.teacherName} | 预约时间：${cardInfo.schdeuleInfo} | 状态：${cardInfo.status}</p>
                  </div>
                  <div class="course-actions">
                    <button class="btn btn-gray" onclick="cancelReservation(${cardInfo.bookingId})">取消预约</button>
                    <button class="btn btn-gray" onclick="viewMyReservationDetail(${cardInfo.bookingId})">查看详情</button>
                  </div>
                </div>
         `
     }
      
 
//更新scheduleObject相关内容 --待细化
//可简化为：日期范围，时间，排期计划
function getScheduleInfo(scheduleObject) {
    if (!scheduleObject) return;
     let info="";

      // TBD:替代为排期名称
      if (scheduleObject.scheduleId)          info += scheduleObject.scheduleId;

    // 起始日期、结束日期和上课时间组成一句简洁文字
    if (scheduleObject.startDate || scheduleObject.endDate || scheduleObject.startTime) {
        let dateStr = '';
        if (scheduleObject.startDate && scheduleObject.endDate && scheduleObject.startDate !== scheduleObject.endDate) {
            dateStr = `${scheduleObject.startDate} ~ ${scheduleObject.endDate}`;
        } else if (scheduleObject.startDate) {
            dateStr = scheduleObject.startDate;
        }
        if (scheduleObject.startTime) {
            if (dateStr) {
                dateStr += ` / ${scheduleObject.startTime} 开课`;
            } else {
                dateStr = `${scheduleObject.startTime} 开课`;
            }
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
   window.renderCalendar    = renderCalendar ; 
   window.displaySchedule  = displaySchedule ;  
   window.cancelBooking   = cancelBooking ; 
   window.refreshData   = refreshData  ; 
   window.formACourseCard   = formACourseCard  ;
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
async function viewMyReservationDetail(bookingId){
   let scheduleResult = [ { date:"2026-4-19",time:"14:15:00"},
    { date:"2026-4-20",time:"14:15:00"}  
   ] ;// 日期时间-》转为用户当前时区
   renderResult(scheduleResult);
   renderCalendar(dateTimeList);
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
  async function cancelBooking(bookingid) { 
     const formData = getBookFormData();  
     await operateBookingStatus( bookingid,formData.status != "booked"?"canceled":"canceling");  
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