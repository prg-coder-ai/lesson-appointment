 
 //studnet ,same as teaher---上课通知--7天内的课程显示-----
// ===================== 核心函数 =====================
 
let DaysAppointmentList=[];// ID,ciurseName,studentName,teacherName,dateTime(创建时间),状态、操作（预览、确认、拒绝） 
 
 
window.refreshAppointmentNotesForStudent  = refreshAppointmentNotesForStudent ;  

 async function refreshAppointmentNotesForStudent(renderTo){
     let days = 1; //TBD 选择 7天、3天、当天1
  //  let userid = userId;//
   // let role=  userRole ;
   DaysAppointmentList =  await getAppointmentListData({Days:days,UserId:userId,Role:userRole});//TBD:添加 userid的限制
    const renderId=renderTo;
    showAppointmentList( DaysAppointmentList,renderId); 
 }  
      