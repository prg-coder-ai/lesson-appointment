 
// 全局常量（后端可通过Thymeleaf注入，如 th:inline="javascript"） 

// 全局变量（替代Vue响应式，直接操作DOM/变量）
let CourseList = [];       // 课程列表
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
//编辑时，courseId、templateId、teacherId可以为空，但是发布时必须设置
function validateCourseForm() {
    let isValid = true;
    if (!localParamter.formEl) return false;
    
    // 清空所有错误提示
    document.querySelectorAll(".form-error").forEach(el => el.innerText = "");
   
    // 逐个校验必填项
    const requiredFields = [ 'courseName', 'content', 'feature'];
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

async function openEditCourseDialog(CourseJsonStr )
{ 
 // 1. 显示弹窗
 const modal = document.getElementById('courseModal');
 if(modal) { 
 modal.style.display = 'flex';
 }
 console.info("edit:",CourseJsonStr,modal); 

 // 2. 初始化默认模板数据 
  let defaultCourse = {};
  if (CourseJsonStr==null) {
    defaultCourse = {
      courseId: "",
      templateId: "",
      courseName: "",
      content: "",
      feature: "",
      status:"",
      teacherId: "" 
    };
  } else  
    try {
      defaultCourse = CourseJsonStr;//JSON.parse(CourseJsonStr);   // 将Course安全地转为json对象 
    } catch (e) {
      defaultCourse = {};
      console.error(e);
    } 
    console.log("edit json:",defaultCourse); 
  // 2. 设置弹窗标题
  const modalTitle = document.getElementById('modalTitle');
  console.log("edit json2:",modalTitle); 
  modalTitle.innerText = (defaultCourse.courseId !="")? '编辑课程' : '新增课程';
   // 4. 生成表单HTML（复用index.html表单结构，适配样式） 
  //显示出来 from
  //获取模板列表----TBD
 
 let  formHtml = `
  <form id="CourseForm"> 
    <input type="hidden" name="courseId" value="${defaultCourse.courseId}">

    <div class="form-item">
      <label>模板ID <span style="color:red">*</span></label>
      <select name="templateId" class="form-select" required>
      <option value="">请选择</option> 
       `;
       //显示，每个模板的内容
      templateList.forEach(template => { 
       var str = template.languageType+ " "+ template.difficultyLevel + " "+template.classDuration+ " "+template.classFee ;
        formHtml += ` <option value= ${template.templateId } ${template.templateId === defaultCourse.templateId ? "selected" : ""}> ${str}</option>` 
      });

      formHtml += `</select>
      <div class="form-error" id="templateIdError"></div>
       </div>

    <div class="form-item">
      <label>课程名称 <span style="color:red">*</span></label>
      <input name="courseName"   value="${defaultCourse.courseName}" required> 
      <div class="form-error" id="courseNameError"></div>
    </div>

    <div class="form-item">
      <label>教学内容 <span style="color:red">*</span></label> 
       <textarea name="content" rows="3" required>${defaultCourse.content}</textarea>
      <div class="form-error" id="contentError"></div>
    </div>
 
    <div class="form-item">
      <label>课程特色 <span style="color:red">*</span></label> 
       <textarea name="feature" rows="3" required>${defaultCourse.feature}</textarea>
      <div class="form-error" id="featureError"></div>
    </div> 

    <div class="form-item">
      <label>授课教师 <span style="color:red">*</span></label>
      <select name="teacherId" class="form-select" required>
        `;
       //显示，每个模板的内容
      teacherList.forEach(teacher => { 
        var str = teacher.name+ " "+ teacher.languageType + " "+teacher.phone+ " "+teacher.email ;
        formHtml += ` <option value="${teacher.userId}" ${teacher.userId === defaultCourse.teacherId ? "selected" : ""}> ${str}</option>`;
     
      });

      formHtml += `</select>
      <div class="form-error" id="teacherIdError"></div>
    </div>

    <div class="mt-4 text-end">
      <button type="button" class="btn btn-cancel" onclick="closeCourseModal()">取消</button>
      <button type="button" class="btn btn-primary" onclick="submitCourseForm()">提交</button>
    </div>
  </form>
`;
  // 5. 渲染表单到弹窗容器 
  if (!formContainer) {
    alert("无法找到 formContainer 元素！\n" +
      "请确认 admin.html 页面内存在 <div id=\"formContainer\"></div> 并且 <script src=\"admin-Course.js\"></script> 是在 DOM 加载完后引入的。");
    // 可在此 return 或抛异常以避免后续报错
    return;
  }
  formContainer.innerHTML = formHtml;
  // 6. 保存表单元素引用
  localParamter.formEl = document.getElementById('CourseForm');
}

// 新增：关闭弹窗函数
function closeCourseModal() {
  
  const modal = document.getElementById('courseModal');
  modal.style.display = 'none';
  // 清空表单错误提示
  document.querySelectorAll(".form-error").forEach(el => el.innerText = "");
  }
/**
 * 响应函数
 * 1. 校验表单
 * 2. 获取表单数据
 * 3. 调用接口提交
 * 4. 响应成功/失败
 */
async function submitCourseForm() {

    // 1. 校验表单
    if (!validateCourseForm()) {
        return;
    }
    // 2. 获取表单数据 
    const formData = {
        courseId:   localParamter.formEl.courseId.value,
        templateId: localParamter.formEl.templateId.value,
        courseName: localParamter.formEl.courseName.value,
        content:    localParamter.formEl.content.value,
        feature:    localParamter.formEl.feature.value, 
        teacherId:  localParamter.formEl.teacherId.value
    };
  // 3. 调用接口提交（区分新增/编辑）
    //根据CourseId判断新增还是修改
    console.info("submit:",formData.courseId);
    const token = getToken();
    const url = formData.courseId !=""? `${baseUrl}/course/update` : `${baseUrl}/course/insert`;
  console.log("update",formData);
    try {
        const res = await axios.post(url, formData, {
            headers: { "Authorization": "Bearer " + token }
        });
        // 4.  响应处理 响应成功/失败
        if (res.data && res.data.code === 200) {
            alert(formData.courseId !="" ? '编辑成功' : '新增成功');
            closeCourseModal(); // 关闭弹窗
          await renderCourseCards(); // 刷新列表
        } else {
            alert(res.data?.message || (formData.courseId!=""  ? '编辑失败' : '新增失败'));
        }
    } catch (err) {
        alert('网络异常，操作失败');
        console.error(err);
    }
}
/**
 * 渲染课程列表（核心：原生JS操作DOM）
 */
async function renderCourseCards() {
    const dynamicContentCenter = document.getElementById('dynamic-content-center');
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

    // 渲染HTML
    let html = '';
    { 
      html += `     
    <div class="modal-mask" id="courseModal">
      <div class="modal-content">
        <div class="modal-header">
          <h3 id="modalTitle">新增课程</h3>
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
                <button class="btn btn-primary" onclick="openEditCourseDialog(null)">新增课程</button>
            </div>
        </div>
           `;
             // 列表表头 ---模板-建立连接-悬浮显示模板内容（学生页面、管理、教师页面），教师--悬浮-显示教师的特色字段（学生页面）
         html += `
            <div style="display:flex;gap:36px;font-weight:bold;border-bottom:1px solid #e9ecef;padding-bottom:8px;margin-bottom:4px;">
                  <div style="width:40px;"><strong>序号</strong></div>  
                    <div style="width:0px;display:none"><strong>Id</strong></div>  
                  <div style="width:130px;"><strong>模板</strong></div>
                <div style="width:130px;"><strong>名称</strong></div>
                <div style="width:130px;"><strong>内容</strong></div>
                <div style="width:130px;"><strong>特色</strong></div>
                <div style="width:130px;"><strong>教师</strong></div>
                <div style="width:120px;"><strong>状态</strong></div>
                <div style="width:240px;"><strong>操作</strong></div>
            </div>
        `;
        if (!CourseList.length) {
          html += '<div style="padding:40px 0;text-align:center;color:#999;">暂无数据</div>';
      } else
        { var index=0;
        CourseList.forEach(Course => {
         // INSERT_YOUR_CODE
         // 根据Course.templateId在templateList中查找对应的模板对象
         const templateObj = templateList.find(t => t.templateId === Course.templateId);
         const teacherObj = teacherList.find(t => t.userId === Course.teacherId);
         
         let tempInfo=templateObj? templateObj.languageType+ " "+ templateObj.difficultyLevel + " "+templateObj.classFee : "" ;
         let teacherInfo=teacherObj? teacherObj.name+ " "+ teacherObj.phone + " "+ teacherObj.email : "n/a" ;
         
           index ++;
            html += `
                <div class="teacher-card" style="margin:8px 0;padding:8px 0;border-bottom:1px solid #f5f5f5;">
                    
                <div style="display:flex;gap:36px;align-items:center;"> 
                   <div style="width:40px;">${index  }</div> 
                     <div style="width:0px;display:none"> ${Course.courseId || ''} </div>   
                     <div style="width:130px;">${tempInfo || ''}</div> 
                      <div style="width:130px;">${Course.courseName || ''}</div> 
                      <div style="width:130px;">${Course.content || ''}</div> 
                      <div style="width:130px;">${Course.feature || ''}</div> 
                      <div style="width:130px;">${teacherInfo || ''}</div> 

                     <div style="width:120px;">                       
                          ${ Course.status === "pending" ? '<span style="color:#faad14;">待审核</span>' :
                            Course.status === "active" ? '<span style="color:#52c41a;">正常</span>' :
                            Course.status === "inactive" ? '<span style="color:#faad14;">待启用</span>' :
                            Course.status === "frozen" ? '<span style="color:#f5222d;">已删除</span>' :
                            `<span>${Course.status||"未知"}</span>`
                          }
                        </div>
                    <div style="width:240px;display:flex;gap:8px;">
                        <button class="btn btn-success" onclick='openEditCourseDialog(${JSON.stringify(Course).replace(/'/g, "\\'")})'>修改</button>                   
                        <button class="btn btn-success" onclick="operateCourse('${Course.courseId}', 'active')">发布</button>
                        <button class="btn btn-warning" onclick="operateCourse('${Course.courseId}', 'inactive')">撤回</button>
                        <button class="btn btn-danger"  onclick="deleteCourse ('${Course.courseId}')">删除</button>
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
/**
 * 筛选条件变化
 */
async function handleSearchChange() {
    localParamter.currentPage = 1; // 重置页码
    await renderCourseCards();
}

/**
 * 重置筛选表单
 */
async function resetSearchForm() {
    document.getElementById('languageType').value = '';
    document.getElementById('difficultyLevel').value = '';
    localParamter.currentPage = 1;
    await renderCourseCards();
}

/**
 * 分页大小变化
 */
async function handlePageSizeChange(val) {
    localParamter.pageSize = val;
    await renderCourseCards();
}

/**
 * 页码变化
 */
async function handleCurrentPageChange(val) {
    localParamter.currentPage = val;
    await renderCourseCards();
}

  
async function deleteCourse(courseId) {
    
  if (!window.confirm('确定要删除该课程吗？删除后基于该课程的预约数据将不受统一管控！')) {
      return;
  }   
  operateCourse(courseId,"frozen"); 
}


/**
 * 发布/回收模板、
 */
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
 
// 点击弹窗遮罩层关闭
  document.getElementById('courseModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('courseModal')) {
      closeCourseModal();
    }
  });
 
  // 点击关闭按钮关闭
  document.getElementById('closeModal').addEventListener('click', closeCourseModal); 