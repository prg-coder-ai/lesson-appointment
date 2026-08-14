/**
 * 教师职业信息维护 - 单条记录版（form 页面）
 * 通过 URL 参数 ?userid=xxxx 指定教师，加载并展示该教师的职业信息。
 * 依赖：utility_request.js (window.request)、api.js (getCurrentUserInfo)、auth.js (handleLogout)
 */
window.teacherInfoModule = window.teacherInfoModule || {};

// ====================== 模块级状态 ======================
// 当前教师的 userId（来自 URL）
let currentTeacherId = null;
// 当前职业信息记录 ID（已有记录时非空，新增时为 null）
let currentProfessionalId = null;
// 当前模式：'view' | 'edit' | 'add'
let currentMode = 'view';
// 最近一次加载的原始数据（用于取消编辑时回滚）
let originalData = null;

const SUBJECT_OPTIONS = ['英语', '日语', '韩语', '法语', '德语', '西班牙语'];
const DAY_OF_WEEK_MAP = { 1: '周一', 2: '周二', 3: '周三', 4: '周四', 5: '周五', 6: '周六', 7: '周日' };

// ====================== URL 参数解析 + 加载入口 ======================
/**
 * 从 URL 读取 userid 并加载教师职业信息。
 * 兼容大小写：userid / userId / id
 */
function loadTeacherInfoFromUrl() {
  const params = new URLSearchParams(window.location.search);
  // 优先 userid（用户指定写法），其次 userId / id
  currentTeacherId = params.get('userid') || params.get('userId') || params.get('id');

  if (!currentTeacherId) {
    renderError('缺少 userid 参数，请在 URL 中携带：<code>?userid=教师ID</code>');
    return;
  }
  loadTeacherInfo(currentTeacherId);
}

/**
 * 调用后端单条查询接口，按 teacherId 拉取职业信息。
 * 接口：GET /teacher/professional/queryTeacherProfessionalInfo?teacherId=xxx
 */
async function loadTeacherInfo(teacherId) {
  setContainerHtml('<div class="loading-tip">加载中...</div>');
  showActionButtons('');

  try {
    const result = await request({
      url: '/teacher/professional/queryTeacherProfessionalInfo',
      params: { teacherId: teacherId }
    });

    if (!result || result.code !== 200) {
      // 接口返回业务错误（如教师不存在）
      const msg = (result && result.message) ? result.message : '查询失败';
      renderError(msg);
      return;
    }

    const data = result.data;
    if (!data || !data.professional) {
      // 教师存在但还没有职业信息 → 进入新增模式
      originalData = buildEmptyForm(teacherId);
      currentProfessionalId = null;
      currentMode = 'add';
      setPageTitle('新增教师职业信息');
      renderEditForm(originalData, true);
      showActionButtons('add');
      return;
    }

    // 已有职业信息 → 进入查看模式
    originalData = normalizeDetail(data);
    currentProfessionalId = data.professional.teacherProfessionalId;
    currentMode = 'view';
    setPageTitle(`教师职业信息 - ${data.name || data.account || teacherId}`);
    renderView(originalData);
    showActionButtons('view');
  } catch (e) {
    console.error('加载教师职业信息失败：', e);
    renderError('加载失败：' + (e && e.message ? e.message : e));
  }
}

