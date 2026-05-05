 //排期管理--页面
 // student-course-booking.js
 console.log("student book a appointment  page");
   // 从token中获取用户的id和role api.js 
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
     <div class="search-bar">
        <input type="text" id="courseName" placeholder="课程名称">
        <select id="language">
            <option value="">语言</option>
            <option value="zh">法文</option>
            <option value="en">中文</option>
            <option value="en">英文</option>
        </select>
        <select id="difficulty">
            <option value="">难度</option>
            <option value="easy">初级</option>
            <option value="middle">中级</option>
            <option value="hard">高级</option>
        </select>
        <input type="text" id="teacher" placeholder="教师">
        <button class="btn-primary" onclick="searchCourse()">检索课程</button>
    </div>

    <!-- 课程选择下拉 隐含教师ID-->
    <div class="form-line">
        <label>选择课程：</label>
        <input type="text" id="teacherIdForCourse" style="display:none;">
   
        <select id="courseSelect" onchange="loadSchedule()">
            <option value="">请先选择课程</option>
        </select>
    </div>
     <!-- 排期选择下拉 -->
       <div class="form-line">
        <label>选择排期：</label>
        <select id="scheduleSelect" onchange="displaySchedule()">
            <option value="">请选择排期</option>
        </select>
    </div>
    <div class="section">
        <div class="section-title">排期信息</div>

        <div class="form-line" style="display:none;">
            <label>Id</label> 
            <input type="label" id="scheduleId">
        </div>

        <div class="form-line" style="display:none;">
            <label>cId</label>
            <input type="label" id="courseId">
        </div>
           
         <div class="form-line" style="display:none;">
            <label>排期时区</label>
            <input type="label" id="originalTimeZone" value=""  style="display:none;">
        </div>
        <div class="form-line  nofocus">
            <label>时区</label>
            <input type="label" id="timeZone" value="">
       
        </div>

        <div class="form-line  nofocus" style="display: flex;"> 
                <label>开始日期：</label>
                <input type="date"  align-items: right; id="startDate" value="${(new Date()).toISOString().split('T')[0]}">
            </div>

            <div class="form-line  nofocus">
                <label >上课时间：</label>
                <input type="time" id="startTime" value="${(function(){ let d = new Date(); return d.toTimeString().slice(0,5); })()}">
            </div>
         
    
        <div class="form-line  nofocus" > 
                <label>结束日期：</label>
                <input type="date" id="endDate" value="">
            </div> 
         
        <div class="form-line  nofocus">
            <label>重复类型：</label>
            <select id="repeatType" onchange="freshByRepeatType()">
                <option value="none" disabled:true>不重复</option>
                <option value="day" disabled:true>每天</option>
                <option value="week" disabled:true>每周</option>
                <option value="month" disabled:true>每月</option>
            </select>
        </div>

        <div class="form-line  nofocus">
            <label>重复周期：</label>
            <input type="number" id="interval" value="1" min="1" style="width:80px">
            <span id="repeatUnit">天</span>
        </div>

        <div class="form-line  nofocus" style="display:none;">
            <label>状态：</label>
           <select id="status" style="display:none;">
                <option value="pending">待发布</option>
                <option value="inactive">已收回</option>
                <option value="active">已发布</option>
                <option value="frozen">已删除</option>
            </select>
        </div>

        <!-- 每周重复：星期选择 -->
        <div class="form-line  nofocus" id="weekDaysBox" style="display:none;">
            <label>重复星期：</label>
            <div id="weekDays">
                <label><input type="checkbox" value="1"  >周一</label>
                <label><input type="checkbox" value="2" >周二</label>
                <label><input type="checkbox" value="3" >周三</label>
                <label><input type="checkbox" value="4"  >周四</label>
                <label><input type="checkbox" value="5"  >周五</label>
                <label><input type="checkbox" value="6"  >周六</label>
                <label><input type="checkbox" value="7"  >周日</label>
            </div>
        </div>

         <!-- 每月重复： -->
        <div class="form-line nofocus" id="monthDaysBox" style="display:none;">
            <label>重复日期：</label>
            <div id="monthDays">                  
            </div>
        </div>      
    </div>
  
    <!-- 预约状态显示和选择 TBD -->
    <div class="form-line">        
          <label><input type="label" id="bookingId" value=""   style="display:none;"></label>  
    </div>
    <div class="form-line  nofocus">
      <label>预约状态：</label>
          <select id="bookingStatus">
                <option value="none">无预约</option>
                <option value="booking">已预约,待确认</option>
                <option value="booked">预约成功</option>
                <option value="canceling">取消待确认</option>
                <option value="canceled">已取消</option>
                 <option value="completed">已完成</option> 
            </select>
    </div>
    <!-- 操作按钮 -->
    <div class="btn-group"> 
        <button class="btn-primary" onclick="previewSchedule()">预览排期</button>
        <button class="btn-primary" onclick="makeOneBooking()">预定课程</button>
        <button class="btn-danger"  onclick="cancelBooking()">取消预定</button> 
        <button class="btn-danger"  onclick="deleteBooking()">删除预定</button>
        <button class="btn-success" onclick="refreshData()">刷新</button>
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
      
    
    searchCourse();  


 // 1. 检索课程（原生 fetch）,只检索status:"active" 已发布课程
 // 从course中的teacherid-》姓名
 async function searchCourse() { 
        const params = {
            courseName: document.getElementById('courseName').value||"",
            languageType: document.getElementById('language').value||"",
            difficultyLevel: document.getElementById('difficulty').value||"",
            teacherName: document.getElementById('teacher').value|| "",
            status:"active"
        }; 
  console.log("search",params);//TBD---
  //lastCourseIndex =currentCourseIndex;
 // currentCourseIndex =-1;
  try { 
    courseList=  await  getCourseList( params); 
  } catch (e) {
      // 模拟数据
      courseList = [ ];
     
      //alert("模拟课程加载成功");
  }
  console.log("search",courseList);
     renderCourseSelect();
}

