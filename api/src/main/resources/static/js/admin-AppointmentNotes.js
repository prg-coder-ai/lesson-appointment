 
 //admin---上课通知--3天内的课程显示-----
// ===================== 核心函数 =====================
 
let appointmentList=[];// ID,ciurseName,studentName,teacherName,dateTime(创建时间),状态、操作（预览、确认、拒绝） 
 
 // 引入分页组件js
 document.write('<script src="/js/public/pagefoot.js"></script>');
 window.refreshAppointmentNotes  = refreshAppointmentNotes ;  

 async function refreshAppointmentNotes(){
        assignLoadobjectListFunction( loadAndShowAppointmentPage);// assign
           // 渲染数据总览面板
           let html=
            `  <div class="card">           
            <div class="filter-bar">  
                <div class="filter-item">
                  <label><span data-term="course">课程</span>名称：</label>
                  <input type="text" id="course-name-input" placeholder="<span data-term="course">课程</span>名称">
                </div>
                      
                <div class="filter-item">
                  <label>天数：</label>
                  <select id="appoint-days-select">
                    <option value=-1>全部</option>
                    <option value=1>未来1天</option>
                    <option value=3>未来3天</option>
                    <option value=7>未来7天</option>
                   </select>
                </div> 
                  
                <div class="filter-item">
                  <label>状态：</label>
                  <select id="appoint-status-select">
                    <option value="">全部</option>
                    <option value="active">正常</option>
                    <option value="noted1">7日内通知</option>
                    <option value="noted2">正常 当日通知已发</option>
                    <option value="completed">已完成 通知已发出 </option> 

                    <option value="cancelling">取消待确认</option>
                    <option value="cancelled">已取消</option>
                    <option value="reject">已拒绝</option>

                    <option value="delete">已删除</option>                      
                    <option value="booked">预约已确认</option>
                    
                    <option value="t-cancelling">取消待确认(T)</option>
                    <option value="t-cancelled"> 已取消(T)</option>
                    <option value="t-reject">已拒绝(T)</option>
                      
                  </select>
                </div> 
                <button class="btn btn-default" onclick="localsearchAppoint()">
                  <i class="fa fa-search"></i> 搜索
                </button>
                <button class="btn btn-default" onclick="resetFilterAppoint()">
                  <i class="fa fa-redo"></i> 重置
                </button>
              </div> 
            <div class="table-container">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>序号</th>
                    <th  style="display:none;">预约ID</th>
                    <th><span data-term="course">课程</span>名称</th>
                    <th><span data-term="student">学生</span>姓名</th>
                    <th><span data-term="teacher">教师</span>姓名</th>
                    <th><span data-term="lessonTime">上课时间</span></th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody id="days-appointment-admin">
                  
                </tbody>
              </table>
            </div>
            </div>
           `;
           
         html += getPagebar();
         const dynamicContentCenter = document.getElementById('dynamic-content-center');
         if(dynamicContentCenter) {
            dynamicContentCenter.innerHTML =  html;  
            applyTerms(dynamicContentCenter);
         
         loadAndShowAppointmentPage();
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
      userId: userId,
      userRole: userRole,    
      name:   document.getElementById('course-name-input').value,
      days:   document.getElementById('appoint-days-select').value,
      status: document.getElementById('appoint-status-select').value 
   }
    if(userRole== "admin") {
      params.userId =null;
      params.userRole = null ;
    }

    Pagination.total = 0;
    Pagination.totalPages = 0;
    appointmentList = [ ];
 
     const pageResult = await fetchAppointmentListPage(params);
     if(pageResult){
      appointmentList = pageResult.rows;
      
      const pageData = pageResult;
      Pagination.total = pageData.total ;
      Pagination.totalPages = pageData.totalPages;
     } 
       showAppointmentList( appointmentList,renderTo); //defined in appointmentNotes.js
       renderPagination( Pagination);        
      
  }

  function localsearchAppoint() {
   Pagination.pageNum = 1;
   loadAndShowAppointmentPage();
}
// 重置筛选条件
function resetFilterAppoint() {
   document.getElementById('course-name-input').value = '';
   document.getElementById('appoint-days-select').value = ''; 
   document.getElementById('appoint-status-select').value = '';
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