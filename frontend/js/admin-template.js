// 全局常量：统一取 js/public/api.js 导出的 API_BASE_URL（默认同源，由 Nginx 反代 /api/v1）
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
  // 2. 设置弹窗标题
  const modalTitle = document.getElementById('templateModalTitle');
  modalTitle.innerHTML = (defaultTemplate.templateId !="")? '编辑<span data-term="course">课程</span>模板' : '新增<span data-term="course">课程</span>模板';
  applyTerms(modalTitle);
   // 4. 生成表单HTML（复用index.html表单结构，适配样式） 
  //显示出来 from
  const formHtml = `
  <form id="templateForm">
    <!-- 隐藏域：模板ID -->
    <input type="hidden" name="templateId" value="${defaultTemplate.templateId}">
    
    <div class="form-item">
      <!-- 2026-10-25 语义修正：这一项是「课程/咨询类型」（classType 的 code），
           显示词由 sys_term 按行业渲染——教育行业 english 显示「英语」，
           法律行业同一个 code 显示「劳动」，健身行业显示「力量训练」。
           它回答"这是哪一类课程/咨询"，**不是**课堂用语。
           之前把它标成「教学语言」是错的，真正的授课语言见下一项。 -->
      <label><span data-term="classType">课程/咨询类型</span> <span style="color:red">*</span></label>
      <select name="languageType" class="form-select" required>
        <option value="">请选择</option>
        ${courseTypeOptionsHtml(defaultTemplate.languageType)}
      </select>
      <div class="form-error" id="languageTypeError"></div>
    </div>

    <div class="form-item">
      <!-- 授课语言（work_language）：用哪种语言上课。固定枚举＋租户自定义，不随行业变化，
           也不走 sys_term。留空表示未指定，课程与排期可再覆盖。 -->
      <label>授课语言</label>
      <select name="workLanguage" class="form-select">
        ${workLanguageOptionsHtml(defaultTemplate.workLanguage, { empty: '未指定' })}
      </select>
      <div class="form-error" id="workLanguageError"></div>
    </div>

    <div class="form-item">
      <label><span data-term="classLevel">难度等级</span> <span style="color:red">*</span></label>
      <select name="difficultyLevel" class="form-select" required>
        <option value="">请选择</option>
        <option value="B1" ${defaultTemplate.difficultyLevel === 'B1' ? 'selected' : ''}><span data-term="classLevel classB1">B1入门</span></option>
        <option value="B2" ${defaultTemplate.difficultyLevel === 'B2' ? 'selected' : ''}><span data-term="classLevel classB2">B2初级</span></option>
        <option value="B3" ${defaultTemplate.difficultyLevel === 'B3' ? 'selected' : ''}><span data-term="classLevel classB3">B3中级</span></option>
        <option value="B4" ${defaultTemplate.difficultyLevel === 'B4' ? 'selected' : ''}><span data-term="classLevel classB4">B4高级</span></option>
      </select>
      <div class="form-error" id="difficultyLevelError"></div>
    </div>

    <div class="form-item">
      <label><span data-term="course">课程</span>形式 <span style="color:red">*</span></label>
      <select name="classForm" class="form-select" required>
        <option value="">请选择</option>
        <option value="1p1" ${defaultTemplate.classForm === '1p1' ? 'selected' : ''}><span data-term="classForm1p1">一对一</span></option>
        <option value="1pN" ${defaultTemplate.classForm === '1pN' ? 'selected' : ''}><span data-term="classForm1pN">小班课</span></option>
         <option value="1p2N  " ${defaultTemplate.classForm === '1p2N' ? 'selected' : ''}><span data-term="classForm1p2N">中班课</span></option>
          
      </select>
      <div class="form-error" id="classFormError"></div>
    </div>

    <div class="form-item">
      <!-- 2026-10-25：这个值会导入课程、再带到排期，并作为排期冲突检查的课时长度。
           改名「课时长度」是为了和排期页的叫法一致，避免以为是"课时费"或"课时数" -->
      <label><span data-term="lessonUnit">课时长度</span>（分钟） <span style="color:red">*</span></label>
      <input type="number" name="classDuration" min="15" step="5" placeholder="如 45 / 60 / 90" value="${defaultTemplate.classDuration}" required>
      <div class="form-error" id="classDurationError"></div>
    </div>

    <div class="form-item">
      <label><span data-term="lessonFee">课时费</span>（元） <span style="color:red">*</span></label>
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
        <option value="active" ${defaultTemplate.status === 'active' ? 'selected' : ''}>正常</option>
        <option value="inactive" ${defaultTemplate.status === 'inactive' ? 'selected' : ''}>待审核</option>
        <option value="frozen" ${defaultTemplate.status === 'frozen' ? 'selected' : ''}>冻结</option>
        <option value="delete" ${defaultTemplate.status === 'delete' ? 'selected' : ''}>删除</option>
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
        // 授课语言（用哪种语言上课）：空串=未指定，后端放行；非空必须是 sys_work_language 里的 code
        workLanguage:   formEl.workLanguage ? formEl.workLanguage.value : '',
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
          let res = await  updateORCreateTemplate(formData);//返回id
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

    // 授课语言清单（内置六项 + 租户自定义）：列表与表单都要用它出显示名。
    // 失败不阻塞页面——workLanguage.js 会退回内置六项。
    if (window.WorkLanguageDomain) {
        try { await window.WorkLanguageDomain.load(); } catch (e) { /* 已内部兜底 */ }
    }

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
                    <label><span data-term="classType">课程/咨询类型</span>：</label>
                    <select id="languageType-select" >
                        <option value="">全部</option>
                        ${courseTypeOptionsHtml('', { empty: '全部' })}
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
                <button class="btn" onclick="openWorkLanguageManager()">
                <i class="fa fa-language"></i>授课语言
                </button>
              </div>        
           `;
             // 列表表头
        html += ` 
         <div class="table-container">
                <table class="data-table">
                <thead>
                <tr> 
                    <th>序号</th>  
                    <th><span data-term="classType">课程/咨询类型</span></th>  
                    <th>授课语言</th>
                    <th><span data-term="classLevel">难度等级</span></th> 
                    <th><span data-term="classForm">课程形式</span></th> 
                    <th><span data-term="lessonUnit">课时</span>(分钟)</th> 
                    <th><span data-term="lessonFee">课时费</span>(元)</th>   
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
                  <td>${courseTypeCellHtml(template.languageType)}</td>
                  <td>${workLanguageCellHtml(template.workLanguage)}</td>
                  <td>${enumTermCellHtml('classLevel', template.difficultyLevel)}</td>
                  <td>${enumTermCellHtml('classForm', template.classForm)}</td>
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
                 
                      ${template.status === "inactive" ? `<button class="btn btn-success" onclick="operateTemplateStatus('${template.templateId}', 'active')">发布</button>` :'' }
                      ${template.status === "active" ? `<button class="btn btn-warning" onclick="operateTemplateStatus('${template.templateId}', 'inactive')">撤回</button>` :'' }
                      ${template.status === "inactive" ? `<button class="btn btn-danger" onclick="deleteTemplateByFrozen('${template.templateId}')">删除</button>` :'' }

                         
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
            const userChoice = confirm('该模板存在课程，是否删除？继续将删除该项目下的全部课程。点击“确定”继续，点击“取消”放弃删除。');
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
    } catch (err) {
        alert('删除模板下课程时出错，请检查网络或后端接口。');
        console.error('deleteTemplateNextLevelByFrozen error:', err);
    }

 }

async function  operateTemplateStatus(templateId,newStatus){
      await  operateTemplate(templateId,newStatus);
  loadAndRenderTemplateCards(); 
}

  // 关闭弹窗只能通过「取消」「提交」按钮或右上角 × —— 点击遮罩不关闭，
  // 避免表单填了一半时误触遮罩导致输入丢失。
  document.getElementById('templateCloseBtn').addEventListener('click', closeTemplateModal);

/* =============================================================
 * 授课语言管理（work_language）2026-10-25
 * -------------------------------------------------------------
 * 为什么放在模板页：授课语言是模板的属性，入口离它最近。
 * 规则：平台内置六项（tenantId=0）所有租户共用且只读；租户只能增删自己的自定义项。
 * 已被模板/课程/排期引用的自定义项不能删——后端会拦，提示先改引用。
 * ============================================================= */

/** 本地转义（避免和页面其它 esc 命名冲突） */
function wlEsc(s) {
    return String(s === null || s === undefined ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function openWorkLanguageManager() {
    let box = document.getElementById('wlManagerModal');
    if (!box) {
        box = document.createElement('div');
        box.id = 'wlManagerModal';
        box.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.35);display:none;align-items:center;justify-content:center;z-index:9999;';
        box.innerHTML = '<div style="background:#fff;border-radius:8px;width:min(780px,92vw);max-height:86vh;overflow:auto;padding:18px;box-shadow:0 8px 28px rgba(0,0,0,.18);">'
            + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">'
            +   '<b style="font-size:15px;">授课语言管理</b>'
            +   '<button class="btn btn-default" onclick="closeWorkLanguageManager()">关闭</button>'
            + '</div>'
            + '<div style="color:#8c8c8c;font-size:12px;line-height:1.8;margin-bottom:12px;background:#fafafa;border:1px solid #f0f0f0;border-radius:6px;padding:10px;">'
            +   '授课语言 = <b>用哪种语言上课</b>（英语/法语/汉语…），与「课程/咨询类型」是两回事：'
            +   '后者是课程分类，显示词会随行业变化（法律行业里 english 显示为「劳动」）。<br>'
            +   '平台内置六项所有机构共用、不可修改；下面可以追加本机构自己的语言。'
            +   '已被模板、课程或排期引用的项不能删除，请先把那些记录改成别的语言。'
            + '</div>'
            + '<div id="wlManagerBody">加载中…</div>'
            + '</div>';
        document.body.appendChild(box);
    }
    box.style.display = 'flex';
    renderWorkLanguageManager();
}

function closeWorkLanguageManager() {
    const box = document.getElementById('wlManagerModal');
    if (box) box.style.display = 'none';
}

function renderWorkLanguageManager() {
    const host = document.getElementById('wlManagerBody');
    if (!host) return;
    const D = window.WorkLanguageDomain;
    if (!D) { host.innerHTML = '授课语言模块未加载（js/public/workLanguage.js）'; return; }

    const list = D.items();
    let rows = '';
    list.forEach(function (it) {
        const builtin = D.isBuiltin(it);
        rows += '<tr style="border-bottom:1px solid #f5f5f5;">'
            + '<td style="padding:6px 8px;font-family:monospace;">' + wlEsc(it.langCode) + '</td>'
            + '<td style="padding:6px 8px;">' + wlEsc(it.nameZh) + '</td>'
            + '<td style="padding:6px 8px;">' + wlEsc(it.nameEn) + '</td>'
            + '<td style="padding:6px 8px;">' + wlEsc(it.nameFr) + '</td>'
            + '<td style="padding:6px 8px;color:' + (builtin ? '#8c8c8c' : '#0958d9') + ';">'
            +   (builtin ? '平台内置' : '本机构') + '</td>'
            + '<td style="padding:6px 8px;text-align:right;">'
            +   (builtin
                    ? '<span style="color:#d9d9d9;">—</span>'
                    : '<button class="btn btn-danger" onclick="deleteWorkLanguage(' + it.id + ',\'' + wlEsc(it.langCode) + '\')">删除</button>')
            + '</td></tr>';
    });
    if (!rows) rows = '<tr><td colspan="6" style="padding:10px;color:#8c8c8c;">暂无</td></tr>';

    host.innerHTML =
        '<table style="width:100%;border-collapse:collapse;font-size:13px;">'
        + '<thead><tr style="background:#fafafa;text-align:left;">'
        +   '<th style="padding:8px;">代码</th><th style="padding:8px;">中文名</th>'
        +   '<th style="padding:8px;">英文名</th><th style="padding:8px;">法文名</th>'
        +   '<th style="padding:8px;">来源</th><th style="padding:8px;"></th>'
        + '</tr></thead><tbody>' + rows + '</tbody></table>'
        + '<div style="margin-top:14px;border-top:1px solid #f0f0f0;padding-top:12px;">'
        +   '<div style="font-size:13px;margin-bottom:8px;">追加一门授课语言</div>'
        +   '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">'
        +     '<input id="wlCode" placeholder="代码 如 italian" style="width:150px;padding:6px;border:1px solid #d9d9d9;border-radius:4px;">'
        +     '<input id="wlZh" placeholder="中文名 如 意大利语" style="width:150px;padding:6px;border:1px solid #d9d9d9;border-radius:4px;">'
        +     '<input id="wlEn" placeholder="英文名（可空）" style="width:130px;padding:6px;border:1px solid #d9d9d9;border-radius:4px;">'
        +     '<input id="wlFr" placeholder="法文名（可空）" style="width:130px;padding:6px;border:1px solid #d9d9d9;border-radius:4px;">'
        +     '<button class="btn btn-primary" onclick="saveWorkLanguage()">保存</button>'
        +   '</div>'
        +   '<div style="color:#bfbfbf;font-size:12px;margin-top:6px;">代码只能小写字母开头，可含数字、下划线、连字符；与内置项重复会被拒绝。</div>'
        + '</div>';
}

async function saveWorkLanguage() {
    const D = window.WorkLanguageDomain;
    if (!D) { alert('授课语言模块未加载'); return; }
    const codeEl = document.getElementById('wlCode');
    const zhEl = document.getElementById('wlZh');
    const code = codeEl ? codeEl.value.trim() : '';
    const zh = zhEl ? zhEl.value.trim() : '';
    if (!code || !zh) { alert('请填写代码与中文名'); return; }
    try {
        await D.save({
            langCode: code,
            nameZh: zh,
            nameEn: (document.getElementById('wlEn') || {}).value || '',
            nameFr: (document.getElementById('wlFr') || {}).value || ''
        });
        await D.load(true);
        renderWorkLanguageManager();
        alert('已保存：' + zh);
    } catch (e) {
        alert('保存失败：' + (e && e.message ? e.message : e));
    }
}

async function deleteWorkLanguage(id, code) {
    const D = window.WorkLanguageDomain;
    if (!D) { alert('授课语言模块未加载'); return; }
    if (!confirm('删除授课语言「' + code + '」？\n已被模板/课程/排期引用时会失败。')) return;
    try {
        await D.remove(id);
        await D.load(true);
        renderWorkLanguageManager();
    } catch (e) {
        alert('删除失败：' + (e && e.message ? e.message : e));
    }
}