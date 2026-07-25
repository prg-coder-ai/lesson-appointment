  /* js for overall page
  */
//let CourseList = [];       // 课程列表
var localParamter ={ 
  currentPage:1,         // 当前页码（初始值由Thymeleaf渲染）
  pageSize : 10,           // 页大小
  total : 0 ,              // 总条数
  CourseDialogVisible: false, // 弹窗状态
  dialogTitle : '新增课程', // 弹窗标题
  currentCourseId: '', // 当前操作的课程ID
  formEl :'', 
};

// 课程分页状态
const coursePagination = {
  pageNum: 1, // 当前页码
  pageSize: 10,  // 页大小
  total: 0,   // 总条数
  totalPages: 0 // // 总页数
};

// ===================== 核心函数 ===================== 
  var templateCondition=[];//模板检索
 // var templateList = [];//await  fetchTemplateList(templateCondition); 
   const conditionJsonForTeacher = { role: 'teacher' }; 
   var teacherList =[];// await fetchUserList(conditionJsonForTeacher);

   function openAddCourseModal(){
    openEditCourseDialog(null);

   }
async function openEditCourseDialog(CourseJsonStr )
{ 
 // 1. 显示弹窗
 const modal = document.getElementById('courseModal');
 if(modal) { 
 modal.style.display = 'flex';
 }
 //console.info("edit:",CourseJsonStr,modal); 

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
    //console .log("edit json:",defaultCourse);
  // 2. 设置弹窗标题
  const modalTitle = document.getElementById('modalTitle');
  //console .log("edit json2:",modalTitle);
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
      <option value="">请选择模板</option> 
       `;
       //显示，每个模板的内容
       if (templateList &&  (Array.isArray(templateList) && templateList.length > 0))  
     { templateList.forEach(template => { 
       var str = template.languageType+ " "+ template.difficultyLevel + " "+template.classDuration+ " "+template.classFee ;
        formHtml += ` <option value= ${template.templateId } ${template.templateId === defaultCourse.templateId ? "selected" : ""}> ${str}</option>` 
      });
    }
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

    // 2. 获取表单数据 
    const formData = {
        courseId:   localParamter.formEl.courseId.value,
        templateId: localParamter.formEl.templateId.value,
        courseName: localParamter.formEl.courseName.value,
        content:    localParamter.formEl.content.value,
        feature:    localParamter.formEl.feature.value, 
        teacherId:  localParamter.formEl.teacherId.value
    };

    
    // 1. 校验表单
    if (!validateCourseForm(formData)) {
      return;
  }
  // 3. 调用接口提交（区分新增/编辑）
    //根据CourseId判断新增还是修改
    //console.info("submit:",formData.courseId);
    //const token = getToken();
    const url = formData.courseId !=""? `course/update` : `course/insert`;
  //  console.log("update",formData);
   let res = await updateORCreateCourse(url, formData);
   if(res!=""){
    alert(formData.courseId !="" ? '编辑成功' : '新增成功');
    closeCourseModal(); // 关闭弹窗
    await renderCourseCards(); // 刷新列表
   } else {
    alert( formData.courseId!=""  ? '编辑失败' : '新增失败');
   } 
}

function validateCourseForm(formData){
  // 检查 templateId, courseName, teacherId 均不为空
  if (!formData.templateId || !formData.courseName || !formData.teacherId) {
    // 可以针对每项提供单独提示
    if (!formData.templateId) {
      showFormError('templateId', '请选择模板');
    }
    if (!formData.courseName) {
      showFormError('courseName', '课程名称不能为空');
    }
    if (!formData.teacherId) {
      showFormError('teacherId', '请选择教师');
    }
    return false;
  }
  // 其它可选校验

  // 校验通过
  clearFormErrors();
  return true;

  // 辅助：显示错误
  function showFormError(field, msg) {
    const el = document.querySelector(`[name="${field}"]`);
    if (el) {
      let errEl = el.parentElement.querySelector('.form-error');
      if (!errEl) {
        errEl = document.createElement('div');
        errEl.className = 'form-error';
        errEl.style.color = 'red';
        el.parentElement.appendChild(errEl);
      }
      errEl.innerText = msg;
    }
  }
  function clearFormErrors() {
    document.querySelectorAll('.form-error').forEach(el => el.innerText = '');
  }

  
}
/**
 * 渲染课程列表（核心：原生JS操作DOM）
 */
   function renderCourseCards() {  

    const dynamicContentCenter = document.getElementById('dynamic-content-center'); 
    if (!dynamicContentCenter) return; 

    dynamicContentCenter.innerHTML = `
    <div class="card">
      <!-- 筛选+操作栏 -->
      <div class="card-header">
        <div class="card-title"><i class="fa fa-book-open"></i> 课程列表</div>
        <button class="btn btn-primary" onclick="openAddCourseModal()">
          <i class="fa fa-plus"></i> 添加课程
        </button>
      </div>
      
      <!-- 筛选条件 -->
      <div class="filter-bar">
        <div class="filter-item">
          <label>课程名称：</label>
          <input type="text" id="course-name-input" placeholder="请输入课程名称">
        </div>
        <div class="filter-item">
          <label>语言类型：</label>
          <select id="language-select">
            <option value="">全部</option>
            <option value="french">法语</option>
            <option value="english">英语</option> 
          </select>
        </div>
        <div class="filter-item">
          <label>状态：</label>
          <select id="course-status-select">
            <option value="">全部</option>
            <option value="active">有效</option>
            <option value="pending">挂起</option>
          </select>
        </div>
         <div>
                    <label>难度等级：</label>
                    <select id="difficulty-level-select" >
                        <option value="">全部</option>
                        <option value="B1">B1入门</option>
                        <option value="B2">B2初级</option>
                        <option value="B3">B3中级</option>
                        <option value="B4">B4高级</option> 
                    </select>
                </div>
        <button class="btn btn-default" onclick="localsearchCourse()">
          <i class="fa fa-search"></i> 搜索
        </button>
        <button class="btn btn-default" onclick="resetCourseFilter()">
          <i class="fa fa-redo"></i> 重置
        </button>
      </div>

      <!-- 数据表格 -->
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
             <!--th>序号</th>
              <th style="width:0px;display:none" >课程ID</th>
              <th>课程名称</th>
              <th>语言类型</th>
              <th>难度等级</th>
              <th>课时费</th>
              <th>时长</th>
              <th>状态</th>
              <th>操作</th  --> 
              
                  <th>序号</th>  
                    <th style="width:0px;display:none">Id</th>
                     <th>课程名称</th>  
                  <th>摘要</th> 
                <th>课程内容</th>
                <th>课程特色</th> 
                <th>教师</th>
                <th>状态</th>
                <th>操作</th>
            </tr>
          </thead>
          <tbody id="course-table-body">
            <!-- 数据由JS动态渲染 -->
          </tbody>
        </table>
      </div>

      <!-- 分页栏 -->
      <div class="pagination-bar">
        <div class="pagination-info">
          共 <span id="course-total">0</span> 条记录，每页 
          <select id="course-page-size" onchange="changeCoursePageSize()">
           <option value="5" selected>5</option>
            <option value="10" selected>10</option>
            <option value="20">20</option>
            <option value="50">50</option>
          </select> 条
        </div>
        <div class="pagination-btns" id="course-pagination-btns"></div>
      </div>
    </div>
  `;
  
  // 页面渲染完成后，加载第一页数据
  loadCourseList();
   }
   // 加载课程列表数据
async function loadCourseList() {  

  // 拼接请求参数
  const params = new URLSearchParams({
    pageNum: coursePagination.pageNum,
    pageSize: coursePagination.pageSize,
    courseName: document.getElementById('course-name-input').value.trim(),
    languageType: document.getElementById('language-select').value,
    difficultyLevel: document.getElementById('difficulty-level-select').value,
    status: document.getElementById('course-status-select').value
  });
   const language = document.getElementById('language-select').value;
  templateList = await  fetchTemplateList(language?language.value:'all');  
  teacherList  = await  fetchUserList(conditionJsonForTeacher);

  try {
    const result = await request({url:`/course/page?${params.toString()}` });
    //const result = await res.json();
    
    if (result ) {
      const pageData = result;//.data;
      // 更新分页状态
      coursePagination.total = pageData.total;
      coursePagination.totalPages = pageData.totalPages;
      
      // 渲染表格
      renderCourseTable(pageData.rows);
      // 渲染分页栏
      renderCoursePagination();
    }
  } catch (error) {
    console.error('加载课程列表失败：', error);
  }
}

// 渲染课程表格
function renderCourseTable(list) {
  const tbody = document.getElementById('course-table-body');
  
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#999;padding:40px 0;">暂无数据</td></tr>';
    return;
  }
   let  html  = ` `;
  var index=(coursePagination.pageNum-1)*coursePagination.pageSize;//记录序号

        list.forEach(Course => { 
         // 根据Course.templateId在templateList中查找对应的模板对象
         const templateObj = templateList?templateList.find(t => t.templateId === Course.templateId) : null;
         const teacherObj = teacherList?teacherList.find(t => t.userId === Course.teacherId) : null;

         let tempInfo=templateObj? templateObj.languageType+ " "+ templateObj.difficultyLevel + " "+templateObj.classFee : "" ;
         let teacherInfo=teacherObj? teacherObj.name : "n/a" ;//+ " "+ teacherObj.phone + " "+ teacherObj.email
         
           index ++;
            html += `
                <tr>               
                     <td>${index  }</td> 
                     <td style="width:0px;display:none"> ${Course.courseId || ''} </td>  
                     <td>${Course.courseName || ''}</td>  
                     <td >${tempInfo || ''}</td> 
                      
                      <td >${Course.content || ''}</td> 
                      <td >${Course.feature || ''}</td> 
                      <td >${teacherInfo || ''}</td> 

                       <td>                       
                          ${ Course.status === "pending" ? '<span style="color:#faad14;">待审核</span>' :
                            Course.status === "active" ? '<span style="color:#52c41a;">正常</span>' :
                            Course.status === "inactive" ? '<span style="color:#faad14;">待启用</span>' :
                            Course.status === "frozen" ? '<span style="color:#f5222d;">已删除</span>' :
                            `<span>${Course.status||"未知"}</span>`
                          }
                        </td>
                    <td>
                        <button class="btn btn-success" onclick='openEditCourseDialog(${JSON.stringify(Course).replace(/'/g, "\\'")})'>修改</button>                   
                        <button class="btn btn-success" onclick="changeCourseStatus('${Course.courseId}', 'active')">发布</button>
                        <button class="btn btn-warning" onclick="changeCourseStatus('${Course.courseId}', 'inactive')">撤回</button>
                        <button class="btn btn-danger"  onclick="deleteCourse ('${Course.courseId}')">删除</button>
                    </td>
                </tr> 
            `;
        });
        tbody.innerHTML = html;
}

// 渲染分页按钮
function renderCoursePagination() {
  const btnContainer = document.getElementById('course-pagination-btns');
  document.getElementById('course-total').textContent = coursePagination.total;
  
  if (coursePagination.total === 0) {
    btnContainer.innerHTML = '<span style="color:#999;">暂无数据</span>';
    return;
  }

  let html = '';
  // 上一页
  html += `<button class="pagination-btn" 
            onclick="changeCoursePage(${coursePagination.pageNum - 1})"
            ${coursePagination.pageNum === 1 ? 'disabled' : ''}>
            上一页
          </button>`;

  // 页码（显示前后3页，超出省略）
  const start = Math.max(1, coursePagination.pageNum - 3);
  const end = Math.min(coursePagination.totalPages, coursePagination.pageNum + 3);
  
  if (start > 1) {
    html += `<button class="pagination-btn" onclick="changeCoursePage(1)">1</button>`;
    if (start > 2) html += '<span style="padding:0 4px;">...</span>';
  }

  for (let i = start; i <= end; i++) {
    html += `<button class="pagination-btn ${i === coursePagination.pageNum ? 'active' : ''}" 
              onclick="changeCoursePage(${i})">${i}</button>`;
  }

  if (end < coursePagination.totalPages) {
    if (end < coursePagination.totalPages - 1) html += '<span style="padding:0 4px;">...</span>';
    html += `<button class="pagination-btn" onclick="changeCoursePage(${coursePagination.totalPages})">${coursePagination.totalPages}</button>`;
  }

  // 下一页
  html += `<button class="pagination-btn" 
            onclick="changeCoursePage(${coursePagination.pageNum + 1})"
            ${coursePagination.pageNum === coursePagination.totalPages ? 'disabled' : ''}>
            下一页
          </button>`;

  btnContainer.innerHTML = html;
}

// 切换页码
function changeCoursePage(targetPage) {
  if (targetPage < 1 || targetPage > coursePagination.totalPages) return;
  coursePagination.pageNum = targetPage;
  loadCourseList();
  // 滚动到卡片顶部
  document.querySelector('.card').scrollIntoView({ behavior: 'smooth' });
}

// 切换每页条数
function changeCoursePageSize() {
  const select = document.getElementById('course-page-size');
  coursePagination.pageSize = Number(select.value);
  coursePagination.pageNum = 1; // 切换条数后重置为第1页
  loadCourseList();
}

// 筛选与操作联动
// 搜索按钮：重置为第1页再查询
function localsearchCourse() {
  coursePagination.pageNum = 1;
  loadCourseList();
}

// 重置筛选条件
function resetCourseFilter() {
  document.getElementById('course-name-input').value = '';
  document.getElementById('language-select').value = '';
  document.getElementById('course-status-select').value = '';
  document.getElementById('difficulty-level-select').value = '';
  coursePagination.pageNum = 1;
  loadCourseList();
}

// 删除课程（操作后刷新当前页）
async function deleteCourse(id) {
  if (!confirm('确定要删除该课程吗？')) return;
  
  try {
    const res = await fetch(`/api/course/${id}`, { method: 'DELETE' });
    const result = await res.json();
    
    if (result.code === 200) {
      alert('删除成功');
      // 删除后判断当前页是否还有数据，无数据则跳上一页
      const currentPageData = document.querySelectorAll('#course-table-body tr').length;
      if (currentPageData === 1 && coursePagination.pageNum > 1) {
        coursePagination.pageNum--;
      }
      loadCourseList();
    }
  } catch (error) {
    console.error('删除失败：', error);
  }
}
/*
async function loadCourseList_olD() { 

      templateList = await  fetchTemplateList(language?language.value:'all');  
      teacherList  = await  fetchUserList(conditionJsonForTeacher);

      const params = new URLSearchParams({
        pageNum: coursePagination.pageNum,
        pageSize: coursePagination.pageSize,
        courseName: document.getElementById('course-name-input').value.trim(),
        languageType: document.getElementById('language-select').value,
        status: document.getElementById('course-status-select').value
      });
  
     CourseList =await fetchCourseList(conditionJson);
      
        if (!CourseList.length) {
          //html += '<div style="padding:40px 0;text-align:center;color:#999;">暂无数据</div>';
      } else
        { var index= coursePagination.pageNum;

        CourseList.forEach(Course => {
         // INSERT_YOUR_CODE
         // 根据Course.templateId在templateList中查找对应的模板对象
         const templateObj = templateList?templateList.find(t => t.templateId === Course.templateId) : null;
         const teacherObj = teacherList?teacherList.find(t => t.userId === Course.teacherId) : null;

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
                        <button class="btn btn-success" onclick="changeCourseStatus('${Course.courseId}', 'active')">发布</button>
                        <button class="btn btn-warning" onclick="changeCourseStatus('${Course.courseId}', 'inactive')">撤回</button>
                        <button class="btn btn-danger"  onclick="deleteCourse ('${Course.courseId}')">删除</button>
                    </div>
                </div>
            </div>
            `;
        });
      }
    } 
      */


// ===================== 交互函数 =====================
/**
 * 筛选条件变化
 */
/*async function handleSearchChange() {
    localParamter.currentPage = 1; // 重置页码
    await renderCourseCards();
}*/
 

function changeCourseStatus(courseId, status) { 
  operateCourse(courseId, status);
  loadCourseList();  
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
  //TBD 判断是否可以删除：条件是该课程的排期的预约数为0，且课程状态为正常（active）
  //如果可以删除，则删除该课程
  //如果不能删除，则提示用户 
  changeCourseStatus(courseId,"frozen"); 
}


// 点击弹窗遮罩层关闭
  document.getElementById('courseModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('courseModal')) {
      closeCourseModal();
    }
  });
 
  // 点击关闭按钮关闭
  document.getElementById('closeModal').addEventListener('click', closeCourseModal); 
  