// ====================== 数据规范化 ======================
/** 把后端返回的 detail 对象整理成 renderView/renderEditForm 期望的结构 */
function normalizeDetail(data) {
  const p = data.professional || {};
  return {
    teacherProfessionalId: p.teacherProfessionalId,
    teacherId: p.teacherId,
    name: data.name || '',
    account: data.account || '',
    phone: data.phone || '',
    email: data.email || '',
    userStatus: data.userStatus || '',
    subject: p.subject || '',
    personalPhotoUrl: p.personalPhotoUrl || '',
    // 保留 base64 字段：编辑时若用户未换图，原样回传，避免丢失已上传图片
    personalPhotoBase64: p.personalPhotoBase64 || '',
    bioText: p.bioText || '',
    bioUrl: p.bioUrl || '',
    availabilityRule: p.availabilityRule || '',
    minBookingHours: p.minBookingHours != null ? p.minBookingHours : 4,
    weeklyAvailableHours: p.weeklyAvailableHours != null ? p.weeklyAvailableHours : 20,
    certificateText: p.certificateText || '',
    status: p.status || 'active',
    createTime: p.createTime || '',
    updateTime: p.updateTime || '',
    certificates: (data.certificates || []).map(c => ({
      certificateId: c.certificateId,
      certName: c.certName || '',
      certUrl: c.certUrl || '',
      // 保留 base64：编辑时未换图则原样回传
      certBase64: c.certBase64 || c.certificateImageBase64 || '',
      sortNo: c.sortNo != null ? c.sortNo : 0
    })),
    availableTimes: (data.availableTimes || []).map(t => ({
      availableId: t.availableId,
      timeType: t.timeType || 'weekly',
      dayOfWeek: t.dayOfWeek,
      specificDate: t.specificDate || '',
      startTime: t.startTime || '09:00:00',
      endTime: t.endTime || '17:00:00',
      status: t.status || 'active'
    }))
  };
}

/** 构造空白表单数据（新增模式） */
function buildEmptyForm(teacherId) {
  return {
    teacherProfessionalId: null,
    teacherId: teacherId,
    name: '',
    account: '',
    phone: '',
    email: '',
    userStatus: '',
    subject: '',
    personalPhotoUrl: '',
    personalPhotoBase64: '',
    bioText: '',
    bioUrl: '',
    availabilityRule: '',
    minBookingHours: 4,
    weeklyAvailableHours: 20,
    certificateText: '',
    status: 'active',
    createTime: '',
    updateTime: '',
    certificates: [],
    availableTimes: [
      { timeType: 'weekly', dayOfWeek: 1, startTime: '09:00:00', endTime: '17:00:00', status: 'active' }
    ]
  };
}

