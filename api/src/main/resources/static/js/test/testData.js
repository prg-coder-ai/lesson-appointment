 
 
/** 测试代码0--批量创建数据
 * 批量创建用户
 * @param {number} number - 要创建的用户数量
 * @param {string} role - 用户角色（如 "student", "teacher", "admin" 等）
 * 调用示例：test_genUser(10, "student");
 */
function test_genUser(number, role) {

  alert(`添加 `+role+" "+number+"人");
  const users = [];
  for (let i = 1; i <= number; i++) {
    const account = role + i;
    const user = {
      // userId 采用简易随机或序号，按需求可更复杂
      userId: `${role}_${Date.now()}_${i}_${Math.floor(Math.random()*1000)}`,
      account: account,
      password: '123456',
      name: account,
      email: account + '@qq.com',
      role: role,
      phone: '',
      avatar: '',
      status: 'active',  // 正常
      remark: ' for test,auto add'
    };
    users.push(user);
  }
  console.log("批量生成用户:", users);
  // 如需发送到后端，可循环请求or批量接口
    users.forEach(u => { request.post('/user/add', u) })

    alert(`已添加 `+role+" "+number+"人");
  return users;
}

// 调用范例：console.log(test_genUser(5, "teacher"));
/**
 * 根据角色生成批量创建用户的 Excel 导入模板
 * 提供表头和部分示例数据，便于批量准备新学号/工号等信息。
 * 支持 'student', 'teacher', 'admin' 等不同角色定制表头
 * 导出为 CSV，便于管理员一键导入。
 * @param {string} role 用户角色
 */
