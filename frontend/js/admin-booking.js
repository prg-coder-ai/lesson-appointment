 
 //admin---待确认预约 预订审核菜单的处理程序
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
                  <label><span data-term="course">课程</span>名称：</label>
                  <input type="text" id="course-name-input" placeholder="课程名称">
                </div>
                        
                <div class="filter-item">
                  <label>状态：</label>
                  <select id="booking-status-select">
                    <option value="">全部</option>
                    <option value="booking">预定待确认</option>
                    <option value="waiting">候补</option>
                    <option value="cancelling">取消待确认</option>
                    <option value="booked">预定已确认</option>
                    <option value="cancelled">已取消</option>
                    <option value="rej-booking">已拒绝预订</option>
                    <option value="rej-cancelling">已拒绝取消</option>
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
            <th><span data-term="course">课程</span>名称</th>
            <th>排期名称</th>
            <th><span data-term="student">学生</span>姓名</th>
            <th><span data-term="teacher">教师</span>姓名</th>
            <th><span data-term="lessonTime">上课时间</span></th>
            <th>状态</th>
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
     courseName:    document.getElementById('course-name-input').value.trim(), 
     status:         document.getElementById('booking-status-select').value  
   };
   if(userRole== "admin") {
    params.userId =null;
    params.userRole = null ;
  }
   let result = await getBookingListPage( params); 
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
                         bookingId: booking.bookingId,
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


 /**
  * cardInfo.status === 'booking' ? '预定待确认' :
                          cardInfo.status === 'booked' ? '预定已确认' :
                          cardInfo.status === 'cancelling' ? '取消待确认' :
                          cardInfo.status === 'cancelled' ? '已取消' :
                          cardInfo.status === 'delete' ? '已删除' :
                          cardInfo.status || ''
 
  */
 function formBookingTr(cardInfo) {
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
             ${
                        cardInfo.status === 'cancelled' || cardInfo.status === 'canceled'
                        ? ` <button class="btn btn-danger" onclick="deleteBookingByFrozen('${cardInfo.bookingId}')"><i class="fa fa-times"></i> 删除</button>
                        `:` `
             }
              ${
                       cardInfo.status === 'frozen'
                        ? `
                            <button class="btn btn-success" onclick="confirmOrCancelBooking('${cardInfo.bookingId}','booking')">撤回</button> 
                           ` 
                        :   cardInfo.status === 'booking'
                        ? `
                            <button class="btn btn-success" onclick="confirmOrCancelBooking('${cardInfo.bookingId}','booked')">确认</button>
                            <button class="btn btn-danger" onclick="confirmOrCancelBooking('${cardInfo.bookingId}','rej-booking')">拒绝</button>
                           ` 
                        : cardInfo.status === 'cancelling' || cardInfo.status === 'canceling'
                        ? `
                            <button class="btn btn-danger" onclick="confirmOrCancelBooking('${cardInfo.bookingId}','cancelled')">确认</button>
                            <button class="btn btn-warning" onclick="confirmOrCancelBooking('${cardInfo.bookingId}','booking')">撤回</button>
                            <button class="btn btn-danger" onclick="confirmOrCancelBooking('${cardInfo.bookingId}','rej-cancelling')">拒绝</button>
                            `
                        : cardInfo.status === 'booked'
                        ? `
                            <button class="btn btn-danger" onclick="confirmOrCancelBooking('${cardInfo.bookingId}','booking')">撤回</button>
                            <button class="btn btn-warning" onclick="confirmOrCancelBooking('${cardInfo.bookingId}','cancelling')">取消</button>
                            `
                        : cardInfo.status === 'waiting'
                        ? `
                            <button class="btn btn-primary" onclick="gotoScheduleForWaitlist('${cardInfo.scheduleId}')"><i class="fa fa-search"></i> 查询递补</button>
                            <button class="btn btn-danger" onclick="confirmOrCancelBooking('${cardInfo.bookingId}','cancelled')">拒绝候补</button>
                           `
                        : cardInfo.status === 'rej-cancelling'
                        ? ` <button class="btn btn-danger" onclick="confirmOrCancelBooking('${cardInfo.bookingId}','cancelling')">撤回</button> 
                          `: cardInfo.status === 'rej-booking'
                        ? ` <button class="btn btn-danger" onclick="confirmOrCancelBooking('${cardInfo.bookingId}','booking')">撤回</button> 
                           `                        : cardInfo.status === 'cancelled' || cardInfo.status === 'canceled'
                        ? ` <button class="btn btn-danger" onclick="confirmOrCancelBooking('${cardInfo.bookingId}','cancelling')">撤回</button>
                             <button class="btn btn-warning" onclick="confirmOrCancelBooking('${cardInfo.bookingId}','booking')">取消</button>
                           `
                        : ''
                     }
                     ${
                       /* 「查询递补」入口：只要这条记录当前**不再占用席位**，就说明它所属的排期
                        * 可能已经空出了位子（管理员确认取消、删除预订、拒绝预订等操作之后），
                        * 管理员需要能顺着这一行去排期页查看候补队列并递补。
                        *
                        * 为什么按「是否占席位」判断，而不是再列一遍状态名：
                        *   1) 席位规则只有一个来源（前端 bookingOccupiesSeat / 后端 BookingStatus.NON_OCCUPYING），
                        *      枚举状态名必然漏——rej-booking、frozen 就是这么漏掉的；
                        *   2) 以后新增「会腾出席位」的状态，这里自动生效，不用回来改。
                        * waiting 行自己已经带了该按钮（候补本人可自助查看队列），此处排除以免重复。
                        */
                       cardInfo.status !== 'waiting' && !bookingOccupiesSeat(cardInfo.status)
                        ? ` <button class="btn btn-primary" onclick="gotoScheduleForWaitlist('${cardInfo.scheduleId}')"><i class="fa fa-search"></i> 查询递补</button>`
                        : ''
                     }
                    </td>
            </tr>
   `;
   return info;
} 

/**
 * 「查询递补」：把管理员带到「课程排期」页面，并锁定该 record 所属的课程与排期。
 *
 * 递补统一在排期维度完成——那里能看到该排期的剩余席位与候补队列（按申请时间升序），
 * 所以这里只负责「跳转 + 带参」，不在此处做任何状态变更。
 *
 * 传参复用页面既有的深链机制 window.pendingDeepLink = { scdid }，
 * admin-schedule.js 渲染时会消费它（handleAdminDeepLink），自动选中课程、排期并显示详情。
 * 不传 sid —— 递补是先看队列再选人，不需要预选学生。
 */
function gotoScheduleForWaitlist(scheduleId) {
    if (!scheduleId) {
        alert('该记录缺少排期信息，无法查询递补。');
        return;
    }
    window.pendingDeepLink = { scdid: scheduleId, sid: null };

    // 优先复用页面菜单的点击逻辑：它会同步高亮、标题，再装载页面内容
    const menuItem = document.querySelector('.menu-item[key="schedule"]');
    if (menuItem) {
        menuItem.click();
        return;
    }
    if (typeof window.loadAdminPageContent === 'function') {
        window.loadAdminPageContent('schedule');
        return;
    }
    alert('无法定位「课程排期」页面，请手动切换到该菜单。');
}

async function confirmOrCancelBooking(bookingid, status) {
  // ===== 第 3 批（2026-10-08）：状态联动已收回服务端，这里只发一次请求 =====
  //
  // 原先这个函数在浏览器里编排整套业务规则：
  //   booked      → 前端自己算排期时间 → 逐条 POST saveAppointment（forEach 未 await，
  //                 中途刷新页面就留下半份时间表）→ 再 PUT 改预订状态
  //   cancelled   → 先 PUT 改课次状态，再 PUT 改预订状态（两次 HTTP，非原子）
  //   booking     → 先 DELETE 课次，再 PUT 改预订状态（同上）
  //   cancelling  → 先 PUT 改课次状态，再 PUT 改预订状态（同上）
  // 后果：课次生成规则只存在于这个浏览器函数里。小程序端同一操作不生成课次，
  // curl 直接调预订接口也能拿到"已确认却没有任何课次行"的预订。
  //
  // 现在服务端在单个事务内完成「状态迁移 + 课次生成/级联」，前端只负责发一次状态变更。
  // 保持调用点签名不变，按钮渲染与状态映射（下方按钮各传的 status）完全不动。
  await operateBookingStatus(bookingid, status);

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
    // 第 3 批：课次置 frozen 的级联已由服务端在事务内完成，
    // 这里原先额外调一次 updateAppointmentsStatusByBookingId(id,"frozen") —— 双写且未 await，
    // 服务端已覆盖该行为，重复调用只会让课次状态被写两次。
    // 保留"该预订存在课次"的二次确认：那是删除前的用户提示，不是业务规则。
    if (checkAppointmentExistsBookingId(id)) {
      const userChoice = confirm('该预订存在预约，是否继续删除？继续将删除该预订下的全部预约。点击“确定”继续，点击“取消”放弃删除。');
      if (!userChoice) {
        return;
      }
    }

    try {
      await operateBookingStatus( id, "frozen");
      getBookingListByPage();
     } catch (e) {
      //  alert('网络错误，删除失败');
        console.error(e);
    }
    }

// 以下三个是旧入口的薄转发，保留 window 挂载是为了不破坏外部/历史调用点。
// 第 3 批后它们都不再自己编排业务规则——课次生成与级联一律由服务端在事务内完成，
// 因此这里只剩一次状态请求；原先各自附带的 updateAppointmentsStatusByBookingId 双写已删除。
async function validBooking(bookingid){
  await operateBookingStatus( bookingid, "booked");
    }

//确认取消----
async function validCancelBooking(bookingid){
   await operateBookingStatus( bookingid, "cancelled");
    }

    async function cancelBooking(bookingid){
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