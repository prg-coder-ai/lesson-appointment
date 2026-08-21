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
  switchSection('loading');
  showActionButtons('');

  try {
    const result = await request({
      url: '/teacher/professional/queryTeacherProfessionalInfo',
      params: { teacherId: teacherId }
    });
    // console.log("queryTeacherProfessionalInfo", result);
    if (!result) {  // 接口返回业务错误（如教师不存在）
      const msg = (result && result.message) ? result.message : '查询失败';
      renderError(msg);
      return;
    }
    // TeacherProfessionalDetailVO 结构
    const data = result;
    if (!data || !data.professional) {
      // 教师存在但还没有职业信息 → 进入新增模式
      originalData = buildEmptyForm(teacherId);
      currentProfessionalId = null;
      currentMode = 'add';
      setPageTitle('新增教师职业信息');
      fillEditForm(originalData, true);
      switchSection('edit');
      showActionButtons('edit');
      return;
    }

    // 已有职业信息 → 进入查看模式
    originalData = normalizeDetail(data);
    currentProfessionalId = data.professional.teacherProfessionalId;
    currentMode = 'view';
    setPageTitle(`教师职业信息 - ${data.name || data.account || teacherId}`);
    fillView(originalData);
    switchSection('view');
    showActionButtons('view');
  } catch (e) {
    console.error('加载教师职业信息失败：', e);
    renderError('加载失败：' + (e && e.message ? e.message : e));
    // Add: 接口异常时也进入新增模式
    originalData = buildEmptyForm(teacherId);
    currentProfessionalId = null;
    currentMode = 'add';
    setPageTitle('新增教师职业信息');
    fillEditForm(originalData, true);
    switchSection('edit');
    showActionButtons('edit');
  }
}

/**
 * 切换 #form-container 内的区域显示
 * mode: 'loading' | 'error' | 'view' | 'edit' | 'publish'
 */
function switchSection(mode) {
  const sections = {
    loading: document.getElementById('section-loading'),
    error:   document.getElementById('section-error'),
    view:    document.getElementById('section-view'),
    edit:    document.getElementById('section-edit'),
    publish: document.getElementById('section-publish')
  };
  Object.keys(sections).forEach(k => {
    if (sections[k]) sections[k].style.display = (k === mode) ? '' : 'none';
  });
}

// ====================== 数据规范化 ======================
/** 把后端返回的 detail 对象整理成 fillView/fillEditForm 期望的结构 */
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
      repeatType: t.repeatType || 'none',
      repeatInterval: t.repeatInterval != null ? t.repeatInterval : 1,
      repeatDays: t.repeatDays || '',
      startDate: t.startDate || '',
      endDate: t.endDate || '',
      startTime: (t.startTime || '09:00').substring(0, 5),
      endTime: (t.endTime || '17:00').substring(0, 5),
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
    availableTimes: (() => {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      return [{
        repeatType: 'none', repeatInterval: 1, repeatDays: '',
        startDate: `${yyyy}-${mm}-${dd}`, 
        endDate: `${yyyy}-${mm}-${dd}`,
        startTime: '09:00', endTime: '09:45', status: 'active'
      }];
    })()
  };
}

