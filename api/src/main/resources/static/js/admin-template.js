// 全局常量（后端可通过Thymeleaf注入，如 th:inline="javascript"）
//const API_BASE_URL = 'http://localhost:8081'; // 优先取后端注入的地址
const baseUrl = API_BASE_URL;

// 全局变量（替代Vue响应式，直接操作DOM/变量）
let templateList = [];       // 模板列表
let currentPage = 1;         // 当前页码（初始值由Thymeleaf渲染）
let pageSize = 10;           // 页大小
let total = 0;               // 总条数
let templateDialogVisible = false; // 弹窗状态
let dialogTitle = '新增课程模板'; // 弹窗标题
let currentTemplateId = '';  // 当前操作的模板ID
let formEl ='';


 // 引入分页组件js
 document.write('<script src="/js/public/pagefoot.js"></script>');

// 表单验证规则（适配Element Plus原生用法）
/*const templateRules = {
    languageType: [{ required: true, message: '请选择语言类型', trigger: 'change' }],
    difficultyLevel: [{ required: true, message: '请选择难度等级', trigger: 'change' }],
    classForm: [{ required: true, message: '请选择课程形式', trigger: 'change' }],
    classDuration: [{ required: true, message: '请输入课时时长', trigger: 'blur' }],
    classFee: [{ required: true, message: '请输入课时费', trigger: 'blur' }],
    description: [{ required: true, message: '请输入模板描述', trigger: 'blur' }]
};
 */ 
// ===================== 核心函数 =====================
function validateForm() {
    let isValid = true;
    if (!formEl) return false;
    
    // 清空所有错误提示
    document.querySelectorAll(".form-error").forEach(el => el.innerText = "");
  
    // 逐个校验必填项
    const requiredFields = ['languageType', 'difficultyLevel', 'classForm', 'classDuration', 'classFee', 'description'];
    requiredFields.forEach(field => {
        const input = formEl[field];
        if (!input.value.trim()) {
            const errorEl = document.getElementById(`${field}Error`);
            if (errorEl) {
                errorEl.innerText = "此项为必填项";
            }
            isValid = false;
        }
    });
    return isValid;
  }
 
  function openEditTemplateDialog(templateJsonStr )
{ 
 // 1. 显示弹窗
 const modal = document.getElementById('templateModal');
 modal.style.display = 'flex';
 //console.info("edit:",templateJsonStr); 

 // 2. 初始化默认模板数据 
  let defaultTemplate = {};
  if (templateJsonStr==null) {
    defaultTemplate = {
      templateId: "",
      languageType: "",
      difficultyLevel: "",
      classForm: "",
      classDuration: "",
      classFee: "",
      description: "请输入模板描述"
    };
  } else  
    try {
      defaultTemplate = templateJsonStr;//JSON.parse(templateJsonStr);   // 将template安全地转为json对象 
    } catch (e) {
      defaultTemplate = {};
      console.error(e);
    } 
    //console.log("edit json:",defaultTemplate); 
  // 2. 设置弹窗标题
  const modalTitle = document.getElementById('modalTitle');
  modalTitle.innerText = (defaultTemplate.templateId !="")? '编辑课程模板' : '新增课程模板';
   // 4. 生成表单HTML（复用index.html表单结构，适配样式） 
  //显示出来 from
  const formHtml = `
  <form id="templateForm">
    <!-- 隐藏域：模板ID -->
    <input type="hidden" name="templateId" value="${defaultTemplate.templateId}">
    
    <div class="form-item">
      <label>语言类型 <span style="color:red">*</span></label>
      <select name="languageType" class="form-select" required>
        <option value="">请选择</option>
        <option value="english" ${defaultTemplate.languageType === 'english' ? 'selected' : ''}>英语</option>
        <option value="french" ${defaultTemplate.languageType === 'french' ? 'selected' : ''}>法语</option>
      </select>
      <div class="form-error" id="languageTypeError"></div>
    </div>

    <div class="form-item">
      <label>难度等级 <span style="color:red">*</span></label>
      <select name="difficultyLevel" class="form-select" required>
        <option value="">请选择</option>
        <option value="B1" ${defaultTemplate.difficultyLevel === 'B1' ? 'selected' : ''}>B1</option>
        <option value="B2" ${defaultTemplate.difficultyLevel === 'B2' ? 'selected' : ''}>B2</option>
        <option value="B3" ${defaultTemplate.difficultyLevel === 'B3' ? 'selected' : ''}>B3</option>
        <option value="B4" ${defaultTemplate.difficultyLevel === 'B4' ? 'selected' : ''}>B4</option>
      </select>
      <div class="form-error" id="difficultyLevelError"></div>
    </div>

    <div class="form-item">
      <label>课程形式 <span style="color:red">*</span></label>
      <select name="classForm" class="form-select" required>
        <option value="">请选择</option>
        <option value="1p1" ${defaultTemplate.classForm === '1p1' ? 'selected' : ''}>一对一</option>
        <option value="1pn" ${defaultTemplate.classForm === '1pn' ? 'selected' : ''}>小班课</option>
          
      </select>
      <div class="form-error" id="classFormError"></div>
    </div>

    <div class="form-item">
      <label>课时时长（分钟） <span style="color:red">*</span></label>
      <input type="number" name="classDuration" value="${defaultTemplate.classDuration}" required>
      <div class="form-error" id="classDurationError"></div>
    </div>

    <div class="form-item">
      <label>课时费（元） <span style="color:red">*</span></label>
      <input type="number" step="0.01" name="classFee" value="${defaultTemplate.classFee}" required>
      <div class="form-error" id="classFeeError"></div>
    </div>

    <div class="form-item">
      <label>模板描述 <span style="color:red">*</span></label>
      <textarea name="description" rows="3" required>${defaultTemplate.description}</textarea>
      <div class="form-error" id="descriptionError"></div>
    </div>

    <div class="mt-4 text-end">
      <button type="button" class="btn btn-cancel" onclick="closeTemplateModal()">取消</button>
      <button type="button" class="btn btn-primary" onclick="submitTemplateForm()">提交</button>
    </div>
  </form>
`; 
// const testFormContainer = document.getElementById('templateFormContainer');
  if (!testFormContainer) {
    alert("无法找到 templateFormContainer 元素！\n" +
      "请确认 admin.html 页面内存在 <div id=\"templateFormContainer\"></div> 并且 <script src=\"admin-template.js\"></script> 是在 DOM 加载完后引入的。");
    // 可在此 return 或抛异常以避免后续报错
    return;
  }
  testFormContainer.innerHTML = formHtml;
  // 6. 保存表单元素引用
  formEl = document.getElementById('templateForm');
}

