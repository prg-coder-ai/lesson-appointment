/* ============================================================================
 * admin-appPackage.js —— 系统配置 → 课堂 App 安装包管理与下载
 * 后端：AppPackageController（/api/v1/app-package/*），端点统一取 shared/apiPaths.js
 *
 * 一份 js 服务四个页面，按当前登录角色自动切视图：
 *   · admin / platform_admin（admin.html、platform_admin.html）
 *       上传 + 管理列表（含已下架、上下架、下载次数、SHA-256、归属、上传人）
 *   · teacher / student（teacher.html、student.html）
 *       只列「已上架」的包 + 下载按钮，不出现上传与上下架入口
 *   上传/下载/上下架均由后端 @Audit 写审计日志（见 AuditAction.APP_PACKAGE_*）。
 *
 * 租户端可见性：菜单项由各页面加 data-module="classroom"，交给
 * feature-flags.js 的 applyMenuVisibility() 按 /eclassroom/config enabled 控制，
 * 与「我的课堂」完全同一判据；本文件不自行判开关（避免配置未加载时的竞态误隐藏）。
 *
 * ⚠️ 顶层标识符一律包在 IIFE 里（多文件页面共享全局作用域，见 check:global-collide），
 *    内联 onclick 只走 window.*，端点只走 EP.*（见 check:endpoints）。
 * ========================================================================== */
