 
 //admin---上课通知--3天内的课程显示-----
// ===================== 核心函数 =====================
 
let DaysAppointmentList=[];// ID,ciurseName,studentName,teacherName,dateTime(创建时间),状态、操作（预览、确认、拒绝） 
 
 
window.refreshAppointmentNotes  = refreshAppointmentNotes ;  

 async function refreshAppointmentNotes(){
    let days = 7; //TBD 选择 7天、3天、当天1
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
                 //let scheduleInfoStr = getScheduleInfo(scheduleObject); 
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
                         appointmentId: appointment.id,
                         bookingId: bookedObject.id,

                         className: classObject.courseName+ " " + scheduleObject.name,
                         
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
    } else {
      pendingBookingsHtml +="<tr> <td> n/a </td> <td> n/a </td><td> n/a </td><td> n/a </td> <td> n/a </td></tr>";
    }

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
    return '正常'+'3~7日通知已发送';
  }  else   if   (status === 'noted2') {
    return '正常'+' 当日通知已发送';
  } else   if   (status === 'completed') {
    return '完成'+' 通知已发送';
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
 function formAppointmentTr(cardInfo) {
    console.log("cardInfo:", cardInfo); 
   const info = `
        <tr class="course-card">
            <td class="course-info">   ${cardInfo.index}</td>
            <td class="course-info" style="display:none;">${cardInfo.bookingId}</td>
       
            <td class="course-info">  ${cardInfo.className}  ${cardInfo.classIndex}  </td>
           <td class="course-info">   ${cardInfo.studentName}</td>
           <td class="course-info">   ${cardInfo.teacherName}</td>
           <td class="course-info">   ${cardInfo.appointmentTime} ${cardInfo.origTz}</td>
           <td class="course-info">    ${checkAppointmentStatus(cardInfo.status)}</td>
            ${
              true //(checkStatusAndDate(cardInfo.appointmentTime,cardInfo.status,cardInfo.origTz))//判断是否需要发送通知，
                ? `<td class="course-info">
                    <button class="btn btn-success" onclick='sendNotesToUsers(${JSON.stringify(cardInfo)})'><i class="fa fa-check"></i> 发送通知</button>  
                   </td>`
                : `<td class="course-info"></td>`
            } 
            </tr>
   `;
 // console.log("cardContent:", info);
   return info;
} 
async  function checkStatusAndDate(appointmentTime,status,timeZone){

  let retPara = { needSendInfo:false,timeTag:3,userTime:appointmentTime};
  console.log("1:",appointmentTime,"timeZone",timeZone ,status,userTimeZone);

  // 将传入的 appointmentTime 字符串中的所有“-”替换为“/”，
  // 然后用 new Date() 构造日期对象，目的是为了在 iOS 设备也能正确解析日期格式。
  // 注意：new Date() 没有明确时区参数，若字符串不含时区信息，则默认按浏览器本地时区解析
  // 若传入字符串中带有 'Z'（UTC）或 +08:00 这种信息，则能按指定时区解析
  // 这里假设 appointmentTime 是"yyyy-MM-dd HH:mm:ss"格式（无时区），建议未来处理带时区的情况
 
    const now = new Date();//浏览器获取的时区的当前时间
    let userTime = new Date(appointmentTime);
    if(timeZone!= userTimeZone){
     const userTzTime = await tzSwitchTo(timeZone, appointmentTime, userTimeZone);   //把预约时间转为当前用户时区  
     console.log("now:",now,"app：",appointmentTime,"to usertz：",userTzTime,userTimeZone);
     userTime =  new Date(userTzTime.dateTime);//浏览器当前时区
    } 
  if (!(now instanceof Date)) {
    console.error("now 不是有效的日期对象:", now);
    return retPara;
  }
  console.log(" userTime:", userTime);
  const diffMs = userTime - now;
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  console.log("now:",now,"app",appointmentTime,userTime,diffMs,diffDays);
  // 只允许状态推进，不能倒退
  if ( status === 'completed' ||  status === 'cancelled' || status === 'canceled') {
      // 已完成/已取消，不发送任何通知.有关消息在相应的确认处理中发送 TBD
      return retPara;
  }
  retPara.userTime = userTime;//
  // 如果预约时间接近1小时并且未标记为 completed，则标记为 completed
  if (diffDays >= 3 && diffDays <= 7){
     if(status == 'active') {
        retPara.needSendInfo =true;retPara.timeTag =2;//-->noted1
     }
  }   else if (diffDays >= 1 ) {
         if( status == 'noted1' ||  status == 'active') {
          retPara.needSendInfo =true;retPara.timeTag =1;//->noted2
         }
  } else if (diffMs <= 1*60*60*1000 ) {
     if ( status == 'noted2' || status == 'noted1' || status == 'active') {
         retPara.needSendInfo =true;retPara.timeTag =0;
     }
  }
  console.log("retPara",retPara);
    return retPara; 
 }

async function sendNotesToUsers( cardInfo){
    //判断时间与状态： active ：七天内~3天内，noted1：1天前，  noted2:completed：不超过1小时
    // INSERT_YOUR_CODE
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
        await operateAppointmentStatus(cardInfo.appointmentId,newStatus);//courseAndBooking.js 
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
   console.log(" sendNotesToTeacher:",userId, cardInfo);
   
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
//把信息发送到站内信箱-----创建添加、修改状态（已发送、已阅读、删除到垃圾箱、删除），最初：只发送+显示（创建数据库表：发件人、收件人、内容、状态）
async function sendNotesTo(userId,infor) {
  
  //await operateBookingStatus(bookingId, 'rejected');
   console.log("TBD sendNotesTo:", userId,infor); 
} 

// INSERT_YOUR_CODE
// 根据你的描述，应该是 order by 要放在 where 之后。正确语句如下：

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