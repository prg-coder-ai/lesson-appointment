 
 //admin---待确认预约
// ===================== 核心函数 =====================
let pendingBookingList=[];// ID,ciurseName,studentName,teacherName,dateTime(创建时间),状态、操作（预览、确认、拒绝） 
 // 引入分页组件js
 document.write('<script src="/js/public/pagefoot.js"></script>');

window.renderBookingCards  = renderBookingCards ;  
window.cancelBooking   = cancelBooking ; 
window.validBooking   = validBooking ; 
window.deleteBookingByFrozen = deleteBookingByFrozen;

 async function renderBookingCards(){
     assignLoadobjectListFunction( getBookingListByPage);//
  let html     = `
  <div class="card">
    <div class="card-header">
      <div class="card-title"><i class="fa fa-calendar-alt"></i>预订列表</div>
        <!-- 筛选条件 -->
              <div class="filter-bar">  
                <div class="filter-item">
                  <label><span data-term="course">课程名称</span>：</label>
                  <input type="text" id="course-name-input" placeholder="课程名称">
                </div>
                        
                <div class="filter-item">
                  <label><span data-term="status">状态</span>：</label>
                  <select id="booking-status-select">
                    <option value="">全部</option>
                    <option value="booking">预订待确认</option>
                    <option value="cancelling">取消待确认</option>
                    <option value="booked">预订已确认</option>
                    <option value="cancelled">已取消</option>
                    <option value="frozen">已删除</option> 
                  </select>
                </div> 
                <button class="btn btn-default" onclick="localsearchBooking()">
                  <i class="fa fa-search"></i> 搜索
                </button>
                <button class="btn btn-default" onclick="resetFilterBooking()">
                  <i class="fa fa-redo"></i> 重置
                </button>
              </div> 
             
    </div>
    <div class="table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>序号</th>
            <th  style="display:none;">预订ID</th>
            <th><span data-term="course">课程</span></th>
            <th><span data-term="schedule">排期</span></th>
            <th><span data-term="student">学生</span></th>
            <th><span data-term="teacher">教师</span></th>
            <th><span data-term="lessonTime">上课时间</span></th>
            <th><span data-term="status">状态</span></th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody id="pending-reservations">
          
        </tbody>
      </table>
    </div>
  </div>
`;
html += getPagebar();
if(dynamicContentCenter) {
  dynamicContentCenter.innerHTML =  html;           
 
 applyTerms(dynamicContentCenter);
}
     getBookingListByPage();// define in 
    // showBookingList();
 }  

 //按照条件，按页加载预定数据，called by admin、student/techer
