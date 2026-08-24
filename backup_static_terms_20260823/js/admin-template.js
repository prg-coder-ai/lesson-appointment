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
  
    // 校验status字段必填项
    const statusInput = formEl.status;
    if (!statusInput.value.trim()) {
        const statusErrorEl = document.getElementById('statusError');
        if (statusErrorEl) {
            statusErrorEl.innerText = "此项为必填项";
        }
        isValid = false;
    }
    
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
  console.info("edit:",templateJsonStr); 

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
      description: "请输入模板描述",
      status: "inactive"
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
        <option value="english" ${defaultTemplate.languageType === 'english' ? 'selected' : ''}><span>英语</span></option>
        <option value="french" ${defaultTemplate.languageType === 'french' ? 'selected' : ''}><span>法语</span></option>
        <option value="spanish" ${defaultTemplate.languageType === 'spanish' ? 'selected' : ''}><span>西班牙语</span></option>
        <option value="chinese" ${defaultTemplate.languageType === 'chinese' ? 'selected' : ''}>中文</option>
      </select>
      <div class="form-error" id="languageTypeError"></div>
    </div>

    <div class="form-item">
      <label>难度等级 <span style="color:red">*</span></label>
      <select name="difficultyLevel" class="form-select" required>
        <option value="">请选择</option>
        <option value="B1" ${defaultTemplate.difficultyLevel === 'B1' ? 'selected' : ''}><span>B1</span></option>
        <option value="B2" ${defaultTemplate.difficultyLevel === 'B2' ? 'selected' : ''}><span>B2</span></option>
        <option value="B3" ${defaultTemplate.difficultyLevel === 'B3' ? 'selected' : ''}><span>B3</span></option>
        <option value="B4" ${defaultTemplate.difficultyLevel === 'B4' ? 'selected' : ''}><span>B4</span></option>
      </select>
      <div class="form-error" id="difficultyLevelError"></div>
    </div>

    <div class="form-item">
      <label>课程形式 <span style="color:red">*</span></label>
      <select name="classForm" class="form-select" required>
        <option value="">请选择</option>
        <option value="1p1" ${defaultTemplate.classForm === '1p1' ? 'selected' : ''}>一对一</option>
        <option value="1pN" ${defaultTemplate.classForm === '1pN' ? 'selected' : ''}>小班课</option>
         <option value="1p2N  " ${defaultTemplate.classForm === '1p2N' ? 'selected' : ''}>中班课</option>
          
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
    <div class="form-item">
      <label>模板状态 <span style="color:red">*</span></label>
      <select name="status" class="form-select" required>
        <option value="">请选择</option>
        <option value="active" ${defaultTemplate.status === 'active' ? 'selected' : ''}>激活</option>
        <option value="inactive" ${defaultTemplate.status === 'inactive' ? 'selected' : ''}>待审核</option>
        <option value="frozen" ${defaultTemplate.status === 'frozen' ? 'selected' : ''}>冻结</option>
      </select>
      <div class="form-error" id="statusError"></div>
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
        description:    formEl.description.value,
        status:         formEl.status.value,
    };
  // 3. 调用接口提交（区分新增/编辑） 
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
    
      html += `<div class="card" style="padding: 15px;">
           <div class="card-header">
              <div class="card-title"><i class="fa fa-filter"></i> 筛选条件</div>
              <button class="btn btn-primary" onclick="openEditTemplateDialog(null)"> <i class="fa fa-plus"></i> 新增模板</button>
            </div>   
     <div class="teacher-list-cards" style="margin:6px 0;display:flex;flex-direction:column;gap:16px;">
      <div class="filter-bar">        
                 <div class="filter-item">
                    <label><span data-term="classType">语言类型</span>：</label>
                    <select id="languageType-select" >
                        <option value="">全部</option>
                        <option value="french"><span data-term="classType1">法语</span></option>
                        <option value="english"><span data-term="classType2">英语</span></option> 
                        <option value="chinese"><span data-term="classType3">汉语</span></option>
                        <option value="spanish"><span data-term="classType4">西语</span></option>
                    </select>
                </div>
                <div class="filter-item">
                    <label><span data-term="classLevel">难度等级</span>：</label>
                    <select id="difficultyLevel-select">
                        <option value="">全部</option>
                        <option value="B1"><span data-term="classLevelB1">B1入门</span></option>
                        <option value="B2"><span data-term="classLevelB2">B2初级</span></option>
                        <option value="B3"><span data-term="classLevelB3">B3中级</span></option>
                        <option value="B4"><span data-term="classLevelB4">B4高级</span></option> 
                    </select>
                </div>
                <!-- 暂时保留 div class="filter-item">
                    <label>名称：</label>
                    <input type="text" id="name-input"  placeholder="模板名称" >
                </div -->
                 <button class="btn" onclick="localsearchTemplate()">
                    <i class="fa fa-search"></i> 搜索
                    </button>
                <button class="btn btn-default" onclick="resetFilterTemplate()"> 
                <i class="fa fa-redo"></i>重置
                </button>
              </div>        
           `;
             // 列表表头
        html += ` 
         <div class="table-container">
                <table class="data-table">
                <thead>
                <tr> 
                    <th><span data-term="serialNumber">序号</span></th>  
                    <th>语言类型</th>  
                    <th>难度等级</th> 
                    <th>课程形式</th> 
                    <th>课时长度</th> 
                    <th>课时费(元)</th>   
                    <th>状态</th>
                    <th >操作</th>
                </tr>
                </thead>
                <tbody id="templatesDisplay-body">
                <!-- 数据由JS动态渲染 -->
                 </tbody>
              </table>
              </div>  
        `; 
 
            html += getPagebar();
            html+=`</div>`;
         if(dynamicContentCenter) {
            dynamicContentCenter.innerHTML =  html;  
            applyTerms(dynamicContentCenter);
            loadAndRenderTemplateCards();
         }
}


