 
// 全局常量（后端可通过Thymeleaf注入，如 th:inline="javascript"）  
var localParamter ={ 
  currentPage:1,         // 当前页码（初始值由Thymeleaf渲染）
  pageSize : 10,           // 页大小
  total : 0 ,              // 总条数
  CourseDialogVisible: false, // 弹窗状态
  dialogTitle : '新增课程', // 弹窗标题
  currentCourseId: '', // 当前操作的课程ID
  formEl :'', 
};

// ===================== 核心函数 =====================

/*
  <tr>
                      <td>预约20260320001</td>
                      <td>英语初级口语 - 小班课</td>
                      <td>张三</td>
                      <td>李老师</td>
                      <td>2026-03-20 14:00</td>
                      <td style="color: #faad14;">待审核</td>
                      <td>
                        <button class="btn btn-success" onclick="approveReservation(this)"><i class="fa fa-check"></i> 通过</button>
                        <button class="btn btn-danger" onclick="rejectReservation(this)"><i class="fa fa-times"></i> 拒绝</button>
                      </td>
                    </tr> 
*/ 
let monthTotalTeacher=0,monthTotalStudent=0,monthTotalCourse=0,monthTotalBooking=0,monthTotalAppoint=0;
//let lastMonthTotalTeacher=0,lastMonthTotalStudent=0,lastMonthTotalCourse=0,lastMonthTotalBooking=0;
let pendingBooking=[];// ID,ciurseName,studentName,teacherName,dateTime(创建时间),状态、操作（预览、确认、拒绝）
let activeDataForTearcher=[];// id="activity-teachers" 教师姓名 授课总节数  预约完成率  学生平均评分  操作
let BookingCount=0,CancelBookingCount=0,TodayLessonsCount;//本周待处理预定单数、今日课程数，宏观显示
let  monthTotalTeacherIcon={},
    monthTotalStudentIcon= {},
    monthTotalCourseIcon= { },
    monthTotalBookingIcon={},
    monthTotalAppointIcon ={ };

/**  <tr>
                      <td>李老师</td>
                      <td>42</td>
                      <td>98%</td>
                      <td>4.9 <i class="fa fa-star" style="color: #faad14;"></i></td>
                      <td>
                        <button class="btn btn-default" onclick="viewTeacherDetail(this)"><i class="fa fa-eye"></i> 详情</button>
                      </td>
                    </tr>
 */   
/**
 * 渲染课程列表（核心：原生JS操作DOM）
 */
/**
 *  读取数据，并刷新页面
 * 1、 月度统计数据 fa-arrow-down fa-arrow-up
 * 2、 待审核的预约
 * 3、 教师统计信息
 */
refreshOverallpage();
 

 async function refreshOverallpage(){
  renderStatisCards();
  showAppointments();
 }

 //刷新月度统计
async function renderStatisCards() { 
    // 获取当前日期的年、月
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // getMonth() 返回 0-11，因此要 +1

   /* monthTotalTeacher=10;monthTotalStudent=20;monthTotalCourse=30;monthTotalBooking=40;monthTotalAppoint=0;
    lastMonthTotalTeacher=1;lastMonthTotalStudent=2;lastMonthTotalCourse=3;
    lastMonthTotalBooking=4;lastMonthTotalAppoint=5;*/
    const stats = await getUserStatisticByMonth(currentYear, currentMonth);
    if (stats) { //console .log(stats.teacherMonthStart, stats.studentMonthEnd);
          monthTotalTeacher= stats.teacherMonthEnd;
         // lastMonthTotalTeacher = stats.teacherMonthStart;

          let delt= monthTotalTeacher-stats.teacherMonthStart;;
          monthTotalTeacherIcon=getFaiconAndStr(delt);

          monthTotalStudent =   stats.studentMonthEnd;
          //lastMonthTotalStudent = stats.studentMonthStart;
          delt= monthTotalStudent- stats.studentMonthStart;
          monthTotalStudentIcon=getFaiconAndStr(delt);
        }
    const stats2 = await getCourseStaticsByMonth(currentYear, currentMonth);
    if (stats2) { //console .log(stats2.courseMonthEnd, stats2.courseMonthStart);
      monthTotalCourse = stats2.courseMonthEnd;
      //lastMonthTotalCourse =   stats2.courseMonthStart;

      let delt= monthTotalCourse- stats2.courseMonthStart;
      monthTotalCourseIcon=getFaiconAndStr(delt);
    }
    //”booked“ --> 当前的预约数，如何计算: booked--本月预约数，上月预约数 
   const  BookingMonthCount = await   getBookingStaticsByMonth(currentYear, currentMonth); 
   //console .log( BookingMonthCount  );
    if(BookingMonthCount) { 
    
      monthTotalBooking = BookingMonthCount .bookingMonth  ;
     // lastMonthTotalBooking =   BookingMonthCount .bookingMonthLast  ; 

      let delt= monthTotalBooking-BookingMonthCount .bookingMonthLast;
      monthTotalBookingIcon=getFaiconAndStr(delt);
    } else { monthTotalBooking =-1;  monthTotalBookingIcon=getFaiconAndStr(0);}

    const appData = await getAppointmentStatisticByMonth(currentYear, currentMonth);
    //console .log(appData);
    if(appData){ 
       monthTotalAppoint = appData .appMonth  ; 
      let delt= appData .appMonth-appData .appMonthLast  ;
      monthTotalAppointIcon=getFaiconAndStr(delt);
    } else {      monthTotalAppoint = 0  ; 
                  let delt= 0  ;
                  monthTotalAppointIcon=getFaiconAndStr(delt);
               }
}

 function getFaiconAndStr( v) {
   if(v==0) return {icon: "",str:"持平",v:v ,color:"#52c41a"};
   else  if(v>0) return {icon:" fa-arrow-up",str:"增加",v:v  ,color:"#52c41a"};
   else   return {icon:" fa-arrow-down",str:"减少",v:-v  ,color:"#f5222d"}; 
 }
//刷新按钮也做同样的动作：读取数据库，更新显示
 async function showAppointments(){
 //search current pendding booking items ,and dispaly here /pendingBooking 
     let userRole = null,userId=null,status ='cancelling';//TB TEST "pending";
     bookingList1 = await getBookingList(userRole, userId, status);
     bookingList2 = await getBookingList(userRole, userId, 'booking');
   
     CancelBookingCount= bookingList1.length;
     BookingCount = bookingList2.length; 
     //console .log("BookingCount:", BookingCount,CancelBookingCount);

     TodayLessonsCount = await getCountOfTodayAppointment();//获取今日课程数量
 }   

// ===================== 交互函数 =====================  
 
 
/**
 * 调用后端接口获取模板列表
 */ 

  