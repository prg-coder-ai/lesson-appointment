 
 //admin---上课通知--3天内的课程显示-----
// ===================== 核心函数 =====================
 
let DaysAppointmentList=[];// ID,ciurseName,studentName,teacherName,dateTime(创建时间),状态、操作（预览、确认、拒绝） 
 
 
window.refreshAppointmentNotes  = refreshAppointmentNotes ;  

 async function refreshAppointmentNotes(){
    let days = 1;
    await getAppointmentListData(days);
    const id="days-appointment";
    showAppointmentList( id); 
 }  
 //获取days天数以内的预约列表
 async function getAppointmentListData(days){ 
      DaysAppointmentList = await getAppointmentList(days); 
        
    console.log("DaysAppointmentList:", DaysAppointmentList);  
 
  } 


 //显示待确认预约
  async function showAppointmentList(id){
  //   const id = "pending-reservations";
     let pendingBookingsHtml = "";
     let index = 0;
     console.log("showAppointmentList:", DaysAppointmentList);  
 
     if (Array.isArray(DaysAppointmentList)) {
         // 用for...of+await，等待所有异步操作完成
         for (let appointment of DaysAppointmentList) { 
          index++;//读取对应的预定ID
          let  bookedObjectList = await getBookingObject(appointment.booking_id); 
          let bookedObject = bookedObjectList[0];
          if(bookedObject == null )
            continue;
          const scheduleObject = await fetchSchedule(bookedObject.scheduleId); 
             if (scheduleObject != null) {
                 let scheduleInfoStr = getScheduleInfo(scheduleObject); 
                 const classObject = await getCourseById(scheduleObject.courseId); 
                 const studentName = await getUserNameById(bookedObject.studentId);
                 const teacherName = await getUserNameById(bookedObject.teacherId);

               //  console.log("studentName:", booking.studentId,studentName);
               //  console.log("teacherName:", booking.teacherId,teacherName);
                 if (classObject != null) {
                     let cardItems = {
                         index: index,
                         scheduleId:    scheduleObject.scheduleId, 
                         origTz:        scheduleObject.timeZone,
                         appointId: appointment.id,
                         bookingId: bookedObject.id,
                         className: classObject.courseName,
                         studentName: studentName,//-->name/phone/email
                         teacherName: teacherName,

                         studentId :bookedObject.studentId,
                         teacherId :bookedObject.teacherId,

                         scheduleInfo: scheduleInfoStr, 
                         status: appointment.status
                     }
                     let cardContent = formBookingTr(cardItems);//TBD: table TR 
                     pendingBookingsHtml += cardContent;
                 } 
         }
     }
    } else {
      pendingBookingsHtml="<tr> <td> n/a </td> </tr>";
    }

     //在全部异步处理后再输出和渲染 
     let bookingContainer = document.getElementById(id);
     if (bookingContainer) {
         bookingContainer.innerHTML = ` ${pendingBookingsHtml}`;
     }

 }
 //检查status，只有待确认的booking、cancelling才显示待确认，并显示相应的按钮
 function checkAppointmentStatus(status) {
  if (status === 'active' ) {
    return '正常';
  } else   if   (status === 'cancelling' || status === 'canceling') {
    return '取消待确认';
  } else if (status === 'booked') {
    return '预约已确认';
  } else if (status === 'cancelled' || status === 'canceled') {
    return '已取消';
  } else if (status === 'deleted') {
    return '已删除';
  }
  return status;
 }
 function formBookingTr(cardInfo) {
  // console.log("cardInfo:", cardInfo); 
   const info = `
        <tr class="course-card">
            <td class="course-info">   ${cardInfo.index}</td>
            <td class="course-info" style="display:none;">${cardInfo.bookingId}</td>
       
            <td class="course-info">   ${cardInfo.className}</td>
           <td class="course-info">   ${cardInfo.studentName}</td>
           <td class="course-info">   ${cardInfo.teacherName}</td>
           <td class="course-info">   ${cardInfo.scheduleInfo}</td>
           <td class="course-info">    ${checkAppointmentStatus(cardInfo.status)}</td>
            ${
              (cardInfo.status === 'cancelled' || cardInfo.status === 'active')
                ? `<td class="course-info">
                    <button class="btn btn-success" onclick="sendNotesToTeacher('${cardInfo.teacherId}', '${cardInfo}')"><i class="fa fa-check"></i> 通知教师</button>
                    <button class="btn btn-success" onclick="sendNotesToStudent('${cardInfo.studentId}', '${cardInfo}')"><i class="fa fa-times"></i> 通知学生</button>
                   </td>`
                : `<td class="course-info"></td>`
            } 
            </tr>
   `;
 // console.log("cardContent:", info);
   return info;
} 

// 需要根据status， 发送通知--上课通知1、2（发送到双方） 或者停课通知（发送给没有提出停课的乙方）
async function sendNotesToTeacher(userId,cardInfo) {
 
   console.log(" sendNotesToTeacher:",userId, cardInfo);
   sendNotesTo(userId,cardInfo);
}
async function sendNotesToStudent(userId,cardInfo) {
  
  
   console.log("T sendNotesToStudent:", userId, cardInfo); 
   sendNotesTo(userId,cardInfo);
}  
//TBD :修改发送次数
async function sendNotesTo(userId,cardInfo) {
  
  //await operateBookingStatus(bookingId, 'rejected');
   console.log("TBD sendNotesTo:", userId,cardInfo); 
} 