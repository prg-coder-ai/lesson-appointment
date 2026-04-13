 //排期管理--页面
let ScheduleList = [];       // 课程列表
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
//编辑时，scheduleId、templateId、teacherId可以为空，但是发布时必须设置
function validateScheduleForm() {
    let isValid = true;
    if (!localParamter.formEl) return false;
    
    // 清空所有错误提示
    document.querySelectorAll(".form-error").forEach(el => el.innerText = "");
   
    // 逐个校验必填项
    const requiredFields = [ 'scheduleName', 'content', 'feature'];
    requiredFields.forEach(field => {
        const input = localParamter.formEl[field];
        if (!input.value || (!input.value.trim()) ){
            const errorEl = document.getElementById(`${field}Error`);
            if (errorEl) {
                errorEl.innerText = "此项为必填项";
            }
            isValid = false;
        }
    });
    return isValid;
  }
  var templateCondition=[];//模板检索
 // var templateList = [];//await  fetchTemplateList(templateCondition); 
   const conditionJsonForTeacher = { role: 'teacher' }; 
   var teacherList =[];// await fetchUserList(conditionJsonForTeacher);

async function openEditScheduleDialog(ScheduleJsonStr )
{ 
  // 1. 显示弹窗
  const modal = document.getElementById('scheduleModal');
  if(modal) { 
  modal.style.display = 'flex';
  }
 console.info("edit:",ScheduleJsonStr,modal); 

 // 2. 初始化默认模板数据 
  let defaultSchedule = {};
  if (ScheduleJsonStr==null) {
    defaultSchedule = {
      scheduleId: "",
      courseId:"",//隐含teacherId
      repeat_type:0,
      repeat_interval:1,
      repeat_days: [],
      repeat_end_date: NOW(),//+31天
      available_sites:1,
      status:"pending",
      
    };
  } else  
    try {
      defaultSchedule = ScheduleJsonStr;  //json object
    } catch (e) {
      defaultSchedule = {};
      console.error(e);
    } 
    console.log("edit json:",defaultSchedule); 
  // 2. 设置弹窗标题
  const modalTitle = document.getElementById('modalTitle');
  console.log("edit json2:",modalTitle); 
  modalTitle.innerText = (defaultSchedule.scheduleId !="")? '编辑排期' : '新增排期';
     
  //显示出来 from 
 let  formHtml = `
  <form id="ScheduleForm"> 
    <input type="hidden" name="scheduleId" value="${defaultSchedule.scheduleId}">

    <div class="form-item">
      <label>课程ID <span style="color:red">*</span></label>
      <select name="courseId" class="form-select" required>
      <option value="">请选择</option> 
       `;
       //显示 课程名称、老师姓名？
      courseList.forEach(course => { 
        var str = course.name;
        formHtml += ` <option value= ${course.courseId } ${course.courseId === defaultSchedule.courseId ? "selected" : ""}> ${str}</option>` 
      });

      formHtml += `</select>
      <div class="form-error" id="courseIdError"></div>
       </div>

    <div class="form-item">
      <label>开始时间 <span style="color:red">*</span></label>
      <input name="startTime"   value="${defaultSchedule.startTime}"  required> 
      <div class="form-error" id="startTimeError"></div>
    </div>

    <div class="form-item">
      <label>结束时间 <span style="color:red">*</span></label> 
      <input name="endTime"  required>${defaultSchedule.endTime} required> 
      <div class="form-error" id="endTimeError"></div>
    </div>
 
    <div class="form-item">
      <label>重复标识 <span style="color:red">*</span></label> 
      <select name="repeat_type" class="form-select" required> 
       <option value=0  ${0  === defaultSchedule.repeat_type ? "selected" : ""}> 不重复</option>
       <option value=1  ${1  === defaultSchedule.repeat_type ? "selected" : ""}> 每天重复</option>
        <option value=2  ${2  === defaultSchedule.repeat_type ? "selected" : ""}> 每周重复</option>
         <option value=3  ${3  === defaultSchedule.repeat_type ? "selected" : ""}> 每月重复</option>
      </select>
      <div class="form-error" id="repeat_typeError"></div>
    </div> 

    <div class="form-item">
      <label>重复间隔 <span style="color:red">*</span></label>
      <select name="repeat_interval" class="form-select" required>
        `;
       //显示,如果每周重复，则显示周1——周日，每个模板的内容
       let maxintval =1;
       let interStr='';
       if(2  === defaultSchedule.repeat_type ) {//每N周 1次 
        interStr+= '<option value=1  ${1  === defaultSchedule.repeat_interval ? "selected" : ""}> 每周1次</option>';
        interStr+= '<option value=2  ${2  === defaultSchedule.repeat_interval ? "selected" : ""}> 每2周1次</option>';
        interStr+= '<option value=3  ${3  === defaultSchedule.repeat_interval ? "selected" : ""}> 每3周1次</option>';
        interStr+= '<option value=4  ${4  === defaultSchedule.repeat_interval ? "selected" : ""}> 每4周1次</option>';
       } else  if(1  === defaultSchedule.repeat_type ) { //每N天1次
        interStr+= '<option value=1  ${1  === defaultSchedule.repeat_interval ? "selected" : ""}> 每天1次</option>';
        interStr+= '<option value=2  ${2  === defaultSchedule.repeat_interval ? "selected" : ""}> 每2天1次</option>';
        interStr+= '<option value=3  ${3  === defaultSchedule.repeat_interval ? "selected" : ""}> 每3天1次</option>';
        interStr+= '<option value=4  ${4  === defaultSchedule.repeat_interval ? "selected" : ""}> 每4天1次</option>';
        interStr+= '<option value=5  ${5  === defaultSchedule.repeat_interval ? "selected" : ""}> 每5天1次</option>';
        interStr+= '<option value=6  ${6  === defaultSchedule.repeat_interval ? "selected" : ""}> 每6天1次</option>';
        interStr+= '<option value=10  ${10  === defaultSchedule.repeat_interval ? "selected" : ""}> 每10天1次</option>';
   
       }else  if(3  === defaultSchedule.repeat_type ) { //每N月1次
        interStr+= '<option value=1  ${1  === defaultSchedule.repeat_interval ? "selected" : ""}> 每月1次</option>';
        interStr+= '<option value=2  ${2  === defaultSchedule.repeat_interval ? "selected" : ""}> 每2月1次</option>';
        interStr+= '<option value=3  ${3  === defaultSchedule.repeat_interval ? "selected" : ""}> 每3月1次</option>';
       }
       formHtml += interStr; 
      formHtml += `</select>
      <div class="form-error" id="repeat_intervalError"></div>
    </div>

    <div class="form-item">
      <label>重复时间 <span style="color:red">*</span></label>
      <select name="repeat_days" class="form-select" required>
        `; 
       if(2  === defaultSchedule.repeat_type ) {//每N周 1次 
        // 显示周1到周日的多选框
        const weekDays = [
          { value: 1, label: '周一' },
          { value: 2, label: '周二' },
          { value: 3, label: '周三' },
          { value: 4, label: '周四' },
          { value: 5, label: '周五' },
          { value: 6, label: '周六' },
          { value: 7, label: '周日' }
        ];
        const selectedDays = (defaultSchedule.repeat_days ? defaultSchedule.repeat_days.split(',').map(v=>parseInt(v)) : []);
        formHtml += '<div style="display:flex;gap:8px;flex-wrap:wrap;">';
        weekDays.forEach(day => {
          formHtml += `<label style="display:inline-flex;align-items:center;margin-right:10px;">
            <input type="checkbox" name="repeat_days" value="${day.value}" ${selectedDays.includes(day.value) ? 'checked' : ''}>
            ${day.label}
          </label>`;
        });
        formHtml += '</div>';
       }  else  if(3  === defaultSchedule.repeat_type ) { //每N月1次
       // 显示每月所有日期的多选框
       // 1-31号
       const monthDays = Array.from({length: 31}, (_, i) => i + 1);
       const selectedMonthDays = (defaultSchedule.repeat_days ? defaultSchedule.repeat_days.split(',').map(v=>parseInt(v)) : []);
       formHtml += '<div style="display:flex;gap:8px;flex-wrap:wrap;max-width:600px;">';
       monthDays.forEach(day => {
         formHtml += `<label style="display:inline-flex;align-items:center;width:58px;margin-bottom:4px;">
           <input type="checkbox" name="repeat_days" value="${day}" ${selectedMonthDays.includes(day) ? 'checked' : ''}>
           ${day}日
         </label>`;
       });
       formHtml += '</div>';
       }
       
      formHtml += ` 
      <div class="form-error" id="repeat_daysError"></div>
    </div> `;

    if(defaultSchedule.repeat_type!=0) { //有重复则指定结束日期
      formHtml += ` 
      <div class="form-item">
      <label>重复结束日期 <span style="color:red">*</span></label> 
      <input name="repeat_end_date"  required>${defaultSchedule.repeat_end_date} required> 
      <div class="form-error" id="repeat_end_dateError"></div>
    </div>`
    } ;

    formHtml += ` 
      <div class="form-item">
      <label>可预定数量(1~7) <span style="color:red">*</span></label> 
      <input name="available_sites"  required>${defaultSchedule.available_sites} required> 
      <div class="form-error" id="available_sitesError"></div>
    </div>`

    formHtml += ` 
        <div class="mt-4 text-end">
          <button type="button" class="btn btn-cancel" onclick="closeScheduleModal()">取消</button>
          <button type="button" class="btn btn-primary" onclick="submitScheduleForm()">提交</button>
        </div>
      </form>
    `;
  // 5. 渲染表单到弹窗容器 
  if (!formContainer) {
    alert("无法找到 formContainer 元素！\n" +
      "请确认 admin.html 页面内存在 <div id=\"formContainer\"></div> 并且 <script src=\"admin-Schedule.js\"></script> 是在 DOM 加载完后引入的。");
    // 可在此 return 或抛异常以避免后续报错
    return;
  }
  formContainer.innerHTML = formHtml;
  // 6. 保存表单元素引用
  localParamter.formEl = document.getElementById('ScheduleForm');
}

