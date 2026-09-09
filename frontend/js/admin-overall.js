
// 全局常量（后端可通过Thymeleaf注入，如 th:inline="javascript"）
var localParamter = {
  currentPage: 1,              // 当前页码（初始值由Thymeleaf渲染）
  pageSize: 10,                // 页大小
  total: 0,                    // 总条数
  CourseDialogVisible: false,  // 弹窗状态
  dialogTitle: '新增课程',      // 弹窗标题
  currentCourseId: '',         // 当前操作的课程ID
  formEl: '',
};

// ===================== 核心函数 =====================

let monthTotalTeacher = 0,
    monthTotalStudent = 0,
    monthTotalCourse = 0,
    monthTotalBooking = 0,
    monthTotalAppoint = 0;
//let lastMonthTotalTeacher=0,lastMonthTotalStudent=0,lastMonthTotalCourse=0,lastMonthTotalBooking=0;
let pendingBooking = [];         // ID,ciurseName,studentName,teacherName,dateTime(创建时间),状态、操作（预览、确认、拒绝）
let activeDataForTearcher = [];  // id="activity-teachers" 教师姓名 授课总节数  预约完成率  学生平均评分  操作
let BookingCount = 0,
    CancelBookingCount = 0,
    TodayLessonsCount;           //本周待处理预定单数、今日课程数，宏观显示
let monthTotalTeacherIcon = {},
    monthTotalStudentIcon = {},
    monthTotalCourseIcon = {},
    monthTotalBookingIcon = {},
    monthTotalAppointIcon = {};

/**
 * 渲染课程列表（核心：原生JS操作DOM）
 */
/**
 *  读取数据，并刷新页面
 * 1、 月度统计数据 fa-arrow-down fa-arrow-up
 * 2、 待审核的预约
 * 3、 教师统计信息
 */
async function refreshOverallpage() {
  await loadAndRefreshOverallpage();
  // 渲染数据总览面板
  dynamicContentCenter.innerHTML = `
    <!-- 数据统计面板 -->
    <div class="stats-panel">
      <div class="stats-item">
        <div class="stats-label">总<span data-term="teacher">教师</span>数</div>
        <div class="stats-value">${monthTotalTeacher}</div>
        <div class="stats-desc"><i class="fa ${monthTotalTeacherIcon.icon}" style="color:  ${monthTotalTeacherIcon.color};"></i>${monthTotalTeacherIcon.v} 人 (${monthTotalTeacherIcon.str})</div>
      </div>
      <div class="stats-item success">
        <div class="stats-label">总<span data-term="student">学生</span>数</div>
        <div class="stats-value">${monthTotalStudent}</div>
        <div class="stats-desc"><i class="fa ${monthTotalStudentIcon.icon}" style="color: ${monthTotalStudentIcon.color};"></i> ${monthTotalStudentIcon.v}  人 (${monthTotalStudentIcon.str})</div>
      </div>
      <div class="stats-item warning">
        <div class="stats-label">总<span data-term="course">课程</span>数</div>
        <div class="stats-value">${monthTotalCourse}</div>
        <div class="stats-desc"><i class="fa  ${monthTotalCourseIcon.icon}" style="color: ${monthTotalCourseIcon.color};"></i> ${monthTotalCourseIcon.v} 门  (${monthTotalCourseIcon.str})</div>
      </div>
      <div class="stats-item danger">
        <div class="stats-label">本月预定数</div>
        <div class="stats-value">${monthTotalBooking}</div>
        <div class="stats-desc"><i class="fa  ${monthTotalBookingIcon.icon}" style="color:${monthTotalBookingIcon.color};"></i>${monthTotalBookingIcon.v} 单  (${monthTotalBookingIcon.str})</div>
      </div>
      <div class="stats-item danger">
        <div class="stats-label">本月预约<span data-term="lessonUnit">课时</span></div>
        <div class="stats-value">${monthTotalAppoint}</div>
        <div class="stats-desc"><i class="fa  ${monthTotalAppointIcon.icon}" style="color: ${monthTotalAppointIcon.color};"></i> ${monthTotalAppointIcon.v} 课次(${monthTotalAppointIcon.str})  </div>
      </div>
    </div>

    <!-- 近期预约审核卡片  -->
    <div class="card">
      <div class="card-header">
        <div class="card-title"><i class="fa fa-calendar-check"></i> 待审核预约</div>
      </div>
      <div class="stats-panel">
        <div class="stats-item">
          <div class="stats-label">预约待确认</div>
          <div class="stats-value">${BookingCount || 0}</div>
        </div>
        <div class="stats-item success">
          <div class="stats-label">取消待确认</div>
          <div class="stats-value">${CancelBookingCount || 0}</div>
        </div>
        <div class="stats-item success">
          <div class="stats-label">今日<span data-term="course">课程</span></div>
          <!--24小时内的预约课程 booked/completed、active -->
          <div class="stats-value">${TodayLessonsCount || 0}</div>
        </div>
      </div>
    </div>

    <!-- 教师活跃度统计卡片 TBD
    <div class="card">
      <div class="card-header">
        <div class="card-title"><i class="fa fa-chart-line"></i> <span data-term="teacher">教师</span>月度<span data-term="teaching">授课</span>统计</div>
        <div class="filter-bar">
          <div class="filter-item">
            <label>月份：</label>
            <select id="month-select">
              <option value="202603">2026年3月</option>
              <option value="202602">2026年2月</option>
              <option value="202601">2026年1月</option>
            </select>
          </div>
          <button class="btn btn-default" onclick="refreshTeacherStats()"><i class="fa fa-search"></i> 查询</button>
        </div>
      </div>
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th><span data-term="teacher">教师</span>姓名</th>
              <th><span data-term="teaching">授课</span>总节数</th>
              <th>预约完成率</th>
              <th><span data-term="student">学生</span>平均评分</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody id="activity-teachers">
          </tbody>
        </table>
      </div>
    </div> -->
  `;   
    applyTerms(dynamicContentCenter); 
  // loadAndRefreshOverallpage();
}

