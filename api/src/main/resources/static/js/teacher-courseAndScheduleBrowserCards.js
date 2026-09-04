 
 // teacher-course-schedule.js
 // teacher---课程管理---查看排期---编辑、添加排期
 //查找属于自己的课程，可添加、编辑排期 
/*
var localParamter ={ 
  currentPage:1,         // 当前页码（初始值由Thymeleaf渲染）
  pageSize : 10,           // 页大小
  total : 0 ,              // 总条数
  CourseDialogVisible: false, // 弹窗状态
  dialogTitle : '新增课程', // 弹窗标题
  currentCourseId: '', // 当前操作的课程ID
  formEl :'', 
};*/
// ===================== 核心函数 =====================
let userTimeZoneDisplay="none";


 // 引入分页组件js
 document.write('<script src="/js/public/pagefoot.js"></script>');

/**
 * 渲染课程列表（核心：原生JS操作DOM）
 */

async function renderTeacherCourseAndScheduleBrowserCards() {
    assignLoadobjectListFunction( loadAndRenderCoursePage_teacher);// assign
    const dynamicContentCenter = document.getElementById('dynamic-content-center');
    if (!dynamicContentCenter) return; 
    // 显示加载中
  //  dynamicContentCenter.innerHTML = '<div style="padding:40px 0;text-align:center;">加载中...</div>';
    // 渲染HTML
    let html = '';
    
      html += `     
            <div class="modal-mask" id="courseModal">
            <div class="modal-content">
                <div class="modal-header">
                <h3 id="modalTitle"><span data-term="course">课程</span>列表</h3> 
                <hr style="margin: 16px 0; border-top: 1px solid #e9ecef;">
                </div> 
            </div>
            </div> `; 
      
             // 列表表头 ---模板-建立连接-悬浮显示模板内容（学生页面、管理、教师页面），教师--悬浮-显示教师的特色字段（学生页面）
         html += `
            <div style="display:flex;gap:36px;padding-bottom:8px;margin-bottom:4px;">
              <table width:90%>
                <thead>
                    <tr>
                        <th width:10%>序号</th> <th width:20%><span data-term="course">课程</span>名称</th>  <th width:20%>内容</th>  <th width:20%>特色</th>  <th width:10%>状态</th>  <th width:20% align:center>操作</th>  
                    </tr>
                </thead>
                <tbody id="courseResultBody"></tbody>
              </table>
            </div>
        `;
        html += getPagebar();
//TBD --排期分页 --2个分页元素的处理
        html += `
         <div id="scheduleListForm" style="display:none;">
           <div class="modal-header" >  
            <h3 id="modalTitle"><span data-term="course">课程</span>排期列表</h3> 
            <hr style="margin: 16px 0; border-top: 1px solid #e9ecef;"> 
          </div>
          <div style="display:flex;gap:36px;padding-bottom:8px;margin-bottom:4px;">
              <table width:90%>
                <thead>
                    <tr>
                        <th width:10%>序号</th> <th width:60%>排期信息</th>   <th width:10%>状态</th>  <th width:20% align:center>操作</th>  
                    </tr>
                </thead>
                <tbody id="schduleResultBody"></tbody>
              </table>
           </div>
        </div> 
      
        <div   class="section" id= "scdheduleDetailCard" style="display:none;"> 
          <h3 >排期详情</h3> 
            <hr style="margin: 16px 0; border-top: 1px solid #e9ecef;"> 
            <div class="form-line" style="display:none;" >
                <label>Id</label> 
                <input type="label" id="scheduleId">
            </div>

            <div class="form-line"  style="display:none;">
                <label>cId</label>
                <input type="label" id="courseId">
            </div>  

            <div class="form-line nofocus"  style="display:none;">
                <label><span data-term="teacher">教师</span></label>
                <input type="label" id="teacherNameForCourse" value="" class="readonly">
            </div>  

            <div class="schedule-container" style="display:flex;">    
            <!-- 左侧 -->
            <div class="schedule-column">
                <div class="form-line">
                    <label>排期时区：</label>
                    <input type="text" id="originalTimeZone" class="readonly">
                </div>

                <div class="form-line">
                    <label>开始日期：</label>
                    <input type="date" id="startDate" class="readonly">
                </div>

                <div class="form-line">
                    <label><span data-term="lessonTime">上课时间</span>：</label>
                    <input type="time" id="startTime" class="readonly">
                </div>

                <div class="form-line">
                    <label>结束日期：</label>
                    <input type="date" id="endDate" class="readonly">
                </div>
            </div>

            <!-- 右侧 -->
            <div class="schedule-column" id="rightBlock"  style="display:${userTimeZoneDisplay};">
                <div class="form-line">
                    <label>我的时区：</label>
                    <input type="text" id="timeZone" class="readonly">
                </div>

                <div class="form-line">
                    <label>开始日期：</label>
                    <input type="date" id="displayStartDate" class="readonly">
                    <input type="text" id="displayStartDate_weekday" class="readonly">
                </div>

                <div class="form-line">
                    <label><span data-term="lessonTime">上课时间</span>：</label>
                    <input type="time" id="displayStartTime" class="readonly">
                </div>

                <div class="form-line">
                    <label>结束日期：</label>
                    <input type="date" id="displayEndDate" class="readonly">
                    <input type="text" id="displayEndDate_weekday" class="readonly">
                </div>
            </div> 
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
        <div class="form-line nofocus" id="monthDaysBox" style="display:none;">
            <label>重复日期：</label>
            <div id="monthDays">                  
            </div>
        </div>      
   </div> 
        `;
       
   
    dynamicContentCenter.innerHTML = html;
    applyTerms(dynamicContentCenter);
    loadAndRenderCoursePage_teacher();
}
async function loadAndRenderCoursePage_teacher(){

    // 构建筛选条件 TBD
    const params =  { 
        teacherId:userId,
      //  templateId:null,
      //  status:null,
      //  courseName:null,
      //  languageType:null,
      //  difficultyLevel:null,
        pageSize: Pagination.pageSize,
        pageNum: Pagination.pageNum
  };

   try {
    const result = await request({url:`/course/page`,
                                   Method:"GET",
                                   params:params});
    //const result = await res.json();
    
    if (result ) {
      const pageData = result;//.data;
      // 更新分页状态
      Pagination.total = pageData.total;
      Pagination.totalPages = pageData.totalPages;
      courseList =  result.rows;// await getCourseList (conditionJson); 
         renderCourseList();
    // 渲染分页栏
        renderPagination( Pagination);        
    } else {
        Pagination.total = 0;
        Pagination.totalPages = 0;
        renderCourseList();
        renderPagination( Pagination);        
    }
  }
  catch (error) {
    console.error('加载课程列表失败：', error);
  }
}

