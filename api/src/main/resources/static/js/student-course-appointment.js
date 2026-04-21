 //预约管理--页面
 //展示本人的所有预约列表，提供预约详情---展示排期列表（使用“取消预约”操作）
 // student-course-appointment.js
 console.log("student appointment  page");
   // 从token中获取用户的id和role
   let token =getToken();// localStorage.getItem('token') || sessionStorage.getItem('token');
   const userInfo= getCurrentUserInfo();
   console.log("userInfo",userInfo);
   let userId = userInfo.userId;
   let userRole = userInfo.role;
    // 获取用户时区（关键）
const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
console.log("tz",userTimeZone);

let courseList = [];       // 课程列表
let scheduleObject=null;       // 排期
let scheduleList =[];
let bookingList=[];
let currentCourseId=null;
let selectedScheuleId = null;
let currentCourseIndex =-1,currentScheduleIndex =-1;
let    lastCourseIndex =-1,   lastScheduleIndex =-1;
var localParameter ={
  currentPage:1,         // 当前页码（初始值由Thymeleaf渲染）
  pageSize : 10,           // 页大小
  total : 0 ,              // 总条数
  ScheduleDialogVisible: false, // 弹窗状态
  dialogTitle : '新增课程', // 弹窗标题
  currentId: '', // 当前操作的课程ID
  formEl :'' 
};
// ===================== 核心函数 =====================

/**
 * 渲染课程列表（核心：原生JS操作DOM）
 * 对于学生，仅显示已发布的课程（status=active）
 */
async function renderStudentBookingCards() {
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
    <div class="form-line">        
        
    <div class="card" id="bookingcards">
        <!-- 预约信息列表及操作 -->
    </div?
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

       // 动态生成每月1-31号复选框，每10个换一行 
        let monthDaysHtml = '';
        for (let i = 1; i <= 31; i++) {
            monthDaysHtml += `<label><input type="checkbox" value="${i}">${i}</label>`;
            if (i % 10 === 0 && i !== 31) monthDaysHtml += '<br>';
        } 
        document.getElementById('monthDays').innerHTML = monthDaysHtml;
 
      
 
//更新scheduleObject相关内容 --待细化
//可简化为：日期范围，时间，排期计划
function renderSchedule(scheduleObject) {
    if (!scheduleObject) return;
     let info="";

      // 刷新开始日期
      if (scheduleObject.scheduleId) 
         info += scheduleObject.scheduleId;
     //name
         

    // 刷新开始日期
    if (scheduleObject.startDate) {
        info += scheduleObject.startDate;
    }  

    // 刷新开始时间
    if (scheduleObject.startTime) {
        info +=  scheduleObject.startTime;
    }  
    // 刷新重复类型
    if (scheduleObject.repeatType) {
         //scheduleObject.repeatType;
    }  

    // 刷新重复间隔
    if (scheduleObject.interval) {
       // scheduleObject.interval;
    }  
  

    // 刷新结束日期
    if (scheduleObject.endDate) {
        // scheduleObject.endDate;
    }  
      
    // 获取下拉框 
        //  scheduleObject.repeatType;   
  

    // 刷新每周/每月重复星期（如有）
   // if ( scheduleObject.repeatType === 2 && Array.isArray( scheduleObject.repeatDays)) 

     //scheduleObject.repeatType === 3  && Array.isArray( scheduleObject.repeatDays)) {
            
}
 
     // 解决“找不到函数loadSchedule”问题：确保loadSchedule在window作用域下暴露
   window.previewSchedule   = previewSchedule;
   window.freshByRepeatType = freshByRepeatType;
   window.renderCalendar    = renderCalendar ;
  
   window.displaySchedule  = displaySchedule ;
   window.makeOneBooking = makeOneBooking ;//make a apointment

   window.deleteBooking   = deleteBooking ;
   window.cancelBooking   = cancelBooking ;

   window.resetSchedule = resetSchedule ;   
   window.refreshData   = refreshData 
   window.loadSchedule  = loadSchedule;
   window.reloadBooking = reloadBooking ;
   window.operateBookingStatus  = operateBookingStatus;

   //将当前排期数值为初始值，方便修改
   function resetSchedule(){
    obj=resetScheduleObject();
    renderSchedule(obj); 
   }
    
 
   // 预览排期--TBD：带入createDTO，而不是form--调入时保存
   async function previewSchedule(courseScheduleCreateDTO) {
    //TBD
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
               repeatDays: 
               endDate:  
           };*/
    // 生成排期列表 localDateTime List<Date,TIME>
    scheduleResult = await generateScheduleListFromServer(courseScheduleCreateDTO); 
    renderResult();
    renderCalendar(); 
}
 
