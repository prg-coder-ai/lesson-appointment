 // 用户列表 管理。通过 role 筛选用户：教师 / 学生 / 管理员（同角色各自一份列表，实现复用）
   // 引入分页组件js
   document.write('<script src="/js/public/pagefoot.js"></script>');
   
   window.renderTeacherCards = renderTeacherCards;
   let currentUserRole ="";

   // ===== 角色显示词（教师/学生/管理员三个列表共用一套渲染） =====
   // 教师、学生走行业词表（termText），同一套代码在不同行业显示不同称谓；
   // 管理员是职能角色，各行业叫法一致，不进词表，直接用字面量。
   // 挂在 window 上而不是顶层 function/const：本文件未包 IIFE，顶层声明会进全局作用域，
   // 与 admin.html 其余脚本存在同名碰撞风险（历史上就因此整份脚本 SyntaxError，
   // 见 tools/check-global-collide.mjs 的注释）。属性赋值不产生词法绑定，安全。
   window.adminUserRoleText = function (role) {
     if (role === 'admin') return '管理员';
     if (role === 'teacher') return (typeof termText === 'function') ? termText('teacher') : '教师';
     if (role === 'student') return (typeof termText === 'function') ? termText('student') : '学生';
     return role || '用户';
   };
   // 列表标题里的角色词：教师/学生保留 data-term 锚点，让 applyTerms 能整词替换
   window.adminUserRoleLabelHtml = function (role) {
     if (role === 'teacher') return '<span data-term="teacher">教师</span>';
     if (role === 'student') return '<span data-term="student">学生</span>';
     return '管理员';
   };
   window.adminUserRoleIcon = function (role) {
     if (role === 'teacher') return 'fa-chalkboard-teacher';
     if (role === 'student') return 'fa-user-graduate';
     return 'fa-user-shield';
   };

   // ===== 当前登录账号 =====
   // 提到 window 上供「列表渲染」与「编辑弹窗」共用：两处若各自从 localStorage 解析一遍，
   // 取值口径迟早分叉（一处取 token 里的 sub、一处取 currentUser.userId）。
   // 自锁防护的 UI 侧判定全靠它（服务端权威判定在 UserService.assertNoAdminSelfLock）。
   window.adminUserLoginId = function () {
     try {
       const cu = JSON.parse(localStorage.getItem('currentUser') || 'null');
       return cu && cu.userId ? String(cu.userId) : '';
     } catch (e) {
       return '';
     }
   };

   // 当前页用户的「原始」数据缓存（userId -> user）。
   // 必须缓存原始值：表格里展示的手机号/邮箱是 maskPhone/maskEmail 脱敏后的结果
   //（如 138****1234、t***@qq.com），编辑弹窗若直接读 DOM 回填，
   // 用户一保存就会把脱敏串当成真实数据写回数据库。
   let userRowCache = new Map();

  // HTML 属性上下文转义（防止姓名/ID 含引号或 < > 破坏 onclick 等内联属性 → 链接中断）
  function escAttr(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // 列表页「发消息」链接：用 data 属性 + 事件委托，避免把用户数据拼进内联 onclick 字符串
  if (!window.__msgComposeDelegate) {
    window.__msgComposeDelegate = true;
    document.addEventListener('click', function (e) {
      const btn = e.target && e.target.closest && e.target.closest('[data-compose-uid]');
      if (!btn) return;
      const id = btn.getAttribute('data-compose-uid');
      const role = btn.getAttribute('data-compose-role');
      const name = btn.getAttribute('data-compose-name') || '';
      const account = btn.getAttribute('data-compose-account') || '';
      if (typeof window.openComposeToUser === 'function') window.openComposeToUser(id, role, name, account);
    });
  }

   async function renderTeacherCards(role) {
           currentUserRole     = role;
           // 同一函数同时服务「教师列表」「学生列表」「管理员列表」三个菜单，
           // 仅靠函数名无法区分，需显式给出列表标识，避免几者的页码互相串味。
           assignLoadobjectListFunction( loadAndRenderUserList, 'userList:' + role);

               let html = `
                <div class="card">
                  <div class="card-header">
                    <div class="card-title"><i class="fa ${window.adminUserRoleIcon(role)}"></i> ${window.adminUserRoleLabelHtml(role)} 列表</div>
                    <button class="btn btn-primary" onclick="openAddUserModal()"><i class="fa fa-plus"></i> 添加${window.adminUserRoleText(role)}</button>
                  </div>
                  <div class="teacher-list-cards" style="margin:6px 0;display:flex;flex-direction:column;gap:16px;">
               
              <!-- 筛选条件 -->
              <div class="filter-bar">  
                <!-- div class="filter-item">
                  <label  style="display:none" >角色：</label>
                  <input type="text" style="display:none"  id="user-role-input" ,value = ${role}>
                </div  -->

                <div class="filter-item">
                  <label></label>
                  <input type="text" id="user-name-input" placeholder="姓名">
                </div>
                                 <div class="filter-item">
                   <label></label>
                  <input type="text" id="user-account-input" placeholder="账号">
                </div>

                <div class="filter-item">
                   <label></label>
                  <input type="text" id="user-email-input" placeholder="电子邮件">
                </div>
                <div class="filter-item">
                   <label></label>
                  <input type="text" id="user-phone-input" placeholder="电话号码">
                </div>

                <div class="filter-item">
                  <label></label>
                  <select id="user-status-select">
                    <option value="">用户状态</option>
                    <option value="active">正常</option>
                    <option value="pending">待审核（暂不可登录）</option>
                    <option value="frozen">已禁用</option>                    
                  </select>
                </div> 
                <button class="btn btn-default" onclick="localsearchUsers()">
                  <i class="fa fa-search"></i> 搜索
                </button>
                <button class="btn" onclick="resetUserFilter()">
                  <i class="fa fa-redo"></i> 重置
                </button>
              </div> 
             
               <!-- 数据表格 -->
              <div class="table-container">
                <table class="data-table">
                <thead>
                <tr> 
                    <th>序号</th>  
                    <th style="width:0px;display:none">Id</th>
                    <th>姓名</th>  
                    <th>账号</th> 
                    <th>电子邮箱</th> 
                    <th>电话号码</th>                    
                    <th>状态</th>
                    <th>操作</th>
                </tr>
                </thead>
                <tbody id="user-table-body">
                <!-- 数据由JS动态渲染 -->
                 </tbody>
              </table>
              </div> 
                `;             
              
          // <!-- 分页栏 -->
            html += getPagebar();//defined in pageFoot.js
            html += `          
          </div>
          `;
              dynamicContentCenter.innerHTML = html;
              applyTerms(dynamicContentCenter);
              loadUserList(role);//"teacher");
      } 

            function localsearchUsers() {
              Pagination.pageNum = 1;
              loadAndRenderUserList();
            }
              // 重置筛选条件
        function resetUserFilter() {
            document.getElementById('user-name-input').value = '';
            document.getElementById('user-email-input').value = '';
            document.getElementById('user-phone-input').value = '';
            document.getElementById('user-account-input').value = '';
            document.getElementById('user-status-select').value = '';
            Pagination.pageNum = 1;
           loadAndRenderUserList();
        }


        
// ===================== 交互函数 =====================
           function loadAndRenderUserList(){
            //const role = document.getElementById('user-role-input').value.trim();//
            //console.error("role",role);
             loadUserList(currentUserRole);
           } 
// 加载用户列表,并分页显示在表格中
// role: 教师或学生
      async function loadUserList(role){                      
            const params = new URLSearchParams({
              pageNum:  Pagination.pageNum,
              pageSize: Pagination.pageSize,
              role:     role,
              name:    document.getElementById('user-name-input').value.trim(),
              email:   document.getElementById('user-email-input').value.trim(), 
              phone:   document.getElementById('user-phone-input').value.trim(), 
              account: document.getElementById('user-account-input').value.trim(),  
              status:  document.getElementById('user-status-select').value
            });
              
            
            try {
              const result = await request({url:`/user/page?${params.toString()}` });
              //const result = await res.json();
              
              if (result ) {
                const pageData = result;//.data;
                // 更新分页状态
                Pagination.total = pageData.total;
                Pagination.totalPages = pageData.totalPages;
                
                // 渲染表格
                renderUserTable(pageData.rows,role);
                // 渲染分页栏,带入分页参数
                renderPagination( Pagination);
              }else {
                Pagination.total =0 ;
                Pagination.totalPages =0;                
                // 渲染表格
                renderUserTable([]);
                // 渲染分页栏,带入分页参数
                renderPagination( Pagination);
              }
            } catch (error) {
              console.error('加载列表失败：', error);
            }
          }
  
          // 数据脱敏：手机号/邮箱 使用 api.js 的全局 maskPhone / maskEmail（单一来源，避免多份实现）

          function renderUserTable(userList,role){
                
            const tbody = document.getElementById('user-table-body'); 

            // 每次重渲染都整体重建缓存：翻页或搜索后旧行已不在当前视图，
            // 留着会让编辑弹窗回填到上一条记录上。
            userRowCache.clear();
            (userList || []).forEach(u => {
              if (u && u.userId) userRowCache.set(String(u.userId), u);
            });

            if (!userList || userList.length === 0) {
              tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#999;padding:40px 0;">暂无数据</td></tr>';
              return;
            }
             let  html  = ` `;
            var index=(Pagination.pageNum-1)*Pagination.pageSize;//记录序号

            // 管理员列表专用：识别「当前登录账号」。
            // 理由：管理员把自己冻结/删除后，本租户就再没有能审批账号的人（只能找平台管理员救场），
            // 属于一键自锁事故，因此对自己这一行不渲染「禁用/删除」。
            var currentLoginUserId = window.adminUserLoginId();

            userList.forEach(tea => {
              index ++;
              var isSelf = role === "admin" && currentLoginUserId && String(tea.userId) === currentLoginUserId;
              html += `
                    <tr>
                     <td> ${index} </td>
                     <td style="display:none;">${tea.userId || ""}</td>
                    <td ${role=="teacher"? ` class="js-teacher-name"style="cursor:pointer;" onclick="teacherInfoBoard('${escAttr(tea.userId)}')"` : ""}>${tea.name || ""}</td>
                    <td>${tea.account || ""}${isSelf ? '<span style="color:#1677ff;font-size:12px;margin-left:4px;">（当前账号）</span>' : ''}</td>
                     <td>${maskEmail(tea.email || "")}</td>
                     <td>${maskPhone(tea.phone || "")}</td>
                    <td>
                      ${ tea.status === "pending" ? '<span style="color:#faad14;">待审核</span>' :
                        tea.status === "active" ? '<span style="color:#52c41a;">正常</span>' :                        
                        tea.status === "frozen" ? '<span style="color:#f5222d;">已禁用</span>' :                       
                        `<span>${tea.status||"未知"}</span>`
                      }
                      </td>
                  
                  <td>
                    <button class="btn btn-primary" onclick="openEditUserModal('${tea.userId}')"><i class="fa fa-edit"></i> 编辑</button>
                    ${tea.status === "pending" ? `<button class="btn btn-success"  onclick="confirmTeacher('${tea.userId}', '${tea.role}')"><i class="fa fa-check"></i> 启用</button>` :'' }
                    ${tea.status === "active" && !isSelf ? `<button class="btn btn-warning" onclick="disableTeacher('${tea.userId}', '${tea.role}')"><i class="fa fa-ban"></i> 禁用</button>` :'' }
                    ${tea.status === "pending" && !isSelf ? `<button class="btn btn-danger" onclick="deleteTeacher('${tea.userId}', '${tea.role}')"><i class="fa fa-trash"></i> 删除</button>` :'' }
                    <button class="btn btn-warning" onclick="resetUserPasswd('${tea.userId}')"><i class="fa fa-trash"></i> 重置密码</button>
                    <button class="btn btn-info" data-compose-uid="${escAttr(tea.userId)}" data-compose-role="${escAttr(tea.role)}" data-compose-name="${escAttr(tea.name || '')}" data-compose-account="${escAttr(tea.account || '')}"><i class="fa fa-comment"></i> 发消息</button>
                     
                  </td>
                </tr>
              `;
             })
             tbody.innerHTML = html;
          }
          //利用changepasswordapi设置用户密码为缺省值
    function resetUserPasswd(userId) { 
      if (!confirm("确定要重置此用户的密码为默认值吗？")) {
        return;
      }
      changePasswordAPI(userId,"123456");
    }
    
    // ===================== 添加用户（区分角色：教师/学生/管理员） =====================
    function openAddUserModal() {
      let modal = document.getElementById('addUserModal');
      if (!modal) modal = createAddUserModal();
      modal.style.display = 'flex';
      // 角色显示词取「纯文本」：input 的 value 是属性上下文，塞不了 HTML 标签。
      // 原写法把 '<span data-term="teacher">教师</span>' 直接放进 value="..."，
      // 标签里的内层双引号会提前截断属性，浏览器把标签当成值渲染 → 只读框里显示一串 XML。
      // 又：弹窗挂在 document.body，列表处那次 applyTerms 覆盖不到它，
      // 故这里与 applyTerms 同源同优先级的取词，标题与输入框才不会各说各话。
      // 教师/学生走行业词表，管理员固定为字面量（见 window.adminUserRoleText）。
      const roleText = window.adminUserRoleText(currentUserRole);
      document.getElementById('addUserModalTitle').textContent = '添加' + roleText;
      const fc = document.getElementById('addUserModalFormContainer');
    
      fc.innerHTML = `
        <form id="addUserForm" class="form-item">
          <input type="hidden" name="role" value="${currentUserRole}">
          <div class="form-line"><label>角色</label><input value="${escapeAttr(roleText)}" readonly></div>
          <div class="form-line"><label>账号</label><input name="account" placeholder="登录账号（租户内唯一）" required></div>
          <div class="form-line"><label>姓名</label><input name="name" placeholder="用户姓名"></div>
          <div class="form-line"><label>手机号</label><input name="phone" placeholder="手机号（与邮箱至少填一项）"></div>
          <div class="form-line"><label>电子邮箱</label><input name="email" placeholder="电子邮箱（与手机号至少填一项）"></div>
          <div class="form-line"><label>初始密码</label><input name="password" value="123456" placeholder="默认 123456"></div>
          <div class="form-tip">初始密码默认为 123456，用户首次登录后可自行重置。</div>
          <div class="form-error" id="addUserFormErr"></div>
          <div class="btn-group">
            <button type="button" class="btn btn-primary" onclick="submitAddUser()">保存</button>
            <button type="button" class="btn btn-cancel" onclick="closeAddUserModal()">取消</button>
          </div>
        </form>`;
    }
    // 模态框骨架工厂：添加用户与编辑用户共用，只有 id 和关闭函数名不同。
    // 约定派生 id：${modalId}Title（标题）/ ${modalId}FormContainer（表单容器）/ ${modalId}CloseBtn（右上角×）。
    function createUserModal(modalId, closeFnName) {
      const m = document.createElement('div');
      m.className = 'modal-mask'; m.id = modalId; m.style.display = 'none';
      m.innerHTML = `<div class="modal-content">
          <div class="modal-header"><div id="${modalId}Title" style="font-weight:600;font-size:16px;"></div>
            <span class="modal-close" id="${modalId}CloseBtn">&times;</span></div>
          <div id="${modalId}FormContainer"></div></div>`;
      document.body.appendChild(m);
      // 只允许通过「取消」「保存」按钮或右上角 × 关闭；点遮罩不关闭，
      // 避免表单填了一半时误触遮罩导致输入丢失。
      document.getElementById(modalId + 'CloseBtn').addEventListener('click', () => window[closeFnName]());
      return m;
    }
    function createAddUserModal()  { return createUserModal('addUserModal',  'closeAddUserModal'); }
    function createEditUserModal() { return createUserModal('editUserModal', 'closeEditUserModal'); }
    function closeAddUserModal() { const m = document.getElementById('addUserModal'); if (m) m.style.display = 'none'; }
    function closeEditUserModal() { const m = document.getElementById('editUserModal'); if (m) m.style.display = 'none'; }
    function submitAddUser() {
      const f = document.getElementById('addUserForm');
      const account = (f.account.value || '').trim();
      const phone = (f.phone.value || '').trim();
      const email = (f.email.value || '').trim();
      const err = document.getElementById('addUserFormErr');
      if (!account) { err.innerText = '账号不能为空'; return; }
      if (!phone && !email) { err.innerText = '手机号和电子邮箱至少填写一项'; return; }
      const data = {
        account: account,
        name: (f.name.value || '').trim(),
        phone: phone,
        email: email,
        password: (f.password.value || '').trim() || '123456',
        role: currentUserRole // 按当前页面角色区分：teacher / student
      };
      request({
        url: `${API_BASE_URL}/user/add`,
        method: 'POST',
        data: data
      }).then(() => {
        closeAddUserModal();
        loadUserList(currentUserRole); // 刷新当前角色列表
        alert('添加成功，初始密码为 ' + data.password);
      }).catch(() => { /* 错误提示由 request 拦截器统一处理 */ });
    }

    // ===================== 编辑用户（账号不可改） =====================
    // 可改字段：姓名 / 手机号 / 电子邮箱 / 状态。
    // 账号（account）与密码一律不可在此修改：账号是登录标识，
    // 改动会让用户登不上，也会破坏租户内唯一性约束。
    const EDITABLE_STATUS = [
      { value: 'active',  text: '正常' },
      { value: 'pending', text: '待审核（暂不可登录）' },
      { value: 'frozen',  text: '已禁用' }
    ];

    function openEditUserModal(userId) {
      // 必须走缓存取原始值：表格里展示的是 maskPhone/maskEmail 脱敏结果
      //（如 138****1234），若从 DOM 回填，用户一保存就会把脱敏串写成真实数据。
      const user = userRowCache.get(String(userId));
      if (!user) { alert('未找到该用户的数据，请刷新列表后重试'); return; }

      // 角色从缓存用户对象带入（user.role 优先，回退当前列表角色），
      // 否则 roleText 会退化成"学生"，导致编辑管理员的弹窗标题写错角色。
      const editRole = user.role || currentUserRole;

      let modal = document.getElementById('editUserModal');
      if (!modal) modal = createEditUserModal();
      modal.style.display = 'flex';
      // 与添加弹窗一致：动态文案取纯文本（弹窗在 body 上，applyTerms 覆盖不到），
      // 避免标题与输入框显示不一致。教师/学生走行业词表，管理员为字面量。
      const roleText = window.adminUserRoleText(editRole);
      document.getElementById('editUserModalTitle').textContent =
        '编辑' + roleText + '信息';

      const status = user.status || 'pending';

      // ===== 自锁防护（UI 侧）=====
      // 管理员把自己改成非 active，本租户就再没有能审批账号的人，只能改库才能恢复。
      // 服务端已在 UserService.assertNoAdminSelfLock 权威拦截（返回 400），
      // 这里把下拉置灰是「别让用户点了才知道」——刻意选置灰可见而非整行隐藏：
      // 用户能看到这个功能存在、也看得到为什么不能改，比凭空少一个控件更好理解。
      // ★ 必须同时判角色：只有管理员/平台管理员会被服务端拦，
      //   教师/学生列表里"自己"那一行（如果当前登录的恰好是教师）不受影响。
      const lockSelf = (editRole === 'admin' || editRole === 'platform_admin')
        && !!window.adminUserLoginId()
        && String(user.userId) === window.adminUserLoginId();

      const statusControl = lockSelf
        ? `<select name="status" disabled title="当前登录账号不可修改自身状态">
             <option value="active" selected>正常</option>
           </select>
           <div class="form-tip" style="color:#faad14;margin-top:4px;">
             当前登录账号不可修改自身状态：管理员一旦把自己置为非启用，
             本租户（或平台）将没有可用管理员审批，只能由数据库修复。请交由其他管理员操作。
           </div>`
        : `<select name="status">
             ${EDITABLE_STATUS.map(s => `<option value="${s.value}"${s.value === status ? ' selected' : ''}>${s.text}</option>`).join('')}
           </select>`;

      document.getElementById('editUserModalFormContainer').innerHTML = `
        <form id="editUserForm" class="form-item">
          <input type="hidden" name="userId" value="${escapeAttr(user.userId)}">
          <div class="form-line"><label>账号</label><input value="${escapeAttr(user.account)}" readonly
               title="账号为登录标识，不可修改"></div>
          <div class="form-line"><label>姓名</label><input name="name" value="${escapeAttr(user.name)}" placeholder="用户姓名"></div>
          <div class="form-line"><label>手机号</label><input name="phone" value="${escapeAttr(user.phone)}" placeholder="手机号（与邮箱至少填一项）"></div>
          <div class="form-line"><label>电子邮箱</label><input name="email" value="${escapeAttr(user.email)}" placeholder="电子邮箱（与手机号至少填一项）"></div>
          <div class="form-line"><label>状态</label>${statusControl}</div>
          <div class="form-tip">账号为登录标识，不可修改；手机号与电子邮箱至少保留一项。</div>
          <div class="form-error" id="editUserFormErr"></div>
          <div class="btn-group">
            <button type="button" class="btn btn-primary" onclick="submitEditUser()">保存</button>
            <button type="button" class="btn btn-cancel" onclick="closeEditUserModal()">取消</button>
          </div>
        </form>`;
    }

    function submitEditUser() {
      const f = document.getElementById('editUserForm');
      const err = document.getElementById('editUserFormErr');
      // 用 f.elements 取值：HTMLFormElement 带 LegacyOverrideBuiltIns，
      // 直接用 f.xxx 在遇到与表单自带属性同名的字段时语义会漂移，f.elements 无歧义。
      const userId = (f.elements.userId.value || '').trim();
      const phone  = (f.elements.phone.value  || '').trim();
      const email  = (f.elements.email.value  || '').trim();
      if (!userId) { err.innerText = '用户Id缺失，请刷新列表后重试'; return; }
      if (!phone && !email) { err.innerText = '手机号和电子邮箱至少填写一项'; return; }

      // 只提交可改字段；请求体里不带 account / password
      const data = {
        userId: userId,
        name:   (f.elements.name.value || '').trim(),
        phone:  phone,
        email:  email,
        status: f.elements.status.value
      };

      // 自锁兜底（UI 第二道）：状态下拉置灰 + 上面那道提示只是"别让用户点了才知道"，
      // 浏览器控制台改 DOM、或者干脆直接打 /user/updateInfo 都绕得过去；
      // 真正的权威拦截在服务端 UserService.assertNoAdminSelfLock（返回 400）。
      // 这里再判一次，是为了把"点了保存才吃 400"变成当场一句人话。
      const cached = userRowCache.get(String(userId));
      const targetRole = (cached && cached.role) || currentUserRole;
      const loginId = window.adminUserLoginId();
      if ((targetRole === 'admin' || targetRole === 'platform_admin')
          && loginId && String(userId) === loginId
          && data.status !== 'active') {
        err.innerText = '不能停用自己的账号状态，请交由其他管理员操作';
        return;
      }

      request({
        url: `${API_BASE_URL}/user/updateInfo`,
        method: 'POST',
        data: data
      }).then(() => {
        closeEditUserModal();
        loadUserList(currentUserRole); // 刷新当前角色列表
        alert('保存成功');
      }).catch(() => { /* 错误提示由 request 拦截器统一处理 */ });
    }


                //Detail--教师信息,用于提交图片、专业信息、时间段等，输出该教师的可用时段及推广信息
                function teacherInfoBoard(userId) {
                  // 必须走 pageUrl：teacherInfo.html 属于受保护的管理端子页，
                  // 少了 tCode 会被引擎守卫判为「租户不一致」而踢回登录页
                  //（历史上表现为：点了教师姓名先闪一下又回到登录界面）。
                  const href = (typeof window.pageUrl === 'function')
                    ? window.pageUrl('teacherInfo.html', { userId: userId })
                    : './teacherInfo.html?userId=' + encodeURIComponent(userId || '');
                  window.location.href = href;
                }
               //禁用
               // ★ 2026-10-24：这里原来写的是 status="pending"，是错的，已改为 frozen。
               //   两个原因：
               //   ① 语义污染 —— pending 是"注册后等审核"，禁用后与刚注册的账号在列表里长得一模一样，
               //      管理员无法区分谁是待审核、谁是被自己禁掉的；
               //   ② 曾经"看起来没生效" —— login 当时放行 pending，点了禁用用户照旧能登录。
               //   现在 pending 也拦了，但状态仍必须分开：CascadeRules 恢复租户只解 frozen、不动 pending，
               //   被禁用的账号在恢复租户后能自动复活，被误判成待审核的则不能。
               //   （小程序端与平台端一直用 frozen，本条是对齐它们的口径。）
                async  function disableTeacher(userId,role) {
                          const user = {userId: userId, status: "frozen" };
                          request({
                            url: `${API_BASE_URL}/user/updateStatus`,
                            method: 'POST',
                            data: user
                          }).then(res => {
                              loadUserList(role);
                          }).catch(e => {
                            alert("网络错误，禁用失败");
                          });

                        }
              //启用或确认--》正常状态
                        function confirmTeacher(userId,role) {
                          // 如果用户状态为pending/inactive/frozen，修改为active
                          request({
                            url: `${API_BASE_URL}/user/updateStatus`,
                            method: 'POST',
                            data: { userId: userId, status: "active" }
                          }).then(res => {
                              loadUserList(role);
                          }).catch(e => {
                            alert("网络错误，确认失败");
                          });

                        }
            //删除--冻结
                        function deleteTeacher(userId,role) {
                          if (confirm("确定要删除吗？")) {
                            request({
                              url: `${API_BASE_URL}/user/updateStatus`,
                              method: 'POST',
                              data: { userId: userId, status: "frozen" }
                            }).then(res => {
                                //  刷新列表
                                loadUserList(role);
                            }).catch(e => {
                              alert("网络错误，删除失败");
                            });

                          }
                        }
                        //--------------2026-08-29 调整显示状态