 
 //teaher---上课通知--7天内的课程显示-----
// ===================== 核心函数 =====================
 
let DaysAppointmentList=[];// ID,ciurseName,studentName,teacherName,dateTime(创建时间),状态、操作（预览、确认、拒绝） 
 
 
window.refreshAppointmentNotesForTeacher  = refreshAppointmentNotesForTeacher ;  
window.refreshOnedayAppointmentNotesForTeacher  = refreshOnedayAppointmentNotesForTeacher ;  
//七日内上课
 async function refreshAppointmentNotesForTeacher(renderTo){
    let days = 7; //TBD 选择 7天、3天、当天1
   // let userid = userId;//
   // let role=  userRole ;
 
    DaysAppointmentList =  await getAppointmentListData({Days:days,UserId:userId,Role:userRole});//利用userid的过滤 ok
    const renderId=renderTo;
    showAppointmentList( DaysAppointmentList,renderId);  //defined in appointmentNotes.js
 }  

//显示当天的课程列表--今日课程
 async function refreshOnedayAppointmentNotesForTeacher(renderTo){
    let days = 1; //TBD 选择 7天、3天、当天1  
    DaysAppointmentList =  await getAppointmentListData({Days:days,UserId:userId,Role:userRole});//利用userid的过滤 ok
    const renderId=renderTo;
    showAppointmentList( DaysAppointmentList,renderId);  //defined in appointmentNotes.js
 }     
 /*我的工作台 模板1
<div class="course-card">
                  <div class="course-info">
                    <h4>英语进阶写作</h4>
                    <p>预约人：李四 | 时间：16:00-17:00 | 状态：已确认</p>
                  </div>
                  <div class="course-actions">
                    <button class="btn btn-gray" onclick="viewDetail(this)">查看详情</button>
                  </div>
                </div>
      */