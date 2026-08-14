/**
 * 教师职业信息维护 - 前端业务逻辑
 * 依赖：utility_request.js (window.request)、api.js (getCurrentUserInfo)、
 *       auth.js (handleLogout)、pagefoot.js (Pagination / assignLoadobjectListFunction / renderPagination)
 * 对应 notes §5 前端页面设计
 */
window.renderTeacherInfoList = loadAndRenderList;

// 当前编辑的表单状态（新增时为 null）
let currentEditingId = null;
// 教师下拉选项缓存
let teacherOptionsCache = [];

const SUBJECT_OPTIONS = ['英语', '日语', '韩语', '法语', '德语', '西班牙语'];
const DAY_OF_WEEK_MAP = { 1: '周一', 2: '周二', 3: '周三', 4: '周四', 5: '周五', 6: '周六', 7: '周日' };

// ================================================================
// 列表加载与渲染
// ================================================================
async function loadAndRenderList() {
  const params = new URLSearchParams({
    pageNum: Pagination.pageNum,
    pageSize: Pagination.pageSize,
    name: document.getElementById('search-name').value.trim(),
    account: document.getElementById('search-account').value.trim(),
    phone: document.getElementById('search-phone').value.trim(),
    email: document.getElementById('search-email').value.trim(),
    subject: document.getElementById('search-subject').value.trim(),
    status: document.getElementById('search-status').value
  });

  try {
    const result = await request({ url: `/teacher/professional/listByPage?${params.toString()}` });
    if (result && result.data) {
      const pageData = result.data;
      Pagination.total = pageData.total || 0;
      Pagination.totalPages = pageData.totalPages || 0;
      renderTable(pageData.rows || []);
      renderPagination(Pagination);
    } else {
      Pagination.total = 0;
      Pagination.totalPages = 0;
      renderTable([]);
      renderPagination(Pagination);
    }
  } catch (error) {
    console.error('加载教师职业信息列表失败：', error);
    renderTable([]);
  }
}

function renderTable(rows) {
  const tbody = document.getElementById('list-tbody');
  if (!rows || rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="12" class="empty-tip">暂无数据</td></tr>';
    return;
  }
  let index = (Pagination.pageNum - 1) * Pagination.pageSize;
  let html = '';
  rows.forEach(item => {
    index++;
    const photoHtml = item.personalPhotoUrl
      ? `<img class="photo-thumb" src="${item.personalPhotoUrl}" alt="">`
      : (item.firstCertificateUrl ? `<img class="photo-thumb" src="${item.firstCertificateUrl}" alt="">` : '<div class="photo-thumb"></div>');
    const statusText = item.status === 'active' ? '<span class="status-active">有效</span>'
      : item.status === 'frozen' ? '<span class="status-frozen">冻结</span>'
      : item.status === 'inactive' ? '<span class="status-inactive">失效</span>'
      : item.status || '';
    const bioText = item.bioText ? (item.bioText.length > 30 ? item.bioText.substring(0, 30) + '...' : item.bioText) : '';
    html += `
      <tr>
        <td>${index}</td>
        <td>${photoHtml}</td>
        <td>${item.name || ''}</td>
        <td>${item.account || ''}</td>
        <td>${item.phone || ''}</td>
        <td>${item.email || ''}</td>
        <td>${item.subject || ''}</td>
        <td title="${item.bioText || ''}">${bioText}</td>
        <td>${item.certificateCount || 0}</td>
        <td>${item.weeklyAvailableHours || 0}</td>
        <td>${statusText}</td>
        <td>
          <button class="btn btn-default" onclick="viewDetail('${item.teacherProfessionalId}')"><i class="fa fa-eye"></i></button>
          <button class="btn btn-warning" onclick="openEditModal('${item.teacherProfessionalId}')"><i class="fa fa-edit"></i></button>
          <button class="btn btn-danger" onclick="deleteItem('${item.teacherProfessionalId}', '${item.name || ''}')"><i class="fa fa-trash"></i></button>
        </td>
      </tr>`;
  });
  tbody.innerHTML = html;
}

function searchList() {
  Pagination.pageNum = 1;
  loadAndRenderList();
}

function resetFilter() {
  document.getElementById('search-name').value = '';
  document.getElementById('search-account').value = '';
  document.getElementById('search-phone').value = '';
  document.getElementById('search-email').value = '';
  document.getElementById('search-subject').value = '';
  document.getElementById('search-status').value = '';
  Pagination.pageNum = 1;
  loadAndRenderList();
}

// ================================================================
// 新增/编辑弹窗
// ================================================================
async function openAddModal() {
  currentEditingId = null;
  document.getElementById('modal-title').innerHTML = '新增教师职业信息';
  await ensureTeacherOptions();
  renderForm({
    teacherId: '',
    subject: '',
    personalPhotoUrl: '',
    bioText: '',
    bioUrl: '',
    minBookingHours: 4,
    weeklyAvailableHours: 20,
    certificateText: '',
    status: 'active',
    certificates: [],
    availableTimes: [{ timeType: 'weekly', dayOfWeek: 1, startTime: '09:00:00', endTime: '17:00:00', status: 'active' }]
  });
  document.getElementById('editModal').classList.add('show');
}