// 新增：关闭弹窗函数
function closeTemplateModal() {
    const modal = document.getElementById('templateModal');
    modal.style.display = 'none';
    // 清空表单错误提示
    document.querySelectorAll(".form-error").forEach(el => el.innerText = "");
  }
/**
 * 新增模板响应函数
 * 1. 校验表单
 * 2. 获取表单数据
 * 3. 调用接口提交
 * 4. 响应成功/失败
 */
async function submitTemplateForm() {

    // 1. 校验表单
    if (!validateForm()) {
        return;
    }
    // 2. 获取表单数据 
    const formData = {
        templateId:     formEl.templateId.value,
        languageType:   formEl.languageType.value,
        difficultyLevel:formEl.difficultyLevel.value,
        classForm:      formEl.classForm.value,
        classDuration:  formEl.classDuration.value,
        classFee:       formEl.classFee.value,
        description:    formEl.description.value
    };
  // 3. 调用接口提交（区分新增/编辑）
    //根据templateId判断新增还是修改
    //const url = formData.templateId !=""? `${baseUrl}/course/template/update` : `${baseUrl}/course/template/insert`;
      // INSERT_YOUR_CODE
      // 兼容 updateORCreateTemplate 作为全局函数被调用的问题
      // 若该函数为模块作用域或 window 对象未注册，则补注册（以支持 admin-template.js 单独引用不报错）
      if (typeof updateORCreateTemplate === 'undefined') {
        // 此处必须用window对象以保证可调用
        window.updateORCreateTemplate = async function(formData){
          // 假设 API_BASE_URL 和 request 全局可用
          const url = formData.templateId && formData.templateId !== ""
            ? `${API_BASE_URL}/course/template/update`
            : `${API_BASE_URL}/course/template/insert`;
          try {
            const res = await request({
              url: url,
              method: 'POST',
              data: formData
            });
            return res;
          } catch (err) {
            alert('网络异常，操作失败002');
            console.error(err);
            return null;
          }
        }
      }
     try{
       // console.log("submitTemplateForm",formData);
          let res = await  updateORCreateTemplate(formData);//返回id
          console.log("submitTemplateForm",res);
        // 4.  响应处理 响应成功/失败
        if (res ) {
            alert(formData.templateId !="" ? '模板编辑成功' : '模板新增成功');
            closeTemplateModal(); // 关闭弹窗
           await loadAndRenderTemplateCards(); // 刷新列表
        } else {
            alert( formData.templateId!=""  ? '模板编辑失败' : '模板新增失败');

        }
    } catch (err) {
        alert('操作失败: ' + (err && err.message ? err.message : err));
   
        console .error(err);
    }
}
/**
 * 渲染模板列表（核心：原生JS操作DOM）
 */

