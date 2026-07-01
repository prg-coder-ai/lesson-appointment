 
 //admin---待确认预约
// ===================== 核心函数 =====================
 
let pendingBookingList=[];// ID,ciurseName,studentName,teacherName,dateTime(创建时间),状态、操作（预览、确认、拒绝） 
 
 
window.provingBooking  = provingBooking ;  

 async function provingBooking(){
     getPendingBookingList();
    // showBookingList();
 }  
 async function getPendingBookingList(){
  //search current pendding booking items ,and dispaly here /pendingBooking 
      let userRole = null,userId=null,status =null;//TB TEST "pending";
      bookingList1 = await getBookingList(userRole, userId, status);
    //bookingList2 = await getBookingList(userRole, userId, 'booking');
    
    pendingBookingList = bookingList1;//.concat(bookingList2);
    console.log("pendingBookingList:", pendingBookingList);  
    showBookingList();
  } 
 //显示待确认预约
  async function showBookingList(){
     const id = "pending-reservations";
     let pendingBookingsHtml = "";
     let index = 0;
     if (Array.isArray(pendingBookingList)) {
         // 用for...of+await，等待所有异步操作完成
         for (let booking of pendingBookingList) { 
          index++;
             const scheduleObject = await fetchSchedule(booking.scheduleId); 
             if (scheduleObject != null) {
                 let scheduleInfoStr = getScheduleInfo(scheduleObject,false); 
                 const classObject = await getCourseById(scheduleObject.courseId); 
                 const studentName = await getUserNameById(booking.studentId);
                 const teacherName = await getUserNameById(classObject.teacherId);

                 console.log("studentName:", booking.studentId,studentName);
                 console.log("teacherName:", booking.teacherId,teacherName);
                 if (classObject != null) {
                     let cardItems = {
                         index: index,
                         scheduleId:    scheduleObject.scheduleId, 
                         origTz:        scheduleObject.timeZone,
                         bookingId: booking.id,
                         className: classObject.courseName+ " " + scheduleObject.name,
                         studentName: studentName,//-->name/phone/email
                         teacherName: teacherName,
                         scheduleInfo: scheduleInfoStr, 
                         status: booking.status
                     }
                     let cardContent = formBookingTr(cardItems);//TBD: table TR 
                     pendingBookingsHtml += cardContent;
                 } 
         }
     }
    }

     //在全部异步处理后再输出和渲染 
     let bookingContainer = document.getElementById(id);
     if (bookingContainer) {
         bookingContainer.innerHTML = ` ${pendingBookingsHtml}`;
     }

 }
 //检查status，只有待确认的booking、cancelling才显示待确认，并显示相应的按钮
 function checkStatus(status) {
  if (status === 'booking' ) {
    return '预约待确认';
  } else   if   (status === 'cancelling' || status === 'canceling') {
    return '取消待确认';
  } else if (status === 'booked') {
    return '预约已确认';
  } else if (status === 'cancelled' || status === 'canceled') {
    return '已取消';
  } else if (status === 'deleted') {
    return '已删除';
  }
  return " ";
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
           <td class="course-info">    ${checkStatus(cardInfo.status)}</td>
            ${
              (cardInfo.status === 'booking' || cardInfo.status === 'cancelling')
                ? `<td class="course-info">
                    <button class="btn btn-success" onclick="approveReservation('${cardInfo.bookingId}', '${cardInfo.status === 'booking' ? 'booked' : 'cancelled'}')"><i class="fa fa-check"></i> 通过</button>
                    <button class="btn btn-danger" onclick="rejectReservation('${cardInfo.bookingId}')"><i class="fa fa-times"></i> 拒绝</button>
                   </td>`
                : `<td class="course-info"></td>`
            }
       
            </tr>
   `;
 // console.log("cardContent:", info);
   return info;
} 
//TBD：需要根据status，判断是批准还是拒绝，仅显示待批准的项目个数----预约确认、取消预约的个数---具体确认在相应的页面进行
async function approveReservation(bookingId,status) {
  console.log("approveReservation:", bookingId);
   await  operateBookingStatus(bookingId, status);
   console.log("approveReservation:", bookingId);
}
async function rejectReservation(bookingId) {
  
   await operateBookingStatus(bookingId, 'rejected');
   console.log("rejectReservation:", bookingId);
 
}  