async function getBookingListByPage(){
  //search current pendding booking items ,and dispaly here /pendingBooking  
  
   const params = {
     pageNum: Pagination.pageNum,
     pageSize: Pagination.pageSize,
     // 可预留 future 参数，比如 userRole, status 等，如有需要可加上
     userId: userId,
     userRole: userRole,    
     courseName:    document.getElementById('course-name-input').value.trim(),//TBD
   // studentName:    document.getElementById('student-name-input').value.trim(),
     status:         document.getElementById('booking-status-select').value  
   };
   if(userRole== "admin") {
    params.userId =null;
    params.userRole = null ;
  }
   let result = await getBookingListPage( params);
  // console.log("page:",params);
   //  console.log("ret:",result);
   if(result){
       const pageData = result;

       Pagination.total = pageData.total ;
       Pagination.totalPages = pageData.totalPages;
         
      showBookingList( pageData.rows); 
      // 渲染分页栏,带入分页参数
      renderPagination( Pagination);    
   } else{

    Pagination.total = 0 ;
    Pagination.totalPages = 0;
      
   showBookingList( []); 
   // 渲染分页栏,带入分页参数
   renderPagination( Pagination);    
   }    
  } 

 //显示待确认预约
  async function showBookingList(pageDataList){
     const id = "pending-reservations";
     let pendingBookingsHtml = "";
     
     pendingBookingList =  pageDataList;
      
     var index=(Pagination.pageNum-1)*Pagination.pageSize;//记录序号
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

                 //console .log("studentName:", booking.studentId,studentName);
                 //console .log("teacherName:", booking.teacherId,teacherName);
                 if (classObject != null) {
                     let cardItems = {
                         index: index,
                         scheduleId:    scheduleObject.scheduleId, 
                         origTz:        scheduleObject.timeZone,
                         bookingId: booking.id,
                         className: classObject.courseName,//+ " " + 
                         scheduleName: scheduleObject.name,
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
 
 function formBookingTr(cardInfo) {
  // console.log("cardInfo:", cardInfo); 
   const info = `
        <tr class="course-card">
            <td class="course-info">   ${cardInfo.index}</td>
            <td class="course-info" style="display:none;">${cardInfo.bookingId}</td>
       
            <td class="course-info">   ${cardInfo.className}</td>
            <td class="course-info">   ${cardInfo.scheduleName}</td>
           <td class="course-info">   ${cardInfo.studentName}</td>
           <td class="course-info">   ${cardInfo.teacherName}</td>
           <td class="course-info">   ${cardInfo.scheduleInfo}</td>
           <td class="course-info">    ${checkStatus_booking(cardInfo.status)}</td>
          
            <td class="course-info">
              <button class="btn btn-danger" onclick="deleteBookingByFrozen('${cardInfo.bookingId}')"><i class="fa fa-times"></i> 删除</button>
              ${
                        cardInfo.status === 'booking'
                        ? `
                            <button class="btn btn-success" onclick="confirmOrCancelBooking('${cardInfo.bookingId}','booked')">确认</button>
                            <button class="btn btn-danger" onclick="confirmOrCancelBooking('${cardInfo.bookingId}','rejected')">拒绝</button>
                           ` 
                        : cardInfo.status === 'cancelling' || cardInfo.status === 'canceling'
                        ? `
                            <button class="btn btn-danger" onclick="confirmOrCancelBooking('${cardInfo.bookingId}','cancelled')">确认</button>
                            <button class="btn btn-warning" onclick="confirmOrCancelBooking('${cardInfo.bookingId}','booked')">撤回</button>
                            `
                        : cardInfo.status === 'booked'
                        ? `
                            <button class="btn btn-danger" onclick="confirmOrCancelBooking('${cardInfo.bookingId}','booking')">撤回</button>
                            <button class="btn btn-warning" onclick="confirmOrCancelBooking('${cardInfo.bookingId}','cancelling')">取消</button>
                            `
                        : cardInfo.status === 'cancelled' || cardInfo.status === 'canceled'
                        ? ` <button class="btn btn-danger" onclick="confirmOrCancelBooking('${cardInfo.bookingId}','cancelling')">撤回</button>
                             <button class="btn btn-warning" onclick="confirmOrCancelBooking('${cardInfo.bookingId}','booking')">取消</button>
                           `
                        : ''
                     }
                    </td>
            </tr>
   `;
 // console.log("cardContent:", info);
   return info;
} 

async function confirmOrCancelBooking(bookingid,status) { 
  // 根据bookingid在bookingList中查找对应的booking对象
  const bookingList = pendingBookingList;
  const bookingObj = Array.isArray(bookingList) ? bookingList.find(b => b.id === bookingid) : null; 
  if(bookingObj ==null)
    return ;
  const scheduleInfo = await fetchSchedule(bookingObj.scheduleId);
 
  //按照排期所用的时区时刻 
  if(status == "booked"  ){   // 获取时间列表  booking--》booked
         const appointmentResults = await generateAppointmentList (bookingObj.scheduleId,scheduleInfo.timeZone );
         // 遍历scheduleResult数组的每个元素，添加到appointment_datetime中
      //   //console .log("list:",appointmentResults);
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
             let AppointmentData = {
              bookingId: bookingid,
              appointmentDatetime: dt,  // 拼写修正
              lastDatetime: dt,
              classIndex: idx+1           // 用forEach的下标，避免indexOf找不到            
         };

         // 清理掉undefined属性（只保留有效字段）
         Object.keys(AppointmentData).forEach(
         key => AppointmentData[key] === undefined && delete AppointmentData[key]
         );  
         // 如果核心值有空，进行警告
         if (!bookingid || !dt) {
             //console .warn("警告：bookingid或appointmentDatetime为空！", AppointmentData);
             return;
         }

         //把booking-》booked,添加时间列表  
         await saveAppointment(AppointmentData);
     });

await validBooking(bookingid);

} else if(status == "cancelled"  ){ 
 //确认取消预约--把book状态设置为booking   
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
 
getBookingListByPage();
}

async function checkAppointmentExistsBookingId(bookingid) {
  if (!bookingid) {
      console.error("checkAppointmentExistsByBookingId: bookingid is required");
      return false;
  }
  try {
      // 假定后端有该接口 /course/appointment/existsByScheduleId/{scheduleId}，返回 { exists: true/false }
      const res = await request({
          url: `${API_BASE_URL}/course/appointment/getByBookingId`,
          method: "get",
          params:{bookingId:bookingid}
      });
      // 兼容后端返回为 {exists: true/false} 或直接返回布尔
      if (Array.isArray(res) && res.length > 0) {
          return true;
      }
 
      return false;
  } catch (e) {
      console.error("checkAppointmentExistsByBookingId error:", e);
      return true;
  }
}
async function deleteBookingByFrozen(id) {
    // 调用后端删除预约接口（假定全局已定义 request 方法和 API_BASE_URL）
    // 查询是否存在以此id为排期id的appointment（预约/子项），返回结果布尔型
     if (checkAppointmentExistsBookingId(id))
     {
      // INSERT_YOUR_CODE
      const userChoice = confirm('该预订存在预约，是否继续删除？继续将删除该预订下的全部预约。点击“确定”继续，点击“取消”放弃删除。');
      if (!userChoice) {
        return;
      }
      //删除该预定的全部预约
     // await deleteAppointmentsByBookingIdByFrozen(id);
     updateAppointmentsStatusByBookingId(id,"frozen");
     }
    
    try {
      await operateBookingStatus( id, "frozen");
      getBookingListByPage();
     } catch (e) {
      //  alert('网络错误，删除失败');
        console.error(e);
    }
    
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


      function localsearchBooking() {
          Pagination.pageNum = 1;
          getBookingListByPage();
      }
      // 重置筛选条件
      function resetFilterBooking() {

          document.getElementById('course-name-input').value = ''; 
          document.getElementById('booking-status-select').value = '';
          Pagination.pageNum = 1;
          getBookingListByPage();

      }