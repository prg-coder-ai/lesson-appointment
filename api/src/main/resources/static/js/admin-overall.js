 
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
let lastMonthTotalTeacher=0,lastMonthTotalStudent=0,lastMonthTotalCourse=0,lastMonthTotalBooking=0,lastMonthTotalAppoint=0;
let pendingBooking=[];// ID,ciurseName,studentName,teacherName,dateTime(创建时间),状态、操作（预览、确认、拒绝）
let activeDataForTearcher=[];// id="activity-teachers" 教师姓名 授课总节数  预约完成率  学生平均评分  操作
let BookingCount=0,CancelBookingCount=0;
let  monthTotalTeacherIcon={},
    monthTotalStudentIcon= {},
    monthTotalCourseIcon= { },
    monthTotalBookingIcon={};
    monthTotalAppointIcon ={ }

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
window.getBookingList  = getBookingList ;  

 async function refreshOverallpage(){
  renderStatisCards();
  showAppointments();
 }

 //刷新月度统计
async function renderStatisCards() {
 
   /* const dynamicContentCenter = document.getElementById('dynamic-content-center');
    console.log("renderCourseCards:",dynamicContentCenter);
    if (!dynamicContentCenter) return; 
    // 显示加载中
    dynamicContentCenter.innerHTML = '<div style="padding:40px 0;text-align:center;">加载中...</div>';

    // 构建筛选条件 TBD
    const conditionJson = {
        //language: document.getElementById('languageType').value,
      //  level: document.getElementById('difficultyLevel').value,
      teacherId:"",
      templateId:"",
      status:"",
        pageRow: localParamter.pageSize,
        pageNum: localParamter.currentPage
    };

      templateList = await  fetchTemplateList(templateCondition);  
      teacherList  = await  fetchUserList(conditionJsonForTeacher);

    // 获取模板列表数据
    await fetchCourseList(conditionJson);  
    const pagination = document.getElementById('pagination');
    if (pagination) {
        pagination.currentPage = localParamter.currentPage;
        pagination.pageSize    = localParamter.pageSize;
        pagination.total       = localParamter.total;
    }
*/
    // INSERT_YOUR_CODE
    // 获取当前日期的年、月
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // getMonth() 返回 0-11，因此要 +1

    monthTotalTeacher=10;monthTotalStudent=20;monthTotalCourse=30;monthTotalBooking=40;monthTotalAppoint=50;
    lastMonthTotalTeacher=1;lastMonthTotalStudent=2;lastMonthTotalCourse=3;lastMonthTotalBooking=4;lastMonthTotalAppoint=5;
    const stats = await getUserStatisticByMonth(currentYear, currentMonth);
    if (stats) { console.log(stats.teacherMonthStart, stats.studentMonthEnd); 
          monthTotalTeacher= stats.teacherMonthEnd;
          lastMonthTotalTeacher = stats.teacherMonthStart;

          let delt= monthTotalTeacher-lastMonthTotalTeacher;
          monthTotalTeacherIcon=getFaiconAndStr(delt);

          monthTotalStudent =   stats.studentMonthEnd;
          lastMonthTotalStudent = stats.studentMonthStart;
          delt= monthTotalStudent-lastMonthTotalStudent;
          monthTotalStudentIcon=getFaiconAndStr(delt);
        }
    const stats2 = await getCourseStaticsByMonth(currentYear, currentMonth);
    if (stats2) { console.log(stats2.courseMonthEnd, stats.courseMonthStart); 
      monthTotalCourse = stats2.courseMonthEnd;
      lastMonthTotalCourse =   stats2.courseMonthStart;

      let delt= monthTotalCourse-lastMonthTotalCourse;
      monthTotalCourseIcon=getFaiconAndStr(delt);
    }
    //”booked“ --> 当前的预约数，如何计算: booked--本月预约数，上月预约数 
   const  BookingMonthCount = await   getBookingStaticsByMonth(currentYear, currentMonth); 
    if(BookingMonthCount) { 
      console.log( BookingMonthCount .bookingMonthLast, BookingMonthCount .bookingMonth ); 
      monthTotalBooking = BookingMonthCount .bookingMonth  ;
      lastMonthTotalBooking =   BookingMonthCount .bookingMonthLast  ; 

      let delt= monthTotalBooking-lastMonthTotalBooking;
      monthTotalBookingIcon=getFaiconAndStr(delt);
    }
    monthTotalAppointIcon=getFaiconAndStr(0);
}
 function getFaiconAndStr( v) {
   if(v==0) return {icon:"",str:"持平",v:v ,color:"#52c41a"};
   else  if(v>0) return {icon:"fa-arrow-up",str:"增加",v:v  ,color:"#52c41a"};
   else   return {icon:"fa-arrow-down",str:"减少",v:-v  ,color:"#f5222d"}; 
 }
