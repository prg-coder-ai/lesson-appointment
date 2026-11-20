/**
 * platform-admin-eclassroom.js —— 平台管理端「课堂服务实例管理」+「租户课堂绑定」
 *
 * 依赖：window.request（utility_request.js）、escapeHtml（api.js）
 * 接口（booking-api /api/v1/eclassroom，normalizeUrl 自动补前缀）：
 *   GET    /eclassroom/instances                 实例列表
 *   POST   /eclassroom/instances                 新建实例
 *   PUT    /eclassroom/instances/{id}            修改实例
 *   DELETE /eclassroom/instances/{id}            删除实例
 *   GET    /eclassroom/tenant/{tenantId}         查租户绑定
 *   PUT    /eclassroom/tenant/{tenantId}/bind?instanceId=   绑定/启用
 *   PUT    /eclassroom/tenant/{tenantId}/disable            禁用
 *   PUT    /eclassroom/tenant/{tenantId}/unbind             解绑
 */
(function () {
  var instanceCache = [];

  function esc(s) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(s);
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function statusText(s) {
    if (s === 1) return '正常';
    if (s === 0) return '停用';
    if (s === 2) return '维护中';
    return s == null ? '未知' : String(s);
  }

  function apiAddress(inst) {
    if (!inst) return '-';
    var host = inst.apiHost || '';
    var port = inst.apiPort ? ':' + inst.apiPort : '';
    var path = inst.apiBasePath || '';
    return (host || '-') + port + path;
  }

  function wsAddress(inst) {
    if (!inst) return '-';
    var host = inst.wsHost || '';
    var port = inst.wsPort ? ':' + inst.wsPort : '';
    var path = inst.wsBasePath || '';
    return (host || '-') + port + path;
  }

  // ===================== 实例管理页 =====================
  function renderEclassroomInstancesPage() {
    var c = document.getElementById('dynamic-content-center');
    if (!c) return;
    c.innerHTML =
      '<div class="card">' +
        '<div class="card-header">' +
          '<div class="card-title"><i class="fa fa-server"></i> 课堂服务实例管理</div>' +
          '<button class="btn btn-primary" onclick="openEclassroomInstanceModal(null)"><i class="fa fa-plus"></i> 新建实例</button>' +
        '</div>' +
        '<div class="table-container">' +
          '<table class="data-table">' +
            '<thead><tr>' +
              '<th>序号</th><th>实例编码</th><th>实例名称</th><th>API 地址</th><th>WS 地址</th>' +
              '<th>区域</th><th>容量</th><th>状态</th><th>操作</th>' +
            '</tr></thead>' +
            '<tbody id="eclassroom-instance-body">' +
              '<tr><td colspan="9" style="text-align:center;padding:20px;">加载中...</td></tr>' +
            '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>';
    loadEclassroomInstances();
  }

  function loadEclassroomInstances() {
    return request({ url: '/eclassroom/instances', method: 'get' })
      .then(function (list) {
        instanceCache = Array.isArray(list) ? list : [];
        renderEclassroomInstanceRows(instanceCache);
      })
      .catch(function (e) {
        console.warn('[eclassroom] 加载实例失败', e);
        var tb = document.getElementById('eclassroom-instance-body');
        if (tb) tb.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:20px;color:#c00;">加载失败</td></tr>';
      });
  }

  function renderEclassroomInstanceRows(rows) {
    var tb = document.getElementById('eclassroom-instance-body');
    if (!tb) return;
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:20px;">暂无实例</td></tr>';
      return;
    }
    tb.innerHTML = rows.map(function (inst, i) {
      return '<tr>' +
        '<td>' + (i + 1) + '</td>' +
        '<td>' + esc(inst.instanceCode || '') + '</td>' +
        '<td>' + esc(inst.instanceName || '') + '</td>' +
        '<td>' + esc(apiAddress(inst)) + '</td>' +
        '<td>' + esc(wsAddress(inst)) + '</td>' +
        '<td>' + esc(inst.region || '-') + '</td>' +
        '<td>' + (inst.maxCapacity != null ? inst.maxCapacity : '-') + '</td>' +
        '<td>' + statusText(inst.status) + '</td>' +
        '<td>' +
          '<button class="btn btn-default" onclick="openEclassroomInstanceModal(' + inst.id + ')">编辑</button> ' +
          '<button class="btn btn-danger" onclick="deleteEclassroomInstance(' + inst.id + ')">删除</button>' +
        '</td>' +
      '</tr>';
    }).join('');
  }

  function openEclassroomInstanceModal(id) {
    var inst = null;
    if (id != null) {
      for (var i = 0; i < instanceCache.length; i++) {
        if (Number(instanceCache[i].id) === Number(id)) { inst = instanceCache[i]; break; }
      }
    }
    var modal = document.getElementById('eclassroomInstanceModal');
    if (!modal) modal = createEclassroomInstanceModal();
    modal.style.display = 'flex';
    document.getElementById('eclassroomInstanceModalTitle').textContent = inst ? '编辑课堂实例' : '新建课堂实例';
    document.getElementById('eclassroomInstanceFormContainer').innerHTML = buildInstanceForm(inst);
    // 页脚错误提示现在留在滚动区外、不会随表单重建，打开时手动清一次
    var err = document.getElementById('eclassroomInstanceFormErr');
    if (err) err.textContent = '';
  }

  function createEclassroomInstanceModal() {
    var m = document.createElement('div');
    // --instance：仅本弹窗启用「限高 + 内容区滚动 + 固定页脚」，不影响页面里其它 modal
    m.className = 'modal-mask modal-mask--instance';
    m.id = 'eclassroomInstanceModal';
    m.style.display = 'none';
    m.innerHTML =
      '<div class="modal-content modal-content--instance">' +
        '<div class="modal-header">' +
          '<div id="eclassroomInstanceModalTitle" style="font-weight:600;font-size:16px;"></div>' +
          '<span class="modal-close" id="eclassroomInstanceCloseBtn">&times;</span>' +
        '</div>' +
        // 表单主体单独滚动；页脚（错误提示 + 保存/取消）留在滚动区外，永远可见可点
        '<div id="eclassroomInstanceFormContainer" class="modal-body--instance"></div>' +
        '<div class="modal-footer--instance">' +
          '<div class="form-error" id="eclassroomInstanceFormErr"></div>' +
          '<div class="btn-group">' +
            '<button type="button" class="btn btn-primary" onclick="submitEclassroomInstance()">保存</button>' +
            '<button type="button" class="btn btn-cancel" onclick="closeEclassroomInstanceModal()">取消</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(m);
    document.getElementById('eclassroomInstanceCloseBtn').addEventListener('click', closeEclassroomInstanceModal);
    return m;
  }

  /**
   * 表单按「基本信息 / API 服务 / WebSocket 服务」三段分组，每段双列网格。
   * 原来 12 个 form-line 一竖列排下来超过视口高度，且弹窗没有滚动容器，
   * 底部按钮被 mask 居中裁掉。字段名（name=）保持原样，submitEclassroomInstance 不动。
   */
  function buildInstanceForm(inst) {
    var isEdit = !!(inst && inst.id);
    function v(f) { return isEdit && inst[f] != null ? esc(inst[f]) : ''; }
    var statusSel = '<select name="status">' +
      '<option value="1"' + (isEdit && inst.status === 1 ? ' selected' : '') + '>正常</option>' +
      '<option value="0"' + (isEdit && inst.status === 0 ? ' selected' : '') + '>停用</option>' +
      '<option value="2"' + (isEdit && inst.status === 2 ? ' selected' : '') + '>维护中</option>' +
      '</select>';

    function section(title, lines) {
      return '<div class="ec-form-section">' +
        '<div class="ec-form-section-title">' + title + '</div>' +
        '<div class="ec-form-grid">' + lines + '</div>' +
        '</div>';
    }
    function line(label, control, full) {
      return '<div class="form-line' + (full ? ' form-line--full' : '') + '">' +
        '<label>' + label + '</label>' + control + '</div>';
    }
    function text(name, val, ph, type) {
      return '<input name="' + name + '"' + (type ? ' type="' + type + '"' : '') +
        ' value="' + val + '"' + (ph ? ' placeholder="' + ph + '"' : '') + '>';
    }

    return '' +
      '<form id="eclassroomInstanceForm" class="form-item eclassroom-instance-form">' +
        '<input type="hidden" name="id" value="' + (isEdit ? inst.id : '') + '">' +
        section('基本信息',
          line('实例编码', '<input name="instanceCode" value="' + v('instanceCode') + '" required placeholder="如 classroom-svc-1">') +
          line('实例名称', text('instanceName', v('instanceName'), '如 华东课堂服务-1')) +
          line('区域', text('region', v('region'), '如 cn-east-1')) +
          line('最大容量', text('maxCapacity', (isEdit && inst.maxCapacity != null ? inst.maxCapacity : 100), '', 'number')) +
          line('状态', statusSel) +
          line('备注', '<textarea name="remark">' + (isEdit ? esc(inst.remark || '') : '') + '</textarea>', true)) +
        section('API 服务',
          line('API 地址', text('apiHost', v('apiHost'), '如 127.0.0.1')) +
          line('API 端口', text('apiPort', (isEdit && inst.apiPort != null ? inst.apiPort : 8092), '', 'number')) +
          line('API 路径', text('apiBasePath', (isEdit ? v('apiBasePath') : '/api/v1'), '/api/v1'))) +
        section('WebSocket 服务',
          line('WS 地址', text('wsHost', v('wsHost'), '如 127.0.0.1')) +
          line('WS 端口', text('wsPort', (isEdit && inst.wsPort != null ? inst.wsPort : 8092), '', 'number')) +
          // 该字段是 WS 根路径，前端 classroom-ws.js 自己补 /ws/classrooms/...；
          // 旧 placeholder 写 /ws 会把人带进 /ws/ws/classrooms 的坑。
          line('WS 路径', text('wsBasePath', v('wsBasePath'), '留空即可（前端自动补 /ws/classrooms）'))) +
      '</form>';
  }

  function closeEclassroomInstanceModal() {
    var m = document.getElementById('eclassroomInstanceModal');
    if (m) m.style.display = 'none';
  }

  function submitEclassroomInstance() {
    var f = document.getElementById('eclassroomInstanceForm');
    if (!f) return;
    var id = f.id.value ? Number(f.id.value) : null;
    var data = {
      instanceCode: f.instanceCode.value.trim(),
      instanceName: f.instanceName.value.trim(),
      apiHost: f.apiHost.value.trim(),
      apiPort: f.apiPort.value ? Number(f.apiPort.value) : null,
      apiBasePath: f.apiBasePath.value.trim(),
      wsHost: f.wsHost.value.trim(),
      wsPort: f.wsPort.value ? Number(f.wsPort.value) : null,
      wsBasePath: f.wsBasePath.value.trim(),
      region: f.region.value.trim(),
      maxCapacity: f.maxCapacity.value ? Number(f.maxCapacity.value) : null,
      status: Number(f.status.value),
      remark: f.remark.value
    };
    if (!data.instanceCode) {
      document.getElementById('eclassroomInstanceFormErr').textContent = '实例编码必填';
      return;
    }
    if (id) data.id = id;
    request({
      url: id ? ('/eclassroom/instances/' + id) : '/eclassroom/instances',
      method: id ? 'put' : 'post',
      data: data
    })
      .then(function () { closeEclassroomInstanceModal(); loadEclassroomInstances(); })
      .catch(function (e) {
        console.warn('[eclassroom] 保存实例失败', e);
        var err = document.getElementById('eclassroomInstanceFormErr');
        if (err) err.textContent = (e && e.message) || '保存失败';
      });
  }

  function deleteEclassroomInstance(id) {
    if (!confirm('确认删除该课堂实例？')) return;
    request({ url: '/eclassroom/instances/' + id, method: 'delete' })
      .then(function () { loadEclassroomInstances(); })
      .catch(function (e) { console.warn('[eclassroom] 删除实例失败', e); });
  }

  // ===================== 租户课堂绑定 =====================
  function editTenantClassroom(tenantId) {
    if (!tenantId) { alert('缺少租户ID'); return; }
    // 先取实例列表（用于下拉），再取当前绑定
    Promise.all([
      request({ url: '/eclassroom/instances', method: 'get' }).catch(function () { return []; }),
      request({ url: '/eclassroom/tenant/' + tenantId, method: 'get' }).catch(function () { return null; })
    ]).then(function (res) {
      var instances = Array.isArray(res[0]) ? res[0] : [];
      var binding = res[1];
      openTenantClassroomModal(tenantId, binding, instances);
    });
  }

  function openTenantClassroomModal(tenantId, binding, instances) {
    var modal = document.getElementById('tenantClassroomModal');
    if (!modal) modal = createTenantClassroomModal();
    modal.style.display = 'flex';

    var boundInstanceId = binding ? binding.instanceId : null;
    var enabled = binding ? Number(binding.enabled) === 1 : false;
    var boundInst = null;
    for (var i = 0; i < instances.length; i++) {
      if (Number(instances[i].id) === Number(boundInstanceId)) { boundInst = instances[i]; break; }
    }

    var options = instances.map(function (inst) {
      var sel = (Number(inst.id) === Number(boundInstanceId)) ? ' selected' : '';
      return '<option value="' + inst.id + '"' + sel + '>' +
        esc(inst.instanceName || inst.instanceCode || inst.id) +
        '（' + esc(apiAddress(inst)) + ' / ' + statusText(inst.status) + '）</option>';
    }).join('');

    var body =
      '<div class="form-line"><label>当前状态</label>' +
        '<span>' + (binding ? (enabled ? '已启用' : '已禁用') : '未绑定') + '</span>' +
        (boundInst ? '（实例：' + esc(boundInst.instanceName || boundInst.instanceCode) + '）' : '') +
      '</div>' +
      '<div class="form-line"><label>选择实例</label><select id="tenantClassroomSelect">' +
        '<option value="">--请选择实例--</option>' + options +
      '</select></div>' +
      '<div class="form-line"><label>备注</label><input id="tenantClassroomRemark" value="' + (binding ? esc(binding.remark || '') : '') + '"></div>' +
      '<div class="btn-group">' +
        '<button type="button" class="btn btn-primary" onclick="bindTenantClassroom(' + tenantId + ')">' + (binding ? '切换/启用' : '启用课堂') + '</button>' +
        (binding ? '<button type="button" class="btn btn-warning" onclick="disableTenantClassroom(' + tenantId + ')">禁用</button>' : '') +
        (binding ? '<button type="button" class="btn btn-danger" onclick="unbindTenantClassroom(' + tenantId + ')">解绑</button>' : '') +
        '<button type="button" class="btn btn-cancel" onclick="closeTenantClassroomModal()">取消</button>' +
      '</div>';

    document.getElementById('tenantClassroomModalBody').innerHTML = body;
  }

  function createTenantClassroomModal() {
    var m = document.createElement('div');
    m.className = 'modal-mask';
    m.id = 'tenantClassroomModal';
    m.style.display = 'none';
    m.innerHTML =
      '<div class="modal-content">' +
        '<div class="modal-header">' +
          '<div style="font-weight:600;font-size:16px;">租户课堂配置</div>' +
          '<span class="modal-close" id="tenantClassroomCloseBtn">&times;</span>' +
        '</div>' +
        '<div id="tenantClassroomModalBody" class="form-item"></div>' +
      '</div>';
    document.body.appendChild(m);
    document.getElementById('tenantClassroomCloseBtn').addEventListener('click', closeTenantClassroomModal);
    return m;
  }

  function closeTenantClassroomModal() {
    var m = document.getElementById('tenantClassroomModal');
    if (m) m.style.display = 'none';
  }

  function bindTenantClassroom(tenantId) {
    var sel = document.getElementById('tenantClassroomSelect');
    var instanceId = sel ? sel.value : '';
    if (!instanceId) { alert('请先选择实例'); return; }
    request({
      url: '/eclassroom/tenant/' + tenantId + '/bind',
      method: 'put',
      params: { instanceId: Number(instanceId) }
    })
      .then(function () {
        closeTenantClassroomModal();
        alert('课堂绑定成功');
        if (typeof window.loadTenantList === 'function') window.loadTenantList();
      })
      .catch(function (e) { console.warn('[eclassroom] bind failed', e); alert('绑定失败'); });
  }

  function disableTenantClassroom(tenantId) {
    if (!confirm('确认禁用该租户课堂？')) return;
    request({ url: '/eclassroom/tenant/' + tenantId + '/disable', method: 'put' })
      .then(function () { closeTenantClassroomModal(); alert('课堂已禁用'); })
      .catch(function (e) { console.warn('[eclassroom] disable failed', e); alert('禁用失败'); });
  }

  function unbindTenantClassroom(tenantId) {
    if (!confirm('确认解绑该租户课堂？解绑后将删除绑定记录。')) return;
    request({ url: '/eclassroom/tenant/' + tenantId + '/unbind', method: 'put' })
      .then(function () { closeTenantClassroomModal(); alert('课堂已解绑'); })
      .catch(function (e) { console.warn('[eclassroom] unbind failed', e); alert('解绑失败'); });
  }

  // ===================== 课堂监视页（2026-11-20） =====================
  //
  // 数据来源是后端 GET /eclassroom/monitor/instances：
  //   租户归属来自主库 sys_tenant_eclassroom；
  //   课程数/在线数由后端**逐个问实例**（每个实例自己的课堂库）后合并。
  // 所以页面不做聚合，只渲染；实例不可达时后端会带 reachable=false + error。

  var monitorCache = [];
  var monitorTimer = null;

  function renderEclassroomMonitorPage() {
    var c = document.getElementById('dynamic-content-center');
    if (!c) return;
    c.innerHTML =
      '<div class="card">' +
        '<div class="card-header">' +
          '<div class="card-title"><i class="fa fa-desktop"></i> 课堂监视</div>' +
          '<div style="display:flex;align-items:center;gap:12px;">' +
            '<span id="eclassroom-monitor-tip" style="color:#888;font-size:12px;"></span>' +
            '<button class="btn btn-primary" onclick="loadEclassroomMonitor(true)"><i class="fa fa-sync"></i> 刷新</button>' +
          '</div>' +
        '</div>' +
        '<div class="table-container">' +
          '<table class="data-table">' +
            '<thead><tr>' +
              '<th>序号</th><th>实例</th><th>区域</th><th>状态</th><th>所属租户</th>' +
              '<th>今日课程</th><th>进行中</th><th>待开始</th><th>实时在线</th><th>容量</th>' +
            '</tr></thead>' +
            '<tbody id="eclassroom-monitor-body">' +
              '<tr><td colspan="10" style="text-align:center;padding:20px;">加载中...</td></tr>' +
            '</tbody>' +
          '</table>' +
        '</div>' +
        '<div class="card-body" style="font-size:12px;color:#888;line-height:1.8;">' +
          '口径：<b>今日课程</b> = 今日开课数（含已结束）；<b>进行中</b> = 当前 LIVE；' +
          '<b>待开始</b> = 已就绪未开课（READY）；<b>实时在线</b> = 上述课堂内实测在线人数合计。' +
          '数据由各实例自行统计后回传，实例不可达时对应格子显示「—」并给出原因；' +
          '页面打开期间每 30 秒自动刷新，切走后自动停止。<br>' +
          '注意：<b>容量</b>是实例登记的配置值，系统当前未据此做准入校验（见「课堂实例容量字段现状分析」）。' +
        '</div>' +
      '</div>';
    loadEclassroomMonitor(false);
    startMonitorAutoRefresh();
  }

  /** 每 30 秒自动刷新；DOM 一旦不在了（切到别的菜单）就自己停，避免定时器堆在后台。 */
  function startMonitorAutoRefresh() {
    stopMonitorAutoRefresh();
    monitorTimer = setInterval(function () {
      if (!document.getElementById('eclassroom-monitor-body')) {
        stopMonitorAutoRefresh();
        return;
      }
      loadEclassroomMonitor(false);
    }, 30000);
  }

  function stopMonitorAutoRefresh() {
    if (monitorTimer) {
      clearInterval(monitorTimer);
      monitorTimer = null;
    }
  }

  function loadEclassroomMonitor(manual) {
    var tip = document.getElementById('eclassroom-monitor-tip');
    if (tip && manual) tip.textContent = '刷新中…';
    return request({ url: '/eclassroom/monitor/instances', method: 'get' })
      .then(function (list) {
        monitorCache = Array.isArray(list) ? list : [];
        renderEclassroomMonitorRows(monitorCache);
        if (tip) {
          var d = new Date();
          var pad = function (n) { return (n < 10 ? '0' : '') + n; };
          tip.textContent = '数据时间 ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
            + '，共 ' + monitorCache.length + ' 个实例';
        }
      })
      .catch(function (e) {
        console.warn('[eclassroom] 加载课堂监视失败', e);
        var tb = document.getElementById('eclassroom-monitor-body');
        if (tb) tb.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:20px;color:#c00;">加载失败，请稍后重试</td></tr>';
        if (tip) tip.textContent = '加载失败';
      });
  }

  /** 统计格：实例不可达时统一显示「—」，避免把"没采集到"误读成"0 节课" */
  function monitorNum(row, key) {
    if (!row.reachable) return '<span style="color:#c0c0c0;">—</span>';
    var v = row[key];
    return (v == null) ? '-' : esc(String(v));
  }

  /** 租户格：数量 + 前两个名称，完整名单放 title；被禁用的绑定单独标注 */
  function monitorTenantsCell(row) {
    var list = Array.isArray(row.tenants) ? row.tenants : [];
    if (!list.length) return '<span style="color:#aaa;">未绑定</span>';
    var names = list.map(function (t) {
      var n = t.orgName || t.tenantCode || ('租户#' + t.tenantId);
      return (t.enabled === 0 || t.enabled === false) ? (n + '（已禁用）') : n;
    });
    var shown = names.slice(0, 2).join('、') + (names.length > 2 ? ' 等' : '');
    return '<span title="' + esc(names.join('、')) + '">' + esc(shown) + '</span>' +
      '<div style="font-size:12px;color:#888;">共 ' + names.length + ' 个</div>';
  }

  function renderEclassroomMonitorRows(rows) {
    var tb = document.getElementById('eclassroom-monitor-body');
    if (!tb) return;
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:20px;">暂无课堂实例</td></tr>';
      return;
    }
    tb.innerHTML = rows.map(function (r, i) {
      var title = esc(r.instanceName || r.instanceCode || ('#' + r.id));
      var sub = r.instanceCode ? ('<div style="font-size:12px;color:#888;">' + esc(r.instanceCode) + '</div>') : '';
      var err = r.reachable ? ''
        : ('<div style="font-size:12px;color:#c00;">' + esc(r.error || '未采集') + '</div>');
      return '<tr>' +
        '<td>' + (i + 1) + '</td>' +
        '<td>' + title + sub + err + '</td>' +
        '<td>' + esc(r.region || '-') + '</td>' +
        '<td>' + statusText(r.status) + '</td>' +
        '<td>' + monitorTenantsCell(r) + '</td>' +
        '<td>' + monitorNum(r, 'todayClasses') + '</td>' +
        '<td>' + monitorNum(r, 'liveClasses') + '</td>' +
        '<td>' + monitorNum(r, 'readyClasses') + '</td>' +
        '<td>' + monitorNum(r, 'onlineUsers') + '</td>' +
        '<td>' + (r.maxCapacity != null ? esc(String(r.maxCapacity)) : '-') + '</td>' +
      '</tr>';
    }).join('');
  }

  // 导出到 window（HTML onclick 调用）
  window.renderEclassroomInstancesPage = renderEclassroomInstancesPage;
  window.renderEclassroomMonitorPage = renderEclassroomMonitorPage;
  window.loadEclassroomMonitor = loadEclassroomMonitor;
  window.loadEclassroomInstances = loadEclassroomInstances;
  window.openEclassroomInstanceModal = openEclassroomInstanceModal;
  window.closeEclassroomInstanceModal = closeEclassroomInstanceModal;
  window.submitEclassroomInstance = submitEclassroomInstance;
  window.deleteEclassroomInstance = deleteEclassroomInstance;
  window.editTenantClassroom = editTenantClassroom;
  window.closeTenantClassroomModal = closeTenantClassroomModal;
  window.bindTenantClassroom = bindTenantClassroom;
  window.disableTenantClassroom = disableTenantClassroom;
  window.unbindTenantClassroom = unbindTenantClassroom;
})();