async function renderCourseList(){ 
  const scheduleListBody = document.getElementById( "scheduleListForm");
  if(scheduleListBody){
    scheduleListBody.style.display = "none"; 
  }
  const body = document.getElementById('courseResultBody');
  body.innerHTML = ''; 

 /* if (!courseList.length) {
    body.innerHTML += '<div style="padding:40px 0;text-align:center;color:#999;">暂无数据</div>';
    return;
} */
  if(courseList!= null ) {
    var index=0;
    let teacherInfo=userInfo? userInfo.name : "n/a" ;
    courseList.forEach(item => { 
        index ++; 
        const tr = document.createElement('tr'); 
       
    tr.style.fontWeight = "400";
        tr.innerHTML = `<td>${index}</td><td>${item.courseName}</td><td>${item.content}</td> <td>${item.feature}</td>`;
        tr.innerHTML +=  
            item.status === "pending" ? '<td>待审核</td>' :
            item.status === "active" ? '<td>正常</td>' :
            item.status === "inactive" ? '<td>待启用</td>' :
            item.status === "frozen" ? '<td>已删除</td>' :
              `<td>${item.status||"未知"}</td>` 
         
       /*  const applyAddSchBtn = document.createElement('button');
        applyAddSchBtn.className = 'btn btn-success'; //  
        applyAddSchBtn.textContent = '增加排期'; 
        applyAddSchBtn.onclick = function() {
          AddScheduleforTheCourse(item.courseId); 
        } 
       
        tdBtn.appendChild(applyAddSchBtn);
         tr.appendChild(tdBtn);  
 */ 
         const tdBtn = document.createElement('td');
        const applyBrwSchBtn = document.createElement('button');
        applyBrwSchBtn.className = 'btn btn-success'; //  
        applyBrwSchBtn.textContent = '查看排期'; 
        applyBrwSchBtn.onclick = function() {
          browseScheduleforTheCourse(item.courseId); 
        }   
        tdBtn.appendChild(applyBrwSchBtn); 
        tr.appendChild(tdBtn);   
        body.appendChild(tr);
    });
    
    }
  }
  /* 
function  AddScheduleforTheCourse(courseId){
  //添加1个排期
  alert("tbd:AddScheduleforTheCourse " + courseId);
}*/

 // 罗列该课程的排期，列表 参考学生预约页面
 async function  browseScheduleforTheCourse(courseId){

 // alert("tbd:browseScheduleforTheCourse " + courseId); 
    const scheduleListBody = document.getElementById( "scheduleListForm");
    if(scheduleListBody){
    scheduleListBody.style.display = "block"; 
    }

 //关闭排期详情卡片 
   showScheduleCard(null);// 

   const scheduleList = await fetchScheduleList( courseId,"active");
// scheduleList:CourseScheduleCreateDTO
   if(Array.isArray(scheduleList) && scheduleList.length > 0){ 
    const body = document.getElementById('schduleResultBody');
    body.innerHTML = ''; 

   scheduleList.forEach(function(item, index) {
        info= getScheduleInfoByDTO(item);
        const tr = document.createElement('tr'); 
        
        tr.innerHTML = `<td>${index+1}</td><td>${info}</td> `;
        tr.innerHTML +=  
            item.status === "pending" ? '<td>待审核</td>' :
            item.status === "active" ? '<td>正常</td>' :
            item.status === "inactive" ? '<td>待启用</td>' :
            item.status === "frozen" ? '<td>已删除</td>' :
              `<td>${item.status||"未知"}</td>` 
         
        const applyAddSchBtn = document.createElement('button');
        applyAddSchBtn.className = 'btn btn-success'; //  
        applyAddSchBtn.textContent = '查看详情'; 
        applyAddSchBtn.onclick = function() { 
              showScheduleCard(item); //显示排期卡片----双时区----admin相关页面
        }   
        const tdBtn = document.createElement('td');
        tdBtn.appendChild(applyAddSchBtn);
        tr.appendChild(tdBtn);   
        body.appendChild(tr);
   });

   }
} 
// 显示排期卡片,双时区----参考学生预约页面
function showScheduleCard(schObj){
 // alert("tbd:showScheduleCard " + schObj); 
   
   let card = document.getElementById("scdheduleDetailCard"); 
   if(schObj==null){
    card.style.display =   'none'; return;
   } else {
    card.style.display =   'block';
   }
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

          renderSchedule(schObj);

        //如果排期时区与用户当前时区不一致的情况下，显示用户时区的时间
        if (schObj.timeZone !== userTimeZone) { 
          userTimeZoneDisplay="block";
          document.getElementById('rightBlock').style.display =userTimeZoneDisplay;
          getMyDatetime();//同步更新用户时区的时间
          getMyEndDatetime();//
        } else {
          userTimeZoneDisplay="none";
          document.getElementById('rightBlock').style.display =userTimeZoneDisplay; 
      } 

}

