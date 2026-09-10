/**
 * 教师职业信息维护 - 单条记录版（form 页面）
 *
 * 迁移说明（2026-09-10）：原位于 api/src/main/resources/static/js/，
 * 前后端分离提交 00ace80 把整个 teacherInfo 页面连同本文件一起删除、未迁入 frontend。
 * 结果：管理端「教师管理」点姓名 → /teacherInfo.html 404 → Nginx try_files
 * 兜底到 index.html（登录页），表现为「点完跳回登录界面」。
 * 本次按 frontend 新体系迁回：
 *   - 未登录踢回登录页必须走 pageUrl()，保住 tCode（否则登录后回不到本页）；
 *   - 「复制链接 / 发布链接」统一走 teacherInfo-publish.js 的 publicProfileUrl()，
 *     公开名片页刻意不带 tCode（对外分享链接，租户编码无意义且污染链接）。
 *
 * 依赖：utility_request.js (window.request)、api.js (getCurrentUserInfo/escapeHtml/pageUrl)
 */
window.teacherInfoModule = window.teacherInfoModule || {};

// ====================== 模块级状态 ======================
let currentTeacherId = null;                 // 当前教师的 userId（来自 URL）
let currentProfessionalId = null;            // 当前职业信息记录 ID（新增时为 null）
let currentMode = 'view';                    // 'view' | 'edit' | 'add' | 'publish'
let originalData = null;                     // 最近一次加载的原始数据（取消编辑时回滚）
//TBD：从后端获取课程选项,根据教师的领域动态生成
const SUBJECT_OPTIONS = ['英语',  '法语', '汉语', '西班牙语'];
const DAY_OF_WEEK_MAP = { 1: '周一', 2: '周二', 3: '周三', 4: '周四', 5: '周五', 6: '周六', 7: '周日' };

// ====================== URL 参数解析 + 加载入口 ======================
/** 从 URL 读取 userid 并加载教师职业信息（兼容 userid / userId / id） */
function loadTeacherInfoFromUrl() {
  const params = new URLSearchParams(window.location.search);
  currentTeacherId = params.get('userid') || params.get('userId') || params.get('id');

  if (!currentTeacherId) {
    renderError('缺少 userid 参数，请在 URL 中携带：<code>?userid=教师ID</code>');
    return;
  }
  loadTeacherInfo(currentTeacherId);
}

/** 按 teacherId 拉取职业信息（无记录时进入新增模式） */
async function loadTeacherInfo(teacherId) {
  switchSection('loading');
  showActionButtons('');

  try {
    const result = await request({
      url: '/teacher/professional/queryTeacherProfessionalInfo',
      params: { teacherId: teacherId }
    });

    // 后端 Result 统一结构：request 已解开成 data；这里 data 即 TeacherProfessionalDetailVO
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
  }
}

/** 切换 #form-container 内的区域显示 */
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

/** 根据模式显示对应的按钮组，隐藏其余几组 */
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

// ====================== 发布区的「复制链接 / 保存为图片」 ======================
function installLinkCopyAndImageSaveHandlers() {
  const copyLinkBtn = document.getElementById('copyLinkBtn');
  if (copyLinkBtn) copyLinkBtn.addEventListener('click', async () => {
    // 先取当前选中的历史版本；未选（"新建"）或选中草稿都不能生成对外链接
    const sel = document.getElementById('pub-history');
    if (!sel) return;
    const selectedOption = sel.options[sel.selectedIndex];

    if (!sel.value) {
      alert('请先选择正确的版本或者发布版本后再复制链接。');
      return;
    }
    if (selectedOption && selectedOption.textContent.includes('【草稿】')) {
      alert('当前版本是草稿，无法生成公开访问链接，请先发布。');
      return;
    }
    // 公开介绍页按 profileId 精确定位版本（免登录，不带 tCode）
    const url = publicProfileUrl({ profileId: sel.value });

    try {
      await navigator.clipboard.writeText(url);
      alert('链接已复制：' + url);
    } catch (err) {
      // 兼容不支持 clipboard API 的浏览器
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      alert('链接已复制');
    }
  });

  const saveImageBtn = document.getElementById('saveImageBtn');
  const previewWrap = document.getElementById('pub-preview');
  if (!saveImageBtn || !previewWrap) return;

  saveImageBtn.addEventListener('click', async () => {
    let suggestedName = '';
    const sel = document.getElementById('pub-history');
    if (sel && !sel.value) {
      const titleEl = document.getElementById('pub-title');
      suggestedName = titleEl ? titleEl.value : '';
    } else if (sel) {
      const selectedOption = sel.options[sel.selectedIndex];
      suggestedName = selectedOption ? selectedOption.textContent : '';
    }

    try {
      const canvas = await captureElement(previewWrap, {
        useCORS: true,    // 解决跨域图片空白
        scale: window.devicePixelRatio
      });
      const imgUrl = canvas.toDataURL('image/jpeg', 0.9);
      const a = document.createElement('a');
      a.href = imgUrl;
      a.download = (suggestedName || '教师介绍') + '.jpg';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      console.error('截图失败', e);
      alert('生成图片失败，请重试');
    }
  });
}
