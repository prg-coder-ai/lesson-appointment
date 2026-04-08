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

function openEditTemplateDialog(template )
{ 
 // 1. 显示弹窗
 const modal = document.getElementById('templateModal');
 modal.style.display = 'flex';
 console.info("edit:",template);
// 2. 设置弹窗标题
const modalTitle = document.getElementById('modalTitle');
modalTitle.innerText = template && template.templateId ? '编辑课程模板' : '新增课程模板';
 // 3. 初始化默认模板数据
 const defaultTemplate = template || {
    templateId: "",
    languageType: "", // 清空默认值，让用户选择
    difficultyLevel: "",
    classForm: "",
    classDuration: "",
    classFee: "",
    description: '请输入模板描述'
  }; 
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
  document.getElementById('templateFormContainer').innerHTML = formHtml;
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
                <div style="width:0px;" type="hidden"><strong>模板ID</strong></div>
                <div style="width:90px;"><strong>语言类型</strong></div>
                <div style="width:180px;"><strong>难度等级</strong></div>
                <div style="width:130px;"><strong>课程形式</strong></div>
                <div style="width:130px;"><strong>课时时长(分钟)</strong></div>
                <div style="width:130px;"><strong>课时费(元)</strong></div>
                <div style="width:120px;"><strong>状态</strong></div>
                <div style="width:240px;"><strong>操作</strong></div>
            </div>
        `;
        templateList.forEach(template => {
            // 状态渲染
            let statusHtml = '';
            if (template.status === 'pending') statusHtml = '<span style="color:#faad14;">待审核</span>';
            else if (template.status === 'active') statusHtml = '<span style="color:#52c41a;">正常</span>';
            else if (template.status === 'inactive') statusHtml = '<span style="color:#faad14;">待启用</span>';
            else if (template.status === 'frozen') statusHtml = '<span style="color:#f5222d;">已删除</span>';
            else statusHtml = `<span>${template.status || '未知'}</span>`;

            html += `
                <div class="teacher-card" style="margin:8px 0;padding:8px 0;border-bottom:1px solid #f5f5f5;">
                    
                <div style="display:flex;gap:36px;align-items:center;">
                    <div style="width:0px;" type="hidden" >${template.templateId || ''}</div>
                    <div style="width:90px;">${template.languageType || ''}</div>
                    <div style="width:180px;">${template.difficultyLevel || ''}</div>
                    <div style="width:130px;">${template.classForm || ''}</div>
                    <div style="width:130px;">${template.classDuration || ''}</div>
                    <div style="width:130px;">${template.classFee || ''}</div> 
                    <div style="width:120px;">${statusHtml}</div>
                    <div style="width:240px;display:flex;gap:8px;">
                        <button class="btn btn-success" onclick="openEditTemplateDialog(${JSON.stringify(template)})">修改</button>
                        <button class="btn btn-success" onclick="operateTemplate('${template.templateId}', 'active')">发布</button>
                        <button class="btn btn-warning" onclick="operateTemplate('${template.templateId}', 'inactive')">回收</button>
                        <button class="btn btn-danger" onclick="operateTemplate('${template.templateId}', 'frozen')">删除</button>
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
            
            console.info("total:",total);
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
 * 发布/回收模板
 */
async function operateTemplate(templateId, action) {
    const token = getToken();
    try {
        const res = await axios.put(`${baseUrl}/course/manage`, {
            templateId: templateId,
            operation: 'edit',
            data: { status: action }
        }, { headers: { "Authorization": "Bearer " + token } });

        if (res.data.code === 200) {
          console.success( '模板操作成功');
            await renderTemplateCards();
        } else {
            alert( '模板操作失败');
        }
    } catch (err) {
        alert('网络异常，操作失败');
        console.error(err);
    }
}

/**
 * 删除模板
 */
async function deleteTemplate(templateId) {
    try {
        await message.confirm(
            '确定要删除该课程模板吗？删除后基于该模板的课程基础参数将不受统一管控！',
            '温馨提示',
            { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' }
        );

        const token = getToken();
        const res = await axios.put(`${baseUrl}/admin/course/manage`, {
            templateId: templateId,
            operation: 'delete'
        }, { headers: { "Authorization": "Bearer " + token } });

        if (res.data.code === 200) {
          console.success('模板删除成功');
            await renderTemplateCards();
        } else {
            alert(res.data.message || '模板删除失败');
        }
    } catch (err) {
        if (err.name !== 'Error') {
            alert('网络异常，删除失败');
            console.error(err);
        } else {
          console.info('已取消删除');
        }
    }
}
// 点击弹窗遮罩层关闭
document.getElementById('templateModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('templateModal')) {
      closeTemplateModal();
    }
  });
  // 点击关闭按钮关闭
  document.getElementById('closeModal').addEventListener('click', closeTemplateModal);