// ====================== 查看模式：填充数据（HTML 结构已预置在 teacherInfo.html）======================
function fillView(data) {
  // 状态文本
  const statusEl = document.getElementById('view-status');
  if (statusEl) {
    statusEl.innerHTML = data.status === 'active' ? '<span class="status-active">有效</span>'
      : data.status === 'frozen' ? '<span class="status-frozen">冻结</span>'
      : data.status === 'inactive' ? '<span class="status-inactive">失效</span>'
      : data.status === 'delete' ? '<span class="status-inactive">删除</span>'
      : escapeHtml(data.status || '-');
  }

  // 照片：优先 URL，其次 base64
  const photoEl = document.getElementById('view-photo');
  if (photoEl) {
    const src = data.personalPhotoUrl
      || (data.personalPhotoBase64
          ? (data.personalPhotoBase64.startsWith('data:') ? data.personalPhotoBase64 : 'data:image/png;base64,' + data.personalPhotoBase64)
          : '');
    photoEl.innerHTML = src
      ? `<img class="view-photo" src="${escapeAttr(src)}" alt="">`
      : '<div class="view-photo" style="display:flex;align-items:center;justify-content:center;color:#ccc;font-size:12px;">无照片</div>';
  }

  // 基本信息字段
  setText('view-name', data.name || '-');
  setText('view-account', data.account || '-');
  setText('view-phone', data.phone || '-');
  setText('view-email', data.email || '-');
  setText('view-subject', data.subject || '-');
  setText('view-userStatus', data.userStatus || '-');

  // 课时配置
  setText('view-minBookingHours', data.minBookingHours != null ? data.minBookingHours : '-');
  setText('view-weeklyAvailableHours', data.weeklyAvailableHours != null ? data.weeklyAvailableHours : '-');
  setText('view-certificateText', data.certificateText || '-');

  // 简介
  setText('view-bioText', data.bioText || '无');

  // 链接
  const bioUrlEl = document.getElementById('view-bioUrl');
  if (bioUrlEl) {
    bioUrlEl.innerHTML = data.bioUrl
      ? `<a href="${escapeAttr(data.bioUrl)}" target="_blank">${escapeHtml(data.bioUrl)}</a>`
      : '<span style="color:#999;">无</span>';
  }

  // 证书列表（动态行，仍用 innerHTML 拼接）
  const certEl = document.getElementById('view-certificates');
  if (certEl) {
    certEl.innerHTML = (data.certificates && data.certificates.length)
      ? data.certificates.map(c => {
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
  }

  // 时间段列表（动态行） ${escapeHtml(rptText)}
  const timeEl = document.getElementById('view-availableTimes');
  if (timeEl) {
    timeEl.innerHTML = (data.availableTimes && data.availableTimes.length)
      ? formAvaliableTimesDiv(data.availableTimes)
      : '<span style="color:#999;">无</span>';
  }

  // 元信息
  setText('view-createTime', data.createTime || '-');
  setText('view-updateTime', data.updateTime || '-');
  setText('view-teacherProfessionalId', data.teacherProfessionalId || '-');
}

/** 安全设置元素 textContent（自动转义） */
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

async function getAvailableTimesFromSchedule() {
  const teacherId = document.getElementById('f-teacherId').value;
  if (!teacherId) return;
  // 调用 API 获取可预约时间段
  let availableSchedulesList = "";
  const availableSchedules = await getAvailableTimesByAPI(teacherId);
  if (availableSchedules) {  // 时间段
    availableSchedulesList = availableSchedules.map(s => {
      const obj = { ...s };  // 浅拷贝，避免修改原对象
      obj.status = obj.status || 'active';
      obj.repeatType = obj.repeatType || 'none';
      obj.repeatInterval = obj.repeatInterval || 1;
      obj.repeatDays = obj.repeatDays || '';
      // 先从完整 datetime 提取时间部分（索引11~16 = "HH:mm"）
      const startFull = obj.startTime || '';
      const endFull = (obj.repeatType === 'none') ? startFull : obj.endTime || '';
      obj.startTime = startFull.length >= 16 ? startFull.substring(11, 16) : '-';
      obj.endTime = endFull.length >= 16 ? endFull.substring(11, 16) : '-';
      // 再截取日期部分（索引0~10 = "YYYY-MM-DD"）
      obj.startDate = startFull.length >= 10 ? startFull.substring(0, 10) : '-';
      obj.endDate = endFull.length >= 10 ? endFull.substring(0, 10) : '-';
      return obj;
    });
    appendAvailableTimes(availableSchedulesList);  // 添加可预约时间段到时间行中，不删除原来的可预约时间段
  }
}

async function getAvailableTimesByAPI(teacherId) {
  try {
    const data = await request(`/schedule/getAvailableSchedule?teacherId=${teacherId}`);
    return data;
  } catch (error) {
    console.error('Error fetching available times:', error);
    return null;
  }
}
// ====================== 编辑/新增模式：填充数据（HTML 结构已预置在 teacherInfo.html）======================
function fillEditForm(data, isAdd) {
  // 教师ID（只读）
  const teacherIdInput = document.getElementById('f-teacherId');
  const teacherIdDisplay = document.getElementById('f-teacherIdDisplay');
  if (teacherIdInput) teacherIdInput.value = data.teacherId || '';
  if (teacherIdDisplay) teacherIdDisplay.value = data.teacherId || '';

  // 教师姓名提示
  const nameHint = document.getElementById('f-teacherNameHint');
  if (nameHint) {
    if (data.name) {
      nameHint.textContent = '教师姓名：' + data.name;
      nameHint.style.display = '';
    } else {
      nameHint.style.display = 'none';
    }
  }

  // 学科
  const subjectSelect = document.getElementById('f-subject');
  if (subjectSelect) subjectSelect.value = data.subject || '';

  // 状态
  const statusSelect = document.getElementById('f-status');
  if (statusSelect) statusSelect.value = data.status || 'active';

  // 个人照片：URL + base64 + 预览
  const photoUrlInput = document.getElementById('f-personalPhotoUrl');
  if (photoUrlInput) photoUrlInput.value = data.personalPhotoUrl || '';

  const photoBase64Input = document.getElementById('f-personalPhotoBase64');
  if (photoBase64Input) photoBase64Input.value = data.personalPhotoBase64 || '';

  const previewImg = document.getElementById('photo-preview-img');
  const placeholder = document.querySelector('#photo-preview .photo-placeholder');
  const photoSrc = data.personalPhotoUrl
    || (data.personalPhotoBase64
        ? (data.personalPhotoBase64.startsWith('data:') ? data.personalPhotoBase64 : 'data:image/png;base64,' + data.personalPhotoBase64)
        : '');
  if (previewImg) {
    if (photoSrc) {
      previewImg.src = photoSrc;
      previewImg.style.display = '';
    } else {
      previewImg.src = '';
      previewImg.style.display = 'none';
    }
  }
  if (placeholder) placeholder.style.display = photoSrc ? 'none' : '';

  // 课时数
  const minHoursInput = document.getElementById('f-minBookingHours');
  if (minHoursInput) minHoursInput.value = data.minBookingHours != null ? data.minBookingHours : 4;
  const weeklyHoursInput = document.getElementById('f-weeklyAvailableHours');
  if (weeklyHoursInput) weeklyHoursInput.value = data.weeklyAvailableHours != null ? data.weeklyAvailableHours : 20;

  // 简介
  const bioTextInput = document.getElementById('f-bioText');
  if (bioTextInput) bioTextInput.value = data.bioText || '';

  // 链接
  const bioUrlInput = document.getElementById('f-bioUrl');
  if (bioUrlInput) bioUrlInput.value = data.bioUrl || '';

  // 证书描述
  const certTextInput = document.getElementById('f-certificateText');
  if (certTextInput) certTextInput.value = data.certificateText || '';

  // 证书行（动态生成）
  const certRows = document.getElementById('cert-rows');
  if (certRows) {
    certRows.innerHTML = '';
    if (data.certificates && data.certificates.length) {
      data.certificates.forEach(c => {
        const div = document.createElement('div');
        div.innerHTML = renderCertRow(c);
        certRows.appendChild(div.firstElementChild);
      });
    }
  }
  // 时间段行（动态生成）
  const timeRows = document.getElementById('time-rows');
  if (timeRows) {
    timeRows.innerHTML = '';
  }
  appendAvailableTimes(data.availableTimes);
}

/** 把可预约时间段添加到时间行中 */
function appendAvailableTimes(availableTimes) {
  const timeRows = document.getElementById('time-rows');
  if (timeRows) {
    if (availableTimes && availableTimes.length) {
      availableTimes.forEach(t => {
        const div = document.createElement('div');
        div.innerHTML = renderTimeRow(t);
        timeRows.appendChild(div.firstElementChild);
      });
    }
  }
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
  const repeatTypeOptions = ['none', 'day', 'week', 'month'].map(tp =>
    `<option value="${tp}" ${tp === (t.repeatType || 'none') ? 'selected' : ''}>${
      tp === 'none' ? '不重复' : tp === 'day' ? '天' : tp === 'week' ? '周' : '月'
    }</option>`
  ).join('');
  const weekChecks = [1, 2, 3, 4, 5, 6, 7].map(d => {
    const checked = (t.repeatDays || '').split(',').includes(String(d)) ? 'checked' : '';
    return `<label style="display:inline-block;margin-right:6px;"><input type="checkbox" class="rpt-day" value="${d}" ${checked}>${DAY_OF_WEEK_MAP[d]}</label>`;
  }).join('');
  const monthChecks = Array.from({ length: 31 }, (_, i) => i + 1).map(d => {
    const checked = (t.repeatDays || '').split(',').includes(String(d)) ? 'checked' : '';
    return `<label style="display:inline-block;margin-right:4px;"><input type="checkbox" class="rpt-day" value="${d}" ${checked}>${d}</label>`;
  }).join('');
  const weekStyle = (t.repeatType || 'none') === 'week' ? '' : 'display:none;';
  const monthStyle = (t.repeatType || 'none') === 'month' ? '' : 'display:none;';
  const unitStyle = (t.repeatType || 'none') === 'none' ? 'display:none;' : '';

  const unit = { none: '', day: '天', week: '周', month: '月' }[t.repeatType || 'none'] || '';
  return `
    <div class="sub-item-row" style="flex-wrap:wrap;gap:8px;">
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
        <span style="color:#666;font-size:12px;">日期</span>
        <input type="date" class="time-startDate" value="${escapeAttr(t.startDate || '')}">
        <span style="color:#666;font-size:12px;">至</span>
        <input type="date" class="time-endDate" value="${escapeAttr(t.endDate || '')}">
            <span style="color:#666;font-size:12px;">时间</span>
        <input type="time" class="time-startTime" value="${escapeAttr((t.startTime || '09:00').substring(0, 5))}">
        <span style="color:#666;font-size:12px;">至</span>
        <input type="time" class="time-endTime" value="${escapeAttr((t.endTime || '09:45').substring(0, 5))}">
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        <select class="time-repeatType" onchange="onTimeRepeatTypeChange(this)">${repeatTypeOptions}</select>
        <span class="repeat-label" style="color:#666;font-size:12px;${unitStyle}"> 重复周期</span>
        <input type="number" class="time-interval" style="${unitStyle};width:60px;" value="${t.repeatInterval != null ? t.repeatInterval : 1}" min="1">
        <span class="repeat-unit" style="color:#666;font-size:12px;${unitStyle}">${unit}</span>
      </div>
      <div class="time-weekDays" style="${weekStyle}width:100%;margin-top:2px;border-top:1px dashed #eee;padding-top:4px;">${weekChecks}</div>
      <div class="time-monthDays" style="${monthStyle}width:100%;margin-top:2px;border-top:1px dashed #eee;padding-top:4px;">${monthChecks}</div>
      <button class="btn btn-danger" onclick="this.closest('.sub-item-row').remove()" style="margin-left:auto;"><i class="fa fa-times"></i></button>
    </div>`;
}

/**
 * 时间段行：切换重复类型时控制 week/month 复选框显示 + 更新重复单位文本
 * 如果不重复，隐藏重复单位、重复周期和间隔输入框
 */
function onTimeRepeatTypeChange(selectEl) {
  const row = selectEl.closest('.sub-item-row');
  if (!row) return;
  const type = selectEl.value;
  const unit = { none: '', day: '天', week: '周', month: '月' }[type] || '';
  const unitEl = row.querySelector('.repeat-unit');
  if (unitEl) unitEl.textContent = unit;
  const weekBox = row.querySelector('.time-weekDays');
  const monthBox = row.querySelector('.time-monthDays');
  if (weekBox) weekBox.style.display = (type === 'week') ? '' : 'none';
  if (monthBox) monthBox.style.display = (type === 'month') ? '' : 'none';
  if (row.querySelector('.time-interval')) row.querySelector('.time-interval').style.display = (type === 'none') ? 'none' : '';
  if (row.querySelector('.repeat-unit')) row.querySelector('.repeat-unit').style.display = (type === 'none') ? 'none' : '';
  if (row.querySelector('.repeat-label')) row.querySelector('.repeat-label').style.display = (type === 'none') ? 'none' : '';
}

function addCertRow() {
  console.log("addCertRow");
  const container = document.getElementById('cert-rows');
  const div = document.createElement('div');
  div.innerHTML = renderCertRow({});
  container.appendChild(div.firstElementChild);
}

function addTimeRow() {
  const container = document.getElementById('time-rows');
  const div = document.createElement('div');
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  div.innerHTML = renderTimeRow({
    repeatType: 'none', repeatInterval: 1, repeatDays: '',
    startDate: `${yyyy}-${mm}-${dd}`, endDate: '',
    startTime: '09:00', endTime: '10:00', status: 'active'
  });
  container.appendChild(div.firstElementChild);
}

// ====================== 模式切换按钮（静态 HTML 已预置在 teacherInfo.html 的 #action-btns 中）======================
/**
 * 根据模式显示对应的按钮组，隐藏其余三组。
 * mode: 'view' | 'edit' | 'add' | 'error' | ''
 */
function showActionButtons(mode) {
  const btns = {
    view:    document.getElementById('btns-view'),
    edit:    document.getElementById('btns-edit'),
    add:     document.getElementById('btns-add'),
    error:   document.getElementById('btns-error'),
    publish: document.getElementById('btns-publish')
  };
  Object.keys(btns).forEach(k => {
    if (btns[k]) btns[k].style.display = (k === mode) ? '' : 'none';
  });
}

/** 进入编辑模式（从查看模式切换） */
function enterEditMode() {
  if (!originalData) return;
  currentMode = 'edit';
  fillEditForm(originalData, false);
  switchSection('edit');
  showActionButtons('edit');
}

/** 取消编辑，回到查看模式 */
function cancelEdit() {
  if (!originalData) return;
  currentMode = 'view';
  fillView(originalData);
  switchSection('view');
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
  // 收集时间段（与 admin-schedule.js 的 getFormData 结构对齐：repeatType/interval/repeatDays/startDate/endDate/startTime/endTime）
  const availableTimes = [];
  document.querySelectorAll('#time-rows .sub-item-row').forEach(row => {
    const repeatType = row.querySelector('.time-repeatType').value;
    const repeatInterval = parseInt(row.querySelector('.time-interval').value) || 1;
    // 根据 repeatType 读取对应容器中的复选框，逗号拼接
    const dayContainer = repeatType === 'week'
      ? row.querySelector('.time-weekDays')
      : repeatType === 'month' ? row.querySelector('.time-monthDays') : null;
    const repeatDays = dayContainer
      ? Array.from(dayContainer.querySelectorAll('.rpt-day:checked')).map(cb => cb.value).join(',')
      : '';
    const startDate = row.querySelector('.time-startDate').value;
    const startTime = row.querySelector('.time-startTime').value.trim();
    const endDate = (repeatType === 'none') ? startDate : row.querySelector('.time-endDate').value; 
    const endTime = row.querySelector('.time-endTime').value.trim();
    if (startDate && startTime) {
      availableTimes.push({
        repeatType,
        repeatInterval,
        repeatDays: repeatDays || null,
        startDate: startDate || null,
        startTime,
        endTime,
        endDate: endDate || null,
        status: 'active'
      });
    }
  });

  // ---- 新增：时间段去重 ---- 去除availableTimes中的重复项  
  const seenKeys = new Map();
  let filtedAvailableTimes = availableTimes.filter(t => {
    const key = [
      t.startDate, t.startTime, t.endDate, t.endTime,
      t.repeatType, t.repeatInterval,
      (t.repeatDays || '').split(',').sort().join(',')
    ].join('|');
    return !seenKeys.has(key) && seenKeys.set(key, true);
  });
  // ---- 去重结束 ----

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
    availableTimes: filtedAvailableTimes
  };

  let url = '/teacher/professional/addTeacherProfessionalInfo';
  if (currentMode === 'edit' && currentProfessionalId) {
    url = '/teacher/professional/updateTeacherProfessionalInfo';
    payload.teacherProfessionalId = currentProfessionalId;
  }

  try {
    const result = await request({ url, method: 'post', data: payload });
    alert(currentMode === 'add' ? '添加成功' : '修改成功');
    // 保存成功后重新加载最新数据，回到查看模式
    await loadTeacherInfo(currentTeacherId);
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
    alert('删除成功');
    // 删除后该教师回到"无职业信息"状态，重新加载会进入新增模式
    await loadTeacherInfo(currentTeacherId);
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
function setPageTitle(title) {
  const el = document.getElementById('page-title');
  if (el) el.textContent = title;
}

function renderError(msg) {
  const errorEl = document.getElementById('section-error');
  if (errorEl) errorEl.innerHTML = msg;
  switchSection('error');
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

// ====================== 发布/转发模式（enterPublishMode） ======================
// 发布模式字段清单（key 对应 fillView 中的字段，用于生成静态 HTML）
const PUBLISH_FIELDS_META = [
  { key: 'name',          label: '教师姓名', group: '基本信息', default: true },
  { key: 'account',       label: '账号',     group: '基本信息', default: false },
  { key: 'phone',         label: '手机',     group: '基本信息', default: false },
  { key: 'email',         label: '邮箱',     group: '基本信息', default: true },
  { key: 'subject',       label: '学科',     group: '基本信息', default: true },
  { key: 'status',        label: '职业信息状态', group: '基本信息', default: false },
  { key: 'userStatus',    label: '账号状态',    group: '基本信息', default: false },
  { key: 'photo',         label: '个人照片',    group: '基本信息', default: true },
  { key: 'minBookingHours',    label: '单次最小课时数', group: '课时配置', default: true },
  { key: 'weeklyAvailableHours', label: '每周可用课时上限', group: '课时配置', default: true },
  { key: 'certificateText',     label: '证书文字描述',  group: '课时配置', default: true },
  { key: 'bioText',       label: '简介文字',  group: '简介与链接', default: true },
  { key: 'bioUrl',        label: '简介链接',  group: '简介与链接', default: true },
  { key: 'certificates',  label: '证书图片列表', group: '证书', default: true },
  { key: 'availableTimes',label: '可预约时间段', group: '排期', default: true }
];

let publishPreviewTimer = null;     // 预览防抖
let publishCurrentDraftId = null;   // 正在编辑的草稿/发布 ID（null 表示新建）

/** 从配置（或默认值）取出字段勾选列表：[{key,label,group,enabled,sort}] */
function buildFieldListFromConfig(configJson) {
  const existing = {};
  if (configJson) {
    try {
      const arr = typeof configJson === 'string' ? JSON.parse(configJson) : configJson;
      (arr || []).forEach(x => { existing[x.key] = x; });
    } catch (_) { /* ignore */ }
  }
  return PUBLISH_FIELDS_META.map((m, i) => {
    const e = existing[m.key] || {};
    return {
      key: m.key, label: m.label, group: m.group,
      enabled: (e.enabled != null) ? !!e.enabled : !!m.default,
      sort: (e.sort != null) ? Number(e.sort) : i
    };
  }).sort((a, b) => a.sort - b.sort);
}

/** 读取样式配置（JSON 对象） */
function readStyleConfig() {
  return {
    fontFamily: document.getElementById('pub-fontFamily').value,
    fontSizePx: parseInt(document.getElementById('pub-fontSizePx').value) || 15,
    titleSizePx: parseInt(document.getElementById('pub-titleSizePx').value) || 22,
    photoSizePx: parseInt(document.getElementById('pub-photoSizePx').value) || 160,
    certSizePx: parseInt(document.getElementById('pub-certSizePx').value) || 120,
    accentColor: document.getElementById('pub-accentColor').value,
    bgColor: document.getElementById('pub-bgColor').value,
    cardBgColor: document.getElementById('pub-cardBgColor').value
  };
}

/** 把读取的 styleConfig 写到输入控件 */
function applyStyleConfigToInputs(cfg) {
  if (!cfg) return;
  ['fontFamily', 'accentColor', 'bgColor', 'cardBgColor'].forEach(k => {
    const el = document.getElementById('pub-' + k);
    if (el && cfg[k] != null) el.value = cfg[k];
  });
  ['fontSizePx', 'titleSizePx', 'photoSizePx', 'certSizePx'].forEach(k => {
    const el = document.getElementById('pub-' + k);
    if (el && cfg[k] != null) el.value = cfg[k];
  });
}

/** 渲染字段勾选列表（带复选框 + 上下移动排序按钮） */
function renderFieldCheckboxes(fieldList) {
  const box = document.getElementById('pub-fields');
  if (!box) return;
  const groupMap = {};
  fieldList.forEach((f, idx) => {
    (groupMap[f.group] = groupMap[f.group] || []).push({ ...f, idx });
  });
  box.innerHTML = Object.keys(groupMap).map(group => {
    return `<div style="margin-bottom:10px;">
      <div style="font-size:12px;color:#999;margin-bottom:4px;padding-left:4px;">${escapeHtml(group)}</div>
      ${groupMap[group].map(f => `
        <div style="display:flex;align-items:center;gap:6px;padding:3px 4px;border-radius:3px;"
             data-field-key="${escapeAttr(f.key)}" draggable="true">
          <label style="flex:1;display:flex;align-items:center;gap:6px;cursor:pointer;margin:0;font-size:13px;">
            <input type="checkbox" class="pub-field-chk" data-key="${escapeAttr(f.key)}" ${f.enabled ? 'checked' : ''}>
            <span>${escapeHtml(f.label)}</span>
          </label>
          <button type="button" class="btn btn-default pub-move" style="padding:1px 6px;font-size:11px;"
                  data-key="${escapeAttr(f.key)}" data-dir="up" title="上移">↑</button>
          <button type="button" class="btn btn-default pub-move" style="padding:1px 6px;font-size:11px;"
                  data-key="${escapeAttr(f.key)}" data-dir="down" title="下移">↓</button>
        </div>`).join('')}
    </div>`;
  }).join('');

  // 勾选框 → 防抖更新预览
  box.querySelectorAll('.pub-field-chk').forEach(chk => {
    chk.addEventListener('change', () => schedulePublishPreview());
  });
  // 上下移动按钮
  box.querySelectorAll('.pub-move').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-key');
      const dir = btn.getAttribute('data-dir');
      moveFieldOrder(key, dir);
    });
  });
  // 拖拽排序（简单版）
  let dragKey = null;
  box.querySelectorAll('[draggable="true"]').forEach(row => {
    row.addEventListener('dragstart', e => {
      dragKey = row.getAttribute('data-field-key');
    });
    row.addEventListener('dragover', e => e.preventDefault());
    row.addEventListener('drop', e => {
      e.preventDefault();
      const targetKey = row.getAttribute('data-field-key');
      if (dragKey && dragKey !== targetKey) {
        swapFieldOrder(dragKey, targetKey);
      }
      dragKey = null;
    });
  });
}

