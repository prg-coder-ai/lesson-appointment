/**
 * 教师职业信息维护 - 单条记录版（form 页面）-publish.js
 * 通过 URL 参数 ?userid=xxxx 指定教师，加载并展示该教师的职业信息。
 * 依赖：utility_request.js (window.request)、api.js (getCurrentUserInfo)、auth.js (handleLogout)
 */ 
  
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
      //TBD 对于与scheduleLink相关的字段-添加时保存scheduleId而不是scheduleLink-渲染时使用scheduleId 创建链接
      //添加隐藏的scheduleId字段，用于后续提交，添加checkBox表示optioned，用于选择是否预约
      const optioned = t.optioned || false;
         //hidden field for scheduleId, used for form submission
      const optionedHtml = `<input type="checkbox" class="cert-optioned" data-extra-scheduleid="${t.scheduleId || ''}" ${optioned ? 'checked' : ''} value="${t.optioned}"> 
            `; 
    return `<div>${escapeHtml(dateRange)} ${escapeHtml(rptText)} ${escapeHtml(dayText)} ${optionedHtml}</div>`;
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
  // 对于与scheduleLink相关的字段-添加时保存scheduleId而不是scheduleLink-渲染时使用scheduleId 创建链接
//遍历availableTimesList，将优先选择打勾的一行的scheduleId赋值给scheduleLink
 let optedScheduleId = '';
   const timeEl = document.getElementById('view-availableTimes');
   //查询所有勾选的行，取第一个的scheduleId作为scheduleLink 
   const optedRows = timeEl.querySelectorAll('.cert-optioned:checked');
  
   if (optedRows.length > 0) {
    optedScheduleId = optedRows[0].dataset.extraScheduleid || '';
   }   
  data.scheduleId = optedScheduleId;
 
  // 基本信息和课时配置的字段会单独渲染到卡片中，rowsHtml 跳过这些字段以避免重复 , 'photo'
  const basicKeys = ['name', 'account', 'phone', 'email', 'subject', 'status', 'userStatus', 'photo'];
  const lessonKeys = ['minBookingHours', 'weeklyAvailableHours', 'certificateText'];

  const teacherId = data.teacherId || '';

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
      bioUrl: data.bioUrl || '',
      
      teacherlink: teacherId || '',
      scheduleLink: optedScheduleId || ''
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
        let linkForSchedule='/booking?scdid='+ optedScheduleId;
        let linkForteacher="/booking?tid="+ teacherId;
      const lines = formAvaliableTimesDiv(data.availableTimes);
      return `<section style="margin-bottom:16px;">
        <h3 style="margin:0 0 8px 0;color:${style.accentColor};font-size:${style.fontSizePx + 2}px;">可预约时间</h3>
        <div>${lines}</div></section>
         
         <!-- div style="color:#222;flex:1;word-break:break-all;"><a href="${escapeAttr(linkForSchedule)}" target="_blank" rel="noopener" style="color:${style.accentColor};word-break:break-all;">直达预定</a></div>    
         <div style="color:#222;flex:1;word-break:break-all;"><a href="${escapeAttr(linkForteacher)}" target="_blank" rel="noopener" style="color:${style.accentColor};word-break:break-all;">全部排期</a></div -->`;    
          
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
      <h3 style="margin:0 0 8px 0;color:${style.accentColor};font-size:${style.fontSizePx + 2}px;"><span data-term="lessonUnit">课时</span>配置</h3>
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
    applyTerms(preview);
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

 
 

 