(function () {
    'use strict';

    var MENU_KEY = 'app_package';
    var EP = (window.ApiPaths && window.ApiPaths.ENDPOINTS) || {};
    var ADMIN_ROLES = ['admin', 'platform_admin'];
    var PF_LABEL = { windows: 'Windows', android: 'Android', ios: 'iOS', macos: 'macOS' };
    var FALLBACK_PLATFORMS = ['windows', 'android', 'ios', 'macos'];
    var MAX_BYTES = 150 * 1024 * 1024;   // 与 AppPackageService.maxBytes 一致，前端先挡一道

    var state = { rows: [], platforms: [], filter: '', uploading: false };

    /* ------------------------------------------------------------ 基础工具 */

    function currentRole() {
        try {
            var cu = JSON.parse(localStorage.getItem('currentUser') || '{}');
            return (cu && cu.role) || '';
        } catch (e) { return ''; }
    }

    function isAdmin() { return ADMIN_ROLES.indexOf(currentRole()) >= 0; }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function sizeText(n) {
        n = Number(n) || 0;
        if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
        if (n >= 1024) return (n / 1024).toFixed(1) + ' KB';
        return n + ' B';
    }

    /* 后端 LocalDateTime 统一序列化为 "...Z"（见契约），这里只做展示层归一 */
    function timeText(v) {
        if (!v) return '-';
        if (Array.isArray(v)) {
            while (v.length < 6) v = v.concat([0]);
            return v[0] + '-' + pad2(v[1]) + '-' + pad2(v[2]) + ' ' + pad2(v[3]) + ':' + pad2(v[4]);
        }
        return String(v).replace('T', ' ').replace(/\.\d+Z?$/, '').replace(/Z$/, '');
    }
    function pad2(n) { return (n < 10 ? '0' : '') + n; }

    function token() {
        try { return localStorage.getItem('token') || ''; } catch (e) { return ''; }
    }
    function apiBase() { return window.API_BASE_URL || ''; }

    function findRow(id) {
        for (var i = 0; i < state.rows.length; i++) {
            if (String(state.rows[i].id) === String(id)) return state.rows[i];
        }
        return null;
    }

    function setMsg(text, ok) {
        var el = document.getElementById('apkg-msg');
        if (!el) return;
        el.textContent = text || '';
        el.style.display = text ? 'block' : 'none';
        el.style.color = ok === false ? '#b42318' : '#157347';
        el.style.background = ok === false ? '#fef3f2' : '#ecfdf3';
        el.style.borderColor = ok === false ? '#fecdca' : '#abefc6';
    }

    function platformOptions(selected) {
        var list = state.platforms.length ? state.platforms : FALLBACK_PLATFORMS;
        return list.map(function (p) {
            return '<option value="' + esc(p) + '"' + (p === selected ? ' selected' : '') + '>'
                + esc(PF_LABEL[p] || p) + '</option>';
        }).join('');
    }

    /* ------------------------------------------------------------ 数据访问 */

    async function loadPlatforms() {
        try {
            var list = await request({ url: EP.APP_PACKAGE_PLATFORMS, method: 'get' });
            state.platforms = Array.isArray(list) ? list : [];
        } catch (e) {
            state.platforms = FALLBACK_PLATFORMS.slice();
        }
    }

    async function loadRows() {
        var host = document.getElementById('apkg-table-body');
        if (!host) return;
        host.innerHTML = '<div style="padding:22px;text-align:center;color:#8a94a6;">正在加载安装包列表…</div>';
        try {
            // 管理视角含已下架；下载视角只返回上架包。归属过滤在后端，前端不传 tenantId。
            var url = isAdmin() ? EP.APP_PACKAGE_LIST : EP.APP_PACKAGE_AVAILABLE;
            var params = state.filter ? { platform: state.filter } : {};
            var list = await request({ url: url, method: 'get', params: params });
            state.rows = Array.isArray(list) ? list : [];
        } catch (e) {
            state.rows = [];
        }
        paintRows();
    }

    /* ------------------------------------------------------------ 列表渲染 */

    function paintRows() {
        var host = document.getElementById('apkg-table-body');
        if (!host) return;
        var admin = isAdmin();

        if (!state.rows.length) {
            host.innerHTML = '<div style="padding:24px;text-align:center;color:#8a94a6;">'
                + (admin ? '暂无安装包。使用上方表单上传第一个包。' : '当前还没有可供下载的安装包，请联系管理员上传。')
                + '</div>';
            return;
        }

        var heads = admin
            ? '<th>文件名</th><th>平台</th><th>版本</th><th>大小</th><th>SHA-256</th>'
              + '<th>归属</th><th>状态</th><th>下载</th><th>上传人</th><th>上传时间</th><th>操作</th>'
            : '<th>文件名</th><th>平台</th><th>版本</th><th>大小</th><th>SHA-256</th>'
              + '<th>更新时间</th><th>操作</th>';

        var rows = state.rows.map(function (r) {
            var id = esc(r.id);
            var sha = r.fileSha256 ? String(r.fileSha256) : '';
            var shaCell = sha
                ? '<code title="' + esc(sha) + '" style="font-size:12px;">' + esc(sha.slice(0, 12)) + '…</code>'
                : '-';
            var owner = (r.tenantId === 0 || r.tenantId === '0')
                ? '<span style="color:#1a6fd4;">平台公共</span>'
                : '<span style="color:#5a6472;">本租户</span>';
            var statusTag = Number(r.status) === 1
                ? '<span style="display:inline-block;padding:1px 8px;border-radius:10px;background:#ecfdf3;color:#157347;font-size:12px;">已上架</span>'
                : '<span style="display:inline-block;padding:1px 8px;border-radius:10px;background:#f2f4f7;color:#667085;font-size:12px;">已下架</span>';

            var actions = '<button class="btn btn-primary" onclick="window.apkgDownload(\'' + id + '\')">'
                + '<i class="fa fa-download"></i> 下载</button>';
            if (admin) {
                var next = Number(r.status) === 1 ? 0 : 1;
                actions += ' <button class="btn btn-default" onclick="window.apkgToggle(\'' + id + '\',' + next + ')">'
                    + (next === 1 ? '上架' : '下架') + '</button>';
            }

            var common = '<td title="' + esc(r.fileName) + '">' + esc(r.fileName) + '</td>'
                + '<td>' + esc(PF_LABEL[r.platform] || r.platform || '-') + '</td>'
                + '<td>' + esc(r.version || '-') + '</td>'
                + '<td>' + sizeText(r.fileSize) + '</td>'
                + '<td>' + shaCell + '</td>';

            return '<tr>' + common
                + (admin
                    ? '<td>' + owner + '</td><td>' + statusTag + '</td>'
                      + '<td>' + (Number(r.downloadCount) || 0) + '</td>'
                      + '<td>' + esc(r.uploaderName || r.uploaderRole || '-') + '</td>'
                      + '<td>' + esc(timeText(r.createTime)) + '</td>'
                    : '<td>' + esc(timeText(r.updateTime || r.createTime)) + '</td>')
                + '<td style="white-space:nowrap;">' + actions + '</td>'
                + '</tr>';
        }).join('');

        host.innerHTML = '<div class="table-container"><table class="data-table"><thead><tr>'
            + heads + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
    }

    /* ------------------------------------------------------------ 页面骨架 */

    function uploadCardHtml() {
        return '<div style="background:#f8fafc;border:1px solid #e3e8ee;border-radius:8px;padding:14px 16px;margin-bottom:16px;">'
            + '  <div style="font-weight:600;margin-bottom:10px;"><i class="fa fa-upload"></i> 上传安装包</div>'
            + '  <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;">'
            + '    <div><label style="display:block;font-size:12px;color:#5a6472;margin-bottom:4px;">文件（≤150MB）</label>'
            + '      <input type="file" id="apkg-file" style="font-size:13px;"></div>'
            + '    <div><label style="display:block;font-size:12px;color:#5a6472;margin-bottom:4px;">目标平台</label>'
            + '      <select id="apkg-platform" style="min-width:120px;">' + platformOptions('windows') + '</select></div>'
            + '    <div><label style="display:block;font-size:12px;color:#5a6472;margin-bottom:4px;">版本号</label>'
            + '      <input type="text" id="apkg-version" placeholder="如 1.0.0" style="width:110px;"></div>'
            + '    <div style="flex:1;min-width:180px;"><label style="display:block;font-size:12px;color:#5a6472;margin-bottom:4px;">更新说明</label>'
            + '      <input type="text" id="apkg-remark" placeholder="选填" style="width:100%;"></div>'
            + '    <div><button class="btn btn-primary" id="apkg-upload-btn" onclick="window.apkgUpload()">'
            + '      <i class="fa fa-cloud-upload"></i> 上传并上架</button></div>'
            + '  </div>'
            + '  <div style="font-size:12px;color:#8a94a6;margin-top:8px;line-height:1.8;">'
            + '    平台管理员上传的包对全部租户可见；租户管理员上传的包仅本租户可见。'
            + '    上传、下载、上下架均写入审计日志。文件以随机名落盘并计算 SHA-256，原始名仅用于下载回填。'
            + '  </div>'
            + '</div>';
    }

    async function renderAppPackagePage() {
        var container = document.getElementById('dynamic-content-center');
        if (!container) return;
        container.innerHTML = '<div class="card"><div class="card-body" style="padding:24px;color:#8a94a6;">正在加载…</div></div>';
        await loadPlatforms();

        var admin = isAdmin();
        container.innerHTML =
            '<div class="card">' +
            '  <div class="card-header">' +
            '    <div class="card-title"><i class="fa fa-laptop"></i> ' +
            (admin ? '课堂 App 安装包管理' : '课堂 App 下载') + '</div>' +
            '    <button class="btn btn-default" onclick="window.apkgRefresh()"><i class="fa fa-refresh"></i> 刷新</button>' +
            '  </div>' +
            '  <div class="card-body">' +
            '    <div style="background:#f6f8fa;border:1px solid #e3e8ee;border-radius:6px;padding:10px 14px;margin-bottom:14px;font-size:13px;line-height:1.9;color:#5a6472;">' +
            '      <b>用途：</b>下载 eClassroom 客户端（Windows 绿色包 / Android / iOS / macOS）到本地安装后进入在线课堂。<br>' +
            '      <b>权限：</b>平台管理员与租户管理员可上传、上下架；教师与学生可下载。<br>' +
            '      <b>校验：</b>列表中的 SHA-256 可用于核对下载文件完整性；请只安装本单位管理员上传的包。' +
            '    </div>' +
            (admin ? uploadCardHtml() : '') +
            '    <div id="apkg-msg" style="display:none;border:1px solid;border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:13px;"></div>' +
            '    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">' +
            '      <label style="font-size:13px;color:#5a6472;">平台筛选：</label>' +
            '      <select id="apkg-filter" onchange="window.apkgSetFilter(this.value)" style="min-width:140px;">' +
            '        <option value="">全部平台</option>' + platformOptions(state.filter) +
            '      </select>' +
            '    </div>' +
            '    <div id="apkg-table-body">正在加载…</div>' +
            '  </div>' +
            '</div>';

        if (typeof window.applyTerms === 'function') window.applyTerms(container);
        await loadRows();
    }

    /** 顶部「刷新」按钮经 registerPageRefresh 调到这里；容器被换走时返回 false 交给通用逻辑整页重渲染 */
    async function refreshAppPackagePage() {
        if (!document.getElementById('apkg-table-body')) return false;
        await loadRows();
        return true;
    }

    /* ------------------------------------------------------------ 操作 */

    async function doUpload() {
        if (state.uploading) return;
        var fileEl = document.getElementById('apkg-file');
        var pfEl = document.getElementById('apkg-platform');
        var vEl = document.getElementById('apkg-version');
        var rEl = document.getElementById('apkg-remark');
        if (!fileEl || !fileEl.files || !fileEl.files.length) {
            setMsg('请先选择要上传的安装包文件。', false);
            return;
        }
        var f = fileEl.files[0];
        if (f.size > MAX_BYTES) {
            setMsg('文件超过 150MB 上限（当前 ' + sizeText(f.size) + '），请压缩或分包后再上传。', false);
            return;
        }
        var fd = new FormData();
        fd.append('file', f);
        fd.append('platform', pfEl ? pfEl.value : 'windows');
        fd.append('version', vEl ? vEl.value.trim() : '');
        fd.append('remark', rEl ? rEl.value.trim() : '');

        state.uploading = true;
        var btn = document.getElementById('apkg-upload-btn');
        if (btn) { btn.disabled = true; btn.textContent = '上传中…'; }
        setMsg('正在上传并计算 SHA-256，大文件可能需要几分钟，请勿关闭页面…', true);
        try {
            // 大文件必须放宽超时：全局 request 默认 15s，150MB 上传必然超时
            await request({ url: EP.APP_PACKAGE_UPLOAD, method: 'post', data: fd, timeout: 300000 });
            if (fileEl) fileEl.value = '';
            if (vEl) vEl.value = '';
            if (rEl) rEl.value = '';
            await loadRows();
            setMsg('上传成功，安装包已上架。', true);
        } catch (e) {
            setMsg('上传失败：' + ((e && e.message) || '请检查网络或文件大小'), false);
        } finally {
            state.uploading = false;
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa fa-cloud-upload"></i> 上传并上架'; }
        }
    }

    async function doDownload(id) {
        var row = findRow(id);
        var name = (row && row.fileName) || 'eClassroom-package';
        setMsg('正在准备下载：' + name + ' …', true);
        try {
            // 后端返回 ResponseEntity<Resource>（二进制流），不能走 window.request 的 JSON 解包；
            // 且 <a href> 带不了 Authorization，必须 fetch + Bearer 取 blob 再触发下载。
            var resp = await fetch(apiBase() + EP.APP_PACKAGE_DOWNLOAD(id), {
                headers: { Authorization: 'Bearer ' + token() }
            });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            var blob = await resp.blob();
            var a = document.createElement('a');
            var objUrl = URL.createObjectURL(blob);
            a.href = objUrl;
            a.download = name;
            document.body.appendChild(a);
            a.click();
            if (a.parentNode) a.parentNode.removeChild(a);
            setTimeout(function () { URL.revokeObjectURL(objUrl); }, 60000);
            setMsg('已开始下载：' + name, true);
            await loadRows();   // 刷新下载次数
        } catch (e) {
            setMsg('下载失败：' + ((e && e.message) || '网络异常'), false);
        }
    }

    async function doToggle(id, next) {
        try {
            await request({
                url: EP.APP_PACKAGE_STATUS,
                method: 'post',
                data: { id: id, status: next }
            });
            await loadRows();
            setMsg(next === 1 ? '已上架，师生端现在可以下载。' : '已下架，师生端不再可见（记录保留供审计）。', true);
        } catch (e) {
            setMsg('操作失败：' + ((e && e.message) || '请重试'), false);
        }
    }

    function doSetFilter(v) {
        state.filter = v || '';
        loadRows();
    }

    /* ------------------------------------------------------------ 注册 / 对外入口 */
    if (typeof window.registerPageRefresh === 'function') {
        window.registerPageRefresh(MENU_KEY, refreshAppPackagePage);
    }
    // 内联 onclick 只能走全局作用域，IIFE 隔离后必须逐个显式挂出
    window.renderAppPackagePage = renderAppPackagePage;
    window.apkgRefresh = function () { return refreshAppPackagePage(); };
    window.apkgUpload = doUpload;
    window.apkgDownload = doDownload;
    window.apkgToggle = doToggle;
    window.apkgSetFilter = doSetFilter;
})();