function getCurrentFieldListFromUI() {
  // 按当前 DOM 顺序重建（保留用户自定义排序）
  const rows = document.querySelectorAll('#pub-fields [draggable="true"]');
  const result = [];
  rows.forEach((row, sortIdx) => {
    const key = row.getAttribute('data-field-key');
    const chk = row.querySelector('.pub-field-chk');
    const meta = PUBLISH_FIELDS_META.find(m => m.key === key) || {};
    result.push({
      key, label: meta.label, group: meta.group,
      enabled: chk ? chk.checked : true, sort: sortIdx
    });
  });
  return result;
}

function swapFieldOrder(srcKey, targetKey) {
  const rows = Array.from(document.querySelectorAll('#pub-fields [draggable="true"]'));
  const srcIdx = rows.findIndex(r => r.getAttribute('data-field-key') === srcKey);
  const tgtIdx = rows.findIndex(r => r.getAttribute('data-field-key') === targetKey);
  if (srcIdx < 0 || tgtIdx < 0) return;
  const parent = rows[0].parentElement;
  // 仅支持同组（同一 parent）内交换
  const arr = Array.from(parent.querySelectorAll('[draggable="true"]'));
  const s = arr.findIndex(r => r.getAttribute('data-field-key') === srcKey);
  const t = arr.findIndex(r => r.getAttribute('data-field-key') === targetKey);
  if (s < 0 || t < 0) return;
  if (s < t) parent.insertBefore(arr[s], arr[t].nextSibling);
  else parent.insertBefore(arr[s], arr[t]);
  schedulePublishPreview();
}

