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
    document.getElementById('eclassroomInstanceModalTitle').innerText = inst ? '编辑课堂实例' : '新建课堂实例';
    document.getElementById('eclassroomInstanceFormContainer').innerHTML = buildInstanceForm(inst);
  }

  function createEclassroomInstanceModal() {
    var m = document.createElement('div');
    m.className = 'modal-mask';
    m.id = 'eclassroomInstanceModal';
    m.style.display = 'none';
    m.innerHTML =
      '<div class="modal-content">' +
        '<div class="modal-header">' +
          '<div id="eclassroomInstanceModalTitle" style="font-weight:600;font-size:16px;"></div>' +
          '<span class="modal-close" id="eclassroomInstanceCloseBtn">&times;</span>' +
        '</div>' +
        '<div id="eclassroomInstanceFormContainer"></div>' +
      '</div>';
    document.body.appendChild(m);
    document.getElementById('eclassroomInstanceCloseBtn').addEventListener('click', closeEclassroomInstanceModal);
    return m;
  }

  function buildInstanceForm(inst) {
    var isEdit = !!(inst && inst.id);
    function v(f) { return isEdit && inst[f] != null ? esc(inst[f]) : ''; }
    return '' +
      '<form id="eclassroomInstanceForm" class="form-item">' +
        '<input type="hidden" name="id" value="' + (isEdit ? inst.id : '') + '">' +
        '<div class="form-line"><label>实例编码</label><input name="instanceCode" value="' + v('instanceCode') + '" required placeholder="如 classroom-svc-1"></div>' +
        '<div class="form-line"><label>实例名称</label><input name="instanceName" value="' + v('instanceName') + '" placeholder="如 华东课堂服务-1"></div>' +
        '<div class="form-line"><label>API 地址</label><input name="apiHost" value="' + v('apiHost') + '" placeholder="如 127.0.0.1"></div>' +
        '<div class="form-line"><label>API 端口</label><input name="apiPort" type="number" value="' + (isEdit && inst.apiPort != null ? inst.apiPort : 8092) + '"></div>' +
        '<div class="form-line"><label>API 路径</label><input name="apiBasePath" value="' + (isEdit ? v('apiBasePath') : '/api/v1') + '" placeholder="/api/v1"></div>' +
        '<div class="form-line"><label>WS 地址</label><input name="wsHost" value="' + v('wsHost') + '" placeholder="如 127.0.0.1"></div>' +
        '<div class="form-line"><label>WS 端口</label><input name="wsPort" type="number" value="' + (isEdit && inst.wsPort != null ? inst.wsPort : 8092) + '"></div>' +
        '<div class="form-line"><label>WS 路径</label><input name="wsBasePath" value="' + v('wsBasePath') + '" placeholder="/ws"></div>' +
        '<div class="form-line"><label>区域</label><input name="region" value="' + v('region') + '" placeholder="如 cn-east-1"></div>' +
        '<div class="form-line"><label>最大容量</label><input name="maxCapacity" type="number" value="' + (isEdit && inst.maxCapacity != null ? inst.maxCapacity : 100) + '"></div>' +
        '<div class="form-line"><label>状态</label><select name="status">' +
          '<option value="1"' + (isEdit && inst.status === 1 ? ' selected' : '') + '>正常</option>' +
          '<option value="0"' + (isEdit && inst.status === 0 ? ' selected' : '') + '>停用</option>' +
          '<option value="2"' + (isEdit && inst.status === 2 ? ' selected' : '') + '>维护中</option>' +
        '</select></div>' +
        '<div class="form-line"><label>备注</label><textarea name="remark">' + (isEdit ? esc(inst.remark || '') : '') + '</textarea></div>' +
        '<div class="form-error" id="eclassroomInstanceFormErr"></div>' +
        '<div class="btn-group">' +
          '<button type="button" class="btn btn-primary" onclick="submitEclassroomInstance()">保存</button>' +
          '<button type="button" class="btn btn-cancel" onclick="closeEclassroomInstanceModal()">取消</button>' +
        '</div>' +
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
      document.getElementById('eclassroomInstanceFormErr').innerText = '实例编码必填';
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
        if (err) err.innerText = (e && e.message) || '保存失败';
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

  // 导出到 window（HTML onclick 调用）
  window.renderEclassroomInstancesPage = renderEclassroomInstancesPage;
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