//可简化为：日期范围，时间，排期计划
function renderSchedule(scheduleObject) {
  if (!scheduleObject) return;
 
    // 刷新开始日期
    if (scheduleObject.scheduleId) {
     document.getElementById('scheduleId').value = scheduleObject.scheduleId;
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
 


async function getMyDatetime() {
  const displayTzInput = document.getElementById('timeZone');
  // 读取原时区、日期与时间。这些输入框id需与页面实际结构对应
  const timeZoneInput = document.getElementById('originalTimeZone');
  const startDateInput = document.getElementById('startDate');
  const startTimeInput = document.getElementById('startTime');

  const fromZone = timeZoneInput ? timeZoneInput.value : (window.formData && window.formData.timeZone) || "";
  const startDate = startDateInput ? startDateInput.value : "";
  const startTime = startTimeInput ? startTimeInput.value : "";

  const toTz= displayTzInput.value;
  // 组装为 DateTime 字符串（假定格式为: yyyy-MM-dd HH:mm:ss）
  const dateTimeStr = `${startDate} ${startTime.length === 5 ? startTime + ":00" : startTime}`;
  try { 
     
      let newTzDateTime = await tzSwitchTo(fromZone, dateTimeStr, toTz); 
      const newDateTime = newTzDateTime?newTzDateTime.dateTime:""; 
      if (typeof newDateTime === "string" && newDateTime.trim().length > 0 && newDateTime.includes(' ')) { 
          const [newDate, newTime] = newDateTime.split(' '); 
          document.getElementById('displayStartDate').value = newDate;
          document.getElementById('displayStartTime').value = newTime; 
          document.getElementById('displayStartDate_weekday').value = newTzDateTime.weekday; 
      } else {
          // 错误提示辅助调试
          console.error("tzSwitchTo 返回的 newDateTime 不是有效的字符串，值为：", newDateTime);
      }
         
  } catch (err) {
      alert("调用时区转换接口失败");
      console.error(err);
  } 
}
async function getMyEndDatetime() {
   const displayTzInput = document.getElementById('timeZone');
  // 读取原时区、日期与时间。这些输入框id需与页面实际结构对应
  const timeZoneInput = document.getElementById('originalTimeZone');
  const startDateInput = document.getElementById('endDate');
  const startTimeInput = document.getElementById('startTime');

  const fromZone = timeZoneInput ? timeZoneInput.value :   "";
  const startDate = startDateInput ? startDateInput.value : "";
  const startTime = startTimeInput ? startTimeInput.value : "";

  const toTz= displayTzInput.value;
  // 组装为 DateTime 字符串（假定格式为: yyyy-MM-dd HH:mm:ss）
  const dateTimeStr = `${startDate} ${startTime.length === 5 ? startTime + ":00" : startTime}`;
  try { 
      const newDateTime= await tzSwitchTo(fromZone,dateTimeStr,toTz);
       if(newDateTime) {
          const newDate = newDateTime.dateTime.split(' ')[0]; 
          document.getElementById('displayEndDate').value =newDate ;
          document.getElementById('displayEndDate_weekday').value = newDateTime.weekday ;
          //document.getElementById('startTime').innerHTML =newTime ; 
       } 
  } catch (err) {
      alert("调用时区转换接口失败");
      console.error(err);
  } 
}
//TBD :增加排期、删除排期--参照admin的排期页面