async function renderTemplateCards() {
    assignLoadobjectListFunction( loadAndRenderTemplateCards);// assign

    const dynamicContentCenter = document.getElementById('dynamic-content-center');
    //console .log("renderTemplateCards:",dynamicContentCenter);
    if (!dynamicContentCenter) return; 
  
    // 渲染HTML
    let html = '';
    
      html += `<div class="card">
            <div class="card-title"><i class="fa fa-filter"></i> 筛选条件</div>
            <div class="filter-form" style="display: flex; gap: 20px; margin-bottom: 16px;">
                <div>
                    <label>语言类型：</label>
                    <select id="languageType-select" >
                        <option value="">全部</option>
                        <option value="french">法语</option>
                        <option value="english">英语</option> 
                    </select>
                </div>
                <div>
                    <label>难度等级：</label>
                    <select id="difficultyLevel-select">
                        <option value="">全部</option>
                        <option value="B1">B1入门</option>
                        <option value="B2">B2初级</option>
                        <option value="B3">B3中级</option>
                        <option value="B4">B4高级</option> 
                    </select>
                </div>
                <div>
                    <label>名称：</label>
                    <input type="text" id="name-input"  placeholder="模板名称" >
                </div>
                 <button class="btn" onclick="localsearchTemplate()">
                    <i class="fa fa-search"></i> 搜索
                    </button>
                <button class="btn btn-default" onclick="resetFilterTemplate()"> 
                <i class="fa fa-redo"></i>重置
                </button>
                <button class="btn btn-primary" onclick="openEditTemplateDialog(null)">新增模板</button>
            </div>
        </div>
           `;
             // 列表表头
        html += `
            <div style="display:flex;gap:36px;font-weight:bold;border-bottom:1px solid #e9ecef;padding-bottom:8px;margin-bottom:4px;">
                  <div style="width:40px;"><strong>序号</strong></div>
                <div style="width:90px;"><strong>语言类型</strong></div>
                <div style="width:180px;"><strong>难度等级</strong></div>
                <div style="width:130px;"><strong>课程形式</strong></div>
                <div style="width:130px;"><strong>课时时长(分钟)</strong></div>
                <div style="width:130px;"><strong>课时费(元)</strong></div>
                <div style="width:120px;"><strong>状态</strong></div>
                <div style="width:240px;"><strong>操作</strong></div>
            </div>

        `; 
            html += `
              <div id="templatesDisplay-body">
                  
                </div>
            `;
            html += getPagebar();
         if(dynamicContentCenter) {
            dynamicContentCenter.innerHTML =  html;  
            loadAndRenderTemplateCards();
         }
}


