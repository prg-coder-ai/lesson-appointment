/**
 * 教师职业信息维护 - 编辑/新增模式
 *
 * 迁移说明（2026-09-10）：原位于 api/src/main/resources/static/js/，
 * 前后端分离时被误删，本次随 teacherInfo.html 一并迁回 frontend。
 * 前后端分离后接口统一走 /api/v1，这里的裸路径由 utility_request.js
 * 的 normalizeUrl 自动补前缀，不需要手工拼接 API_BASE_URL。
 *
 * 依赖：api.js (escapeHtml/escapeAttr)、teacherInfo.js (DAY_OF_WEEK_MAP、currentMode 等模块状态)
 */

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

      <!-- 上传按钮：previousElementSibling 指向上面隐藏的 file input -->
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
  // 优先推荐复选框：勾选后，该行的 scheduleId 会成为对外发布页的直达预约链接
  const optionedHtml = `<label><input type="checkbox" class="cert-optioned" data-extra-scheduleid="${escapeAttr(t.scheduleId || '')}" ${t.optioned ? 'checked' : ''}>
        优先推荐</label>`;
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
      ${optionedHtml}
    </div>`;
}

/**
 * 时间段行：切换重复类型时控制 week/month 复选框显示 + 更新重复单位文本
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
  const container = document.getElementById('cert-rows');
  if (!container) return;
  const div = document.createElement('div');
  div.innerHTML = renderCertRow({});
  container.appendChild(div.firstElementChild);
}

function addTimeRow() {
  const container = document.getElementById('time-rows');
  if (!container) return;
  const div = document.createElement('div');
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  div.innerHTML = renderTimeRow({
    repeatType: 'none', repeatInterval: 1, repeatDays: '',
    startDate: `${yyyy}-${mm}-${dd}`, endDate: '',
    startTime: '09:00', endTime: '10:00', status: 'active',
    scheduleId: '',
    optioned: 0
  });
  container.appendChild(div.firstElementChild);
}

// ====================== 保存（新增 / 修改） ======================
async function saveForm() {
  const teacherIdEl = document.getElementById('f-teacherId');
  const teacherId = teacherIdEl ? teacherIdEl.value : '';
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

  // 收集时间段（与 admin-schedule.js 结构对齐：repeatType/interval/repeatDays/startDate/endDate/startTime/endTime）
  const availableTimes = [];
  document.querySelectorAll('#time-rows .sub-item-row').forEach(row => {
    const repeatTypeEl = row.querySelector('.time-repeatType');
    if (!repeatTypeEl) return;
    const repeatType = repeatTypeEl.value;
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
    const optionedEl = row.querySelector('.cert-optioned');
    const optioned = optionedEl ? (optionedEl.checked || 0) : 0;
    const scheduleId = (optionedEl && optionedEl.dataset && optionedEl.dataset.extraScheduleId) || '';
    if (startDate && startTime) {
      availableTimes.push({
        repeatType,
        repeatInterval,
        repeatDays: repeatDays || null,
        startDate: startDate || null,
        startTime,
        endTime,
        endDate: endDate || null,
        status: 'active',
        scheduleId: scheduleId,
        optioned: optioned ? 1 : 0
      });
    }
  });

  // ---- 时间段去重：按「日期+时间+重复规则」判重 ----
  const seenKeys = new Map();
  const filtedAvailableTimes = availableTimes.filter(t => {
    const key = [
      t.startDate, t.startTime, t.endDate, t.endTime,
      t.repeatType, t.repeatInterval,
      (t.repeatDays || '').split(',').sort().join(',')
    ].join('|');
    return !seenKeys.has(key) && seenKeys.set(key, true);
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
    availableTimes: filtedAvailableTimes
  };

  let url = '/teacher/professional/addTeacherProfessionalInfo';
  if (currentMode === 'edit' && currentProfessionalId) {
    url = '/teacher/professional/updateTeacherProfessionalInfo';
    payload.teacherProfessionalId = currentProfessionalId;
  }

  try {
    await request({ url, method: 'post', data: payload });
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
    await request({
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
 */
function handlePhotoSelect(fileInput, previewImgId, base64InputId) {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;
  // 限制 5MB，避免 base64 撑爆请求体
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
    const thumb = row.querySelector('.cert-thumb');
    const placeholder = thumb && thumb.querySelector('.photo-placeholder');
    if (placeholder) placeholder.style.display = 'none';
  };
  reader.onerror = function () {
    alert('图片读取失败，请重试');
  };
  reader.readAsDataURL(file);
}

/**
 * 生成图片预览 HTML：始终包含一个 <img>（无图时隐藏 + 占位），
 * 以便 handlePhotoSelect 能通过 id/class 找到目标 img 设置 src。
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
