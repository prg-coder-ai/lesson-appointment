 
 //admin---待确认预约
// ===================== 核心函数 =====================
 
let pendingBookingList=[];// ID,ciurseName,studentName,teacherName,dateTime(创建时间),状态、操作（预览、确认、拒绝） 
 
 
window.provingBooking  = provingBooking ;  
window.cancelBooking   = cancelBooking ; 
window.validBooking   = validBooking ; 

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
  //  console.log("pendingBookingList:", pendingBookingList);  
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
    return '预定待确认';
  } else   if   (status === 'cancelling' || status === 'canceling') {
    return '取消待确认';
  } else if (status === 'booked') {
    return '预定已确认';
  } else if (status === 'cancelled' || status === 'canceled') {
    return '已取消';
  } else if (status === 'deleted') {
    return '已删除';
  }
  return status;
 }

 /**
  * cardInfo.status === 'booking' ? '预定待确认' :
                          cardInfo.status === 'booked' ? '预定已确认' :
                          cardInfo.status === 'cancelling' ? '取消待确认' :
                          cardInfo.status === 'cancelled' ? '已取消' :
                          cardInfo.status === 'delete' ? '已删除' :
                          cardInfo.status || ''
 
  */
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
          <!--   ${
              (cardInfo.status === 'booking' || cardInfo.status === 'cancelling')
                ? `<td class="course-info">
                    <button class="btn btn-success" onclick="approveReservation('${cardInfo.bookingId}', '${cardInfo.status === 'booking' ? 'booked' : 'cancelled'}')"><i class="fa fa-check"></i> 通过</button>
                    <button class="btn btn-danger" onclick="rejectReservation('${cardInfo.bookingId}')"><i class="fa fa-times"></i> 拒绝</button>
                   </td>`
                : `<td class="course-info"></td>`
            }  -->
       
              ${
                        cardInfo.status === 'booking'
                        ? `<td class="course-info">
                            <button class="btn btn-success" onclick="validOrCancelReservation('${cardInfo.bookingId}','booked')">确认</button>
                            <button class="btn btn-danger" onclick="validOrCancelReservation('${cardInfo.bookingId}','cancelled')">拒绝</button>
                           </td>`
                        : cardInfo.status === 'cancelling' || cardInfo.status === 'canceling'
                        ? `<td class="course-info">
                            <button class="btn btn-danger" onclick="validOrCancelReservation('${cardInfo.bookingId}','cancelled')">确认</button>
                            <button class="btn btn-warning" onclick="validOrCancelReservation('${cardInfo.bookingId}','booked')">撤回</button>
                           </td>`
                        : cardInfo.status === 'booked'
                        ? `<td class="course-info">
                            <button class="btn btn-danger" onclick="validOrCancelReservation('${cardInfo.bookingId}','booking')">撤回</button>
                            <button class="btn btn-warning" onclick="validOrCancelReservation('${cardInfo.bookingId}','cancelling')">取消</button>
                           </td>`
                        : cardInfo.status === 'cancelled' || cardInfo.status === 'canceled'
                        ? `<td class="course-info"> <button class="btn btn-danger" onclick="validOrCancelReservation('${cardInfo.bookingId}','cancelling')">撤回</button>
                             <button class="btn btn-warning" onclick="validOrCancelReservation('${cardInfo.bookingId}','booking')">取消</button>
                           </td>`
                        : ''
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


async function validOrCancelReservation(bookingid,status) { 
  // 根据bookingid在bookingList中查找对应的booking对象
  const bookingList = pendingBookingList;
  const bookingObj = Array.isArray(bookingList) ? bookingList.find(b => b.id === bookingid) : null; 
  const scheduleInfo = await fetchSchedule(bookingObj.scheduleId);
 
  //按照排期所用的时区时刻 
  if(status == "booked"  ){   // 获取时间列表  booking--》booked
         const appointmentResults = await generateAppointmentList (bookingObj.scheduleId,scheduleInfo.timeZone );
         // 遍历scheduleResult数组的每个元素，添加到appointment_datetime中
      //   console.log("list:",appointmentResults);
         let appointmentDateTimeList = [];
         if (Array.isArray(appointmentResults)) {
         appointmentResults.forEach(item => {
             // 假设item中有appointment_datetime字段，如果不是可根据实际字段名调整
             // 这里假设item就是约定的预约时间对象或类似格式
             // 如果item有date和time字段，合成为一个appointment_datetime字段（如 "2024-06-10 09:00"）
             if (item.date && item.time) {
                 appointmentDateTimeList.push(`${item.date}T${item.time}`); 
             }
         });
         } 

         // 遍历appointmentDateTimeList，将日期、时刻赋值到AppointmentData.appointmemnt_datetime 
         // 你的问题“为什么传入saveAppointment(AppointmentData)的参数为空值？”
         // 可能形成空值的原因：（1）appointmentDateTimeList为空，（2）dt本身无值，（3）bookingid/bookingObj/scheduleInfo没准备好。
         // 建议加打印/检查赋值。
         appointmentDateTimeList.forEach(async (dt, idx) => { 
         // 字段名应为 appointmentDatetime 而不是 appointmemntDatetime（避免拼写错误）
         let AppointmentData = {
             bookingId: bookingid,
             appointmentDatetime: dt,  // 拼写修正
             lastDatetime: dt,
             classIndex: idx+1           // 用forEach的下标，避免indexOf找不到
             // 你可以解开以下注释，把缺的字段都补上
             /* teacherId: bookingObj?.teacherId,
             courseId: scheduleInfo?.courseId,
             scheduleId: bookingObj?.scheduleId,
             studentId: bookingObj?.studentId,
             timeZone: scheduleInfo?.timeZone || undefined // 为空时也正常输出
             */
         };

         // 清理掉undefined属性（只保留有效字段）
         Object.keys(AppointmentData).forEach(
         key => AppointmentData[key] === undefined && delete AppointmentData[key]
         );  
         // 如果核心值有空，进行警告
         if (!bookingid || !dt) {
             console.warn("警告：bookingid或appointmentDatetime为空！", AppointmentData);
             return;
         }

         //把booking-》booked,添加时间列表  
         await saveAppointment(AppointmentData);
     });

await validBooking(bookingid);

} else if(status == "cancelled"  ){ 
 //确认取消预约--把book状态设置为booking 
  //await updateAppointmentsStatusByBookingId(bookingid, "cancelled");
  await validCancelBooking(bookingid);
}  else if(status == "booking"  ){ // 
//删除所有相关预约列表，并把book状态设置为booking
 await deleteAppointmentsByBookingId(bookingid);
 await operateBookingStatus( bookingid, "booking") ;   
} else if(status == "cancelling"  ){ 
//把相关预约列表的状态设置为cancelling--未确定状态 
//更新预约表的bookingid对应的所有项的状态为cancelling 
await cancelBooking(bookingid); 
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
await sleep(200); 
showBookingList(); 
}


async function validBooking(bookingid){
       
  await operateBookingStatus( bookingid, "booked"); 
    } 

//确认取消----
async function validCancelBooking(bookingid){
      
   //将appointment的bookingid=bookingid的所有项的状态设置为“cancelled->cancelling ->booked-->booking
   //console.log("validCancelBooking updateAppointmentsStatusByBookingId bookingid:",bookingid);
   await updateAppointmentsStatusByBookingId(bookingid, "cancelled");
   //更新booking预定状态
   await operateBookingStatus( bookingid, "cancelled"); 
    } 

    async function cancelBooking(bookingid){ 
        //将appointment的bookingid=bookingid的所有项的状态设置为“cancelled->cancelling ->booked-->booking
      //  console.log("validCancelBooking updateAppointmentsStatusByBookingId bookingid:",bookingid);
        await updateAppointmentsStatusByBookingId(bookingid, "cancelling");
        //更新booking预定状态
        await operateBookingStatus( bookingid, "cancelling"); //--学生、教师取消
         }