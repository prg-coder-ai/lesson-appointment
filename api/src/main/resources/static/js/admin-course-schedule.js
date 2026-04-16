 //排期管理--页面
 console.log("schedule page");
let courseList = [];       // 课程列表
let scheduleObject=null;       // 排期
let scheduleList =[];

var localParamter ={ 
  currentPage:1,         // 当前页码（初始值由Thymeleaf渲染）
  pageSize : 10,           // 页大小
  total : 0 ,              // 总条数
  ScheduleDialogVisible: false, // 弹窗状态
  dialogTitle : '新增课程', // 弹窗标题
  currentId: '', // 当前操作的课程ID
  formEl :'', 
};
// ===================== 核心函数 =====================
 // 获取用户时区（关键）
const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
console.log("tz",userTimeZone);
/**
 * 渲染课程列表（核心：原生JS操作DOM）
 */
async function renderScheduleCards() {
    const dynamicContentCenter = document.getElementById('dynamic-content-center');
    console.log("container:",dynamicContentCenter);
    if (!dynamicContentCenter) return; 
    // 显示加载中
    dynamicContentCenter.innerHTML = '<div style="padding:40px 0;text-align:center;">加载中...</div>';  
    // 渲染HTML
    let html = '';
    { 
      html += `     
     <div class="search-bar">
        <input type="text" id="courseName" placeholder="课程名称">
        <select id="language">
            <option value="">语言</option>
            <option value="zh">中文</option>
            <option value="en">英文</option>
        </select>
        <select id="difficulty">
            <option value="">难度</option>
            <option value="easy">初级</option>
            <option value="middle">中级</option>
            <option value="hard">高级</option>
        </select>
        <input type="text" id="teacher" placeholder="教师">
        <button class="btn-primary" onclick="searchCourse()">检索课程</button>
    </div>

    <!-- 课程选择下拉 -->
    <div class="form-line">
        <label>选择课程：</label>
        <select id="courseSelect" onchange="loadSchedule()">
            <option value="">请先检索课程</option>
        </select>
    </div>

    <div class="section">
        <div class="section-title">排期设置</div>

        <div class="form-line" style="display:none;".>
            <label>Id</label>
            <input type="label" id="scheduleId">
        </div>

           <div class="form-line">
            <label>时区</label>
            <input type="label" id="timeZone" value=${userTimeZone}>
        </div>

        <div class="form-line">
            <label>开始日期：</label>
            <input type="date" id="startDate" value="${(new Date()).toISOString().split('T')[0]}">
       
        </div>
        <div class="form-line">
            <label>开始时间：</label>
            <input type="time" id="startTime" value="${(function(){ let d = new Date(); return d.toTimeString().slice(0,5); })()}">
       
        </div>

        <div class="form-line">
            <label>重复类型：</label>
            <select id="repeatType" onchange="onRepeatTypeChange()">
                <option value="none">不重复</option>
                <option value="day">每天</option>
                <option value="week">每周</option>
                <option value="month">每月</option>
            </select>
        </div>

        <div class="form-line">
            <label>重复周期：</label>
            <input type="number" id="interval" value="1" min="1" style="width:80px">
            <span id="repeatUnit">天</span>
        </div>

        <div class="form-line">
            <label>状态</label>
           <select id="status">
                <option value="pending">待发布</option>
                <option value="inactive">生效</option>
                <option value="active">正常</option>
                <option value="forzen">已删除</option>
            </select>
        </div>

        <!-- 每周重复：星期选择 -->
        <div class="form-line" id="weekDaysBox" style="display:none;">
            <label>重复星期：</label>
            <div id="weekDays">
                <label><input type="checkbox" value="1">周一</label>
                <label><input type="checkbox" value="2">周二</label>
                <label><input type="checkbox" value="3">周三</label>
                <label><input type="checkbox" value="4">周四</label>
                <label><input type="checkbox" value="5">周五</label>
                <label><input type="checkbox" value="6">周六</label>
                <label><input type="checkbox" value="7">周日</label>
            </div>
        </div>

         <!-- 每月重复： -->
        <div class="form-line" id="monthDaysBox" style="display:none;">
            <label>重复日期：</label>
            <div id="monthDays">
                  
            </div>
        </div>
        <div class="form-line">
            <label>结束日期：</label>
            <input type="date" id="endDate" value="">
       
        </div>
    </div>

    <!-- 操作按钮 -->
    <div class="btn-group">
        <button onclick="previewSchedule()">预览</button>
        <button class="btn-primary" onclick="publishSchedule()">发布</button>
        <button class="btn-success" onclick="saveSchedule()">保留</button>
        <button class="btn-danger" onclick="deleteSchedule()">删除</button>
    </div>

    <!-- 排期结果 -->
    <div class="section">
        <div class="section-title">排期结果（列表）</div>
        <table>
            <thead>
                <tr>
                    <th>课次</th>
                    <th>日期</th>
                    <th>时间</th>
                </tr>
            </thead>
            <tbody id="resultBody"></tbody>
        </table>
    </div>

    <div class="section">
        <div class="section-title">日历视图</div>
        <div id="calendar" class="calendar"></div>
    </div>`;
        
    dynamicContentCenter.innerHTML = html;

       // 动态生成每月1-31号复选框，每10个换一行 
        let monthDaysHtml = '';
        for (let i = 1; i <= 31; i++) {
            monthDaysHtml += `<label><input type="checkbox" value="${i}">${i}</label>`;
            if (i % 10 === 0 && i !== 31) monthDaysHtml += '<br>';
        } 
        document.getElementById('monthDays').innerHTML = monthDaysHtml;

         
        // 设置默认结束日期为今天+30天
       
          const endDateInput = document.getElementById("endDate");
          if (endDateInput) {
            const today = new Date();
            today.setDate(today.getDate() + 30);
            const year = today.getFullYear();
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const day = String(today.getDate()).padStart(2, '0');
            endDateInput.value = `${year}-${month}-${day}`;
          } ;
    

    
    searchCourse(); 

async function getCourseList(conditionJson) { 
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
          courseList = res.data|| [];
          localParamter.total = courseList.length|| 0;
          console.info("total:",localParamter.total,courseList);
          // 补全默认状态
          courseList.forEach(item => {
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

 // 1. 检索课程（原生 fetch）
 async function searchCourse() {
 
  const params = {
    courseName: document.getElementById('courseName').value,
    languageType: document.getElementById('language').value,
    difficultyLevel: document.getElementById('difficulty').value,
    teacher: document.getElementById('teacher').value
};
 console.log("search",params);//TBD---
  
  try { 
        await  getCourseList( params); 
  } catch (e) {
      // 模拟数据
      courseList = [ ];
     
      //alert("模拟课程加载成功");
  }
  renderCourseSelect();
}

function renderCourseSelect() {
  const sel = document.getElementById('courseSelect');
  sel.innerHTML = '<option value="">请选择课程</option>';
  courseList.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.id;
      opt.innerText = item.courseName;
      sel.appendChild(opt);
  });
}
//更新scheduleObject相关内容 --待细化
function renderSchedule() {
     if (!scheduleObject) return;

       // 刷新开始日期
       if (scheduleObject.scheduleId) {
        document.getElementById('scheduleId').value = scheduleObject.scheduleId;
    } else {
        document.getElementById('scheduleId').value = '';
    }

     // 刷新开始日期
     if (scheduleObject.startDate) {
         document.getElementById('startDate').value = scheduleObject.startDate;
     } else {
         document.getElementById('startDate').value = '';
     }

     // 刷新开始时间
     if (scheduleObject.startTime) {
         document.getElementById('startTime').value = scheduleObject.startTime;
     } else {
         document.getElementById('startTime').value = '';
     }

     // 刷新重复类型
     if (scheduleObject.repeatType) {
         document.getElementById('repeatType').value = scheduleObject.repeatType;
     } else {
         document.getElementById('repeatType').value = 'none';
     }

     // 刷新重复间隔
     if (scheduleObject.interval) {
         document.getElementById('interval').value = scheduleObject.interval;
     } else {
         document.getElementById('interval').value = 1;
     }

     if (scheduleObject.status) {
        document.getElementById('status').value = scheduleObject.status;
    } else {
        document.getElementById('status').value = "pending";
    }

     // 刷新结束日期
     if (scheduleObject.endDate) {
         document.getElementById('endDate').value = scheduleObject.endDate;
     } else {
         document.getElementById('endDate').value = '';
     }
     List <int> repeatDays ;
     // INSERT_YOUR_CODE
     // 把逗号分隔的数字字符串转为数组
     if (scheduleObject.repeatDays && typeof scheduleObject.repeatDays === 'string') {
         repeatDays = scheduleObject.repeatDays
             .split(',')
             .map(s => s.trim())
             .filter(s => s !== '')
             .map(Number)
             .filter(n => !isNaN(n));
     }

     // 刷新每周/每月重复星期（如有）
     if ( scheduleObject.repeatType === "week" 
              && Array.isArray(repeatDays)) {
         const checkboxes = document.querySelectorAll('#weekDays input[type="checkbox"]');
         checkboxes.forEach(cb => {
             cb.checked = repeatDays.includes(Number(cb.value));
         });
     } else   if ( scheduleObject.repeatType === "month" 
        && Array.isArray(repeatDays)) {
   const checkboxes = document.querySelectorAll('#monthDays input[type="checkbox"]');
   checkboxes.forEach(cb => {
       cb.checked = repeatDays.includes(Number(cb.value));
   });
    } else{
            const checkboxes = document.querySelectorAll('#weekDays input[type="checkbox"]');
            checkboxes.forEach(cb => {
                cb.checked = false;
            });
              checkboxes = document.querySelectorAll('#monthDays input[type="checkbox"]');
            checkboxes.forEach(cb => {
                cb.checked = false;
            });
        }
}

/**
 * 根据课程id，调用后端接口获取模板列表
 */
async function fetchScheduleList( cid) {
    const token = getToken();
    if (!token) return;
    
    dto.setCourseId(cid);
    try {
        // Axios GET请求（修复response.json()错误，Axios已自动解析）
        const response = await axios.get(`${API_BASE_URL}/course/schedule/selectByCourseId/${cid}`, {
            headers: { "Authorization": "Bearer " + token }, 
        });
        const res = response.data;
        console.info("get response data:",res);
        if (res && res.code === 200) {
          //console.info("data.schedules:",res.schedules);
            scheduleList = res.data.schedules|| []; // TBD:对于多个排期的情况进行区分

            localParamter.total = scheduleList.length|| 0;
            
            console.info("total:",localParamter.total,scheduleList);
            // 补全默认状态
            scheduleList.forEach(item => {
                if (!item.status) item.status = 'active';
            });
        } else {
            ;//alert(res?.message || '获取课程列表失败');
        }
    } catch (e) {
        alert("网络错误，获取模板列表失败");
        console.error(e);
    }
}



    // 切换重复类型:更新复选的重复天数：周一~7，月（1-31）
    function onRepeatTypeChange() {
      const type = document.getElementById('repeatType').value;
      const unit = { none: "", day: "天", week: "周", month: "月" };
      document.getElementById('repeatUnit').innerText = unit[type];
      document.getElementById('weekDaysBox').style.display = ( type === 'week') ? 'flex' : 'none';
      document.getElementById('monthDaysBox').style.display = ( type === 'month') ? 'flex' : 'none';
  }
     // INSERT_YOUR_CODE
     // 解决“找不到函数loadSchedule”问题：确保loadSchedule在window作用域下暴露
   window.loadSchedule = loadSchedule;
   window.previewSchedule = previewSchedule;
   window.onRepeatTypeChange = onRepeatTypeChange;
   window.renderCalendar = renderCalendar ;
   window.publishSchedule = publishSchedule ;

     // 加载课程排期
    async function loadSchedule() {
      const cid = document.getElementById('courseSelect').value;
      if (!cid) return;
        // 清理scheduleObject的各个字段
        scheduleObject = {
            scheduleId: "",
            courseId: "",
            courseName: "",
            teacherId: "",
            teacherName: "",
            startDate: (function() {
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const day = String(now.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            })(),
       
            repeatEndDate: (function() {
                // repeatEndDate = startDate + 30 days
                let startDate = new Date();
                startDate.setDate(startDate.getDate() + 30);
                // 格式化为YYYY-MM-DD
                let month = String(startDate.getMonth() + 1).padStart(2, '0');
                let day = String(startDate.getDate()).padStart(2, '0');
                return `${startDate.getFullYear()}-${month}-${day}`;
            })(),
 
            startTime: (function() {
                const now = new Date();
                const hours = String(now.getHours()).padStart(2, '0');
                const minutes = String(now.getMinutes()).padStart(2, '0');
                return `${hours}:${minutes}`;
            })(),
            endTime: (function() {
                const now = new Date();
                now.setHours(now.getHours() + 1);
                const hours = String(now.getHours()).padStart(2, '0');
                const minutes = String(now.getMinutes()).padStart(2, '0');
                return `${hours}:${minutes}`;
            })(),
       
            repeatType: 0,
            interval: 1,
            repeatDays: [],
            status: "pending", 
            timeZone:userTimeZone,
            userTimeZone:userTimeZone       
        };  
      try {
        scheduleList =   await fetchScheduleList(cid);
          //alert("加载课程排期成功");
          if (scheduleList && scheduleList.length > 0) {
              // 列表长度大于0 ,  //TBD：根据列表长度，添加1个下拉框选择。暂时选择第一个
            scheduleObject = scheduleList[0];
            renderSchedule(); 
            //更新排期的显示
          }
          return;
      } catch (e) {
          alert("加载排期失败",e);
      } 
      
  }

   function  getFormData(){
    const form = {
        scheduleId: document.getElementById('scheduleId').value,
        startDate: document.getElementById('startDate').value,
        startTime: document.getElementById('startTime').value,
        repeatType: document.getElementById('repeatType').value,
        interval: document.getElementById('interval').value,
        status:  document.getElementById('status').value,
        timeZone: document.getElementById('timeZone').value, //保持原始时区---排期的时区
        userTimeZone:userTimeZone, //输出时间的时区
        // 根据选择获取repeatDays的数组
        repeatDays: (() => {
            // 仅当repeatType为week/month时读取，其他情况为空数组
            const repeatTypeVal = document.getElementById('repeatType').value;
            if (repeatTypeVal === 'week' ) {
                const weekDayInputs = document.querySelectorAll('#weekDays input[type=checkbox]');
                let arr = [];
                weekDayInputs.forEach(cb => { 
                    if (cb.checked) arr.push(Number(cb.value));
                });
                return arr;
            } else  if ( repeatTypeVal === 'month' ) {

                const weekDayInputs = document.querySelectorAll('#monthDays input[type=checkbox]');
                console.log("days",weekDayInputs);
                let arr = [];
                weekDayInputs.forEach(cb => { 
                    if (cb.checked) arr.push(Number(cb.value));
                });
                console.log("days arr",arr);
                return arr;
            } else {
                return [];
            }
        })(),
        endDate: document.getElementById('endDate').value,
      
    }; 
    console.log("form:",form);
    return form;
   }
   // 预览排期
   async function previewSchedule() {
     const form = getFormData();
    //console.log("form:",form) ;
    // 生成排期列表 localDateTime List<Date,TIME>
    scheduleResult = await generateScheduleListFromServer(form);
    console.log("result:",scheduleResult) ;
    renderResult();
    renderCalendar();
    //alert("预览成功");
}

 
// 分析：可能由于日期时区或构造Date的方式导致了前端和后端实际天数偏差。例如直接用new Date('yyyy-MM-dd')会因时区差别导致日期减少1天。可以尝试使用new Date(year, month, day)规避。
async function generateScheduleListFromServer(form) { 
    const url = `course/schedule/generate` ;
    const token = getToken();
    try {
        const res = await fetch(`${API_BASE_URL}/${url}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                "Authorization": "Bearer " + token
            },
            credentials: 'include',
            body: JSON.stringify(form)
        });

        const result = await res.json();
        
        // 修正后端返回的日期数组，确保日期不因本地解析减少1天
        // 尝试将日期转为本地日期字符串再渲染
        if (result && result.code === 200) {
            // result.data: [{date:'2024-06-01',time:'09:00'}, ...]
            // 兼容性修正：如后端返回的date为'yyyy-MM-dd'字符串，前端用new Date(date)在不同时区下解析会出现日期偏移。
            // 方案：把date字符串分解为年月日，用new Date(year, month-1, day)组成本地时间，或渲染时直接使用原字符串。
            // 这里只返回数据，渲染时renderCalendar里（下方）再修正用法
            return result.data;
        } else {
            alert(result?.message || '获取排期失败');
        }
    } catch (err) {
        alert('获取排期失败');
        console.error(err);  
    }
} 
  
// 渲染排期列表
function renderResult() {
    const body = document.getElementById('resultBody');
    body.innerHTML = '';
    if(scheduleResult!= null ) {
    scheduleResult.forEach(item => {
        const tr = document.createElement('tr');
        
        tr.innerHTML = `<td>${scheduleResult.indexOf(item) + 1}</td><td>${item.date}</td><td>${item.time}</td>`;
   
        body.appendChild(tr);
    });
        }
  }
 // 渲染日历
 function renderCalendar() {
  const cal = document.getElementById('calendar');
  cal.innerHTML = '';
  if(scheduleResult == null )
    return;

  const dateSet = new Set(scheduleResult.map(i => i.date));
console.log("r",dateSet);
  // INSERT_YOUR_CODE
  // 将dateSet的第一项（若存在）转为日期变量
  let firstDateVar = null;
  if (dateSet.size > 0) {
      const firstDateStr = Array.from(dateSet)[0];
      // 假设格式为'yyyy-MM-dd'
      const [year, month, day] = firstDateStr.split('-');
      firstDateVar = new Date(Number(year), Number(month) - 1, Number(day));
      console.log('firstDateVar:', firstDateVar);
  }

  // startDate设置为dateSet第一项表示的日期（如果有），否则用今天
  let startDate;
  if (firstDateVar) {
      startDate = new Date(firstDateVar); // 已在本地，0点时间
  } else {
      startDate = new Date();
  }
 
  const dayOfWeek = startDate.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
  const diffToMonday = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
  startDate.setDate(startDate.getDate() + diffToMonday);

  // 显示35天，横向排列，每行7天
  const daysToShow = 35;

  const today = new Date(startDate);
  today.setHours(0, 0, 0, 0); // 本地0点
  for (let i = 0; i <= daysToShow; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      // 保证是本地时区的年月日
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      const div = document.createElement('div');
      div.className = 'calendar-day';
      if (dateSet.has(dateStr)) div.classList.add('marked');
      div.innerText = d.getDate();
      cal.appendChild(div);
  }
}

    // 发布--修改当前的排期状态并保存
    async function publishSchedule() {
      const cid = document.getElementById('courseSelect').value;
    
      saveSchedule();
     // alert("发布成功");
  }
 
  // 保存 uodate or insert 
  async function saveSchedule() {
    const form = getFormData();
    const url = form.scheduleId !=""? `course/schedule/update` : `course/schedule/create`;
    
    const token = getToken();
    try{
      const res= await fetch(`${API_BASE_URL}/${url}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          "Authorization": "Bearer " + token
        },
        credentials: 'include',
        body: JSON.stringify(form)
      });
       // 4.  响应处理 响应成功/失败
       if (res.data && res.data.code === 200) {
        alert(formData.scheduleId !="" ? '编辑成功' : '新增成功'); 
    } else {
        alert(res.data?.message || (formData.courseId!=""  ? '编辑失败' : '新增失败'));
    }
    }catch(err){
        alert('网络异常，操作失败');
        console.error(err);  
    } 
  }

  // 删除
  async function deleteSchedule(scheduleId) {
      
       await operateSchedule(scheduleId,"frozen");
      scheduleResult = [];
      renderResult();
      renderCalendar();
      alert("删除成功");
  }
 
/**
 * 发布/回收模板、
 */
async function operateSchedule(scheduleId, action) {
    const token = getToken();
    const payload = {
      scheduleid: scheduleId,  // 注意小写，和后端命名对应
      status: action
  };
      console.log("payload：",payload); 
    fetch(`${API_BASE_URL}/course/schedule/updateStatus`, {
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
        renderScheduleCards(); 
      } else {
        alert(msg || '操作失败');
      }
    })
    .catch(e => {
      // 网络错误或json解析异常都能捕获
      alert("网络错误或数据解析异常，操作失败");
      console.error(e);
    });
   
    } ;
      
    }
    console.log("schedule page END");
}
/**
 * 排期管理页面：
 * 1、课程选择：提供检索字段：课程名称、语言、难度、教师
 *     1.1 用下拉菜单显示检索到的课程列表，单选
 *     
 *  2、根据选择的课程，查询对应的排期，显示排期参数（允许修改）：
 *    2.1 开始日期，开始时间
 *        重复类型：下拉菜单：不重复、每天、每周、每月
 *        重复间隔：N（天、周、月)
 *        重复时间： 周一~周日（每周）或者 月初到月末（每月）
 *        结束日期： 
 *    2.2 显示操作按钮：预览、发布、保留、删除
 *    2.3 排期结果显示区域：
 *    2.3.1 列表显示：年月日、时分
 *    2.3.2 日历显示：在日历上标记所有的排期日期
 * 
 * 
 **/