// 新增：关闭弹窗函数
function closeScheduleModal() {
  
  const modal = document.getElementById('scheduleModal');
  modal.style.display = 'none';
  // 清空表单错误提示
  document.querySelectorAll(".form-error").forEach(el => el.innerText = "");
  }

async function submitScheduleForm() {

    // 1. 校验表单
    if (!validateScheduleForm()) {
        return;
    }
    // 2. 获取表单数据 
    const formData = {
        scheduleId:   localParamter.formEl.scheduleId.value,
        courseId: localParamter.formEl.courseId.value,
        startTime: localParamter.formEl.startTime.value,
        endTime:    localParamter.formEl.endTime.value,
        repeat_type:    localParamter.formEl.repeat_type.value, 
        repeat_interval:  localParamter.formEl.repeat_interval.value, 
        repeat_days:  localParamter.formEl.repeat_days.value, 
        repeat_end_date:  localParamter.formEl.repeat_end_date.value, 
        available_sites:  localParamter.formEl.available_sites.value
    };
  // 3. 调用接口提交（区分新增/编辑）
    //根据ScheduleId判断新增还是修改
    console.info("submit:",formData.scheduleId);
    const token = getToken();
    const url = formData.scheduleId !=""? `${baseUrl}/course/schedule/update` : `${baseUrl}/course/schedule/insert`;
    console.log("update",formData);
    try {
        const res = await axios.post(url, formData, {
            headers: { "Authorization": "Bearer " + token }
        });
        // 4.  响应处理 响应成功/失败
        if (res.data && res.data.code === 200) {
            alert(formData.scheduleId !="" ? '编辑成功' : '新增成功');
            closeScheduleModal(); // 关闭弹窗
          await renderScheduleCards(); // 刷新列表
        } else {
            alert(res.data?.message || (formData.scheduleId!=""  ? '编辑失败' : '新增失败'));
        }
    } catch (err) {
        alert('网络异常，操作失败');
        console.error(err);
    }
}
/**
 * 渲染课程列表（核心：原生JS操作DOM）
 */