async function loadAndRenderTemplateCards() {
 
  // 构建筛选条件
  const conditionJson = {
      languageType:       document.getElementById('languageType-select').value,
      difficultyLevel:    document.getElementById('difficultyLevel-select').value,
      name:    document.getElementById('name-input').value,
      pageSize:Pagination.pageSize,
      pageNum: Pagination.pageNum
  };

  // 获取模板列表数据
  const pageResult  = await  fetchTemplateListPage(conditionJson);
  
  if(pageResult){
    templateList = pageResult.rows;    
    const pageData = pageResult;
    Pagination.total = pageData.total ;
    Pagination.totalPages = pageData.totalPages;
   
    showTemplatesList( templateList,"templatesDisplay-body"); //defined in appointmentNotes.js
    renderPagination( Pagination);   
   } else {
    
    Pagination.total = 0 ;
    Pagination.totalPages = 0;
   
    showTemplatesList( [],"templatesDisplay-body"); //defined in appointmentNotes.js
    renderPagination( Pagination);  
   }

  }

  
  function localsearchTemplate() {
    Pagination.pageNum = 1;
    loadAndRenderTemplateCards();
    
 }
 // 重置筛选条件
 function resetFilterTemplate() {
    document.getElementById('languageType-select').value="";
    document.getElementById('difficultyLevel-select').value="";
    document.getElementById('name-input').value="";
    Pagination.pageNum = 1;
     loadAndRenderTemplateCards();
      
 }

 
   function showTemplatesList( templates,renderTo) {
    var  html = ` `;
          
     var index=(Pagination.pageNum-1)*Pagination.pageSize;//记录序号let index = 0;

      if (templates && templates.length >0 )
        templates.forEach(template => {
        
          index ++;
          html += `
              <div class="teacher-card" style="margin:8px 0;padding:8px 0;border-bottom:1px solid #f5f5f5;">
                  
              <div style="display:flex;gap:36px;align-items:center;"> 
                 <div style="width:40px;">${index  }</div> 
                  <div style="width:90px;">${template.languageType || ''}</div>
                  <div style="width:180px;">${template.difficultyLevel || ''}</div>
                  <div style="width:130px;">${template.classForm || ''}</div>
                  <div style="width:130px;">${template.classDuration || ''}</div>
                  <div style="width:130px;">${template.classFee || ''}</div> 
                  
                   <div style="width:120px;">                       
                        ${ template.status === "pending" ? '<span style="color:#faad14;">待审核</span>' :
                          template.status === "active" ? '<span style="color:#52c41a;">正常</span>' :
                          template.status === "inactive" ? '<span style="color:#faad14;">待启用</span>' :
                          template.status === "frozen" ? '<span style="color:#f5222d;">已删除</span>' :
                          `<span>${template.status||"未知"}</span>`
                        }
                      </div>
                  <div style="width:240px;display:flex;gap:8px;">
                      <button class="btn btn-success" onclick='openEditTemplateDialog(${JSON.stringify(template).replace(/'/g, "\\'")})'>修改</button>
                 
                      <button class="btn btn-success" onclick="operateTemplateStatus('${template.templateId}', 'active')">发布</button>
                      <button class="btn btn-warning" onclick="operateTemplateStatus('${template.templateId}', 'inactive')">撤回</button>
                      <button class="btn btn-danger" onclick="deleteTemplate('${template.templateId}')">删除</button>
                  </div>
              </div>
          </div>
          `;
      });
    
     var renderItem = document.getElementById(renderTo);
            // 列表表头
     if(renderItem){
            renderItem.innerHTML = html;
     }
 }
// ===================== 交互函数 =====================
  
/**
 * 删除模板
 */
   function deleteTemplate(templateId) {    
    // INSERT_YOUR_CODE
    // 1. 判断是否存在基于该模板的课程（即该模板是否被课程表引用）
    async function checkTemplateHasCourses(templateId) {
      try {
        // 假设有接口: /course/list 查询课程列表，参数支持 templateId
        // 检查参数传递，getCourseList 可以接收 { templateId: ... }
        // 但要确保参数名和后端（如 CourseQueryParam DTO）一致
        const res = await getCourseList({ templateId });
        console.error("check:",res);
        if (res && Array.isArray(res) && res.length > 0) {
          console.error("check:",true);
          return true;
        }
        console.error("check:",false);
        return true;
      } catch (error) {
        console.error('检查模板是否有关联课程时出错', error);
        // 出错视为有，阻止误删
        return true;
      }
    }
 //   if (!window.confirm('确定要删除该课程模板吗？删除后基于该模板的课程基础参数将不受统一管控！')) {
   //         return;
    //    }
        // INSERT_YOUR_CODE
        var bconfirmed = false ;
        (async () => {
            // 执行前检查模板是否关联课程，如有关联则不允许删除
            const hasCourses = await checkTemplateHasCourses(templateId);
            if (hasCourses) {
                //alert('该模板有关联课程，无法删除！请先删除或修改基于该模板的课程。');
              //  return;
              const userChoice = confirm('该模板存在课程，是否继续删除？继续将删除该项目下的全部课程。点击“确定”继续，点击“取消”放弃删除。');
              if (!userChoice) {
                  return;
                        }
             bcomfirmed = true;
        
            }

            if(!bcomfirmed) //提示1次
              if (!confirm('确定要删除该模板吗？')) return;

            try {
                const res = await request({
                    url: `${API_BASE_URL}/course/template/${templateId}`,
                    method: 'DELETE'
                });
                if (res >0) {
                  //  alert('模板删除成功');
                    await loadAndRenderTemplateCards();
                } else {
                    alert('模板删除失败: ' + (res && res.msg ? res.msg : '未知错误'));
                }
            } catch (err) {
                alert('网络异常，模板删除失败');
                console.error(err);
            }
        })();
     //   deleteTemplate
        // operateTemplateStatus(templateId,"frozen");          
}
    

async function  operateTemplateStatus(templateId,newStatus){
      await  operateTemplate(templateId,newStatus);
  loadAndRenderTemplateCards(); 
}

// 点击弹窗遮罩层关闭
document.getElementById('templateModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('templateModal')) {
      closeTemplateModal();
    }
  });
  // 点击关闭按钮关闭
  document.getElementById('closeModal').addEventListener('click', closeTemplateModal);