//刷新按钮也做同样的动作：读取数据库，更新显示
 async function showAppointments(){
 //search current pendding booking items ,and dispaly here /pendingBooking 
     let userRole = null,userId=null,status ='cancelling';//TB TEST "pending";
     bookingList1 = await getBookingList(userRole, userId, status);
     bookingList2 = await getBookingList(userRole, userId, 'booking');
   
     CancelBookingCount= bookingList1.length;
     BookingCount = bookingList2.length; 
     console.log("BookingCount:", BookingCount,CancelBookingCount);  
 }   

/**
 * 调用后端接口获取模板列表
 */
async function fetchCourseList(conditionJson) {
    const token = getToken();
    if (!token) return;

    try {
        // Axios GET请求（修复response.json()错误，Axios已自动解析）
        const response = await axios.get(`${API_BASE_URL}/course/list`, {
            headers: { "Authorization": "Bearer " + token },
            params: conditionJson // 筛选条件通过params传递
        });
        const res = response.data;
        console.info("get response data:",res);
        if (res && res.code === 200) {
          //console.info("data.courses:",res.courses);  .courses
            CourseList = res.data|| [];
            localParamter.total = CourseList.length|| 0;
            console.info("total:",localParamter.total,CourseList);
            // 补全默认状态
            CourseList.forEach(item => {
                if (!item.status) item.status = 'active';
            });
        } else {
            alert(res?.message || '获取课程列表失败');
        }
    } catch (e) {
        alert("网络错误，获取模板列表失败");
        console.error(e);
    }
}

// ===================== 交互函数 =====================    
async function operateCourse(courseId, action) {
    const token = getToken();
    const payload = {
      courseid: courseId,  // 注意小写，和后端命名对应
      status: action
  };
      console.log("payload：",payload); 
    fetch(`${API_BASE_URL}/course/updateStatus`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        "Authorization": "Bearer " + token
      },
      credentials: 'include',
      body: JSON.stringify(payload)
    })
    .then(response => {
      // 判定http请求结果，如果不是2xx，直接抛出
      if (!response.ok) {
        throw new Error(`服务器错误，状态码: ${response.status}`);
      }
      // 某些接口如204/无内容, 直接返回空对象防止解析异常
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        return response.json();
      }
      // 不是json时返回空对象，避免res为undefined或字符串
      return {};
    })
    .then(res => {
      // 防御：确认res是对象且有code字段
      const code = typeof res === "object" && res !== null && "code" in res ? res.code : undefined;
      const msg = (typeof res === "object" && res !== null && res.message) ? res.message : '';
      if (code === 200) { 
        if (console.success) {
          console.success(msg);
          console.success('操作成功');
        }
        renderCourseCards(); 
      } else {
        alert(msg || '操作失败');
      }
    })
    .catch(e => {
      // 网络错误或json解析异常都能捕获
      alert("网络错误或数据解析异常，操作失败");
      console.error(e);
    });
   
    }  
 
 
  