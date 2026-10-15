/* ============================================================================
 * tenant-legal.js —— 租户管理员维护本租户的《用户协议》/《隐私政策》（场景 B）
 *
 * 存储模型：
 *   租户管理员写 tenant_id=N（本租户覆盖级）；终端用户访问 legal.html 时
 *   先查 tenant_id=N，没有回退 tenant_id=0 的平台版。
 *   平台提供 *_template docType 作为参考模板（仅存储，不被 resolve 生效版读取路径命中）。
 *
 * 三个接口：
 *   GET  /sys/legal-doc?docType=xxx&lang=zh   → resolveScope 派生本租户 tenantId，
 *     先查 tenant_id=N 回退 tenant_id=0。返回的 doc.tenantId === 0 表示租户尚未发布。
 *   GET  /sys/legal-doc/template?docType=xxx  → 强制查 tenant_id=0 + docType + "_template"，
 *     即平台提供的参考模板。
 *   POST /sys/legal-doc/update                 → 保存新版本，resolveScope 派生本租户 tenantId，
 *     存入 tenant_id=N + docType。旧启用版自动 status=0。
 * ========================================================================== */

const TENANT_LEGAL_TYPES = [
  { value: 'user_agreement', label: '用户协议' },
  { value: 'privacy_policy', label: '隐私政策' }
];

