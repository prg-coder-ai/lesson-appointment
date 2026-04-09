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
var testFormContainer =null;
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

/**
 * 获取Token（修复localStorage解析逻辑）
 */

function getToken() {
    const currentUserStr = localStorage.getItem('currentUser');
    if (!currentUserStr) {
        alert('未登录，请重新登录');
        window.location.href = '/login'; // 跳转到登录页
        return '';
    }
    const currentUser = JSON.parse(currentUserStr);
    return currentUser.token || '';
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
      description: "请输入模板描述"
    };
  } else  
    try {
      defaultTemplate = templateJsonStr;//JSON.parse(templateJsonStr);   // 将template安全地转为json对象 
    } catch (e) {
      defaultTemplate = {};
      console.error(e);
    } 
    console.log("edit json:",defaultTemplate); 
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
        <option value="online" ${defaultTemplate.classForm === 'online' ? 'selected' : ''}>线上</option>
        <option value="offline" ${defaultTemplate.classForm === 'offline' ? 'selected' : ''}>线下</option>
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
  // 5. 渲染表单到弹窗容器
 
  // templateFormContainer 是模板编辑/新增弹窗里的表单内容区域，其在 admin.html 中作为 <div id="templateFormContainer"></div> 预留。
  // 这里我们直接通过 document.getElementById('templateFormContainer') 获取并动态赋值其 innerHTML。
  // 本JS无须"创建"该元素，只需确保 admin.html 文件里已存在对应的 <div id="templateFormContainer"></div>，否则需在弹窗容器结构内手动加上：
  // <div id="templateFormContainer"></div>
  // 本函数给 templateFormContainer 动态赋表单内容即可。
  // 说明：如果你遇到 document.getElementById('templateFormContainer') 获取到 undefined/null，
  // 最常见原因是本 JS 文件的 <script src="admin-template.js"></script> 引入时机在 admin.html 里太早，DOM 还未生成。
  // 你应确保 <div id="templateFormContainer"></div> 已经渲染在页面上（一般在弹窗结构内），
  // 并且 <script src="admin-template.js"></script> 应当放在 </body> 前，确保页面所有 DOM 元素都已解析后再加载 JS。
  // 检查方法：
  // 1. 检查 HTML 结构中模态弹窗已有 <div id="templateFormContainer"></div>
  // 2. 检查 JS 是否在 DOMContentLoaded 之前运行——如果是，应将JS引入放到底部
  // 3. 若本 JS 需要处理的 DOM 不是实时可见，可以先确保 modal 弹窗 stype.display = 'block' 后再渲染内容
  // 4. 若仍有疑问，建议在本处加如下防御代码进行排查：

  // Debug: 如果找不到 templateFormContainer，弹详细报错
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
        templateId:formEl.templateId.value,
        languageType: formEl.languageType.value,
        difficultyLevel: formEl.difficultyLevel.value,
        classForm: formEl.classForm.value,
        classDuration: formEl.classDuration.value,
        classFee: formEl.classFee.value,
        description: formEl.description.value
    };
  // 3. 调用接口提交（区分新增/编辑）
    //根据templateId判断新增还是修改
    console.info("submit:",formData.templateId);
    const token = getToken();
    const url = formData.templateId !=""? `${baseUrl}/course/template/update` : `${baseUrl}/course/template/insert`;
  
    try {
        const res = await axios.post(url, formData, {
            headers: { "Authorization": "Bearer " + token }
        });
        // 4.  响应处理 响应成功/失败
        if (res.data && res.data.code === 200) {
            alert(formData.templateId !="" ? '模板编辑成功' : '模板新增成功');
          closeTemplateModal(); // 关闭弹窗
          await renderTemplateCards(); // 刷新列表
        } else {
            alert(res.data?.message || (formData.templateId!=""  ? '模板编辑失败' : '模板新增失败'));
        }
    } catch (err) {
        alert('网络异常，操作失败');
        console.error(err);
    }
}
/**
 * 渲染模板列表（核心：原生JS操作DOM）
 */