async function loadAndRenderTemplateCards() {
 
  // 构建筛选条件
  const conditionJson = {
      languageType:       document.getElementById('languageType-select').value,
      difficultyLevel:    document.getElementById('difficultyLevel-select').value,
     //TBD  name:    document.getElementById('name-input').value,
     name:null,
      pageSize:Pagination.pageSize,
      pageNum: Pagination.pageNum
  };
 //console.log(conditionJson);
  // 获取模板列表数据
  const pageResult  = await  fetchTemplateListPage(conditionJson);
  console.log(pageResult);
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

 //div-》table渲染
   function showTemplatesList( templates,renderTo) {
    var  html = ` `;
          
     var index=(Pagination.pageNum-1)*Pagination.pageSize;//记录序号let index = 0;

      if (templates && templates.length >0 )
        templates.forEach(template => {
        
          index ++;
          html += `
              <tr> 
                 <td  >${index  }</td> 
                  <td  >${template.languageType || ''}</td>
                  <td  >${template.difficultyLevel === 'B1' ? 'B1入门' : 
                    template.difficultyLevel === 'B2' ? 'B2初级' : 
                    template.difficultyLevel === 'B3' ? 'B3中级' :
                     template.difficultyLevel === 'B4' ? 'B4高级' : (template.difficultyLevel || '')}</td>
                  <td  >${template.classForm === '1p1' ? '一对一' : 
                    template.classForm === '1pN' ? '小班课' : 
                    template.classForm === '1p2N' ? '中班课' : 
                    (template.classForm || '')}</td>
                  <td  >${template.classDuration || ''}</td>
                  <td  >${template.classFee || ''}</td>  
                   <td>                       
                        ${ template.status === "pending" ? '<span style="color:#faad14;">待审核</span>' :
                          template.status === "active" ? '<span style="color:#52c41a;">正常</span>' :
                          template.status === "inactive" ? '<span style="color:#faad14;">待启用</span>' :
                          template.status === "frozen" ? '<span style="color:#f5222d;">已删除</span>' :
                          `<span>${template.status||"未知"}</span>`
                        }
                      </td>
                  <td><div class="btn-group">
                      <button class="btn btn-success" onclick='openEditTemplateDialog(${JSON.stringify(template).replace(/'/g, "\\'")})'>修改</button>
                 
                      <button class="btn btn-success" onclick="operateTemplateStatus('${template.templateId}', 'active')">发布</button>
                      <button class="btn btn-warning" onclick="operateTemplateStatus('${template.templateId}', 'inactive')">撤回</button>
                      <button class="btn btn-danger" onclick="deleteTemplateByFrozen('${template.templateId}')">删除</button>
                      </div>
                  </td>
              </tr>
          `;
      });
    
     var renderItem = document.getElementById(renderTo);
            // 列表表头
     if(renderItem){
            renderItem.innerHTML = html;
     }
 }
// ===================== 交互函数 =====================

function deleteTemplateByFrozen(templateId) {     
      var bConfirmed = false ;
      (async () => {
          // 执行前检查模板是否关联课程，如有关联则不允许删除
          const hasCourses = await checkTemplateHasCourses(templateId);
          if (hasCourses) { 
            const userChoice = confirm('该模板存在关联课程，是否删除？继续将删除该项目下的全部课程。点击“确定”继续，点击“取消”放弃删除。');
            if (!userChoice) {
                return;
                      }
           //设置该模板的所有课程状态为delete
           bConfirmed = true;   
           deleteTemplateNextLevelByFrozen(templateId);
          }

          if(!bConfirmed) //提示1次 
            if (!confirm('确定要删除该模板吗？')) return;

            await operateTemplate(templateId,"frozen");

            await loadAndRenderTemplateCards();
             
      })();           
}
  
 async function deleteTemplateNextLevelByFrozen(templateId){
 // INSERT_YOUR_CODE
    try {
        // 调用接口设置模板所有课程的状态为delete
        // 获取所有课程，筛选属于该模板的课程，然后调用接口设置其状态为"delete"
        // 后端接口: /api/v1/course/updateStatusByLastId/{id}?status=delete, method: POST
        // 这里假设存在API_BASE_URL全局变量，否则请按实际填充
        // 1. 获取该模板下所有课程
        const res = await request({
            url: `${API_BASE_URL}/course/updateStatusByLastId/${encodeURIComponent(templateId)}?status=${encodeURIComponent("frozen")}`,
            method: 'POST' 
        });
          console.log("deleted",res);
    } catch (err) {
        alert('删除模板下关联课程时出错，请检查网络或后端接口。');
        console.error('deleteTemplateNextLevelByFrozen error:', err);
    }

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