function moveFieldOrder(key, dir) {
  const row = document.querySelector(`#pub-fields [data-field-key="${key}"]`);
  if (!row) return;
  const parent = row.parentElement;
  const sibling = dir === 'up' ? row.previousElementSibling : row.nextElementSibling;
  if (!sibling) return;
  if (dir === 'up') parent.insertBefore(row, sibling);
  else parent.insertBefore(sibling, row);
  schedulePublishPreview();
}

/** 全选/全不选 */
function pubToggleAll(on) {
  document.querySelectorAll('#pub-fields .pub-field-chk').forEach(c => {
    c.checked = !!on;
  });
  schedulePublishPreview();
}

/** 预览防抖 */
function schedulePublishPreview() {
  if (publishPreviewTimer) clearTimeout(publishPreviewTimer);
  publishPreviewTimer = setTimeout(() => renderPublishPreview('inline'), 120);
}

/** 生成可预约时间段的展示 HTML */
function formAvaliableTimesDiv(availableTimesList) {
  const lines = availableTimesList.map(t => {
    const rptText = { none: '', day: '', week: '每周', month: '每月' }[t.repeatType] || '';
    const dayText = (t.repeatDays && t.repeatDays.trim())
      ? `(${t.repeatDays.split(',').map(d => t.repeatType === 'week' ? (DAY_OF_WEEK_MAP[d] || d) : d).join('/')})`
      : (t.repeatInterval && t.repeatInterval > 1 ? ` 每${t.repeatInterval}${t.repeatType === 'day' ? '天' : t.repeatType === 'week' ? '周' : t.repeatType === 'month' ? '月' : ''}` : '');
    const dateRange = [t.startDate, (t.endDate || '')].filter(Boolean).join('~')
      + ((t.startTime || t.endTime) ? ' - ' + [(t.startTime || '').substring(0, 5), (t.endTime || '').substring(0, 5)].filter(Boolean).join('~') : '');
    return `<div>${escapeHtml(dateRange)} ${escapeHtml(rptText)} ${escapeHtml(dayText)}</div>`;
  }).join('');
  return lines;
}
/**
 * 根据当前勾选 + 样式 + originalData 生成发布页 HTML（纯字符串，不含任何外链）
 * mode: 'inline' 仅预览在页面内嵌容器中（可外链）
 * mode: 'standalone' 生成独立可保存的完整 HTML（含 <!DOCTYPE html> 等）
 */