function generateUserImportTemplate(role = "student") {
  let headers = [
    "account",    // 账号，必填
    "name",       // 姓名，必填
    "password",   // 初始密码
    "email",      // 邮箱
    "phone",      // 电话
    "role",       // 角色
    "avatar",     // 头像url
    "status",     // 状态（1正常，其他可表示禁用等）
    "remark"      // 备注
  ];
  let example = {
    student: [
      ["student001", "张三", "123456", "student001@qq.com", "18300000001", "student", "", "1", ""],
      ["student002", "李四", "123456", "student002@qq.com", "18300000002", "student", "", "1", ""]
    ],
    teacher: [
      ["teacher001", "王老师", "123456", "teacher001@qq.com", "13900000001", "teacher", "", "1", ""],
      ["teacher002", "刘老师", "123456", "teacher002@qq.com", "13900000002", "teacher", "", "1", ""]
    ],
    admin: [
      ["admin01", "系统管理员", "123456", "admin01@qq.com", "18500000001", "admin", "", "1", ""]
    ]
  };
  let rows = example[role] || example["student"];
  let csvArr = [];
  csvArr.push(headers.join(","));
  rows.forEach(r => {
    csvArr.push(r.map(col => `"${String(col).replace(/"/g, '""')}"`).join(","));
  });

  let csvContent = csvArr.join("\r\n");

  // 通过 Blob 下载csv
  const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8;'});
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `用户导入模板_${role}_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// 使用范例：generateUserImportTemplate("student");
// 可在管理员批量导入/新建页加“下载模板”按钮，绑定本方法
/**
 * 批量创建10个CourseTemplate对象并通过后端接口添加到数据库
 * 需配合后端API /courseTemplate/add (POST) 使用
 * 可作为演示/初始化用途，只需管理员页面用一次即可
 */
async function batchAddCourseTemplates() {
  // 可根据实际CourseTemplate字段扩展或调整
  const templates = [
    {
      templateId: "CT001",
      languageType: "english",
      difficultyLevel: "1入门",
      classFee: 100,
      classDuration: 30,
      classForm: "一对一",
      description: "适合零基础入门的英文会话课程",
      status: "active"
    },
    {
      templateId: "CT002",
      languageType: "japanese",
      difficultyLevel: "2进阶",
      classFee: 120,
      classDuration: 45,
      classForm: "一对一",
      description: "日语N4-N3进阶班，巩固基础提升会话",
      status: "active"
    },
    {
      templateId: "CT003",
      languageType: "kr",
      difficultyLevel: "1入门",
      classFee: 90,
      classDuration: 30,
      classForm: "小班课",
      description: "韩语入门小班课程，适合初学者",
      status: "active"
    },
    {
      templateId: "CT004",
      languageType: "english",
      difficultyLevel: "3中级",
      classFee: 150,
      classDuration: 60,
      classForm: "大班课",
      description: "企业级商务英语中级提升课",
      status: "active"
    },
    {
      templateId: "CT005",
      languageType: "france",
      difficultyLevel: "2进阶",
      classFee: 110,
      classDuration: 45,
      classForm: "一对一",
      description: "法语进阶会话训练",
      status: "active"
    },
    {
      templateId: "CT006",
      languageType: "日语",
      difficultyLevel: "3中级",
      classFee: 180,
      classDuration: 60,
      classForm: "大班课",
      description: "日语商务写作与口语综合提升",
      status: "active"
    },
    {
      templateId: "CT007",
      languageType: "chinese",
      difficultyLevel: "1入门",
      classFee: 80,
      classDuration: 30,
      classForm: "小班课",
      description: "对外汉语入门课程，适合外籍学生",
      status: "active"
    },
    {
      templateId: "CT008",
      languageType: "德语",
      difficultyLevel: "2进阶",
      classFee: 130,
      classDuration: 45,
      classForm: "一对一",
      description: "德语B1听说读写全面进阶",
      status: "active"
    },
    {
      templateId: "CT009",
      languageType: "韩语",
      difficultyLevel: "4高级",
      classFee: 200,
      classDuration: 60,
      classForm: "一对一",
      description: "韩语TOPIK冲刺高级班",
      status: "active"
    },
    {
      templateId: "CT010",
      languageType: "english",
      difficultyLevel: "4高级",
      classFee: 260,
      classDuration: 90,
      classForm: "大班课",
      description: "英文演讲与学术论文写作高级班",
      status: "active"
    }
  ];
  let i=0;
  for (const tpl of templates) {
    try {
      // 使用封装的request.post方法发送请求，实现更优雅的调用和兼容性
     // const result = await request.post('/course/template/insert', tpl);
      const result = await request({
        url: `${API_BASE_URL}/course/template/insert`,
        method: 'POST',
        data: tpl, // 正确传递查询参数，自动加到URL上 
        });

      // 可根据result结构展示反馈
      if(i==0)
         console.log("course/template/insert:",result);
        i++;
      if (result  ) {
        console.log(`模板${tpl.templateId}添加成功`);
      } else {
        console.warn(`模板${tpl.templateId}添加失败`, result && result.msg);
      }
    } catch (e) {
      console.error(`模板${tpl.templateId}接口异常`, e);
    }
  }
  alert("共10个CourseTemplate初始化添加请求已完成，请刷新数据查看。");
}

// 使用方法：管理员页面按钮绑定 batchAddCourseTemplates() 即可
/**
 * 1. 首先获取所有教师ID列表
 * 2. 遍历每个CourseTemplate，为其创建10个Course对象，每个Course对象随机分配一个教师ID
 * 3. 调用后端 /course/add 接口提交新Course对象
 */
async function batchAddCoursesForTemplates() {
  // 首先获取所有role=teacher的用户ID
  let teacherIDs = [];
  try {
    //const data = await request.get("/user/list?role=teacher");
    //if (data && data.code === 200 && Array.isArray(data.data)) 
    const conditionJson = { role: 'teacher' };//TBD:当前admin所属的群组等过滤条件
    const data = await fetchUserList(conditionJson);
    {
      teacherIDs = data.map(user => user.userId).filter(Boolean);
    }
  } catch (e) {
    console.error("获取教师ID列表失败", e);
    alert("获取教师ID列表失败，不能批量生成课程。");
    return;
  }
  if (!teacherIDs.length) {
    alert("没有可用教师账号，无法生成课程。");
    return;
  }
   let templates =  await fetchTemplateList('all');

  // 10个模板
  for (const tpl of templates) {
    for (let i = 0; i < 10; i++) {
      const teacherId = teacherIDs[Math.floor(Math.random() * teacherIDs.length)];
      // 构造Course对象
      const newCourse = {
        templateId: tpl.templateId,
        teacherId: teacherId,
        courseName:tpl.languageType+"-"+tpl.difficultyLevel+"-"+tpl.classForm+"-"+(i+1),
        languageType: tpl.languageType,
        difficultyLevel: tpl.difficultyLevel,
        classFee: tpl.classFee,
        classDuration: tpl.classDuration,
        classForm: tpl.classForm,
        content:tpl.description,
        feature:tpl.classForm,
        description: tpl.description + `（自动生成课程${i+1}）`,
        status: "active"
        // 其他Course属性可按需补充
      };
      try {
        const result = await request.post("/course/insert", newCourse);
        if (result  ) {
          console.log(`模板${tpl.templateId}第${i+1}个课程添加成功，教师:${teacherId}`);
        } else {
          console.warn(`模板${tpl.templateId}第${i+1}个课程添加失败`, result && result.msg);
        }
      } catch (e) {
        console.error(`模板${tpl.templateId}第${i+1}个课程接口异常`, e);
      }
    }
  }
}
/**
 * 为每个课程批量创建10个排期，并添加到数据库（适用于演示/测试/初始化）
 * 需配合后端saveScheduleToServer (POST)
 * 每次执行，所有课程各生成10条排期，自动分配上课时间
 * -------
 */
async function batchAddCourseSchedulesPerCourse() {
  try {
    // 1. 获取所有课程列表
    const coursesJson = await fetchCourseList({status:'active'});
    console.error(coursesJson);
    if (!coursesJson ) {
      alert("获取课程列表失败 "  );
      return;
    }
   

    if (!coursesJson.length) {
      alert("没有课程数据，无法批量生成课程排期。");
      return;
    }

    // 2. 为每个课程生成10条排期对象
    const schedules = [];
    const today = new Date();
    for (const course of coursesJson) {
      for (let i = 0; i < 10; i++) {
        // 自动分配上课时间: 从明天开始，每隔1天一条
        const classDate = new Date(today);
        classDate.setDate(today.getDate() + i + 1);
        // 生成上课时间段
        const startHour = 8 + (i % 10); // 8~17点
        const duration = course.classDuration || 30; // 单位分钟
        const startTime = `${startHour.toString().padStart(2, '0')}:00:00`;
        const endMinute = (0 + duration) % 60;
        const endHour = startHour + Math.floor(duration / 60) + Math.floor((0 + duration) / 60);
        const endTime = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}:00`;

        // 构造CourseSchedule对象属性，自行调整字段名
        const scheduleObj = {
          scheduleId: Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b=>b.toString(16).padStart(2,'0')).join(''),
     
          courseId: course.courseId,
          teacherId: course.teacherId || "",
          templateId: course.templateId,
        //  classDate: classDate.toISOString().slice(0, 10), // yyyy-MM-dd
          startTime: startTime, // "HH:mm"
          endTime: endTime,     // "HH:mm"
        
          startDate:classDate.toISOString().slice(0, 10),
          endDate:classDate.toISOString().slice(0, 10),
          status: "active",   // 可预约
          classroom: "教室-" + ((i % 5) + 1),
          remark: `自动生成-${i+1}`,

          repeatType:0,
          repeatInterval: 1,
          repeatDays:  [],
          timeZone:  "America/Edmonton",
          availableSites: 1, 
          name:   course.courseName+(i+1)
        };
        schedules.push(scheduleObj);
      }
    }

    // 3. 添加到数据库（依次POST，或后端支持批量接口可批量发送）
    let okCount = 0, failCount = 0;
    for (const sched of schedules) {
      
    await sleep(20);
      try {
        const result = saveScheduleToServer(false,sched);//await request.post("/courseSchedule/add", sched);
        if (result ) {
          okCount++;
        } else {
          failCount++; 
        }
      } catch (e) {
        failCount++;
        console.error("排期添加接口异常", sched, e);
      }
        
    }

    alert(`批量为课程生成排期完成！成功：${okCount}，失败：${failCount}`);
  } catch(e) {
    console.error("自动批量添加课程排期异常", e);
    alert("批量生成课程排期失败：" + e);
  }
}
// 使用方法：在管理员页面按钮绑定 batchAddCourseSchedulesPerCourse()

