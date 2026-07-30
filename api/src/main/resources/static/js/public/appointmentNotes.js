// functoions for appointmentNotes display and data load

function refreshRightPage() {
   // console.log("refresh",pageTitle.textContent)
    if(pageTitle.textContent!= ""){
       loadAdminPageContent(pageTitle.textContent); 
    }
   }

 //获取days天数以内的预约列表
 /*private String UserId;  //
    private String Role;     
    private int Days; */
 async function getAppointmentListData(conditions ){     
    return await getAppointmentList(conditions);  
   // console.log("DaysAppointmentList:", DaysAppointmentList); 
} 


// 获取课程数量,当日 days=1,一周内 days=7
async function getCountOfTodayAppointment() {

  //const token = getToken && typeof getToken === 'function' ? getToken() : '';
  let days =1;
  try { //指定天数内的预约课程数
      const res  =  await  request({url:`${API_BASE_URL}/course/appointment/statistical/onDays`, 
        Method:"get",  
        params: { ondays:days }//controller: @RequestParam("ondays") int days
     });
 
        return res  ;  
      
    } catch (e) {
      // 网络或服务器异常处理
     console.error("getCountOfTodayAppointment",e);
     return null;
    }
} //获取今日预约次数

//获取最近days天的课程
 //NoUsed
async function getAppointmentList(conditions ) {
  
 try {
     // 允许传递排序字段和排序方式（如 appointmentTime 字段降序）
     const res  = await request({
       url: `${API_BASE_URL}/course/appointment/statistical/listByDays`, 
       Method: "get", 
       params: { 
         days:    conditions.Days, // controller: @RequestParam("days") int days
         userId:  conditions.UserId,
         role:    conditions.Role,
         // 向后端传递排序参数，需后端Controller方法新增@RequestParam("sortField")和@RequestParam("sortOrder")参数，并在Service/Mapper中根据这两个参数动态设置order by子句
         sortField: "appointmentDatetime",   // 例如后端：@RequestParam(required = false, defaultValue = "appointmentTime") String sortField
         sortOrder: "asc"               // 例如后端：@RequestParam(required = false, defaultValue = "desc") String sortOrder
       }
     });
     
     // 返回统计结果对象， array
     return res  ;  
   } catch (e) {
     // 网络或服务器异常处理
    console.error("getAppointmentList",e);
    return null;
   }
 }
 
/**
 *  const params = {
      pageNum: Pagination.pageNum,
      pageSize: Pagination.pageSize,
    
     name:   document.getElementById('course-name-select').value,
     days:   document.getElementById('appoint-days-select').value,
     status: document.getElementById('appoint-status-select').value ,
   }
   */
 //分页显示--获取 显示 --
 //error function
async function getAppointmentListPageX(query ) {
   
  try {
      // 允许传递排序字段和排序方式（如 appointmentTime 字段降序）
      const res  = await request({
        url: `${API_BASE_URL}/course/appointment/statistical/listByDaysByPage`, 
        Method: "GET", 
        data: query, 
        params:{ query}         //作为对象发送，无括号则作为若干的单个参数
      });
       // 返回统计结果对象， PageResult
      return res  ; //QueryResult  
    } catch (e) {
      // 网络或服务器异常处理
     console.error("getAppointmentListPage",e);
     return null;
    }
  }
 // INSERT_YOUR_CODE

/**
 * 获取指定天数内的预约分页列表（兼容后端 @RequestBody）
 * @param {Object} query AppointmentQueryPage请求对象，比如 {pageNum, pageSize, days, userId, role, status}
 * @returns {Promise<Object>} 分页查询 PageResult 对象
 *
 * 注意：参数通过 data 传递（POST body），不能用 GET 方式，否则后端无法绑定 @RequestBody
 * 用法示例：
 *   const query = { pageNum: 1, pageSize: 10, days: 7, userId: ..., role: ..., status: ... };
 *   const res = await fetchAppointmentListPage(query);
 */