function renderTenantLegalPage() {
  const c = document.getElementById('dynamic-content-center');
  if (!c) return;

  c.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div class="card-title"><i class="fa fa-file-contract"></i> 协议与政策（本租户版本）</div>
        <div class="tab-bar" style="margin-left:16px;">
          <select id="tenant-legal-doc-type">
            ${TENANT_LEGAL_TYPES.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}
          </select>
          <select id="tenant-legal-lang">
            <option value="zh">中文</option>
            <option value="en">English</option>
            <option value="fr">Français</option>
          </select>
          <button class="btn btn-default" id="tenant-legal-adopt-btn" title="从平台提供的参考模板载入初始内容"><i class="fa fa-copy"></i> 采纳平台模板</button>
          <button class="btn btn-default" id="tenant-legal-view-platform-btn" title="新窗口查看平台统一版本"><i class="fa fa-eye"></i> 查看平台版本</button>
          <button class="btn btn-default" id="tenant-legal-view-template-btn" title="新窗口查看平台提供的参考模板"><i class="fa fa-file-alt"></i> 查看平台模板</button>
          <button class="btn btn-default" id="tenant-legal-load-btn"><i class="fa fa-refresh"></i> 重读</button>
          <button class="btn btn-primary" id="tenant-legal-save-btn"><i class="fa fa-save"></i> 保存为本租户版本</button>
        </div>
      </div>
      <div style="margin:12px 16px; padding:10px 14px; border-radius:6px; background:rgba(78,110,242,.08); color:#4e6ef2; font-size:12px; line-height:1.7;">
        <b>说明</b>：您在此处发布的是本租户场景 B（租户对用户）的生效版本。终端用户注册或登录时若需要签署协议，将读取您发布的版本；您未发布前系统会回退到平台统一版本。
      </div>
      <div class="form-item" style="margin:16px 16px 8px;">
        <label>标题</label>
        <input type="text" id="tenant-legal-title" placeholder="文档标题，如：XX 机构用户服务协议">
      </div>
      <div class="form-item" style="margin:0 16px 8px;">
        <label>正文（支持 HTML）</label>
        <textarea id="tenant-legal-content" rows="18" style="width:100%; font-family:monospace; padding:10px; border:1px solid #ddd; border-radius:4px; box-sizing:border-box;"></textarea>
      </div>
      <div id="tenant-legal-hint" style="margin:0 16px 16px; color:#6b7587; font-size:12px;"></div>
    </div>
  `;

  const $ = id => document.getElementById(id);

  function updateHint(msg, isWarn) {
    const hint = $('tenant-legal-hint');
    if (!hint) return;
    hint.style.color = isWarn ? '#c56a00' : '#6b7587';
    hint.textContent = msg || '';
  }

  function loadTenantLegal() {
    const docType = $('tenant-legal-doc-type').value;
    const lang = $('tenant-legal-lang').value;
    updateHint('读取中…', false);
    request({ url: '/sys/legal-doc', method: 'get', params: { docType, lang }, customErrorMsg: false })
      .then(doc => {
        const titleEl = $('tenant-legal-title');
        const contentEl = $('tenant-legal-content');
        if (!doc || !doc.content) {
          titleEl.value = '';
          contentEl.value = '';
          updateHint('本租户尚未发布此文档。点击「采纳平台模板」可载入平台提供的参考文本，修订后保存即发布为本租户生效版。', true);
          return;
        }
        titleEl.value = doc.title || '';
        contentEl.value = doc.content || '';
        if (doc.tenantId === 0) {
          updateHint('当前为平台兜底版本 v' + doc.version + '（tenant_id=0）。请点击「采纳平台模板」载入参考文本，修订后保存即发布为本租户生效版。', true);
        } else {
          updateHint('本租户已发布版本 v' + doc.version + '（tenant_id=' + doc.tenantId + '）。当前文本即为终端用户实际阅读的内容。', false);
        }
      })
      .catch(err => {
        updateHint('读取失败：' + ((err && err.message) || '请重试'), true);
      });
  }

  function adoptPlatformTemplate() {
    const docType = $('tenant-legal-doc-type').value;
    const lang = $('tenant-legal-lang').value;
    updateHint('正在拉取平台模板…', false);
    request({ url: '/sys/legal-doc/template', method: 'get', params: { docType, lang }, customErrorMsg: false })
      .then(doc => {
        if (!doc || !doc.content) {
          updateHint('平台尚未为此文档提供参考模板，请先咨询平台管理员，或直接编辑空白内容。', true);
          return;
        }
        $('tenant-legal-title').value = doc.title || '';
        $('tenant-legal-content').value = doc.content || '';
        updateHint('已载入平台参考模板 v' + doc.version + '（tenant_id=0_template），请修改为符合本机构实际情况后保存。', true);
      })
      .catch(err => {
        updateHint('拉取模板失败：' + ((err && err.message) || '请重试'), true);
      });
  }

  function saveTenantLegal() {
    const docType = $('tenant-legal-doc-type').value;
    const lang = $('tenant-legal-lang').value;
    const title = $('tenant-legal-title').value.trim();
    const content = $('tenant-legal-content').value;
    if (!title) { alert('请填写标题'); return; }
    if (!content) { alert('正文不能为空'); return; }
    if (!confirm('保存后将生效为本租户的 ' + TENANT_LEGAL_TYPES.find(t => t.value === docType).label + ' 生效版（终端用户实际阅读的版本）。确认保存？')) return;
    updateHint('保存中…', false);
    request({
      url: '/sys/legal-doc/update', method: 'POST',
      data: { docType, language: lang, title, content },
      customErrorMsg: false
    })
      .then(doc => {
        alert('已保存为新版本（v' + (doc && doc.version) + '），旧版本自动停用。生效范围：本租户。');
        loadTenantLegal();
      })
      .catch(err => {
        updateHint('保存失败：' + ((err && err.message) || '请重试'), true);
      });
  }

  $('tenant-legal-doc-type').addEventListener('change', loadTenantLegal);
  $('tenant-legal-adopt-btn').addEventListener('click', adoptPlatformTemplate);
  $('tenant-legal-view-platform-btn').addEventListener('click', function () {
    var docType = $('tenant-legal-doc-type').value;
    var lang = $('tenant-legal-lang').value;
    var url = 'legal.html?type=' + encodeURIComponent(docType) + '&lang=' + encodeURIComponent(lang) + '&scope=platform';
    window.open(url, '_blank', 'noopener');
  });
  $('tenant-legal-view-template-btn').addEventListener('click', function () {
    var docType = $('tenant-legal-doc-type').value;
    var lang = $('tenant-legal-lang').value;
    var url = 'legal.html?type=' + encodeURIComponent(docType + '_template') + '&lang=' + encodeURIComponent(lang);
    window.open(url, '_blank', 'noopener');
  });
  $('tenant-legal-load-btn').addEventListener('click', loadTenantLegal);
  $('tenant-legal-save-btn').addEventListener('click', saveTenantLegal);

  loadTenantLegal();
}