// 1. 查询全部学生列表
async function getAllStudentIds() {
  try {
    //TBD /user/list con={role:student,status:active }
    const resp = await request({url:"/user/student/list",method:"get"});
    if (resp  ) {
      // 将后端返回的学生用户对象数组 resp 映射为只包含 userId 的纯数组，即提取所有学生的 userId 构成一个新数组返回
      return resp.map(u => u.userId);
    } else {
      return [];
    }
  } catch (e) {
    console.error("获取学生列表失败", e);
    return [];
  }
}
async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
// 2. 帮全部排期随机指定给1个学生 ----TBD：直接assign-student
async function assignSchedulesRandomStudent() {
  const studentIds = await getAllStudentIds();
  if (!studentIds.length) {
    alert("没有可用学生，无法分配排期");
    return;
  }
  let schedulesList = await getScheduleList();
  let ok = 0, fail = 0;
  //console.error("schedules",schedulesIdList);
  let teacherId=null;
  for (const scdObj of schedulesList) {
    
    await sleep(20); 
    teacherId=null
      if(scdObj){
         let cObj = await getCourseById(scdObj.courseId);
         console.warn(" getCourseById", cObj ); 
         if(cObj)
            teacherId = cObj.teacherId;
          else 
          {
            console.warn("search no getCourseById", scdObj ); 
          }
      }  
       if(teacherId == null)
       {
        console.warn("search no teacherid", scdObj );
        continue;
       }
     const sid = studentIds[Math.floor(Math.random() * studentIds.length)]; 
    // 构造预约对象
    const orderDto = {
      //id: Math.random().toString(36).slice(2, 10), // 生成8位随机字符串
      studentId: sid,
      scheduleId: scdObj.scheduleId, // 兼容可能的字段名
      teacherId:  teacherId,
      status: "booked", // 可根据实际业务调整pending
     // remark: "自动分配"
 
    };

    try {
      const rst = await request({url:`${API_BASE_URL}/course/booking/create`,
        method:`POST`,
        data: orderDto});
      if (rst) {
        ok++;
      } else {
        fail++;
        console.warn("学生预约失败", orderDto, rst && rst.msg);
        break;//only once for test
      } 
    } catch(e) {
      fail++;
      console.error("分配学生预约接口异常", orderDto, e);
      break;
    }
  }
  alert(`随机分配排期给学生已完成，成功：${ok}，失败：${fail}`);
}
 
  //
