/**
 * 教师职业信息维护 - 单条记录版（form 页面）公共调用函数
 *
 * 迁移说明（2026-09-10）：本文件原位于 api/src/main/resources/static/js/，
 * 在「前后端分离」提交 00ace80 中被连同页面一起删除、未迁入 frontend，
 * 导致管理端点击教师姓名跳 /teacherInfo.html 时 404、被 Nginx try_files
 * 兜底成登录首页。此处按 frontend 新体系迁入：
 *   - 依赖 window.request（utility_request.js）：裸路径 /teacher/... 会由
 *     normalizeUrl 自动补 /api/v1 前缀，因此这里保持裸路径即可，勿拼 "@/api"。
 *   - 依赖 escapeHtml / escapeAttr（api.js）。
 *   - 依赖 DAY_OF_WEEK_MAP（teacherInfo.js，运行时才被调用，加载顺序无冲突）。
 *
 * 依赖：utility_request.js (window.request)、api.js (escapeHtml/escapeAttr/getCurrentUserInfo)
 */
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
      status: t.status || 'active',
      optioned: t.optioned != null ? t.optioned : 0,
      scheduleId: t.scheduleId || ''
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
        availableId: null,
        repeatType: 'none', repeatInterval: 1, repeatDays: '',
        startDate: `${yyyy}-${mm}-${dd}`,
        endDate: `${yyyy}-${mm}-${dd}`,
        startTime: '09:00', endTime: '09:45', status: 'active',
        optioned: 0,
        scheduleId: ''
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

  // 时间段列表（动态行）
  const timeEl = document.getElementById('view-availableTimes');
  if (timeEl) {
    timeEl.innerHTML = (data.availableTimes && data.availableTimes.length)
      ? formAvaliableTimesDiv(data.availableTimes, { withOptionCheckbox: true })
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
  const teacherIdInput = document.getElementById('f-teacherId');
  const teacherId = teacherIdInput ? teacherIdInput.value : '';
  if (!teacherId) return;
  // 调用 API 获取可预约时间段
  const availableSchedules = await getAvailableTimesByAPI(teacherId);
  if (availableSchedules) {
    const availableSchedulesList = availableSchedules.map(s => {
      const obj = { ...s };  // 浅拷贝，避免修改原对象
      obj.scheduleId = obj.scheduleId || '';
      obj.optioned = obj.optioned != null ? obj.optioned : 0;
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
    // 追加到时间行中，不删除原有行
    appendAvailableTimes(availableSchedulesList);
  }
}

async function getAvailableTimesByAPI(teacherId) {
  try {
    // 裸路径由 utility_request.js 的 normalizeUrl 补成 /api/v1/schedule/getAvailableSchedule
    const data = await request({
      url: '/schedule/getAvailableSchedule',
      params: { teacherId: teacherId }
    });
    return data;
  } catch (error) {
    console.error('Error fetching available times:', error);
    return null;
  }
}

// ====================== 工具函数 ======================
function setPageTitle(title) {
  const el = document.getElementById('page-title');
  if (el) el.textContent = title;
}

function renderError(msg) {
  const errorEl = document.getElementById('section-error');
  if (errorEl) errorEl.innerHTML = msg;
  // 防御：msg 中若含 data-term 标记的片段（如某些错误模板），随注入内容一并转换
  if (typeof applyTerms === 'function' && errorEl) applyTerms(errorEl);
  switchSection('error');
  showActionButtons('error');
}