async function renderTemplateCards() {
    const dynamicContentCenter = document.getElementById('dynamic-content-center');
    if (!dynamicContentCenter) return; 
    // 显示加载中
    dynamicContentCenter.innerHTML = '<div style="padding:40px 0;text-align:center;">加载中...</div>';

    // 构建筛选条件
    const conditionJson = {
        //language: document.getElementById('languageType').value,
      //  level: document.getElementById('difficultyLevel').value,
        pageRow: pageSize,
        pageNum: currentPage
    };

    // 获取模板列表数据
    await fetchTemplateList(conditionJson);

    // 渲染HTML
    let html = '';
    if (!templateList.length) {
        html = '<div style="padding:40px 0;text-align:center;color:#999;">暂无模板数据</div>';
    } else { 
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
        var index=0;
        templateList.forEach(template => {
         // console.log(template);
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
                   
                        <button class="btn btn-success" onclick="operateTemplate('${template.templateId}', 'active')">发布</button>
                        <button class="btn btn-warning" onclick="operateTemplate('${template.templateId}', 'inactive')">撤回</button>
                        <button class="btn btn-danger" onclick="deleteTemplate('${template.templateId}')">删除</button>
                    </div>
                </div>
            </div>
            `;
        });
    }
    dynamicContentCenter.innerHTML = html;

    // 更新分页组件
    const pagination = document.getElementById('pagination');
    if (pagination) {
        pagination.currentPage = currentPage;
        pagination.pageSize = pageSize;
        pagination.total = total;
    }
}

/**
 * 调用后端接口获取模板列表
 */
async function fetchTemplateList(conditionJson) {
    const token = getToken();
    if (!token) return;

    try {
        // Axios GET请求（修复response.json()错误，Axios已自动解析）
        const response = await axios.get(`${API_BASE_URL}/course/template/list`, {
            headers: { "Authorization": "Bearer " + token },
            params: conditionJson // 筛选条件通过params传递
        });
        const res = response.data;
        console.info("get:",res);
        if (res && res.code === 200) {
          
            templateList = res.data.templates|| [];

            total = templateList.length|| 0;
            
            console.info("total:",total,templateList);
            // 补全默认状态
            templateList.forEach(item => {
                if (!item.status) item.status = 'active';
            });
        } else {
            alert(res?.message || '获取模板列表失败');
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
    currentPage = 1; // 重置页码
    await renderTemplateCards();
}

/**
 * 重置筛选表单
 */
async function resetSearchForm() {
    document.getElementById('languageType').value = '';
    document.getElementById('difficultyLevel').value = '';
    currentPage = 1;
    await renderTemplateCards();
}

/**
 * 分页大小变化
 */
async function handlePageSizeChange(val) {
    pageSize = val;
    await renderTemplateCards();
}

/**
 * 页码变化
 */
async function handleCurrentPageChange(val) {
    currentPage = val;
    await renderTemplateCards();
}

  

/**
 * 发布/回收模板、
 */
async function operateTemplate(templateId, action) {
    const token = getToken();
    const payload = {
      templateid: templateId,  // 注意小写，和后端命名对应
      status: action
  };
   
        // 这里分析参数带入方式：接口说明需要 templateId 和 action（操作类型/状态）作为参数。
        // axios.put 发送到 /course/template/manage，后端期望参数格式为 { templateId, action } （或 status）。
        // 但你的写法是 { templateId: ..., status: ... }，后端如期望 action 字段，需要修正字段名。
        // 根据后端接口 CourseController.updateTemplate 需要 {templateid, action} 作为 JSON 请求体字段（不是直接字符串参数）。
        // 且参数名注意为 templateid（小写），后端 Spring 不能自动映射 templateId，需和后端代码严格匹配
        // 如果后端 Controller 层要求 RequestBody Json对象，请传:
        // { templateid: templateId, action: action }
        // 不是 params、不是 query、不是 array；是object。
        // axios 等库请求时，发送 request body 只需将数据对象作为第二个参数（POST、PUT），第三个参数为 headers 配置。
        // 例如：axios.put(url, { key1: value1, key2: value2 }, { headers: { ... } })
        // 在 fetch，用 fetch(url, { method: 'POST', body: JSON.stringify(data), headers: { ... } });
        // 后端 expects @RequestBody JSON，所以务必用对象并确保字段名与后端参数完全一致
        
       /* const res = await axios.put(
            `${baseUrl}/course/template/updateStatus`,
            {
              data:{  templateId: templateId, 
                status: action // 使用 action 字段传递类型（如 edit, publish, recall, ...）
              }
            },
            { headers: { "Authorization": "Bearer " + token } }         
        );

        if (res.data.code === 200) {
          console.success( '模板操作成功');
            await renderTemplateCards();
        } else {
            alert( '模板操作失败');
        }
    } catch (err) {
        alert('网络异常，操作失败');
        console.error(err);
    }*/

    // 这段代码中 `res && res.code === 200` 会出现异常的根本原因可能如下：
    // 1. fetch的response未必能被正常解析为json（如接口返回204/空/非json字符串），那么response.json()会抛出异常，进入catch。
    // 2. 如果后端接口出错返回了HTML、null、undefined或其他非对象内容，.then(res => ...)这里的res不是期望的对象，访问res.code会抛出。
    // 3. 某些情况下res实际为null/undefined或格式不符（如res为字符串），则res.code === 200会抛异常。
    //
    // 更安全的写法，需先确认res为对象且有code属性，再判断。推荐加类型检查与默认值防御。

    fetch(`${API_BASE_URL}/course/template/updateStatus`, {
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
          console.success('模板操作成功');
        }
        renderTemplateCards(); 
      } else {
        alert(msg || '模板操作失败');
      }
    })
    .catch(e => {
      // 网络错误或json解析异常都能捕获
      alert("网络错误或数据解析异常，操作失败");
      console.error(e);
    });
   
    }  
/**
 * 删除模板
 */
async function deleteTemplate(templateId) {
    
        if (!window.confirm('确定要删除该课程模板吗？删除后基于该模板的课程基础参数将不受统一管控！')) {
            return;
        }
   
        operateTemplate(templateId,"frozen"); 
}

// 点击弹窗遮罩层关闭
document.getElementById('templateModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('templateModal')) {
      closeTemplateModal();
    }
  });
  // 点击关闭按钮关闭
  document.getElementById('closeModal').addEventListener('click', closeTemplateModal);