//OK
async function fetchAppointmentListPage(query) {
  try {
    const res = await request({
      url: `${API_BASE_URL}/course/appointment/statistical/listByDaysByPage`, 
      method: "post", // 必须为POST，以便@RequestBody生效
      data: query // 直接作为body传递 ，controller作为对象接收，不能有括号T
      // 不需要 params 字段
    });
    console.log("apppage",res);
    return res;
  } catch (e) {
    console.error("fetchAppointmentListPage", e);
    return null;
  }
}
 //显示待确认预约
 async function showAppointmentList(appointmentList,id){
    //   const id = "pending-reservations";
       let pendingBookingsHtml = "";

       var index=(Pagination.pageNum-1)*Pagination.pageSize;//记录序号let index = 0;

    //   console.log("showAppointmentList:", DaysAppointmentList);  
      let count=0;
       if (Array.isArray(appointmentList)) {
           // 用for...of+await，等待所有异步操作完成
           count = appointmentList.length;
           for (let appointment of appointmentList) { 
            index++;//读取对应的预定ID
             
            let  bookedObject = await getBookingObject(appointment.bookingId);       
            if(bookedObject == null )
              continue;
            
            const scheduleObject = await fetchSchedule(bookedObject.scheduleId); 
               if (scheduleObject != null) {  
                   const classObject = await getCourseById(scheduleObject.courseId); 
                   const studentName = await getUserNameById(bookedObject.studentId);
                   const teacherName = await getUserNameById(bookedObject.teacherId);
   
                   if (classObject != null) {
                       let cardItems = {
                           index: index,
                           scheduleId:    scheduleObject.scheduleId, 
                           origTz:        scheduleObject.timeZone,
                           appointmentId: appointment.id,
                           bookingId:     bookedObject.id,
  
                           className: classObject.courseName,//+ " " + scheduleObject.name,
                           
                           classIndex: appointment.classIndex,
                           studentName: studentName,//-->name/phone/email
                           teacherName: teacherName,
  
                           studentId :bookedObject.studentId,
                           teacherId :bookedObject.teacherId,
  
                          // scheduleInfo: scheduleInfoStr, 
                           appointmentTime: appointment.appointmentDatetime ? appointment.appointmentDatetime.replace('T', ' ') : '',
                      
                           status: appointment.status
                       }
                       let cardContent = formAppointmentTr(cardItems);//TBD: table TR 
                       pendingBookingsHtml += cardContent;
                   } 
           }
       }
      } 
      
      //if(count==0)  {
      //  pendingBookingsHtml +="<div> 近7日内没有课程</div>";//<tr> <td> n/a </td> <td> n/a </td><td> n/a </td><td> n/a </td> <td> n/a </td> <td>   </td> <td>  </td></tr>";
      //}
  
       //在全部异步处理后再输出和渲染 
       let bookingContainer = document.getElementById(id);
       if (bookingContainer) {
           bookingContainer.innerHTML = ` ${pendingBookingsHtml}`;
       }
  
   }
   //检查status，只有待确认的booking、cancelling才显示待确认，并显示相应的按钮 3天、1天前、当天
   function checkAppointmentStatus(status) {
    if (status === 'active' ) {
      return '正常';
    } else   if   (status === 'noted1') {
      return '正常'+' 3~7日通知已发送';
    }  else   if   (status === 'noted2') {
      return '正常'+' 当日通知已发送';
    } else   if   (status === 'completed') {
      return '完成'+' 通知已发送';
    } else   if   (status === 'cancelling' || status === 'canceling') {
      return '取消待确认';
    } else if   (status === 't-cancelling') {
      return '取消待确认(T)';
    } else if (status === 'booked') {
      return '预约已确认';
    } else if (status === 'cancelled' || status === 'canceled') {
      return '已取消';
    } else if (status === 'deleted') {
      return '已删除';
    } else if (status === 't-reject' ) {
      return '已拒绝(T)';
    }else if (status === 'reject' ) {
      return '已拒绝';
    }
    return status;
   }
   function formAppointmentTr(cardInfo) {
      //console .log("cardInfo:", cardInfo);
     const info = `
          <tr>
              <td>   ${cardInfo.index}</td>
              <td   style="display:none;">${cardInfo.bookingId}</td>         
              <td>  ${cardInfo.className}  ${cardInfo.classIndex}  </td>
              <td>   ${cardInfo.studentName}</td>
              <td>   ${cardInfo.teacherName}</td>
              <td>   ${cardInfo.appointmentTime} ${cardInfo.origTz}</td>
              <td>    ${checkAppointmentStatus(cardInfo.status)}</td>
              <td class="course-info">
                ${ (userRole == "admin" &&  checkStatusAndDate(cardInfo.appointmentTime,cardInfo.status,cardInfo.origTz))  // ---添加请假--按钮，
                  ? `   <button class="btn btn-success" onclick='sendNotesToUsers(${JSON.stringify(cardInfo)})'><i class="fa fa-check"></i> 发送通知</button> `
                  : ` `
              }
              ${ (userRole == "admin" && cardInfo.status=="cancelling")?
                 `   <button class="btn btn-success" onclick='confirmCancellingAppointment(${cardInfo.appointmentId},true)'><i class="fa fa-check"></i>确认</button>  
                     <button class="btn btn-success" onclick='confirmCancellingAppointment(${cardInfo.appointmentId},false)'><i class="fa fa-uncheck"></i>取消</button>  
                     `
                  : ` `
              }
              

              ${ (userRole == "admin" && cardInfo.status=="t-cancelling")?
                `   <button class="btn btn-success" onclick='teacherConfirmCancellingAppointment(${cardInfo.appointmentId},true)'><i class="fa fa-check"></i>确认</button>  
                    <button class="btn btn-success" onclick='teacherConfirmCancellingAppointment(${cardInfo.appointmentId},false)'><i class="fa fa-uncheck"></i>取消</button>  
                    `
                 : ` `
             }
             ${ (userRole == "student" && cardInfo.status=="cancelling")?
              `   <button class="btn btn-success" onclick='setApointmentStatusAndReload(${cardInfo.appointmentId},"active")'><i class="fa fa-check"></i>恢复预约</button>                    
                  `
               : ` `
           }
             ${ (userRole == "student" && cardInfo.status !="cancelling")?
              `   <button class="btn btn-success" onclick='setApointmentStatusAndReload(${cardInfo.appointmentId},"cancelling")'><i class="fa fa-check"></i>请假</button>                    
                  `
               : ` `
           } 
            ${ (userRole == "teacher" && cardInfo.status=="t-cancelling")?
              `   <button class="btn btn-success" onclick='setApointmentStatusAndReload(${cardInfo.appointmentId},"active")'><i class="fa fa-check"></i>恢复预约</button>                    
                  `
               : ` `
           }
             ${ (userRole == "teacher" && cardInfo.status !="t-cancelling")?
              `   <button class="btn btn-success" onclick='setApointmentStatusAndReload(${cardInfo.appointmentId},"t-cancelling")'><i class="fa fa-check"></i>请假</button>                    
                  `
               : ` `
           } 
              </td>
              </tr>
     `; 
     //console.log("cardInfo:", info); 
     return info;
  } 

  //检查状态和时间，判断是否需要发送通知 ---待验证 TBD
  async  function checkStatusAndDate(appointmentTime,status,timeZone){
  
    let retPara = { needSendInfo:false,timeTag:3,userTime:appointmentTime};
    //console.log("1:",appointmentTime,"timeZone",timeZone ,status,userTimeZone);
  
    // 将传入的 appointmentTime 字符串中的所有“-”替换为“/”，
    // 然后用 new Date() 构造日期对象，目的是为了在 iOS 设备也能正确解析日期格式。
    // 注意：new Date() 没有明确时区参数，若字符串不含时区信息，则默认按浏览器本地时区解析
    // 若传入字符串中带有 'Z'（UTC）或 +08:00 这种信息，则能按指定时区解析
    // 这里假设 appointmentTime 是"yyyy-MM-dd HH:mm:ss"格式（无时区），建议未来处理带时区的情况
   
      const now = new Date();//浏览器获取的时区的当前时间
      let userTime = new Date(appointmentTime);
      if(timeZone!= userTimeZone){
       const userTzTime = await tzSwitchTo(timeZone, appointmentTime, userTimeZone);   //把预约时间转为当前用户时区  
    //   console.log("now:",now,"app：",appointmentTime,"to usertz：",userTzTime,userTimeZone);
       userTime =  new Date(userTzTime.dateTime);//浏览器当前时区
      } 
    if (!(now instanceof Date)) {
      //console.error("now 不是有效的日期对象:", now);
      return retPara;
    }
    //console.log(" userTime:", userTime);
    const diffMs = userTime - now;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    //console.log("now:",now,"app",appointmentTime,userTime,diffMs,diffDays);
    // 只允许状态推进，不能倒退
    if ( status === 'completed' ||  status === 'cancelled' || status === 'canceled') {
        // 已完成/已取消，不发送任何通知.有关消息在相应的确认处理中发送 TBD
        return retPara;
    }
    retPara.userTime = userTime;//
    // 如果预约时间接近1小时并且未标记为 completed，则标记为 completed
    if (diffDays >= 3 && diffDays <= 7){
       if(status == 'active') {
          retPara.needSendInfo =true;
          retPara.timeTag =2;//-->noted1
       }
    }   else if (diffDays >= 1 ) {
           if( status == 'noted1' ||  status == 'active') {
            retPara.needSendInfo =true;
            retPara.timeTag =1;//->noted2
           }
    } else if (diffMs <= 1*60*60*1000 ) {
       if ( status == 'noted2' || status == 'noted1' || status == 'active') {
           retPara.needSendInfo =true;
           retPara.timeTag =0;
       }
    }
    //console.log("retPara",retPara);
      return retPara; 
   }
  
   // 根据内容构造通知信息，并更新状态
  async function sendNotesToUsers( cardInfo){
      //判断时间与状态： active ：七天内~3天内，noted1：1天前，  noted2:completed：不超过1小时
      // 根据预约时间与当前时间比较，判断应发送何种通知
      // active ：七天内，noted1：3天内，noted2:1天内，completed：1h内或已过
      // cardInfo.appointmentTime format 假设为 "YYYY-MM-DD HH:mm:ss" 或类似
     
      // 如果 cardInfo 是字符串（通过 innerHTML 的 onclick '${cardInfo}' 方式传递），需要从 JSON 字符串还原为对象
      // 如果已经是对象可以跳过
      if (typeof cardInfo === "string") {
          try {
              cardInfo = JSON.parse(cardInfo.replace(/'/g, '"'));
          } catch (e) {
              console.error("cardInfo解析失败，请确保传递格式为JSON字符串，或改用对象传递", cardInfo, e);
              return;
          }
      }
      //console.log(cardInfo,cardInfo.origTz);
      let resultCheck= await checkStatusAndDate(cardInfo.appointmentTime,cardInfo.status,cardInfo.origTz);
  
      if(resultCheck.needSendInfo==false)
        return ;
   
      sendNotesToTeacher(cardInfo.teacherId,cardInfo,resultCheck.timeTag);
      sendNotesToStudent(cardInfo.studentId,cardInfo,resultCheck.timeTag);
      // 根据当前状态，得出新的状态并返回
      let newStatus = cardInfo.status;
      if (resultCheck.timeTag==2) {
          newStatus = 'noted1';
      } else if ( resultCheck.timeTag==1) {
          newStatus = 'noted2';
      } else if ( resultCheck.timeTag==0) {
          newStatus = 'completed';
      }
      // 调用后端API更新状态
      if(newStatus != cardInfo.status) {
          await setApointmentStatusAndReload(cardInfo.appointmentId,newStatus);//courseAndBooking.js 
      }
      
  }
  // 需要根据status， 发送通知--上课通知1、2（发送到双方） 或者停课通知（发送给没有提出停课的乙方）
  // 根据 cardInfo 中的 status，动态生成适用于教师的通知内容
     // cardInfo.status 取值说明：
     //   active      —— 课程正常即将上课/待上课--
     //   noted1      —— 已发送3天前的提醒（提前提醒）
     //   noted2      —— 已发送当天提醒
     //   cancelled   —— 课程已取消
     //   cancelling  —— 学生发起取消申请
     //   t-cancelling—— 教师发起取消申请
     //   completed   —— 课程已完成
     //   changed     —— 课程已改期
     // 输出信息需简明扼要：正常/提醒时强调上课时间、课程与学生，取消/发起取消时强调情况说明，完成/改期则提醒查看详情或历史。
   function sendNotesToTeacher(userId,cardInfo,timeTag) {
   //timeTag0---完成 1---1天前 2--三天
     //console.log(" sendNotesToTeacher:",userId, cardInfo);
     
     // 根据 cardInfo.status 重新编写 teacherNote，内容更清晰并细分所有状态
     let teacherNote = '';
     switch (cardInfo.status) {
       case 'active'://-->noted1 
       case 'noted1'://-->noted2 
       case 'noted2': //-->completed 
       
        switch(timeTag){
          case 2: 
              teacherNote = `【课程提醒】3天后有课：${cardInfo.appointmentTime}，《${cardInfo.className}》，学生：${cardInfo.studentName}。请提前做好准备。`;
            break;
          case 1: 
            teacherNote = `【今日上课提醒】今天有课程：${cardInfo.appointmentTime}，《${cardInfo.className}》，学生：${cardInfo.studentName}。请准时上课。`;
            break;
          case 0:
              teacherNote = `【上课通知】您有一节即将开始的课程：${cardInfo.appointmentTime}，课程：《${cardInfo.className}》，学生：${cardInfo.studentName}。请准时上课。` ;   
              break;
        }
         break;
         case 'completed':
          teacherNote = `【上课完成】您与学生 ${cardInfo.studentName} 的《${cardInfo.className}》（${cardInfo.appointmentTime}）课程已完成，请查阅课后反馈。`;
          break;
       case 'cancelling':
       case 'canceling':
         teacherNote = `【取消申请提醒】学生已申请取消 ${cardInfo.appointmentTime} 的《${cardInfo.className}》课程，学生：${cardInfo.studentName}。请关注处理进度。`;
         break;
       case 't-cancelling':
         teacherNote = `【取消申请提交成功】您已申请取消 ${cardInfo.appointmentTime} 的《${cardInfo.className}》课程，学生：${cardInfo.studentName}。请等待审核。`;
         break;
       case 'cancelled':
       case 'canceled':
         teacherNote = `【课程已取消】${cardInfo.appointmentTime} 的《${cardInfo.className}》（学生：${cardInfo.studentName}）已被取消。`;
         break;
     
       case 'changed':
         teacherNote = `【课程改期通知】《${cardInfo.className}》课程（学生：${cardInfo.studentName}）的上课时间已变更为：${cardInfo.appointmentTime}，请留意时间调整。`;
         break;
       default:
         teacherNote = `【课程通知】关于《${cardInfo.className}》（学生：${cardInfo.studentName}）有新动态，请及时查阅详情。`;
     }
     //cardInfo.noteContent = teacherNote;
     sendNotesTo(userId,teacherNote);
  }
  //TBD:预约时间与用户时间的转换
    function sendNotesToStudent(userId,cardInfo,timeTag) {
    
     let studentNote = '';
     switch (cardInfo.status) {
       case 'active': // -->noted1 
       case 'noted1': // -->noted2 
       case 'noted2': // -->completed
        
         switch(timeTag){
          case 2: 
            studentNote = `【课程提醒】3天后有课：${cardInfo.appointmentTime}，课程：《${cardInfo.className}》，老师：${cardInfo.teacherName}。请提前做好准备。`;
            break;
          case 1: 
          studentNote = `【今日上课提醒】今天有课程：${cardInfo.appointmentTime}，课程：《${cardInfo.className}》，老师：${cardInfo.teacherName}。请准时上课。`;
            break;
          case 0:
            studentNote = `【上课通知】您有一节即将开始的课程：${cardInfo.appointmentTime}，课程：《${cardInfo.className}》，老师：${cardInfo.teacherName}。请准时参加。`;
              break;
        }
         break;
  
       case 'completed':
         studentNote = `【课程已完成】您与老师 ${cardInfo.teacherName} 的《${cardInfo.className}》（${cardInfo.appointmentTime}）课程已结束，欢迎查看课后反馈。`;
         break;
       case 'cancelling':
       case 'canceling':
         studentNote = `【取消申请提交成功】您已申请取消 ${cardInfo.appointmentTime} 的《${cardInfo.className}》课程，老师：${cardInfo.teacherName}。请等待处理。`;
         break;
       case 't-cancelling':
         studentNote = `【老师申请取消】老师已申请取消 ${cardInfo.appointmentTime} 的《${cardInfo.className}》课程。如有疑问请联系客服或关注进一步通知。`;
         break;
       case 'cancelled':
       case 'canceled':
         studentNote = `【课程已取消】${cardInfo.appointmentTime} 的《${cardInfo.className}》（老师：${cardInfo.teacherName}）已被取消。如有疑问请联系管理员。`;
         break;
       case 'changed':
         studentNote = `【课程改期通知】《${cardInfo.className}》课程（老师：${cardInfo.teacherName}）的上课时间已变更为：${cardInfo.appointmentTime}，请留意调整后的时间。`;
         break;
       default:
         studentNote = `【课程通知】关于《${cardInfo.className}》（老师：${cardInfo.teacherName}）有新动态，请及时查阅详情。`;
     }
     sendNotesTo(userId, `${cardInfo.studentName}`+studentNote);  
  }
   
  
 //根据bookingId查询预约时间列表--List <Appointment>->List {date:date,time:time }
 async function getAppointmentsByBookingId( bookingId) {
 
  try {       
      const res  = await request(
          {url:`${API_BASE_URL}/course/appointment/getByBookingId`,  
          method:"get",
          params:{ bookingId:bookingId } // 筛选条件通过params传递
      });
      const results =   res ;
      if (Array.isArray(results)) {
          appointmentResults = results.map(item => {
            let date = "";
            let time = "";
            if (item.appointmentDatetime) {
              // 兼容 'YYYY-MM-DD HH:mm' 或 'YYYY-MM-DDTHH:mm'
              const dtString = item.appointmentDatetime.replace('T', ' ');
              const [d, t] = dtString.split(' ');
              date = d;
              time = t;
            }
            return {
              id  : item.id,
              date: date,
              time: time,
              status: item.status
            };
          });
        } else {
          appointmentResults = [];
        }
      return appointmentResults;
  } catch (e) {
      console.error(e);
      return [];
  }
}


async function saveAppointment( appointdata) { 
  // 分析参数传递是否正确
  // 正确写法：axios.post(url, data, config)
  // 原代码把headers和params放在了data里，实际上应该放在第三个参数
  try {
      // Axios POST请求 
      const res  =await request({
           url:`${API_BASE_URL}/course/appointment/add`,
           method:"post",
           data:  appointdata   // appointdata 在这里作为POST请求体body传递 
          });
         return  res; 
  } catch (e) {
      //alert("网络错误，获取课程列表失败");
      console.error(e);
      return   false;
  }
}
async function setApointmentStatusAndReload(appointmentId,status){
   await operateAppointmentStatus(appointmentId,status);
  loadAndShowAppointmentPage();
}
//设置一个预约时间的状态--学生提出
async function cancellingAppointment(appointmentId,bCancelling){
  let status="";
  if(bCancelling){
     status= "cancelling";
  } else {
     status= "active";
  }
 await setApointmentStatusAndReload(appointmentId,status);//courseAndBooking.js
 return ;
}

//教师、管理员提出的确认或拒绝
async function confirmCancellingAppointment(appointmentId,bCancelled){
  let status="";
  if(bCancelled){
     status= "cancelled";
  } else {
     status= "reject";
  }
 await setApointmentStatusAndReload(appointmentId,status);//courseAndBooking.js
 return ;
}

//教师申请延期与撤回
async function teacherCancellingAppointment(appointmentId,bCancelling){
  let status="";
  if(bCancelling){
     status= "t-cancelling";
  } else {
     status= "active";
  }
 await setApointmentStatusAndReload(appointmentId,status);//courseAndBooking.js
 return ;
}

//对教师延期申请的确认或拒绝
async function teacherConfirmCancellingAppointment(appointmentId,bCancelled){
  let status="";
  if(bCancelled){
     status= "t-cancelled";
  } else {
     status= "t-reject";
  }
 await setApointmentStatusAndReload(appointmentId,status);//courseAndBooking.js
 return ;
}
//根据bookingId更新所有相关的预约时间状态
async function updateAppointmentsStatusByBookingId( bookingId,status) { 
  try {
      // 注意：后端接口 @RequestParam 需要参数在 params/query，不应放在 body
      // 必须通过 params 配置传递 bookingId 和 status，否则会报“Required request parameter 'bookingId' is not present”
      // PUT无body，参数全部通过params
      const res = await request({url: `${API_BASE_URL}/course/appointment/updateStatusByBookingId`, 
             method:"put",
              params: { bookingId: bookingId, status: status }
          }
      ); 
      console.info("appointments:", res );  
          return res  ;  
  } catch (e) {        
      console.error(e);
      return false;
  }
}
async function deleteAppointmentsByBookingId( bookingId) { 
  try {
      // Axios GET请求（修复response.json()错误，Axios已自动解析）
      const res  = await request({url:`${API_BASE_URL}/course/appointment/deleteByBookingId`,
           method:"delete",  
           params: {bookingId:bookingId} // 筛选条件通过params传递
      });
        return res ; 
  } catch (e) {
      //alert("网络错误，获取课程列表失败");
      console.error(e);
      return   false;
  }

}


  //把信息发送到站内信箱-----创建添加、修改状态（已发送、已阅读、删除到垃圾箱、删除），最初：只发送+显示（创建数据库表：发件人、收件人、内容、状态）
  async function sendNotesTo(userId,infor) {

    //await operateBookingStatus(bookingId, 'rejected');
     console.log("TBD sendNotesTo:", userId,infor);
  }
/////////////////////////////////////////////////////2026-7-1 /////////////////////////////////////////////////////
/*
 * ================================ Token 前后端协同原理简述 ================================
 * 
 * 1. Token是什么？
 *    Token（令牌）一般指JWT（JSON Web Token），是一种前后端分离应用中常用的身份认证机制。
 *    后端通过签发Token给登录用户，Token中包含用户ID、角色等信息，并用密钥签名防篡改。
 *    前端拿到Token后，在后续请求中携带该Token，实现"无状态"的身份认证。
 * 
 * 2. 协同流程
 *    （1）登录阶段：
 *       - 前端调用登录API（如 /login），后端验证用户名密码，验证通过后生成Token（带过期时间），返回给前端。
 *    （2）携带Token访问API：
 *       - 前端收到Token后，通常以 "Bearer {token}" 形式放入每次API请求的Header（如 Authorization 字段）。
 *    （3）后端校验Token：
 *       - 后端拦截API请求，提取并校验Token是否合法、是否过期，再确定用户身份。Token有效则放行，无效则返回未授权。
 *    （4）前端Token管理：
 *       - 前端可把Token保存在localStorage、sessionStorage等，每次需要访问受保护API时取出Token携带。Token过期后需重新登录获取。
 * 
 * 3. 典型代码参考（发送请求时携带Token）：
 *    (假设已拿到token变量)
 *    await request({
 *        url: API_BASE_URL + "/some/protected/api",
 *        method: "get",
 *        headers: {
 *           Authorization: "Bearer " + token
 *        }
 *    });
 * 
 * 4. 如何安全协同？
 *    - Token一般不建议长期存储在cookie中（防止XSS/CSRF漏洞），推荐存在localStorage/sessionStorage，仅每次请求时在header中携带。
 *    - 后端只信任自己签发且尚未过期的Token，且保证签名密钥安全不可泄露。
 *    - 未携带或非法Token的请求应被拦截（如通过Spring Security等机制）。
 * 
 * 5. Token用途拓展
 *    - 携带角色信息，后端根据token自动鉴权（如区分管理员与普通用户）。
 *    - 支持单点登录、刷新token机制、"登出"直接令前端删除本地token。
 * 
 * 总结：Token是现代Web应用前后端分离情况下实现身份认证和权限控制的核心手段之一，能让前端在无需保存会话的情况下参与安全通信，且提高了扩展性和安全性。
 */
// INSERT_YOUR_CODE
/**
 * 后端验证 Token 合法性的大致流程如下：
 * 
 * 1. 获取 Token：后端读取 HTTP 请求头（通常是 Authorization 字段，内容类似 "Bearer xxx.yyy.zzz"）。
 * 
 * 2. 校验签名：使用后端保存的签名密钥，对客户端传来的 Token 进行解码，并验证其签名是否合法、是否被篡改。
 *    （比如使用 jjwt、java-jwt 等库。密钥通常只在后端保存，前端无法伪造签名）
 * 
 * 3. 校验过期时间：解码后的 JWT payload 中包含 exp 字段，后端检查当前时间是否在有效时间范围（如果 Token 已过期则拒绝）
 * 
 * 4. 校验格式/内容：比如检查 Token 的类型、Payload 是否完整（用户ID、角色等信息），有无黑名单等。
 * 
 * 典型后端验证伪代码（Java/Spring 示例，见 JwtUtil.java）：
 * 
 *  String token = ... // 从请求头获取
 *  Claims claims = Jwts.parserBuilder()
 *      .setSigningKey(signingKey)         // 设置签名密钥
 *      .build()
 *      .parseClaimsJws(token)             // 解析与验证token
 *      .getBody();
 *  // 验证过期时间
 *  Date expirationDate = claims.getExpiration();
 *  if (expirationDate.before(new Date())) {
 *      // Token已过期
 *  }
 *  // 可附加更多校验如用户状态/权限等
 * 
 * 结论：只有签名有效且未过期的 Token，后端才认为是“合法”的，进而确认当前访问用户身份和权限。
 */

 