// ====================== 查看模式渲染 ======================
function renderView(data) {
  const statusText = data.status === 'active' ? '<span class="status-active">有效</span>'
    : data.status === 'frozen' ? '<span class="status-frozen">冻结</span>'
    : data.status === 'inactive' ? '<span class="status-inactive">失效</span>'
    : (data.status || '-');
  const photoHtml = data.personalPhotoUrl
    ? `<img class="view-photo" src="${escapeAttr(data.personalPhotoUrl)}" alt="">`
    : (data.personalPhotoBase64
        ? `<img class="view-photo" src="${escapeAttr(data.personalPhotoBase64.startsWith('data:') ? data.personalPhotoBase64 : 'data:image/png;base64,' + data.personalPhotoBase64)}" alt="">`
        : '<div class="view-photo" style="display:flex;align-items:center;justify-content:center;color:#ccc;font-size:12px;">无照片</div>');
  const certHtml = (data.certificates && data.certificates.length)
    ? data.certificates.map(c => {
        // 证书图片：优先 URL，其次 base64
        let certImgHtml = '';
        if (c.certUrl) {
          certImgHtml = `<a href="${escapeAttr(c.certUrl)}" target="_blank"><img class="cert-view-img" src="${escapeAttr(c.certUrl)}" alt=""></a>`;
        } else if (c.certBase64) {
          const dataUri = c.certBase64.startsWith('data:') ? c.certBase64 : 'data:image/png;base64,' + c.certBase64;
          certImgHtml = `<img class="cert-view-img" src="${escapeAttr(dataUri)}" alt="">`;
        }
        return `<div style="margin-bottom:10px;display:flex;gap:10px;align-items:flex-start;">
           ${certImgHtml ? `<div>${certImgHtml}</div>` : ''}
           <div>
             <strong>${escapeHtml(c.certName || '未命名')}</strong>
             ${c.certUrl ? ` · <a href="${escapeAttr(c.certUrl)}" target="_blank">查看原图</a>` : ''}
             <div style="color:#999;font-size:12px;">排序 ${c.sortNo != null ? c.sortNo : 0}</div>
           </div>
         </div>`;
      }).join('')
    : '<span style="color:#999;">无</span>';
  const timeHtml = (data.availableTimes && data.availableTimes.length)
    ? data.availableTimes.map(t => {
        const day = t.timeType === 'weekly'
          ? (DAY_OF_WEEK_MAP[t.dayOfWeek] || '-')
          : (t.specificDate || '-');
        const typeText = t.timeType === 'weekly' ? '每周'
          : t.timeType === 'holiday' ? '假日'
          : '日期覆盖';
        return `<div>${typeText} ${day} ${t.startTime || ''} - ${t.endTime || ''}</div>`;
      }).join('')
    : '<span style="color:#999;">无</span>';

  setContainerHtml(`
    <!-- 照片 + 基本信息区 -->
    <div style="display:flex;gap:24px;margin-bottom:20px;flex-wrap:wrap;">
      <div>${photoHtml}</div>
      <div style="flex:1;min-width:280px;">
        <div class="view-section" style="margin-bottom:0;">
          <div class="view-field"><div class="label">教师姓名</div><div class="value">${escapeHtml(data.name || '-')}</div></div>
          <div class="view-field"><div class="label">账号</div><div class="value">${escapeHtml(data.account || '-')}</div></div>
          <div class="view-field"><div class="label">手机</div><div class="value">${escapeHtml(data.phone || '-')}</div></div>
          <div class="view-field"><div class="label">邮箱</div><div class="value">${escapeHtml(data.email || '-')}</div></div>
          <div class="view-field"><div class="label">学科</div><div class="value">${escapeHtml(data.subject || '-')}</div></div>
          <div class="view-field"><div class="label">状态</div><div class="value">${statusText}</div></div>
          <div class="view-field"><div class="label">用户状态</div><div class="value">${escapeHtml(data.userStatus || '-')}</div></div>
        </div>
      </div>
    </div>

    <!-- 课时配置 -->
    <div class="view-section">
      <div class="view-field"><div class="label">单次最小课时数</div><div class="value">${data.minBookingHours != null ? data.minBookingHours : '-'}</div></div>
      <div class="view-field"><div class="label">每周可用课时上限</div><div class="value">${data.weeklyAvailableHours != null ? data.weeklyAvailableHours : '-'}</div></div>
      <div class="view-field"><div class="label">证书文字描述</div><div class="value">${escapeHtml(data.certificateText || '-')}</div></div>
    </div>

    <!-- 简介 -->
    <div class="form-group" style="margin-top:16px;">
      <label>文字说明（教师简介）</label>
      <div style="white-space:pre-wrap;color:#333;font-size:14px;line-height:1.6;padding:8px;background:#fafafa;border-radius:4px;">${escapeHtml(data.bioText || '无')}</div>
    </div>
    <div class="form-group">
      <label>文字说明链接</label>
      <div class="value">${data.bioUrl ? `<a href="${escapeAttr(data.bioUrl)}" target="_blank">${escapeHtml(data.bioUrl)}</a>` : '<span style="color:#999;">无</span>'}</div>
    </div>

    <!-- 子表：证书 -->
    <div class="sub-section">
      <div class="sub-section-title"><i class="fa fa-certificate"></i> 资格证书</div>
      <div>${certHtml}</div>
    </div>

    <!-- 子表：可预约时间段 -->
    <div class="sub-section">
      <div class="sub-section-title"><i class="fa fa-clock"></i> 可预约时间段</div>
      <div>${timeHtml}</div>
    </div>

    <!-- 元信息 -->
    <div class="view-section" style="margin-top:16px;color:#999;font-size:12px;">
      <div class="view-field"><div class="label">创建时间</div><div class="value">${escapeHtml(data.createTime || '-')}</div></div>
      <div class="view-field"><div class="label">更新时间</div><div class="value">${escapeHtml(data.updateTime || '-')}</div></div>
      <div class="view-field"><div class="label">职业信息ID</div><div class="value" style="font-size:12px;">${escapeHtml(data.teacherProfessionalId || '-')}</div></div>
    </div>
  `);
}

