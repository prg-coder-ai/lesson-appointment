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

// 表单验证规则（适配Element Plus原生用法）
const templateRules = {
    languageType: [{ required: true, message: '请选择语言类型', trigger: 'change' }],
    difficultyLevel: [{ required: true, message: '请选择难度等级', trigger: 'change' }],
    classForm: [{ required: true, message: '请选择课程形式', trigger: 'change' }],
    classDuration: [{ required: true, message: '请输入课时时长', trigger: 'blur' }],
    classFee: [{ required: true, message: '请输入课时费', trigger: 'blur' }],
    description: [{ required: true, message: '请输入模板描述', trigger: 'blur' }]
};

// 初始化Element Plus表单验证
const templateFormRef = ElForm.useForm({
    model: {
        templateId: '',
        languageType: '',
        difficultyLevel: '',
        classForm: '',
        classDuration: '',
        classFee: '',
        description: ''
    },
    rules: templateRules
});

// ===================== 核心函数 =====================
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

/**
 * 渲染模板列表（核心：原生JS操作DOM）
 */
async function renderTemplateCards() {
    const dynamicContentCenter = document.getElementById('dynamicContentCenter');
    if (!dynamicContentCenter) return;

    // 显示加载中
    dynamicContentCenter.innerHTML = '<div style="padding:40px 0;text-align:center;">加载中...</div>';

    // 构建筛选条件
    const conditionJson = {
        language: document.getElementById('languageType').value,
        level: document.getElementById('difficultyLevel').value,
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
                        <option value="france" th:selected="${searchForm.languageType == 'france'}">法语</option>
                        <option value="english" th:selected="${searchForm.languageType == 'english'}">英语</option> 
                    </select>
                </div>
                <div>
                    <label>难度等级：</label>
                    <select id="difficultyLevel" onchange="handleSearchChange()">
                        <option value="">全部</option>
                        <option value="B1" th:selected="${searchForm.difficultyLevel == 'B1'}">B1入门</option>
                        <option value="B2" th:selected="${searchForm.difficultyLevel == 'B2'}">B2初级</option>
                        <option value="B3" th:selected="${searchForm.difficultyLevel == 'B3'}">B3中级</option>
                        <option value="B4" th:selected="${searchForm.difficultyLevel == 'B4'}">B4高级</option> 
                    </select>
                </div>
                <button class="btn btn-default" onclick="resetSearchForm()">重置</button>
            </div>
        </div>
           `;
        html += `
            <div style="display:flex;gap:36px;font-weight:bold;border-bottom:1px solid #e9ecef;padding-bottom:8px;margin-bottom:4px;">
                <div style="width:120px;"><strong>模板ID</strong></div>
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
                <div class="teacher-card">
                    <div style="display:flex;gap:36px;">
                        <div>${template.id || ''}</div>
                        <div>${template.language || ''}</div>
                        <div>${template.level || ''}</div>
                        <div>${template.courseFormat || ''}</div>
                        <div>${statusHtml}</div>
                    </div>
                    <div class="teacher-actions">
                        <button class="btn btn-success" onclick="openEditTemplateDialog('${template.id}')">修改</button>
                        <button class="btn btn-success" onclick="operateTemplate('${template.id}', 'active')">发布</button>
                        <button class="btn btn-warning" onclick="operateTemplate('${template.id}', 'inactive')">回收</button>
                        <button class="btn btn-danger" onclick="deleteTemplate('${template.id}')">删除</button>
                    </div>
                </div>
            `;
        });
    }
    dynamicContentCenter.innerHTML = html;

    // 更新分页组件（Element Plus原生API）
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

        if (res && res.code === 200) {
            templateList = res.data.data.templates || [];
            total = res.data.data.total || 0;
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
 * 打开新增模板弹窗
 */
function openAddTemplateDialog() {
    dialogTitle = '新增课程模板';
    resetTemplateForm();
    templateDialogVisible = true;
    // 显示Element Plus弹窗
    ElDialog.open({
        id: 'templateDialog',
        title: dialogTitle,
        visible: true
    });
}

/**
 * 打开修改模板弹窗
 */
async function openEditTemplateDialog(templateId) {
    currentTemplateId = templateId;
    dialogTitle = '修改课程模板';
    resetTemplateForm();

    // 获取模板详情
    const token = getToken();
    try {
        const response = await axios.get(`${API_BASE_URL}/course/template/detail/${templateId}`, {
            headers: { "Authorization": "Bearer " + token }
        });
        const template = response.data.data;
        // 填充表单
        templateFormRef.model.templateId = template.id;
        templateFormRef.model.languageType = template.language;
        templateFormRef.model.difficultyLevel = template.level;
        templateFormRef.model.classForm = template.courseFormat;
        templateFormRef.model.classDuration = template.classDuration;
        templateFormRef.model.classFee = template.classFee;
        templateFormRef.model.description = template.description;
    } catch (e) {
        alert('获取模板详情失败');
        console.error(e);
    }

    // 显示弹窗
    templateDialogVisible = true;
    ElDialog.open({ id: 'templateDialog', title: dialogTitle, visible: true });
}

/**
 * 重置模板表单
 */
function resetTemplateForm() {
    templateFormRef.resetFields(); // Element Plus表单重置
    templateFormRef.model = {
        templateId: '',
        languageType: '',
        difficultyLevel: '',
        classForm: '',
        classDuration: '',
        classFee: '',
        description: ''
    };
}

/**
 * 提交模板表单（新增/修改）
 */
async function submitTemplateForm() {
    // 表单验证
    const valid = await templateFormRef.validate();
    if (!valid) return;

    const token = getToken();
    const formData = templateFormRef.model;
    try {
        let res;
        if (formData.templateId) {
            // 修改模板
            res = await axios.put(`${baseUrl}/course/manage`, {
                templateId: formData.templateId,
                operation: 'edit',
                data: formData
            }, { headers: { "Authorization": "Bearer " + token } });
        } else {
            // 新增模板
            res = await axios.post(`${baseUrl}/course/template/add`, formData, {
                headers: { "Authorization": "Bearer " + token }
            });
        }

        if (res.data.code === 200) {
            ElMessage.success(formData.templateId ? '模板修改成功' : '模板新增成功');
            templateDialogVisible = false;
            ElDialog.close('templateDialog'); // 关闭弹窗
            await renderTemplateCards(); // 刷新列表
        } else {
            alert(res.data.message || (formData.templateId ? '模板修改失败' : '模板新增失败'));
        }
    } catch (err) {
        alert('网络异常，操作失败');
        console.error(err);
    }
}

/**
 * 发布/回收模板
 */
async function operateTemplate(templateId, type) {
    const token = getToken();
    try {
        const res = await axios.put(`${baseUrl}/course/manage`, {
            templateId: templateId,
            operation: 'edit',
            data: { status: type }
        }, { headers: { "Authorization": "Bearer " + token } });

        if (res.data.code === 200) {
            ElMessage.success(type === 'active' ? '模板发布成功' : '模板回收成功');
            await renderTemplateCards();
        } else {
            alert(res.data.message || (type === 'active' ? '模板发布失败' : '模板回收失败'));
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
        await ElMessageBox.confirm(
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
            ElMessage.success('模板删除成功');
            await renderTemplateCards();
        } else {
            alert(res.data.message || '模板删除失败');
        }
    } catch (err) {
        if (err.name !== 'Error') {
            alert('网络异常，删除失败');
            console.error(err);
        } else {
            ElMessage.info('已取消删除');
        }
    }
}

// 页面初始化
window.onload = async function() {
    await renderTemplateCards();
};