//把courseList列在下拉框中
function renderCourseSelect() {
  const sel = document.getElementById('courseSelect');


  sel.innerHTML = '<option value="">请选择课程</option>';
  courseList.forEach(item => {
    if(item.status=='active'){
      const opt = document.createElement('option');
      opt.value = item.courseId;
      opt.innerText = item.courseName;
      sel.appendChild(opt);
    }
  });
 /* if(lastCourseIndex>=0)
  {
   if(courseList.length>lastCourseIndex )
    currentCourseIndex = lastCourseIndex; 
  }
  if(currentCourseIndex ==-1)
    currentCourseId =0;
    sel.index =currentCourseIndex; 
    */
}

//更新scheduleObject相关内容 --待细化
//可简化为：日期范围，时间，排期计划
function renderSchedule(scheduleObject) {
    if (!scheduleObject) return;
     console.log("renderSchedule",scheduleObject);

      // 刷新开始日期
      if (scheduleObject.scheduleId) {
       document.getElementById('scheduleId').value = scheduleObject.scheduleId;
       console.log("scheduleId",scheduleObject.scheduleId);
       console.log("scheduleId", document.getElementById('scheduleId').value);
   } else {
       document.getElementById('scheduleId').value = '';
   }
  
 // 刷新开始日期
 if (scheduleObject.startDate) {//原排期时区--用于测试比较
    document.getElementById('originalTimeZone').value = scheduleObject.timeZone;
} else {
    document.getElementById('originalTimeZone').value = '';
}
document.getElementById('timeZone').value = userTimeZone;

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
    if (scheduleObject.repeatType) {
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
     
    console.log("repeatDs:",scheduleObject.repeatDays,scheduleObject.repeatType);
    
    // 获取下拉框
   const sel = document.getElementById('repeatType');
   if(sel!= null) {
       sel.selectedIndex = scheduleObject.repeatType;   
   }

    // 刷新每周/每月重复星期（如有）
    if ( scheduleObject.repeatType === 2 && Array.isArray( scheduleObject.repeatDays)) {
        const checkboxes = document.querySelectorAll('#weekDays input[type="checkbox"]');
        checkboxes.forEach(cb => {
            cb.checked =  scheduleObject.repeatDays.includes(Number(cb.value));
        });

    } else   if ( scheduleObject.repeatType === 3  && Array.isArray( scheduleObject.repeatDays)) {
           const checkboxes = document.querySelectorAll('#monthDays input[type="checkbox"]');
           checkboxes.forEach(cb => {
               cb.checked =  scheduleObject.repeatDays.includes(Number(cb.value));
           });
   } 
   freshByRepeatType(); 
}


    // 切换重复类型:更新复选的重复天数：周一~7，月（1-31）
    function freshByRepeatType() {
      const type = document.getElementById('repeatType').value;
      const unit = { none: "", day: "天", week: "周", month: "月" };
      document.getElementById('repeatUnit').innerText = unit[type];
      document.getElementById('weekDaysBox').style.display = ( type === 'week') ? 'flex' : 'none';
      document.getElementById('monthDaysBox').style.display = ( type === 'month') ? 'flex' : 'none';
  }
   
     // 解决“找不到函数loadSchedule”问题：确保loadSchedule在window作用域下暴露
   window.searchCourse      = searchCourse;  
   window.previewSchedule   = previewSchedule;  
   window.freshByRepeatType = freshByRepeatType;
   window.renderCalendar    = renderCalendar ;
  
   window.displaySchedule  = displaySchedule ;
   window.makeOneBooking   = makeOneBooking ;//make a apointment

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
   
   function resetScheduleObject(){
  // 清理scheduleObject的各个字段
  scheduleObject = {
    scheduleId: "",
    courseId: currentCourseId,
    courseName: "",
    teacherId: "",
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
    userTimeZone:userTimeZone       
};  
return  scheduleObject;
   }

   
     // 加载课程排期---
    async function loadSchedule() {
      const cid = document.getElementById('courseSelect').value; 
      if (!cid) return [];
      currentCourseId = cid;
       
        // 把页面的courseId节点内容设置为cid
        const courseIdElem = document.getElementById('courseId');
        if (courseIdElem) {
            courseIdElem.value = cid;
        }
      // 根据 courseList 查询指定 id = cid 的元素
      let selectedCourse = null;
      if (Array.isArray(courseList)) {
          selectedCourse = courseList.find(course => course.courseId === cid);
          if (selectedCourse!= null){//更新当前教师ID
            document.getElementById('teacherIdForCourse').value= selectedCourse.teacherId; 
            //TBD:显示教师名称
          }
      }
      try {
        let cnt=0; //查找指定课程的有效排期
        scheduleList = await fetchScheduleList(cid,"active");
        console.log(" scheduleList",scheduleList) ;

        if (scheduleList && scheduleList.length > 0) {           
            // 把scheduleList列表按scheduleId值添加到scheduleSelect下拉列表中
            const scheduleSelect = document.getElementById('scheduleSelect');
            if (scheduleSelect) {
                // 先清空原有选项
                scheduleSelect.innerHTML = '<option value="">请选择课程排期</option>';
                scheduleList.forEach(schedule => {
                    if(schedule.status=='active'){ //TBD:--过滤在后端完成
                        cnt++;
                    // scheduleId和排期信息（可展示更多）
                    const opt = document.createElement('option');
                    opt.value = schedule.scheduleId;
                    // 展示排期信息，如果有startDate等可拼接
                    let displayText = `排期ID: ${schedule.scheduleId}`;
                    if (schedule.startDate && schedule.startTime) {
                        displayText += ` / ${schedule.startDate} ${schedule.startTime}`;
                    } else if (schedule.startDate) {
                        displayText += ` / ${schedule.startDate}`;
                    }
                    opt.innerText = displayText;
                    scheduleSelect.appendChild(opt);
                }
                }); 
            }
           
            //更新排期的显示
            /*if(lastCourseIndex != -1)
              if(scheduleList.length>currentScheduleIndex)
                { currentScheduleIndex = lastCourseIndex;
                }else {
                    currentScheduleIndex = 0;  
                }
            scheduleSelect.index = currentScheduleIndex;
            lastCourseIndex =currentScheduleIndex ;
             */
          } 
        if(cnt > 0) return;
      } catch (e) {
        //  alert("没有找到该课程的排期，请联系老师",e);
        cnt = 0;
      } 
      if(cnt==0)  {
        scheduleSelect.innerHTML = '<option value="">暂时该课程没有排期</option>';
        scheduleObject = resetScheduleObject();//清理显示区
        renderSchedule(scheduleObject);
    } 
  }
  //当排期列表选择变化时，重新显示排期计划及预定情况
   function displaySchedule() {
        // 查询scheduleSelect下拉框的当前，获取数据，调用 renderSchedule 更新当前选择 
        const scheduleSelect = document.getElementById('scheduleSelect');
        if (!scheduleSelect) return;
        const selectedId = scheduleSelect.value;
        if (!selectedId) return;
        
        // 在 scheduleList 中查找对应的排期对象
        const selectedSchedule = scheduleList.find(s => String(s.scheduleId) === String(selectedId));
        if (selectedSchedule) {
            scheduleObject = selectedSchedule;  
                if (typeof renderSchedule === 'function') {
                        renderSchedule(scheduleObject);
                    }
                    selectedScheuleId = selectedId;
                    reloadBooking();
                }  
   }
 
  
   function  getScheduleFormData(){
    const form = {
        courseId: document.getElementById('courseId').value,
        scheduleId: document.getElementById('scheduleId').value,
        startDate: document.getElementById('startDate').value,
        startTime: document.getElementById('startTime').value,
        repeatType: document.getElementById('repeatType').value,
        interval: document.getElementById('interval').value,
        status:  document.getElementById('status').value,
        timeZone: document.getElementById('originalTimeZone').value, //保持原始时区---排期的时区
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
        endDate: document.getElementById('endDate').value,
      
    }; 
    console.log("form:",form);
    return form;
   }

   // 预览排期
   async function previewSchedule() {
     const form = getScheduleFormData();
   
    // 生成排期列表 localDateTime List<Date,TIME>
    scheduleResult = await generateScheduleListFromServer(form); 
    renderResult();
    renderCalendar(); 
}

// 
 
  //根据排期id、用户角色和用户id，查询预约信息。可复用于检索教师的预约
  //返回 Booking 列表
  //在排期列表选择变化时调用，更新对应的预定状态
/**
 * 错误分析：
 * 
 * 出现该错误的原因是：后端接口 `@RequestBody BookingQueryParaDTO dto` 预期接收的是一个 JSON 对象（单个BookingQueryParaDTO实例），
 * 而前端请求发送了一个JSON数组或body格式不符合预期。
 * 
 * 对照当前getBookingInfo的实现，发现：
 *   body:params 直接赋值一个对象并没有转换为JSON字符串，fetch请求的body如果是对象会被序列化为[object Object]，不是有效的JSON。
 * 正确做法应为：
 *   - 使用JSON.stringify(params)
 *   - Content-Type: application/json
 * 
 * 另外，接口期望"POST /course/booking/list"发送JSON对象，不是数组。
 *  
 */
 
  //根据bookingObject的状态，显示是否已预定
  function renderStudentBookingStatus(bObj) {
    console.log("renderStudentBookingStatus:",bObj);
    const bidItem = document.getElementById('bookingId');
    bidItem.value=(bObj)?bObj.id:"";
    const listStatus = document.getElementById('bookingStatus');
  if (bObj == null) {
    listStatus.value ="none";
  } else {
    listStatus.value =bObj.status;
  } 
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
 //TBD:修改一个预约后，按照预约id，查询获取预约对象，更新预约号状态
  //   uodate or insert 
  async function makeOneBooking() { 
    const status = "booking"; 
    const formData = getScheduleFormData(); 
    const teacharId = document.getElementById('teacherIdForCourse').value;
    console.log("save form:",formData,userId,userRole);   
/*  private String bookingId;  
    private String scheduleId;  
    private String studentId;   
    private String status;
*/
     const bidItem = document.getElementById("bookingId");
     const token =getToken();
     let bookingid=  bidItem.value;  
    let dto = {
        bookingId: bookingid|| "",
        scheduleId: formData.scheduleId || "", 
        studentId:  userId,
        teacherId:  teacharId,
        status:status
    };
      
    //console.log("BK save  dto:",dto);
    const url = bookingid !=""? `course/booking/update/${bookingid}` : `course/booking`; 
    //console.log("BK save  dto url:",url);
    try{
      const res= await fetch(`${API_BASE_URL}/${url}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          "Authorization": "Bearer " + token
        },
        credentials: 'include',
        body: JSON.stringify(dto)
      });
      const result = await res.json();
     // console.log("res:",result);
       // 4.  响应处理 响应成功/失败 result.data.id = new id
       if (result && result.code === 200) {
        alert(bookingid !="" ? '修改成功' : '创建成功'); 
        // 设置新的状态---- result.data ：result返回的booking的id，更新显示，直接更新
         reloadBooking( );
    } else {
        alert(result.data?.message + (bookingid!=""  ? '修改失败' : '创建失败'));
    }
    }catch(err){
        alert('网络异常，操作失败');
        console.error(err);  
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
    if ( (formData.status=="booking") ||  (formData.status=="canceled") ){
       await operateBookingStatus(formData.bookingid,"delete"); 
       reloadBooking( );
    }
    else   { 
    alert("请联系老师，确认后才能删除");
    }
  }
  //判断预约状态，如果是booking则可直接取消，如果是booked,则设置为canceling，等待确认
  async function cancelBooking() { 
     const formData = getBookFormData(); 

     await operateBookingStatus(formData.bookingid,formData.status != "booked"?"canceled":"canceling");  
     reloadBooking();
  }

 function refreshData(){
    //再次读取排期数据并显示
    loadSchedule(); 
 }

    //在状态变化时，更新预约状态，参数暂无用
    async function  reloadBooking(){ 
         //const bidItem = document.getElementById("bookingId");
         //bidItem.value = bookingid;
         if(selectedScheuleId != null) {
            const bookingObjectList =    await getBookingInfo(selectedScheuleId,userRole,userId); 
            console.log("bookingObjectList:",bookingObjectList)
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