//  利用public下的已有函数getBookingList读取已经预定的booking对象(status="booked")，
// 然后判断在appointment数据表中如果不存在booking.id则把booking对象转为ScheduleGenerateDTO ，
// 调用generateScheduleListFromServer创建预定对象的预约时间
async function generateAppointmentListByBooking() {
  // 1. 获取已预约的booking对象列表
  let bookingList = await getBookingList({ status: "booked" });
  if (!Array.isArray(bookingList)) {
    console.warn("getBookingList 未获取到数组数据，实际为:", bookingList);
    return;
  }
  console.log(`[generateAppointmentListByBooking] 已获取booking数量:`, bookingList.length);

  // 2. 遍历booking对象，判断appointment表中是否已经存在，如果不存在则生成ScheduleGenerateDTO并生成预约
  let countInserted = 0, countSkipped = 0, errors = 0;
  for (let i = 0; i < bookingList.length; i++) {
    const booking = bookingList[i];

    // 检查appointment数据表中是否已经存在该预约
    let exists = false;
    try {
      exists = await checkAppointmentExistsByBookingId(booking.id);
    } catch (e) {
      console.error(`检查appointment是否存在异常:`, booking.id, e);
      errors++;
      continue;
    }

    if (exists) {
      console.log(`[generateAppointmentListByBooking] 已存在的预约，跳过 bookingId=`, booking.id);
      countSkipped++;
      continue;
    }

    // booking对象转为ScheduleGenerateDTO
    //let generateDTO =  toScheduleCreateDto( booking);
    
    try {
      let rst = await generateAppointmentList(booking.scheduleId,null);
      if (rst  ) {
        countInserted++;
        console.log(`[generateAppointmentListByBooking] 已为bookingId=${booking.id}创建预约`, rst);
        //TBD --保存到数据库
      } else {
        errors++;
        console.warn(`[generateAppointmentListByBooking] 生成预约失败 bookingId=`, booking.id, rst && rst.msg);
      }
    } catch (e) {
      errors++;
      console.error(`[generateAppointmentListByBooking] generateScheduleListFromServer 调用异常`, booking.id, e);
    }
  }

  alert(`预约导入完成。成功创建: ${countInserted}，已存在跳过: ${countSkipped}，错误: ${errors}`);
}

async  function checkAppointmentExistsByBookingId(booking_id){
// INSERT_YOUR_CODE
  // 调用API，appointment/getByBookingId 判断是否为空
  // 返回true表示已存在，false表示不存在
  try {
    const res = await request({
      url: `${API_BASE_URL}/appointment/getByBookingId`,
      method: "GET",
      params: { bookingId: booking_id }
    });
    // 这里假定res.data为预约数组，且接口包一层Result
    if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
      return true;  // 存在
    }
    return false;   // 不存在
  } catch (e) {
    // 网络/服务器异常，抛出上层处理
    throw e;
  }
 
}

 function test_genUser_student() {
  
  let number = 300;
  let role = "student";

  test_genUser(number,role);
 }
 function test_genUser_teacher() {
  let number = 100;
  let role = "teacher";
  test_genUser(number,role);
 }
// 用法示例：
// assignSchedulesRandomStudent(schedules); // 其中schedules是排期对象数组
 //创建测试页面,返回 测试入口按钮
  function makeTestPage() {

        let testHtml ="<div>";
        let number = 300,role = "student";
        testHtml += ' <div > <button class="btn btn-default" onclick="test_genUser_student()"> 添加学生</button></div>';
        number = 100,role = "teacher";
        testHtml += ' <div > <button class="btn" onclick="test_genUser_teacher()"> 添加教师</button></div>';
      
        testHtml += ' <div > <button class="btn" onclick="batchAddCourseTemplates()"> 添加课程模板</button></div>';
        testHtml += ' <div > <button class="btn" onclick="batchAddCoursesForTemplates()"> 添加课程</button></div>';

        testHtml += ' <div> <button class="btn" onclick="batchAddCourseSchedulesPerCourse()"> 添加课程排期</button></div>';

        testHtml += ' <div > <button class="btn" onclick="assignSchedulesRandomStudent()"> 添加课程预定</button></div>';
        testHtml += '</div>';

        return testHtml; 
  }
 