async function loadAndRefreshOverallpage() {
  await renderStatisCards();
  await showAppointments();
}

//刷新月度统计
async function renderStatisCards() {
  // 获取当前日期的年、月
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // getMonth() 返回 0-11，因此要 +1

  // 4 个统计接口互相独立，整体并行；每个 promise 自带 catch 返回 null，保持原 if(stats) 兼容
  const [stats, stats2, bookingMonthCount, appData] = await Promise.all([
    getUserStatisticByMonth(currentYear, currentMonth).catch(() => null),
    getCourseStaticsByMonth(currentYear, currentMonth).catch(() => null),
    getBookingStaticsByMonth(currentYear, currentMonth).catch(() => null),
    getAppointmentStatisticByMonth(currentYear, currentMonth).catch(() => null)
  ]);

  if (stats) { //console .log(stats.teacherMonthStart, stats.studentMonthEnd);
    monthTotalTeacher = stats.teacherMonthEnd;

    let delt = monthTotalTeacher - stats.teacherMonthStart;
    monthTotalTeacherIcon = getFaiconAndStr(delt);

    monthTotalStudent = stats.studentMonthEnd;
    delt = monthTotalStudent - stats.studentMonthStart;
    monthTotalStudentIcon = getFaiconAndStr(delt);
  }
  if (stats2) {
    monthTotalCourse = stats2.courseMonthEnd;

    let delt = monthTotalCourse - stats2.courseMonthStart;
    monthTotalCourseIcon = getFaiconAndStr(delt);
  }
  //”booked“ --> 当前的预约数，如何计算: booked--本月预约数，上月预约数
  if (bookingMonthCount) {
    monthTotalBooking = bookingMonthCount.bookingMonth;

    let delt = monthTotalBooking - bookingMonthCount.bookingMonthLast;
    monthTotalBookingIcon = getFaiconAndStr(delt);
  } else {
    monthTotalBooking = -1;
    monthTotalBookingIcon = getFaiconAndStr(0);
  }

  if (appData) {
    monthTotalAppoint = appData.appMonth;
    let delt = appData.appMonth - appData.appMonthLast;
    monthTotalAppointIcon = getFaiconAndStr(delt);
  } else {
    monthTotalAppoint = 0;
    monthTotalAppointIcon = getFaiconAndStr(0);
  }
}

function getFaiconAndStr(v) {
  if (v == 0)
    return { icon: "", str: "持平", v: v, color: "#52c41a" };
  else if (v > 0)
    return { icon: " fa-arrow-up", str: "增加", v: v, color: "#52c41a" };
  else
    return { icon: " fa-arrow-down", str: "减少", v: -v, color: "#f5222d" };
}

// 刷新按钮也做同样的动作：读取数据库，更新显示
async function showAppointments() {
  // search current pendding booking items ,and dispaly here /pendingBooking
  const userRole = null, userId = null;//TB TEST "pending";

  // 3 个接口互相独立，整体并行：2 个 booking 列表 + 今日课程数
  const [list1, list2, todayCount] = await Promise.all([
    getBookingList(userRole, userId, 'cancelling'),
    getBookingList(userRole, userId, 'booking'),
    getCountOfTodayAppointment()
  ]);

  bookingList1 = list1;
  bookingList2 = list2;
  CancelBookingCount = (list1 && list1.length) || 0;
  BookingCount = (list2 && list2.length) || 0;
  //console .log("BookingCount:", BookingCount,CancelBookingCount);

  TodayLessonsCount = todayCount;//获取今日课程数量
}

// ===================== 交互函数 =====================


/**
 * 调用后端接口获取模板列表
 */