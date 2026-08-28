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
//TBD：从后端获取课程选项,根据教师的领域动态生成
const SUBJECT_OPTIONS = ['英语',  '法语', '汉语', '西班牙语'];
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
 

// 2. 保存预览区域为JPG图片
const saveImageBtn = document.getElementById('saveImageBtn');
const previewWrap = document.getElementById('pub-preview');  

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