//getBookingInfo 
let  bookingList =[];
async function getBookingData( userRole, useid,status) { 
    bookingList = getBookingList(userRole, useid,status);
}
   
// 渲染排期列表
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
  function getBookFormData(){

    const bid = document.getElementById("bookingId").value;
    const bst = document.getElementById("bookingStatus").value;
    return  { bookingid:bid,status: bst}; 
  }
//预定状态：booking 、book-proved、canceling，cancel-proved，删除delete
  // 删除--只有没有确认的预约，或者已经确认取消的才可由学生自行删除，不涉及时间列表。
  // 管理员确认取消后，可删除该预约及对应的预约时间列表
  async function deleteBooking() {
    const formData = getBookFormData();
    if ( (formData.status=="booking") ||  (formData.status=="canceled") )
       await operateBookingStatus(formData.bookingid,"delete"); 
    else   { 
    alert("请联系老师，确认后才能删除");
    }
  }
  //判断预约状态，如果是booking则可直接取消，如果是booked,则设置为canceling，等待确认
  async function cancelBooking() { 
     const formData = getBookFormData(); 

     await operateBookingStatus(formData.bookingid,formData.status != "booked"?"canceled":"canceling");  
  }

 function refreshData(){
    //再次读取排期数据并显示
    loadSchedule(); 
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
    
     
    console.log("schedule page END");
}

// 设置下拉框为禁止选择（只读/不可操作），可以为元素加 disabled 属性，例如：
// document.getElementById("bookingStatus").disabled = true;

// 恢复可选择：
// document.getElementById("bookingStatus").disabled = false;



/**
 * 学生课程预定管理页面：
 * 1、课程选择：提供检索字段：课程名称、语言、难度、教师
 *     1.1 用下拉菜单显示检索到的课程列表，单选
 *     
 *  2、根据选择的课程，查询对应的排期，显示排期参数（允许修改）：
 *    2.1 开始日期，开始时间
 *        重复类型：下拉菜单：不重复、每天、每周、每月
 *        重复间隔：N（天、周、月)
 *        重复时间： 周一~周日（每周）或者 月初到月末（每月）
 *        结束日期： 
 *    2.2 读取用户对当前排期的预定
 *    2.2 显示操作按钮：预览、预定、取消预定、删除
 *    2.3 排期结果显示区域：
 *    2.3.1 列表显示：年月日、时分
 *    2.3.2 日历显示：在日历上标记所有的排期日期
 * 
 * 日历显示属性：
 *   排期中已经设置的日期----用背景色块表示
 *   TBD:1 检查不可选择的排期（已报满） 
 *   TBD:2 按天预约的情况：已排期--可用、不可用、选择、不选择的情况
 * 
 * 
 * 数据操作：对于学生，新建booking： 添加booking，把排期时间列表插入到appointment数据表
 *                   修改booking状态： 取消（预定如果没有被确认）、预定（取消如果没有被确认）、删除（如果没有待确认的取消，没有已确认的预定，可自行删除）
 *                                    修改的同时，更新对应的appointment中的对应数据（按booking.id ）
 *  booking:对于教师： 1、检查自己的所有预定
 *                    2、确认 预定、确认预订取消
 *                    3、临时调整已预定的个别课次的时间：（appointment）
 *  对应的controller：
 *        insert、update、updateStatus
 * 
 * <select id="bookingStatus">
                <option value="none">无预约</option>
                <option value="booking">已预约,待确认</option>
                <option value="booked">预约成功</option>
                <option value="canceling">取消待确认</option>
                <option value="canceled">已取消</option>
                 <option value="completed">已完成</option> 
            </select>
 * **/ 
  // 只要 DIV 未从 DOM 移除，其内容都能通过 JavaScript 获取和修改。 
// 结论：只要元素还在DOM树中，display:none不会影响JS用value/innerText等API访问或修改其内容