async function openEditModal(teacherProfessionalId) {
  currentEditingId = teacherProfessionalId;
  document.getElementById('modal-title').innerHTML = '修改教师职业信息';
  try {
    const result = await request({ url: `/teacher/professional/queryTeacherProfessionalInfo?teacherProfessionalId=${teacherProfessionalId}` });
    if (result && result.data && result.data.professional) {
      await ensureTeacherOptions();
      const p = result.data.professional;
      renderForm({
        teacherProfessionalId: p.teacherProfessionalId,
        teacherId: p.teacherId,
        subject: p.subject || '',
        personalPhotoUrl: p.personalPhotoUrl || '',
        bioText: p.bioText || '',
        bioUrl: p.bioUrl || '',
        minBookingHours: p.minBookingHours || 4,
        weeklyAvailableHours: p.weeklyAvailableHours || 20,
        certificateText: p.certificateText || '',
        status: p.status || 'active',
        certificates: (result.data.certificates || []).map(c => ({
          certificateId: c.certificateId, certName: c.certName, certUrl: c.certUrl, sortNo: c.sortNo
        })),
        availableTimes: (result.data.availableTimes || []).map(t => ({
          availableId: t.availableId, timeType: t.timeType, dayOfWeek: t.dayOfWeek,
          specificDate: t.specificDate, startTime: t.startTime, endTime: t.endTime, status: t.status
        }))
      }, true);
      document.getElementById('editModal').classList.add('show');
    } else {
      alert(result && result.message ? result.message : '查询详情失败');
    }
  } catch (e) {
    console.error('查询详情失败：', e);
  }
}

function closeEditModal() {
  document.getElementById('editModal').classList.remove('show');
}

/** 拉取教师下拉选项（仅 role=teacher 的用户） */
async function ensureTeacherOptions() {
  if (teacherOptionsCache.length > 0) return;
  try {
    const result = await request({ url: '/user/teacher/list' });
    if (result && result.data) {
      teacherOptionsCache = result.data;
    }
  } catch (e) {
    console.error('拉取教师列表失败：', e);
  }
}

function renderForm(data, isEdit) {
  const teacherDisabled = isEdit ? 'disabled' : '';
  const teacherOptionsHtml = teacherOptionsCache.map(t =>
    `<option value="${t.userId}" ${t.userId === data.teacherId ? 'selected' : ''}>${t.name || t.account || t.userId}</option>`
  ).join('');

  let certRowsHtml = '';
  if (data.certificates && data.certificates.length > 0) {
    data.certificates.forEach(c => { certRowsHtml += renderCertRow(c); });
  }

  let timeRowsHtml = '';
  if (data.availableTimes && data.availableTimes.length > 0) {
    data.availableTimes.forEach(t => { timeRowsHtml += renderTimeRow(t); });
  }

  document.getElementById('modal-body').innerHTML = `
    <div class="form-group">
      <label>教师 <span class="required">*</span></label>
      <select id="f-teacherId" ${teacherDisabled}>
        <option value="">请选择教师</option>
        ${teacherOptionsHtml}
      </select>
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
      <label>个人照片URL</label>
      <input type="text" id="f-personalPhotoUrl" value="${data.personalPhotoUrl || ''}" placeholder="照片访问URL">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>单次最小课时数</label>
        <input type="number" id="f-minBookingHours" value="${data.minBookingHours || 4}" min="1">
      </div>
      <div class="form-group">
        <label>每周可用课时上限</label>
        <input type="number" id="f-weeklyAvailableHours" value="${data.weeklyAvailableHours || 20}" min="1">
      </div>
    </div>
    <div class="form-group">
      <label>文字说明（教师简介）</label>
      <textarea id="f-bioText" maxlength="2000" placeholder="教师简介">${data.bioText || ''}</textarea>
    </div>
    <div class="form-group">
      <label>文字说明链接</label>
      <input type="text" id="f-bioUrl" value="${data.bioUrl || ''}" placeholder="外部简历/博客URL">
    </div>
    <div class="form-group">
      <label>证书文字描述</label>
      <input type="text" id="f-certificateText" value="${data.certificateText || ''}" placeholder="如 CET-8、JLPT N1">
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
  `;
}

