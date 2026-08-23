  /* js for overall  admin-course.js 课程管理 CRUD
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
 
 // 引入分页组件js
 document.write('<script src="/js/public/pagefoot.js"></script>');
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
      <label><span data-term="course">课程</span>名称 <span style="color:red">*</span></label>
      <input name="courseName"   value="${defaultCourse.courseName}" required> 
      <div class="form-error" id="courseNameError"></div>
    </div>

    <div class="form-item">
      <label>教学内容 <span style="color:red">*</span></label> 
       <textarea name="content" rows="3" required>${defaultCourse.content}</textarea>
      <div class="form-error" id="contentError"></div>
    </div>
 
    <div class="form-item">
      <label><span data-term="course">课程</span>特色 <span style="color:red">*</span></label> 
       <textarea name="feature" rows="3" required>${defaultCourse.feature}</textarea>
      <div class="form-error" id="featureError"></div>
    </div> 

    <div class="form-item">
      <label><span data-term="teaching">授课</span><span data-term="teacher">教师</span> <span style="color:red">*</span></label>
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
  applyTerms(formContainer);
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
    assignLoadobjectListFunction( loadAndRenderCourseListByPage);// assign
    const dynamicContentCenter = document.getElementById('dynamic-content-center'); 
    if (!dynamicContentCenter) return; 
    let html=``;
html = `
    <div class="card">
      <!-- 筛选+操作栏 -->
      <div class="card-header">
        <div class="card-title"><i class="fa fa-book-open"></i> <span data-term="course">课程</span>列表</div>
        <button class="btn btn-primary" onclick="openAddCourseModal()">
          <i class="fa fa-plus"></i> 添加<span data-term="course">课程</span>
        </button>
      </div>
      
      <!-- 筛选条件 -->
      <div class="filter-bar">
        <div class="filter-item">
          <label><span data-term="course">课程</span>名称：</label>
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
              <th style="width:0px;display:none" ><span data-term="course">课程</span>ID</th>
              <th><span data-term="course">课程</span>名称</th>
              <th>语言类型</th>
              <th>难度等级</th>
              <th><span data-term="lessonUnit">课时</span>费</th>
              <th>时长</th>
              <th>状态</th>
              <th>操作</th  --> 
              
                  <th>序号</th>  
                    <th style="width:0px;display:none">Id</th>
                     <th><span data-term="course">课程</span>名称</th>  
                  <th>摘要</th> 
                <th><span data-term="course">课程</span>内容</th>
                <th><span data-term="course">课程</span>特色</th> 
                <th><span data-term="teacher">教师</span></th>
                <th>状态</th>
                <th>操作</th>
            </tr>
          </thead>
          <tbody id="course-table-body">
            <!-- 数据由JS动态渲染 -->
          </tbody>
        </table>
      </div>
      `;
      html += getPagebar();
      if(dynamicContentCenter) {
        dynamicContentCenter.innerHTML =  html;  
        applyTerms(dynamicContentCenter);
        loadAndRenderCourseListByPage();
     }
  // 页面渲染完成后，加载第一页数据
     
   }

   // 加载课程列表数据
async function loadAndRenderCourseListByPage() {  

  // 拼接请求参数
  const params = new URLSearchParams({
    pageNum: Pagination.pageNum,
    pageSize: Pagination.pageSize,
    courseName: document.getElementById('course-name-input').value.trim(),
    languageType: document.getElementById('language-select').value,
    difficultyLevel: document.getElementById('difficulty-level-select').value,
    status: document.getElementById('course-status-select').value
  });
   const language = document.getElementById('language-select').value;
  templateList = await  fetchTemplateList(language?language.value:'all');  
  teacherList  = await  fetchUserList(conditionJsonForTeacher);

  try {
    const result = await request({url:`/course/page?${params.toString()}` });//GET
    //const result = await res.json();
    
    if (result ) {
      const pageData = result;//.data;
      // 更新分页状态
      Pagination.total = pageData.total;
      Pagination.totalPages = pageData.totalPages;
      
      // 渲染表格
      renderCourseTable(pageData.rows);
      // 渲染分页栏
      renderPagination( Pagination);
    }else{
      Pagination.total = 0;
      Pagination.totalPages = 0;
      renderCourseTable([]);
      renderPagination( Pagination);
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
  var index=(Pagination.pageNum-1)*Pagination.pageSize;//记录序号

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
                        <button class="btn btn-danger"  onclick="deleteCourseByFrozen ('${Course.courseId}')">删除</button>
                    </td>
                </tr> 
            `;
        });
        tbody.innerHTML = html;
} // 筛选与操作联动
// 搜索按钮：重置为第1页再查询
function localsearchCourse() {
  Pagination.pageNum = 1;
  loadAndRenderCourseListByPage();
}

// 重置筛选条件
function resetCourseFilter() {
  document.getElementById('course-name-input').value = '';
  document.getElementById('language-select').value = '';
  document.getElementById('course-status-select').value = '';
  document.getElementById('difficulty-level-select').value = '';
  Pagination.pageNum = 1;
  loadAndRenderCourseListByPage();
}

// 删除课程（操作后刷新当前页）
async function deleteCourseByFrozen(id) {
  
  try {
    const scdList = fetchScheduleList(id,null);
  // INSERT_YOUR_CODE
  // 判断scdList是否为空数组
    var bcomfirmed =false;
  if (scdList && Array.isArray(await scdList) && (await scdList).length > 0) {
    //alert('该课程存在排期，不能删除！');
    const userChoice = confirm('该课程存在排期，是否继续删除？继续将删除该项目下的全部排期。点击“确定”继续，点击“取消”放弃删除。');
        if (!userChoice) {
            return;
                  }
                  bcomfirmed = true;
    //删除该课程的所有排期 设置标记
       await setScheduleStatusByLastId(id,"frozen");              
  }
  }
   catch(error){
    console.error('查询排期失败：',id, error);
   }
       if(!bcomfirmed) //提示1次
         if (!confirm('确定要删除该课程吗？')) return;
  try { 
      await  changeCourseStatus(id,"frozen"); 
      loadAndRenderCourseListByPage();
  } catch (error) {
    console.error('删除失败：', error);
  }
}


function changeCourseStatus(courseId, status) { 
  try {
  operateCourse(courseId, status);
  }catch (error) {
    console.error('修改失败：', error);
  }
  loadAndRenderCourseListByPage();  
} 

async function  setScheduleStatusByLastId(courseId,status){
// INSERT_YOUR_CODE
  try {
    // 获取所有该课程的排期
    const scheduleList = await fetchScheduleList(courseId, null);
    if (Array.isArray(scheduleList) && scheduleList.length > 0) {
      // 批量异步修改每个排期状态
      await Promise.all(
        scheduleList.map(schedule =>
          operateSchedule(schedule.scheduleId, status)
        )
      );
    }
  } catch (err) {
    console.error('批量修改排期状态失败:', err, courseId, status);
  }

}
  
// 点击弹窗遮罩层关闭
  document.getElementById('courseModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('courseModal')) {
      closeCourseModal();
    }
  });
 
  // 点击关闭按钮关闭
  document.getElementById('closeModal').addEventListener('click', closeCourseModal); 
  