async function renderScheduleCards() {
    const dynamicContentCenter = document.getElementById('dynamic-content-center');
    if (!dynamicContentCenter) return; 
    // 显示加载中
    dynamicContentCenter.innerHTML = '<div style="padding:40px 0;text-align:center;">加载中...</div>';

    // 构建筛选条件 TBD
    const conditionJson = {
        //language: document.getElementById('languageType').value,
      //  level: document.getElementById('difficultyLevel').value,
      courseId:"",
      templateId:"",
      status:"",
        pageRow: localParamter.pageSize,
        pageNum: localParamter.currentPage
    };

      courseList = await  fetchCourseeList("");  //所有课程列表 
    // 获取所有排期数据
    await fetchScheduleList(conditionJson);

    // 渲染HTML
    let html = '';
    { 
      html += `     
    <div class="modal-mask" id="scheduleModal">
      <div class="modal-content">
        <div class="modal-header">
          <h3 id="modalTitle">新增课程排期</h3>
          <span class="modal-close" id="closeModal"><i class="fa fa-times"></i></span>
        </div>
        <div id="formContainer">
          <!-- 表单内容由JS动态生成 -->
        </div>
      </div>
    </div> `;
    
      html += `<div class="card">
            <div class="card-title"><i class="fa fa-filter"></i> 筛选条件</div>
            <div class="search-form" style="display: flex; gap: 20px; margin-bottom: 16px;">
                <div>
                    <label>语言类型：</label>
                    <select id="languageType" onchange="handleSearchChange()">
                        <option value="">全部</option>
                        <option value="france">法语</option>
                        <option value="english">英语</option> 
                    </select>
                </div>
                <div>
                    <label>难度等级：</label>
                    <select id="difficultyLevel" onchange="handleSearchChange()">
                        <option value="">全部</option>
                        <option value="B1">B1入门</option>
                        <option value="B2">B2初级</option>
                        <option value="B3">B3中级</option>
                        <option value="B4">B4高级</option> 
                    </select>
                </div>
                <button class="btn btn-default" onclick="resetSearchForm()">重置</button>
                <button class="btn btn-primary" onclick="openEditScheduleDialog(null)">新增排期</button>
            </div>
        </div>
           `;
             // 列表表头 ---模板-建立连接-悬浮显示模板内容（学生页面、管理、教师页面），教师--悬浮-显示教师的特色字段（学生页面）
         html += `
            <div style="display:flex;gap:36px;font-weight:bold;border-bottom:1px solid #e9ecef;padding-bottom:8px;margin-bottom:4px;">
                  <div style="width:40px;"><strong>序号</strong></div>  
                    <div style="width:0px;display:none"><strong>Id</strong></div>  
                  <div style="width:130px;"><strong>课程名称</strong></div>
                <div style="width:130px;"><strong>开始时间</strong></div>
                <div style="width:130px;"><strong>结束时间</strong></div>
                <div style="width:30px;"><strong>间次</strong></div>
                <div style="width:80px;"><strong>间隔</strong></div>
                <div style="width:40px;"><strong>重复</strong></div>
                <div style="width:140px;"><strong>结束日期</strong></div>
                <div style="width:40px;"><strong>可预定数量</strong></div>
                <div style="width:40px;"><strong>状态</strong></div>
                <div style="width:120px;"><strong>操作</strong></div>
            </div>
        `;
        if (!ScheduleList.length) {
          html += '<div style="padding:40px 0;text-align:center;color:#999;">暂无数据</div>';
      } else
        { var index=0;
        ScheduleList.forEach(Schedule => {
         // INSERT_YOUR_CODE
         // 根据Schedule.templateId在templateList中查找对应的模板对象
         const courseObj = templateList.find(t => t.courseId === Schedule.courseId); 
         
         let courseInfo=courseObj? courseObj.name : "" ; 

           index ++;
            html += `
                <div class="teacher-card" style="margin:8px 0;padding:8px 0;border-bottom:1px solid #f5f5f5;">
                    
                 <div style="width:40px;"><strong>序号</strong></div>  
                    <div style="width:0px;display:none"><strong>Id</strong></div>  
                  <div style="width:130px;"><strong>课程名称</strong></div>
                <div style="width:130px;"><strong>开始时间</strong></div>
                <div style="width:130px;"><strong>结束时间</strong></div>
                <div style="width:30px;"><strong>间次</strong></div>
                <div style="width:80px;"><strong>间隔</strong></div>
                <div style="width:40px;"><strong>重复</strong></div>
                <div style="width:140px;"><strong>结束日期</strong></div>
                <div style="width:40px;"><strong>可预定数量</strong></div>
                <div style="width:80px;"><strong>状态</strong></div>
                <div style="width:24px;align:center"><strong>操作</strong></div>

                <div style="display:flex;gap:36px;align-items:center;"> 
                   <div style="width:40px;">${index  }</div> 
                     <div style="width:0px;display:none"> ${Schedule.scheduleId || ''} </div>   
                     <div style="width:130px;">${courseInfo || ''}</div> 
                      <div style="width:130px;">${Schedule.startTime || ''}</div> 
                      <div style="width:130px;">${Schedule.endTime || ''}</div> 
                      <div style="width:30px;">${Schedule.repeat_type || ''}</div> 
                      <div style="width:80px;">${Schedule.repeat_interval || ''}</div>  
                <div style="width:40px;">${Schedule.repeat_days || ''} </div>
                <div style="width:180px;">${Schedule.repeat_end_date || ''} </div>
                <div style="width:40px;">${Schedule.available_sites || ''} </div>  
                     <div style="width:80px;">                       
                          ${ Schedule.status === "pending" ? '<span style="color:#faad14;">待审核</span>' :
                            Schedule.status === "active" ? '<span style="color:#52c41a;">正常</span>' :
                            Schedule.status === "inactive" ? '<span style="color:#faad14;">待启用</span>' :
                            Schedule.status === "frozen" ? '<span style="color:#f5222d;">已删除</span>' :
                            `<span>${Schedule.status||"未知"}</span>`
                          }
                        </div>
                    <div style="width:240px;display:flex;gap:8px;">
                        <button class="btn btn-success" onclick='openEditScheduleDialog(${JSON.stringify(Schedule).replace(/'/g, "\\'")})'>修改</button>                   
                        <button class="btn btn-success" onclick="operateSchedule('${Schedule.scheduleId}', 'active')">发布</button>
                        <button class="btn btn-warning" onclick="operateSchedule('${Schedule.scheduleId}', 'inactive')">撤回</button>
                        <button class="btn btn-danger"  onclick="deleteSchedule ('${Schedule.scheduleId}')">删除</button>
                    </div>
                </div>
            </div>
            `;
        });
      }
    }
    dynamicContentCenter.innerHTML = html;

    // 更新分页组件
    const pagination = document.getElementById('pagination');
    if (pagination) {
        pagination.currentPage = localParamter.currentPage;
        pagination.pageSize    = localParamter.pageSize;
        pagination.total       = localParamter.total;
    }
}