function renderCertRow(c) {
  c = c || {};
  return `
    <div class="sub-item-row">
      <input type="text" class="cert-name" value="${c.certName || ''}" placeholder="证书名称">
      <input type="text" class="cert-url" value="${c.certUrl || ''}" placeholder="证书图片URL">
      <input type="number" class="cert-sort" value="${c.sortNo != null ? c.sortNo : 0}" placeholder="排序" style="max-width:70px;">
      <button class="remove-row-btn" onclick="this.parentElement.remove()"><i class="fa fa-times"></i></button>
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
      <input type="date" class="time-date" value="${t.specificDate || ''}" placeholder="具体日期">
      <input type="text" class="time-start" value="${t.startTime || '09:00:00'}" placeholder="开始">
      <input type="text" class="time-end" value="${t.endTime || '17:00:00'}" placeholder="结束">
      <button class="remove-row-btn" onclick="this.parentElement.remove()"><i class="fa fa-times"></i></button>
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

// ================================================================
// 提交表单（新增/修改）
// ================================================================
async function submitForm() {
  const teacherId = document.getElementById('f-teacherId').value;
  if (!teacherId) {
    alert('请选择教师');
    return;
  }

  // 收集证书
  const certificates = [];
  document.querySelectorAll('#cert-rows .sub-item-row').forEach(row => {
    const name = row.querySelector('.cert-name').value.trim();
    const url = row.querySelector('.cert-url').value.trim();
    const sort = parseInt(row.querySelector('.cert-sort').value) || 0;
    if (name || url) certificates.push({ certName: name, certUrl: url, sortNo: sort });
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
  if (currentEditingId) {
    url = '/teacher/professional/updateTeacherProfessionalInfo';
    payload.teacherProfessionalId = currentEditingId;
  }

  try {
    const result = await request({ url, method: 'post', data: payload });
    if (result && result.code === 200) {
      alert(currentEditingId ? '修改成功' : '添加成功');
      closeEditModal();
      loadAndRenderList();
    } else {
      alert(result && result.message ? result.message : '操作失败');
    }
  } catch (e) {
    console.error('提交失败：', e);
  }
}

// ================================================================
// 删除
// ================================================================
async function deleteItem(teacherProfessionalId, name) {
  if (!confirm(`确认删除教师【${name}】的职业信息？此操作将级联删除其证书和可预约时间段。`)) return;
  try {
    const result = await request({
      url: '/teacher/professional/deleteTeacherProfessionalInfo',
      method: 'post',
      params: { teacherProfessionalId }
    });
    if (result && result.code === 200) {
      alert('删除成功');
      loadAndRenderList();
    } else {
      alert(result && result.message ? result.message : '删除失败');
    }
  } catch (e) {
    console.error('删除失败：', e);
  }
}

// ================================================================
// 详情查看
// ================================================================
async function viewDetail(teacherProfessionalId) {
  try {
    const result = await request({ url: `/teacher/professional/queryTeacherProfessionalInfo?teacherProfessionalId=${teacherProfessionalId}` });
    if (!result || !result.data || !result.data.professional) {
      alert(result && result.message ? result.message : '查询失败');
      return;
    }
    const d = result.data;
    const p = d.professional;
    const certHtml = (d.certificates || []).map(c =>
      `<div style="margin-bottom:6px;"><strong>${c.certName || ''}</strong> ${c.certUrl ? `<a href="${c.certUrl}" target="_blank">查看图片</a>` : ''}</div>`
    ).join('') || '无';
    const timeHtml = (d.availableTimes || []).map(t => {
      const day = t.timeType === 'weekly' ? (DAY_OF_WEEK_MAP[t.dayOfWeek] || '') : (t.specificDate || '');
      return `<div>${t.timeType === 'weekly' ? '每周' : (t.timeType === 'holiday' ? '假日' : '日期')} ${day} ${t.startTime}-${t.endTime}</div>`;
    }).join('') || '无';

    document.getElementById('detail-body').innerHTML = `
      <div class="form-row">
        <div class="form-group"><label>教师姓名</label><input value="${d.name || ''}" readonly></div>
        <div class="form-group"><label>账号</label><input value="${d.account || ''}" readonly></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>手机</label><input value="${d.phone || ''}" readonly></div>
        <div class="form-group"><label>邮箱</label><input value="${d.email || ''}" readonly></div>
      </div>
      <div class="form-group"><label>学科</label><input value="${p.subject || ''}" readonly></div>
      <div class="form-group"><label>个人照片</label>${p.personalPhotoUrl ? `<img src="${p.personalPhotoUrl}" style="max-width:120px;">` : '无'}</div>
      <div class="form-group"><label>文字说明</label><textarea readonly>${p.bioText || ''}</textarea></div>
      <div class="form-group"><label>文字说明链接</label><input value="${p.bioUrl || ''}" readonly></div>
      <div class="form-row">
        <div class="form-group"><label>单次最小课时</label><input value="${p.minBookingHours || ''}" readonly></div>
        <div class="form-group"><label>每周课时上限</label><input value="${p.weeklyAvailableHours || ''}" readonly></div>
      </div>
      <div class="form-group"><label>证书文字描述</label><input value="${p.certificateText || ''}" readonly></div>
      <div class="form-group"><label>资格证书</label><div>${certHtml}</div></div>
      <div class="form-group"><label>可预约时间段</label><div>${timeHtml}</div></div>
      <div class="form-row">
        <div class="form-group"><label>职业信息状态</label><input value="${p.status || ''}" readonly></div>
        <div class="form-group"><label>用户状态</label><input value="${d.userStatus || ''}" readonly></div>
      </div>
    `;
    document.getElementById('detailModal').classList.add('show');
  } catch (e) {
    console.error('查询详情失败：', e);
  }
}

function closeDetailModal() {
  document.getElementById('detailModal').classList.remove('show');
}