// ====================== 编辑/新增模式渲染 ======================
function renderEditForm(data, isAdd) {
  const teacherReadonly = isAdd
    ? `<input type="text" value="${escapeAttr(data.teacherId || '')}" readonly>
       <input type="hidden" id="f-teacherId" value="${escapeAttr(data.teacherId || '')}">`
    : `<input type="text" value="${escapeAttr(data.teacherId || '')}" readonly>
       <input type="hidden" id="f-teacherId" value="${escapeAttr(data.teacherId || '')}">`;

  let certRowsHtml = '';
  if (data.certificates && data.certificates.length) {
    data.certificates.forEach(c => { certRowsHtml += renderCertRow(c); });
  }
  let timeRowsHtml = '';
  if (data.availableTimes && data.availableTimes.length) {
    data.availableTimes.forEach(t => { timeRowsHtml += renderTimeRow(t); });
  }

  setContainerHtml(`
    <div class="form-group">
      <label>教师ID <span class="required">*</span></label>
      ${teacherReadonly}
      ${data.name ? `<div style="font-size:12px;color:#999;margin-top:4px;">教师姓名：${escapeHtml(data.name)}</div>` : ''}
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>学科</label>
        <select id="f-subject">
          <option value="">请选择</option>
          ${SUBJECT_OPTIONS.map(s => `<option value="${s}" ${s === data.subject ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>状态</label>
        <select id="f-status">
          <option value="active" ${data.status === 'active' ? 'selected' : ''}>有效</option>
          <option value="inactive" ${data.status === 'inactive' ? 'selected' : ''}>失效</option>
          <option value="frozen" ${data.status === 'frozen' ? 'selected' : ''}>冻结</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label>个人照片</label>
      <div class="photo-upload-row">
        <!-- 图片预览：始终保留一个 <img>，无图时隐藏并显示占位 -->
        <div class="photo-preview" id="photo-preview">
          ${(() => {
            const src = data.personalPhotoUrl
              || (data.personalPhotoBase64
                  ? (data.personalPhotoBase64.startsWith('data:') ? data.personalPhotoBase64 : 'data:image/png;base64,' + data.personalPhotoBase64)
                  : '');
            return src
              ? `<img class="photo-preview-img" id="photo-preview-img" src="${escapeAttr(src)}" alt="">`
              : `<img class="photo-preview-img" id="photo-preview-img" src="" alt="" style="display:none;"><div class="photo-placeholder">无图片</div>`;
          })()}
        </div>
        <!-- 文件选择 + URL 输入 -->
        <div class="photo-inputs">
          <input type="file" id="f-personalPhotoFile" accept="image/*" style="display:none;" onchange="handlePhotoSelect(this, 'photo-preview-img', 'f-personalPhotoBase64')">
          <button class="btn btn-default" type="button" onclick="document.getElementById('f-personalPhotoFile').click()"><i class="fa fa-upload"></i> 选择图片上传</button>
          <input type="text" id="f-personalPhotoUrl" value="${escapeAttr(data.personalPhotoUrl || '')}" placeholder="或填写照片URL">
          <!-- 隐藏字段：存放 base64，未换图时保留原值 -->
          <input type="hidden" id="f-personalPhotoBase64" value="${escapeAttr(data.personalPhotoBase64 || '')}">
        </div>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>单次最小课时数</label>
        <input type="number" id="f-minBookingHours" value="${data.minBookingHours != null ? data.minBookingHours : 4}" min="1">
      </div>
      <div class="form-group">
        <label>每周可用课时上限</label>
        <input type="number" id="f-weeklyAvailableHours" value="${data.weeklyAvailableHours != null ? data.weeklyAvailableHours : 20}" min="1">
      </div>
    </div>
    <div class="form-group">
      <label>文字说明（教师简介）</label>
      <textarea id="f-bioText" maxlength="2000" placeholder="教师简介">${escapeHtml(data.bioText || '')}</textarea>
    </div>
    <div class="form-group">
      <label>文字说明链接</label>
      <input type="text" id="f-bioUrl" value="${escapeAttr(data.bioUrl || '')}" placeholder="外部简历/博客URL">
    </div>
    <div class="form-group">
      <label>证书文字描述</label>
      <input type="text" id="f-certificateText" value="${escapeAttr(data.certificateText || '')}" placeholder="如 CET-8、JLPT N1">
    </div>

    <div class="sub-section">
      <div class="sub-section-title"><i class="fa fa-certificate"></i> 资格证书（支持多张）</div>
      <div id="cert-rows">${certRowsHtml}</div>
      <button class="add-row-btn" onclick="addCertRow()"><i class="fa fa-plus"></i> 添加证书</button>
    </div>

    <div class="sub-section">
      <div class="sub-section-title"><i class="fa fa-clock"></i> 可预约时间段</div>
      <div id="time-rows">${timeRowsHtml}</div>
      <button class="add-row-btn" onclick="addTimeRow()"><i class="fa fa-plus"></i> 添加时间段</button>
    </div>
  `);
}

// ====================== 子表行渲染（证书 / 时间段） ======================
function renderCertRow(c) {
  c = c || {};
  const thumbHtml = getPhotoImgHtml(c.certUrl, c.certBase64, 'cert-thumb-img');
  return `
    <div class="sub-item-row cert-row">
      <div class="cert-thumb">${thumbHtml}</div>
      <input type="text" class="cert-name" value="${escapeAttr(c.certName || '')}" placeholder="证书名称">
      <input type="text" class="cert-url" value="${escapeAttr(c.certUrl || '')}" placeholder="图片URL（可选）">
      <input type="number" class="cert-sort" value="${c.sortNo != null ? c.sortNo : 0}" placeholder="排序" style="max-width:70px;">
      <input type="hidden" class="cert-base64" value="${escapeAttr(c.certBase64 || '')}">
      <input type="file" class="cert-file" accept="image/*" style="display:none;" onchange="handleCertPhotoSelect(this)">
      <button class="btn btn-default" type="button" onclick="this.previousElementSibling.click()"><i class="fa fa-upload"></i></button>
      <button class="btn btn-danger" onclick="this.parentElement.remove()"><i class="fa fa-times"></i></button>
    </div>`;
}

function renderTimeRow(t) {
  t = t || {};
  const dowOptions = Object.keys(DAY_OF_WEEK_MAP).map(k =>
    `<option value="${k}" ${String(t.dayOfWeek) === k ? 'selected' : ''}>${DAY_OF_WEEK_MAP[k]}</option>`
  ).join('');
  const typeOptions = ['weekly', 'override', 'holiday'].map(tp =>
    `<option value="${tp}" ${tp === t.timeType ? 'selected' : ''}>${tp === 'weekly' ? '每周模板' : tp === 'override' ? '日期覆盖' : '假日'}</option>`
  ).join('');
  return `
    <div class="sub-item-row">
      <select class="time-type">${typeOptions}</select>
      <select class="time-dow"><option value="">星期</option>${dowOptions}</select>
      <input type="date" class="time-date" value="${escapeAttr(t.specificDate || '')}" placeholder="具体日期">
      <input type="text" class="time-start" value="${escapeAttr(t.startTime || '09:00:00')}" placeholder="开始">
      <input type="text" class="time-end" value="${escapeAttr(t.endTime || '17:00:00')}" placeholder="结束">
      <button class="btn btn-danger" onclick="this.parentElement.remove()"><i class="fa fa-times"></i></button>
    </div>`;
}

function addCertRow() {
  const container = document.getElementById('cert-rows');
  const div = document.createElement('div');
  div.innerHTML = renderCertRow({});
  container.appendChild(div.firstChild);
}

function addTimeRow() {
  const container = document.getElementById('time-rows');
  const div = document.createElement('div');
  div.innerHTML = renderTimeRow({ timeType: 'weekly', dayOfWeek: 1, startTime: '09:00:00', endTime: '17:00:00', status: 'active' });
  container.appendChild(div.firstChild);
}

// ====================== 模式切换按钮（静态 HTML 已预置在 teacherInfo.html 的 #action-btns 中）======================
/**
 * 根据模式显示对应的按钮组，隐藏其余三组。
 * mode: 'view' | 'edit' | 'add' | 'error' | ''
 */
function showActionButtons(mode) {
  const btns = {
    view: document.getElementById('btns-view'),
    edit: document.getElementById('btns-edit'),
    add:  document.getElementById('btns-add'),
    error: document.getElementById('btns-error')
  };
  Object.keys(btns).forEach(k => {
    if (btns[k]) btns[k].style.display = (k === mode) ? '' : 'none';
  });
}

/** 进入编辑模式（从查看模式切换） */
function enterEditMode() {
  if (!originalData) return;
  currentMode = 'edit';
  renderEditForm(originalData, false);
  showActionButtons('edit');
}

/** 取消编辑，回到查看模式 */
function cancelEdit() {
  if (!originalData) return;
  currentMode = 'view';
  renderView(originalData);
  showActionButtons('view');
}

// ====================== 保存（新增 / 修改） ======================
async function saveForm() {
  const teacherId = document.getElementById('f-teacherId').value;
  if (!teacherId) {
    alert('教师ID不能为空');
    return;
  }

  // 收集证书（含 base64 图片）
  const certificates = [];
  document.querySelectorAll('#cert-rows .cert-row').forEach(row => {
    const name = row.querySelector('.cert-name').value.trim();
    const url = row.querySelector('.cert-url').value.trim();
    const base64 = row.querySelector('.cert-base64').value;
    const sort = parseInt(row.querySelector('.cert-sort').value) || 0;
    // 有名称、URL 或 base64 之一即认为该行有效
    if (name || url || base64) {
      certificates.push({ certName: name, certUrl: url, certBase64: base64 || null, sortNo: sort });
    }
  });

  // 收集时间段
  const availableTimes = [];
  document.querySelectorAll('#time-rows .sub-item-row').forEach(row => {
    const timeType = row.querySelector('.time-type').value;
    const dowVal = row.querySelector('.time-dow').value;
    const dateVal = row.querySelector('.time-date').value;
    const startTime = row.querySelector('.time-start').value.trim();
    const endTime = row.querySelector('.time-end').value.trim();
    if (startTime && endTime) {
      availableTimes.push({
        timeType,
        dayOfWeek: dowVal ? parseInt(dowVal) : null,
        specificDate: dateVal || null,
        startTime, endTime,
        status: 'active'
      });
    }
  });

  const payload = {
    teacherId,
    subject: document.getElementById('f-subject').value,
    personalPhotoUrl: document.getElementById('f-personalPhotoUrl').value.trim(),
    // base64 图片：未选图时为隐藏字段原值（保留已上传图片），选了新图则覆盖
    personalPhotoBase64: document.getElementById('f-personalPhotoBase64').value || null,
    bioText: document.getElementById('f-bioText').value.trim(),
    bioUrl: document.getElementById('f-bioUrl').value.trim(),
    minBookingHours: parseInt(document.getElementById('f-minBookingHours').value) || 4,
    weeklyAvailableHours: parseInt(document.getElementById('f-weeklyAvailableHours').value) || 20,
    certificateText: document.getElementById('f-certificateText').value.trim(),
    status: document.getElementById('f-status').value,
    certificates,
    availableTimes
  };

  let url = '/teacher/professional/addTeacherProfessionalInfo';
  if (currentMode === 'edit' && currentProfessionalId) {
    url = '/teacher/professional/updateTeacherProfessionalInfo';
    payload.teacherProfessionalId = currentProfessionalId;
  }

  try {
    const result = await request({ url, method: 'post', data: payload });
    if (result && result.code === 200) {
      alert(currentMode === 'add' ? '添加成功' : '修改成功');
      // 保存成功后重新加载最新数据，回到查看模式
      await loadTeacherInfo(currentTeacherId);
    } else {
      alert(result && result.message ? result.message : '操作失败');
    }
  } catch (e) {
    console.error('保存失败：', e);
    alert('保存失败：' + (e && e.message ? e.message : e));
  }
}

// ====================== 删除 ======================
async function deleteCurrent() {
  if (!currentProfessionalId) return;
  const name = originalData && originalData.name ? originalData.name : currentTeacherId;
  if (!confirm(`确认删除教师【${name}】的职业信息？此操作将级联删除其证书和可预约时间段。`)) return;
  try {
    const result = await request({
      url: '/teacher/professional/deleteTeacherProfessionalInfo',
      method: 'post',
      params: { teacherProfessionalId: currentProfessionalId }
    });
    if (result && result.code === 200) {
      alert('删除成功');
      // 删除后该教师回到"无职业信息"状态，重新加载会进入新增模式
      await loadTeacherInfo(currentTeacherId);
    } else {
      alert(result && result.message ? result.message : '删除失败');
    }
  } catch (e) {
    console.error('删除失败：', e);
    alert('删除失败：' + (e && e.message ? e.message : e));
  }
}

// ====================== 图片上传处理（FileReader → base64） ======================

/**
 * 通用：选择图片文件 → 读为 base64 → 写入隐藏字段 + 更新预览 <img>
 * @param {HTMLInputElement} fileInput  <input type="file">
 * @param {string} previewImgId        预览 <img> 的 id
 * @param {string} base64InputId       存放 base64 的隐藏 <input> id
 */
function handlePhotoSelect(fileInput, previewImgId, base64InputId) {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;
  // 简单校验类型与大小（限制 5MB，避免 base64 撑爆请求体）
  if (!file.type.startsWith('image/')) {
    alert('请选择图片文件');
    fileInput.value = '';
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    alert('图片不能超过 5MB');
    fileInput.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = function (e) {
    const base64 = e.target.result;  // data:image/xxx;base64,....
    const base64Input = document.getElementById(base64InputId);
    if (base64Input) base64Input.value = base64;
    const previewImg = document.getElementById(previewImgId);
    if (previewImg) {
      previewImg.src = base64;
      previewImg.style.display = '';
    }
    // 隐藏同容器的占位 div
    const placeholder = previewImg && previewImg.parentElement && previewImg.parentElement.querySelector('.photo-placeholder');
    if (placeholder) placeholder.style.display = 'none';
  };
  reader.onerror = function () {
    alert('图片读取失败，请重试');
  };
  reader.readAsDataURL(file);
}

/**
 * 证书行内选择图片：定位到同行 .cert-base64 隐藏字段 + .cert-thumb-img 预览图
 * @param {HTMLInputElement} fileInput  证书行内的 <input type="file" class="cert-file">
 */
function handleCertPhotoSelect(fileInput) {
  const row = fileInput.closest('.cert-row');
  if (!row) return;
  const base64Input = row.querySelector('.cert-base64');
  const previewImg = row.querySelector('.cert-thumb-img');
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    alert('请选择图片文件');
    fileInput.value = '';
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    alert('图片不能超过 5MB');
    fileInput.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = function (e) {
    const base64 = e.target.result;
    if (base64Input) base64Input.value = base64;
    if (previewImg) {
      previewImg.src = base64;
      previewImg.style.display = '';
    }
    // 隐藏缩略图容器内的占位 div
    const thumb = fileInput.closest('.cert-thumb');
    const placeholder = thumb && thumb.querySelector('.photo-placeholder');
    if (placeholder) placeholder.style.display = 'none';
  };
  reader.onerror = function () {
    alert('图片读取失败，请重试');
  };
  reader.readAsDataURL(file);
}

/**
 * 生成图片预览 HTML：始终包含一个 <img> 元素（无图时隐藏 + 占位）
 * 优先用 URL，其次用 base64，都没有则显示占位文字。
 * 始终保留 <img> 是为了让 handlePhotoSelect 能通过 id/class 找到目标 img 设置 src。
 * @param {string} url      图片URL
 * @param {string} base64   图片base64（可为 data URI 或纯 base64）
 * @param {string} imgCls   <img> 的 class
 */
function getPhotoImgHtml(url, base64, imgCls) {
  let src = '';
  if (url) {
    src = url;
  } else if (base64) {
    // 兼容纯 base64（无 data: 前缀）和完整 data URI
    src = base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`;
  }
  if (!src) {
    return `<img class="${imgCls}" src="" alt="" style="display:none;"><div class="photo-placeholder">无图片</div>`;
  }
  return `<img class="${imgCls}" src="${escapeAttr(src)}" alt="">`;
}

// ====================== 工具函数 ======================
function setContainerHtml(html) {
  const el = document.getElementById('form-container');
  if (el) el.innerHTML = html;
}

function setPageTitle(title) {
  const el = document.getElementById('page-title');
  if (el) el.textContent = title;
}

function renderError(msg) {
  setContainerHtml(`<div class="error-tip">${msg}</div>`);
  showActionButtons('error');
}

/** HTML 转义，防止数据中的尖括号破坏页面结构 */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 属性值转义（用于 input value="..." / href="..." 等） */
function escapeAttr(str) {
  return escapeHtml(str);
}