function generatePublishHtml(mode) {
  const style = readStyleConfig();
  const fields = getCurrentFieldListFromUI().filter(f => f.enabled);
  const data = originalData || {};
  const fset = new Set(fields.map(f => f.key));

  // 工具：取数据值
  const getPhotoSrc = () => {
    const p = data.personalPhotoBase64 || data.personalPhotoUrl || '';
    return p;
  };

  // 基本信息和课时配置的字段会单独渲染到卡片中，rowsHtml 跳过这些字段以避免重复 , 'photo'
  const basicKeys = ['name', 'account', 'phone', 'email', 'subject', 'status', 'userStatus', 'photo'];
  const lessonKeys = ['minBookingHours', 'weeklyAvailableHours', 'certificateText'];

  // 字段按顺序渲染
  const rowsHtml = fields.map(f => {
    // 跳过已由 basicHtml / lessonHtml 单独渲染的字段
    if (basicKeys.includes(f.key) || lessonKeys.includes(f.key)) return '';

    const v = {
      name: data.name, account: data.account, phone: data.phone,
      email: data.email, subject: data.subject,
      status: data.status, userStatus: data.userStatus,
      minBookingHours: data.minBookingHours,
      weeklyAvailableHours: data.weeklyAvailableHours,
      certificateText: data.certificateText,
      bioText: data.bioText,
      bioUrl: data.bioUrl
    }[f.key];
    if (f.key === 'certificates') {
      if (!data.certificates || !data.certificates.length) return '';
      const imgs = data.certificates.map(c => {
        const src = c.certBase64 || c.certUrl || '';
        if (!src) return '';
        return `<figure style="display:inline-block;margin:6px;text-align:center;">
          <img src="${escapeAttr(src)}" alt="${escapeAttr(c.certName || '')}"
               style="width:${style.certSizePx}px;height:${style.certSizePx}px;object-fit:cover;border-radius:6px;border:1px solid #eee;">
          <figcaption style="font-size:12px;color:#666;margin-top:4px;">${escapeHtml(c.certName || '')}</figcaption>
        </figure>`;
      }).join('');
      return `<section style="margin-bottom:16px;">
        <h3 style="margin:0 0 8px 0;color:${style.accentColor};font-size:${style.fontSizePx + 2}px;">资格证书</h3>
        <div>${imgs || '<span style="color:#999;">无</span>'}</div></section>`;
    }
    if (f.key === 'availableTimes') {
      if (!data.availableTimes || !data.availableTimes.length) return '';
      const lines = formAvaliableTimesDiv(data.availableTimes);
      return `<section style="margin-bottom:16px;">
        <h3 style="margin:0 0 8px 0;color:${style.accentColor};font-size:${style.fontSizePx + 2}px;">可预约时间</h3>
        <div>${lines}</div></section>`;
    }
    if (f.key === 'bioText') {
      if (!v) return '';
      return `<section style="margin-bottom:16px;">
        <h3 style="margin:0 0 8px 0;color:${style.accentColor};font-size:${style.fontSizePx + 2}px;">简介</h3>
        <div style="white-space:pre-wrap;line-height:1.7;">${escapeHtml(v)}</div></section>`;
    }
    if (f.key === 'bioUrl') {
      if (!v) return '';
      return `<section style="margin-bottom:16px;">
        <h3 style="margin:0 0 8px 0;color:${style.accentColor};font-size:${style.fontSizePx + 2}px;">外部链接</h3>
        <a href="${escapeAttr(v)}" target="_blank" rel="noopener" style="color:${style.accentColor};word-break:break-all;">${escapeHtml(v)}</a></section>`;
    }
    // 基本字段 key-value
    return `<div style="display:flex;gap:12px;margin-bottom:6px;">
      <div style="width:140px;color:#666;flex-shrink:0;">${escapeHtml(f.label)}</div>
      <div style="color:#222;flex:1;word-break:break-all;">${escapeHtml(String(v ?? '')) || '<span style="color:#bbb;">-</span>'}</div>
    </div>`;
  }).join('');

  const title = document.getElementById('pub-title').value.trim()
    || ((data.name || '教师') + ' 个人介绍');

  // 基本信息 key-value 单独放到一个卡片（basicKeys/lessonKeys 已在上方定义）
  let basicHtml = '';
  if (basicKeys.some(k => fset.has(k))) {
    const rows = fields.filter(f => basicKeys.includes(f.key) && f.key !== 'photo').map(f => {
      const v = { name: data.name, account: data.account, phone: data.phone,
        email: data.email, subject: data.subject, status: data.status,
        userStatus: data.userStatus }[f.key];
      return `<div style="display:flex;gap:12px;margin-bottom:6px;">
        <div style="width:120px;color:#666;flex-shrink:0;">${escapeHtml(f.label)}</div>
        <div style="color:#222;flex:1;word-break:break-all;">${escapeHtml(String(v ?? '')) || '<span style="color:#bbb;">-</span>'}</div>
      </div>`;
    }).join('');
    basicHtml = `<section style="margin-bottom:16px;">
      <h3 style="margin:0 0 8px 0;color:${style.accentColor};font-size:${style.fontSizePx + 2}px;">基本信息</h3>
      <div style="background:${style.cardBgColor};padding:12px 16px;border-radius:8px;">${rows}</div>
    </section>`;
  }

  let lessonHtml = '';
  if (lessonKeys.some(k => fset.has(k))) {
    const rows = fields.filter(f => lessonKeys.includes(f.key)).map(f => {
      const v = { minBookingHours: data.minBookingHours,
        weeklyAvailableHours: data.weeklyAvailableHours,
        certificateText: data.certificateText }[f.key];
      return `<div style="display:flex;gap:12px;margin-bottom:6px;">
        <div style="width:150px;color:#666;flex-shrink:0;">${escapeHtml(f.label)}</div>
        <div style="color:#222;flex:1;word-break:break-all;">${escapeHtml(String(v ?? '')) || '<span style="color:#bbb;">-</span>'}</div>
      </div>`;
    }).join('');
    lessonHtml = `<section style="margin-bottom:16px;">
      <h3 style="margin:0 0 8px 0;color:${style.accentColor};font-size:${style.fontSizePx + 2}px;">课时配置</h3>
      <div style="background:${style.cardBgColor};padding:12px 16px;border-radius:8px;">${rows}</div>
    </section>`;
  }

  // 把 basicHtml / lessonHtml 从 rowsHtml 里移除（已经单独渲染了）
  const othersHtml = fields
    .filter(f => !basicKeys.includes(f.key) && !lessonKeys.includes(f.key))
    .filter(f => !['bioText', 'bioUrl', 'certificates', 'availableTimes'].includes(f.key))
    .map(f => '').join(''); // 其他字段已在 rowsHtml 中的 key-value 区块处理过

  const photoHtml = fset.has('photo') && getPhotoSrc()
    ? `<div style="flex-shrink:0;text-align:center;">
         <img src="${escapeAttr(getPhotoSrc())}" alt="${escapeHtml(data.name || '照片')}"
              style="width:${style.photoSizePx}px;height:${style.photoSizePx}px;object-fit:cover;border-radius:12px;border:1px solid #eee;">
       </div>`
    : '';

  const headerHtml = `
    <header style="display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap;margin-bottom:24px;">
      ${photoHtml}
      <div style="flex:1;min-width:240px;">
        <h1 style="margin:0 0 8px 0;color:${style.accentColor};font-size:${style.titleSizePx}px;">${escapeHtml(title)}</h1>
        <div style="color:#666;font-size:${Math.max(12, style.fontSizePx - 2)}px;">${escapeHtml(data.subject || '')} · ${escapeHtml((data.userStatus === 'active' || data.status === 'active') ? '状态：在职' : '')}</div>
      </div>
    </header>`;

  const bodyInner = `${headerHtml}${basicHtml}${lessonHtml}${rowsHtml}${othersHtml}
    <footer style="margin-top:32px;padding-top:12px;border-top:1px solid #eee;color:#999;font-size:12px;text-align:center;">
      发布时间：${new Date().toLocaleString()}
    </footer>`;

  const cssBlock = `
    body { margin:0; padding:24px; background:${style.bgColor}; font-family:${style.fontFamily}; font-size:${style.fontSizePx}px; color:#222; line-height:1.6; }
    .publish-wrapper { max-width:900px; margin:0 auto; background:#fff; padding:32px; border-radius:12px; box-shadow:0 2px 12px rgba(0,0,0,0.06); }
    img { max-width:100%; height:auto; }
    * { box-sizing:border-box; }
  `;

  if (mode === 'standalone') {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${cssBlock}</style>
</head>
<body>
  <div class="publish-wrapper">${bodyInner}</div>
</body>
</html>`;
  }
  // inline 模式：只放 wrapper
  return `<div class="publish-wrapper" style="font-family:${style.fontFamily};font-size:${style.fontSizePx}px;color:#222;background:${style.bgColor};padding:24px;border-radius:12px;">
    <style>${cssBlock}</style>
    ${bodyInner}
  </div>`;
}

function renderPublishPreview(mode) {
  const preview = document.getElementById('pub-preview');
  if (!preview) return;
  try {
    preview.innerHTML = generatePublishHtml('inline');
  } catch (e) {
    preview.innerHTML = '<div style="color:#f5222d;">预览渲染失败：' + escapeHtml(e.message) + '</div>';
  }
}

/** 进入发布模式 */
async function enterPublishMode() {
  if (!originalData) {
    alert('请先加载或创建教师职业信息后再发布');
    return;
  }
  if (!currentTeacherId) {
    alert('缺少 teacherId，无法进入发布模式');
    return;
  }
  currentMode = 'publish';
  switchSection('publish');
  showActionButtons('publish');

  // 初始化标题
  const titleEl = document.getElementById('pub-title');
  if (titleEl && !titleEl.value) {
    titleEl.value = (originalData.name || '教师') + ' · ' + (originalData.subject || '个人介绍');
  }
  // 初始化字段勾选（如果有草稿，稍后会覆盖）
  if (document.getElementById('pub-fields').children.length === 0) {
    renderFieldCheckboxes(buildFieldListFromConfig(null));
  }
  // 样式默认值（控件已有 HTML value，无需再写）

  // 绑定样式控件 change/input → 防抖预览
  const styleIds = ['pub-fontFamily', 'pub-accentColor', 'pub-bgColor', 'pub-cardBgColor',
                    'pub-fontSizePx', 'pub-titleSizePx', 'pub-photoSizePx', 'pub-certSizePx'];
  styleIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.removeEventListener('input', schedulePublishPreview);
      el.removeEventListener('change', schedulePublishPreview);
      el.addEventListener('input', schedulePublishPreview);
      el.addEventListener('change', schedulePublishPreview);
    }
  });
  document.getElementById('pub-title').addEventListener('input', schedulePublishPreview);

  // 历史版本下拉
  await loadPublishHistorySelect();

  // 默认预览
  renderPublishPreview('inline');
}

function exitPublishMode() {
  currentMode = 'view';
  switchSection('view');
  showActionButtons('view');
}

async function loadPublishHistorySelect() {
  const sel = document.getElementById('pub-history');
  if (!sel) return;
  const placeholder = sel.firstElementChild; // <option value="">-- 新建 --</option>
  sel.innerHTML = '';
  if (placeholder) sel.appendChild(placeholder);
  try {
    const list = await request({
      url: '/teacher/published/list',
      method: 'GET',
      params: { teacherId: currentTeacherId }
    });
    publishCurrentDraftId = null;
    (list || []).forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.publishedProfileId;
      const timeTxt = item.updateTime ? new Date(item.updateTime).toLocaleString() : '';
      const statusTxt = item.status === 'published' ? '【已发布】' : item.status === 'archived' ? '【归档】' : '【草稿】';
      opt.textContent = statusTxt + ' ' + (item.title || '无标题') + (timeTxt ? ' · 更新于 ' + timeTxt : '');
      sel.appendChild(opt);
    });
  } catch (e) {
    console.warn('加载历史版本失败：', e);
  }
}

async function loadPublishHistory(profileId) {
  if (!profileId) {
    // 切到"新建"：还原默认值 + 清 draftId
    publishCurrentDraftId = null;
    renderFieldCheckboxes(buildFieldListFromConfig(null));
    applyStyleConfigToInputs(null);
    renderPublishPreview('inline');
    return;
  }
  try {
    const item = await request({
      url: '/teacher/published/get',
      method: 'GET',
      params: { publishedProfileId: profileId }
    });
    publishCurrentDraftId = item && item.publishedProfileId;
    document.getElementById('pub-title').value = item && item.title || '';
    applyStyleConfigToInputs(item && item.styleConfig);
    renderFieldCheckboxes(buildFieldListFromConfig(item && item.fieldConfig));
    // 若有 draftData 快照（可能与 current originalData 不同版本），优先用其回填
    if (item && item.draftData) {
      try {
        const d = typeof item.draftData === 'string' ? JSON.parse(item.draftData) : item.draftData;
        if (d) originalData = d; // 允许临时快照覆盖
      } catch (_) {}
    }
    renderPublishPreview('inline');
  } catch (e) {
    console.error('加载历史版本失败：', e);
    alert('加载失败：' + (e && e.message ? e.message : e));
  }
}

/** 收集当前表单（给后端 save 接口用） */
function collectPublishPayload() {
  const fields = getCurrentFieldListFromUI();
  const styleCfg = readStyleConfig();
  const staticHtml = generatePublishHtml('standalone');
  return {
    publishedProfileId: publishCurrentDraftId || null,
    teacherId: currentTeacherId,
    teacherProfessionalId: originalData && originalData.teacherProfessionalId || null,
    title: document.getElementById('pub-title').value.trim()
      || ((originalData && originalData.name || '教师') + ' 个人介绍'),
    fieldConfig: JSON.stringify(fields),
    styleConfig: JSON.stringify(styleCfg),
    draftData: JSON.stringify(originalData),
    staticHtml: staticHtml
  };
}

async function savePublishDraft() {
  try {
    const payload = collectPublishPayload();
    payload.status = 'draft';
    payload.staticHtml = generatePublishHtml('standalone'); // 草稿也保留静态HTML
    const res = await request({ url: '/teacher/published/save', method: 'post', data: payload });
    if (res && res.publishedProfileId) {
      publishCurrentDraftId = res.publishedProfileId;
      await loadPublishHistorySelect();
      document.getElementById('pub-history').value = res.publishedProfileId;
      alert('草稿已保存');
    } else {
      alert('保存草稿失败');
    }
  } catch (e) {
    console.error('保存草稿失败：', e);
    alert('保存失败：' + (e && e.message ? e.message : e));
  }
}

function previewPublish() {
  const win = window.open('', '_blank');
  if (!win) {
    alert('浏览器阻止了弹窗，请允许本站弹窗后重试');
    return;
  }
  win.document.write(generatePublishHtml('standalone'));
  win.document.close();
}

async function submitPublish() {
  // 至少要勾选 1 个字段 + 有标题
  const fields = getCurrentFieldListFromUI().filter(f => f.enabled);
  if (fields.length === 0) {
    alert('请至少勾选 1 个要发布的字段');
    return;
  }
  const title = document.getElementById('pub-title').value.trim();
  if (!title) {
    alert('请填写发布标题');
    return;
  }
  if (!confirm(`确认发布【${title}】？发布后将作为该教师对外展示的最新版本（旧版本自动归档）。`)) {
    return;
  }
  try {
    const payload = collectPublishPayload();
    payload.status = 'published';
    const res = await request({ url: '/teacher/published/save', method: 'post', data: payload });
    if (res && res.publishedProfileId) {
      publishCurrentDraftId = res.publishedProfileId;
      await loadPublishHistorySelect();
      document.getElementById('pub-history').value = res.publishedProfileId;
      // 给出公开访问链接提示——按照教师ID，为最后发布的
      const link = location.origin + location.pathname.replace(/teacherInfo\.html.*$/, '')
        + 'teacherPublishedProfile.html?teacherId=' + encodeURIComponent(currentTeacherId);
      alert(`发布成功！\n\n公开访问链接：\n${link}\n\n（已复制到剪贴板）`);
      try { navigator.clipboard.writeText(link); } catch (_) {}
    } else {
      alert('发布失败');
    }
  } catch (e) {
    console.error('发布失败：', e);
    alert('发布失败：' + (e && e.message ? e.message : e));
  }
}

 function installLinkCopyAndImageSaveHandlers() {
// 1. 复制链接 ---查看

const copyLinkBtn = document.getElementById('copyLinkBtn');
copyLinkBtn.addEventListener('click', async () => {
  //读取pub-history的当前选中项  
  //获取当前版本，如果是草稿，则提示用户先发布  
  
  let profileId ="";
   
    const sel = document.getElementById('pub-history');
    const selectedOption = sel.options[sel.selectedIndex];

    console.log("index---",sel.selectedIndex,"v",sel.value);

    if (sel.value.length ==0) {//第一行，新建。
      alert('请先选择正确的版本或者发布版本后再复制链接。');
      return;
    }
    if (selectedOption && selectedOption.textContent.includes('【草稿】')) {
      alert('当前版本是草稿，无法生成公开访问链接，请先发布。');
      return;
    }
    profileId = sel.value; 
  // 给出公开访问链接提示，通过历史id获取当前版本的链接，
      const url = location.origin + location.pathname.replace(/teacherInfo\.html.*$/, '')
        + 'teacherPublishedProfile.html?profileId=' + encodeURIComponent(profileId);
  
  try {
    await navigator.clipboard.writeText(url);
    alert('链接已复制：' + url);
  } catch (err) {
    // 兼容不支持clipboard的浏览器
    const input = document.createElement('input');
    input.value = url;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    alert('链接已复制');
  }
});


/**
 * html2canvas 区域截图 + 保存位置选择工具
 * 依赖：全局 html2canvas（CDN 引入）
 *
 * - captureElement(target)：截取指定 div/元素（含 overflow 隐藏的完整内容）
 * - captureFullPage()：整页，等价于 captureElement(document.body)
 * - saveWithPicker()：弹出系统保存对话框，用户选择保存位置和文件名
 *                     （File System Access API；不支持的浏览器兜底为默认下载）
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function canvasToBlob(canvas, mime, quality) {
  return new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('canvas.toBlob 失败'))), mime, quality)
  );
}

/**
 * 递归展开 target 内所有可滚动子容器（overflow:auto/scroll 且有隐藏内容），
 * 返回恢复函数。截图前调用，让内嵌滚动区的隐藏内容全部可见。
 */
function expandInnerScrollContainers(root) {
  const changed = [];
  const walk = (node) => {
    for (const child of node.children) {
      const cs = getComputedStyle(child);
      const scrollable =
        cs.overflowY === 'auto' || cs.overflowY === 'scroll' ||
        cs.overflow === 'auto' || cs.overflow === 'scroll';
      if (scrollable && child.scrollHeight > child.clientHeight) {
        changed.push({
          node: child,
          overflow: child.style.overflow,
          overflowY: child.style.overflowY,
          height: child.style.height,
          maxHeight: child.style.maxHeight,
        });
        child.style.overflow = 'visible';
        child.style.overflowY = 'visible';
        child.style.maxHeight = 'none';
        child.style.height = 'auto';
      }
      walk(child);
    }
  };
  walk(root);
  return () => changed.forEach((c) => {
    c.node.style.overflow = c.overflow;
    c.node.style.overflowY = c.overflowY;
    c.node.style.height = c.height;
    c.node.style.maxHeight = c.maxHeight;
  });
}
/**
 * 截取指定元素（div 等）为 canvas
 * @param {HTMLElement|string} target 元素或 CSS 选择器
 * @param {Object} [options]
 * @param {number}  [options.scale]          高清倍数，默认 devicePixelRatio
 * @param {boolean} [options.fullContent=true] 是否展开自身及内嵌滚动容器的 overflow 隐藏内容（截全）
 * @param {string}  [options.backgroundColor='#ffffff']
 * @returns {Promise<HTMLCanvasElement>}
 */
async function captureElement(target, options = {}) {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) throw new Error('找不到目标元素: ' + target);

  const {
    scale = window.devicePixelRatio || 1,
    fullContent = true,
    backgroundColor = '#ffffff',
  } = options;

  // 临时展开目标元素自身 + 内嵌滚动容器的 overflow 限制，让隐藏内容全部可见，截完恢复
  let restoreSelf = () => {};
  let restoreInner = () => {};
  if (fullContent) {
    const snap = { overflow: el.style.overflow, height: el.style.height, maxHeight: el.style.maxHeight };
    el.style.overflow = 'visible';
    el.style.maxHeight = 'none';
    el.style.height = 'auto';
    restoreSelf = () => {
      el.style.overflow = snap.overflow;
      el.style.height = snap.height;
      el.style.maxHeight = snap.maxHeight;
    };
    await sleep(50); // 等待重排
    restoreInner = expandInnerScrollContainers(el); // 递归展开内嵌滚动区
    await sleep(50);
  }

  try {
    return await html2canvas(el, {
      width: el.scrollWidth,
      height: el.scrollHeight,
      windowWidth: document.documentElement.scrollWidth,
      windowHeight: document.documentElement.scrollHeight,
      scrollX: 0,
      scrollY: 0,
      x: 0,
      y: 0,
      scale,
      useCORS: true,
      backgroundColor,
      logging: false,
    });
  } finally {
    restoreInner();
    restoreSelf();
  }
}

/** 整页截图便捷封装 */
function captureFullPage(options = {}) {
  return captureElement(document.body, options);
}

/**
 * 保存 canvas：优先弹出系统保存对话框让用户选位置；不支持则兜底下载
 * @param {HTMLCanvasElement} canvas
 * @param {string} [suggestedName='screenshot'] 建议文件名（不含扩展名）
 * @param {string} [type='png'] 'png' | 'jpg'
 * @param {number} [quality=0.92] JPEG 质量
 * @returns {Promise<{saved:boolean, via:string, name?:string, reason?:string}>}
 */
async function saveWithPicker(canvas, suggestedName = 'screenshot', type = 'png', quality = 0.92) {
  const isJpg = type === 'jpg';
  const mime = isJpg ? 'image/jpeg' : 'image/png';
  const ext = isJpg ? 'jpg' : 'png';
  const blob = await canvasToBlob(canvas, mime, quality);

  // File System Access API：真正的系统保存对话框，可选目录和文件名
  if (typeof window.showSaveFilePicker === 'function') {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: `${suggestedName}.${ext}`,
        types: [{ description: `${ext.toUpperCase()} 图片`, accept: { [mime]: [`.${ext}`] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { saved: true, via: 'picker', name: handle.name };
    } catch (e) {
      if (e.name === 'AbortError') return { saved: false, via: 'picker', reason: '用户取消' };
      throw e;
    }
  }

  // 兜底：a[download]，存到浏览器默认下载目录（无法选位置）
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${suggestedName}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { saved: true, via: 'download', name: `${suggestedName}.${ext}` };
}

/* ===== 用法 =====
// 必须在用户点击等手势中调用（showSaveFilePicker 要求用户激活）
document.getElementById('btn').addEventListener('click', async () => {
  // 1. 截取指定 div
  const canvas = await captureElement('#my-div', { scale: 2 });
  //   或整页：const canvas = await captureFullPage({ scale: 2 });

  // 2. 弹出保存对话框，用户选位置和文件名
  const r = await saveWithPicker(canvas, 'my-div', 'png');
  if (r.saved) console.log('已保存:', r.name, r.via === 'picker' ? '（你选择的位置）' : '（默认下载目录）');
  else console.log('未保存:', r.reason);

  // 也可存为 jpg：saveWithPicker(canvas, 'my-div', 'jpg', 0.9);
});
*/

// 2. 保存预览区域为JPG图片
const saveImageBtn = document.getElementById('saveImageBtn');
const previewWrap = document.getElementById('pub-preview'); 
/*
html2canvas(document.body, {
  width, height,
  windowWidth: width, windowHeight: height,
  scrollX: 0, scrollY: 0, x: 0, y: 0,
  scale: 2, useCORS: true,
}); */
  
 

saveImageBtn.addEventListener('click', async () => {
  let suggestedName="";
  const sel = document.getElementById('pub-history');
 
   if (sel.value.length ==0) 
    { let titleEl= document.getElementById("pub-title");
      //获取titleEl的字符串  
      suggestedName= titleEl.value;
    } else {
      const selectedOption = sel.options[sel.selectedIndex];
      suggestedName= selectedOption.textContent;//历史版本的列表显示名称
    }

  try {
    const canvas = await captureElement(previewWrap, { 
      useCORS: true,    // 解决跨域图片空白
      scale: window.devicePixelRatio
    });
    // 转JPG，质量0.9
    const imgUrl = canvas.toDataURL('image/jpeg', 0.9);

    const a = document.createElement('a');
    a.href = imgUrl;
    a.download = suggestedName+'.jpg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (e) {
    console.error('截图失败', e);
    alert('生成图片失败，请重试');
  }
});
 }