/**
 * 调用后端接口获取模板列表
 */
async function fetchScheduleList(conditionJson) {
    const token = getToken();
    if (!token) return;

    try {
        // Axios GET请求（修复response.json()错误，Axios已自动解析）
        const response = await axios.get(`${API_BASE_URL}/course/schedule/list`, {
            headers: { "Authorization": "Bearer " + token },
            params: conditionJson // 筛选条件通过params传递
        });
        const res = response.data;
        console.info("get response data:",res);
        if (res && res.code === 200) {
          //console.info("data.schedules:",res.schedules);
            ScheduleList = res.data.schedules|| [];

            localParamter.total = ScheduleList.length|| 0;
            
            console.info("total:",localParamter.total,ScheduleList);
            // 补全默认状态
            ScheduleList.forEach(item => {
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
/**
 * 筛选条件变化
 */
async function handleSearchChange() {
    localParamter.currentPage = 1; // 重置页码
    await renderScheduleCards();
}

/**
 * 重置筛选表单
 */
async function resetSearchForm() {
    //document.getElementById('languageType').value = '';
  //  document.getElementById('difficultyLevel').value = '';
    localParamter.currentPage = 1;
    await renderScheduleCards();
}

/**
 * 分页大小变化
 */
async function handlePageSizeChange(val) {
    localParamter.pageSize = val;
    await renderScheduleCards();
}

/**
 * 页码变化
 */
async function handleCurrentPageChange(val) {
    localParamter.currentPage = val;
    await renderScheduleCards();
}

  
async function deleteSchedule(scheduleId) {
    
  if (!window.confirm('确定要删除该课程排期吗？')) {
      return;
  }   
  operateSchedule(scheduleId,"frozen"); 
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
   
    }  
 
// 点击弹窗遮罩层关闭
  document.getElementById('scheduleModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('scheduleModal')) {
      closeScheduleModal();
    }
  });
 
  // 点击关闭按钮关闭
  document.getElementById('closeModal').addEventListener('click', closeScheduleModal); 

//显示日历视图
 function showInDateMap( ) {
    const calendarEl = document.getElementById('calendar');
    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'timeGridWeek', // 周视图
        locale: 'zh-cn', // 中文
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay'
        },
        events: function(fetchInfo, successCallback, failureCallback) {
            // 从后端获取排期数据（需补充查询接口）
            axios.get('${API_BASE_URL}/course/schedule/list', {
                params: {
                    start: fetchInfo.startStr,
                    end: fetchInfo.endStr
                }
            }).then(res => {
                // 转换为FullCalendar事件格式
                const events = res.data.data.map(schedule => ({
                    title: '课程' + schedule.courseId,
                    start: schedule.startTime,
                    end: schedule.endTime
                }));
                successCallback(events);
            }).catch(err => {
                failureCallback(err);
            });
        }
    });
    calendar.render();
};