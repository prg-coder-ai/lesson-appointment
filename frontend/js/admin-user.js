 // 用户列表 管理。通过role筛选用户 教师和学生
   // 引入分页组件js
   document.write('<script src="/js/public/pagefoot.js"></script>');
   
   window.renderTeacherCards = renderTeacherCards;
   let currentUserRole ="";

   // 当前页用户的「原始」数据缓存（userId -> user）。
   // 必须缓存原始值：表格里展示的手机号/邮箱是 maskPhone/maskEmail 脱敏后的结果
   //（如 138****1234、t***@qq.com），编辑弹窗若直接读 DOM 回填，
   // 用户一保存就会把脱敏串当成真实数据写回数据库。
   let userRowCache = new Map();
   async function renderTeacherCards(role) {
           currentUserRole     = role;
           // 同一函数同时服务「教师列表」与「学生列表」两个菜单，
           // 仅靠函数名无法区分，需显式给出列表标识，避免两者的页码互相串味。
           assignLoadobjectListFunction( loadAndRenderUserList, 'userList:' + role);

               let html = `
                <div class="card">
                  <div class="card-header">
                    <div class="card-title"><i class="fa fa-chalkboard-teacher"></i> ${role=="teacher"?"教师列表":"学生列表" } </div>
                    <button class="btn btn-primary" onclick="openAddUserModal()"><i class="fa fa-plus"></i> 添加用户</button>
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
                    <option value="pending">待审核/未生效</option>
                    <option value="frozen">已删除</option>                    
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
  
          // 数据脱敏：手机号屏蔽中间4位
          function maskPhone(phone) {
            if (!phone) return "";
            const s = String(phone).trim();
            if (s.length === 0) return "";
            if (s.length === 11) {
              return s.substring(0, 3) + "****" + s.substring(7);
            }
            if (s.length <= 4) {
              return "*".repeat(s.length);
            }
            return s.substring(0, 1) + "*".repeat(s.length - 2) + s.substring(s.length - 1);
          }

          // 数据脱敏：邮箱@之前部分保留首尾字符，中间屏蔽4个字符
          function maskEmail(email) {
            if (!email) return "";
            const s = String(email).trim();
            if (s.length === 0) return "";
            const atIdx = s.indexOf("@");
            if (atIdx < 0) return s;
            const local = s.substring(0, atIdx);
            const domain = s.substring(atIdx);
            const len = local.length;
            if (len === 0) return domain;
            let masked;
            if (len === 1) {
              masked = "*";
            } else if (len === 2) {
              masked = local.substring(0, 1) + "*";
            } else if (len <= 5) {
              masked = local.substring(0, 1) + "*".repeat(len - 2) + local.substring(len - 1);
            } else {
              masked = local.substring(0, 1) + "****" + local.substring(len - 1);
            }
            return masked + domain;
          }

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
            
            userList.forEach(tea => {
              index ++;
              html += `
                    <tr>
                     <td> ${index} </td>
                     <td style="display:none;">${tea.userId || ""}</td>
                    <td ${role=="teacher"? ` class="js-teacher-name"style="cursor:pointer;" onclick="teacherInfoBoard('${tea.userId}')"` : ""}>${tea.name || ""}</td>
                    <td>${tea.account || ""}</td>
                     <td>${maskEmail(tea.email || "")}</td>
                     <td>${maskPhone(tea.phone || "")}</td>
                    <td>
                      ${ tea.status === "pending" ? '<span style="color:#faad14;">待审核</span>' :
                        tea.status === "active" ? '<span style="color:#52c41a;">正常</span>' :                        
                        tea.status === "frozen" ? '<span style="color:#f5222d;">已删除</span>' :                       
                        `<span>${tea.status||"未知"}</span>`
                      }
                      </td>
                  
                  <td>
                    <button class="btn btn-primary" onclick="openEditUserModal('${tea.userId}')"><i class="fa fa-edit"></i> 编辑</button>
                    ${tea.status === "pending" ? `<button class="btn btn-success"  onclick="confirmTeacher('${tea.userId}', '${tea.role}')"><i class="fa fa-check"></i> 启用</button>` :'' }
                    ${tea.status === "active" ? `<button class="btn btn-warning" onclick="disableTeacher('${tea.userId}', '${tea.role}')"><i class="fa fa-ban"></i> 禁用</button>` :'' }
                    ${tea.status === "pending" ? `<button class="btn btn-danger" onclick="deleteTeacher('${tea.userId}', '${tea.role}')"><i class="fa fa-trash"></i> 删除</button>` :'' }
                    <button class="btn btn-warning" onclick="resetUserPasswd('${tea.userId}')"><i class="fa fa-trash"></i> 重置密码</button>
                    <button class="btn btn-info" onclick="window.openComposeToUser('${tea.userId}','${tea.role}','${(tea.name||'').replace(/'/g,"")}')"><i class="fa fa-comment"></i> 发消息</button>
                     
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
    
    // ===================== 添加用户（区分角色：教师/学生） =====================
    function openAddUserModal() {
      let modal = document.getElementById('addUserModal');
      if (!modal) modal = createAddUserModal();
      modal.style.display = 'flex';
      const isTeacher = currentUserRole === 'teacher';
      document.getElementById('addUserModalTitle').innerText = '添加' + (isTeacher ? '教师' : '学生');
      const fc = document.getElementById('addUserModalFormContainer');
      fc.innerHTML = `
        <form id="addUserForm" class="form-item">
          <input type="hidden" name="role" value="${currentUserRole}">
          <div class="form-line"><label>角色</label><input value="${isTeacher ? '教师' : '学生'}" readonly></div>
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
      { value: 'pending', text: '待审核/未生效' },
      { value: 'frozen',  text: '已删除' }
    ];

    function openEditUserModal(userId) {
      // 必须走缓存取原始值：表格里展示的是 maskPhone/maskEmail 脱敏结果
      //（如 138****1234），若从 DOM 回填，用户一保存就会把脱敏串写成真实数据。
      const user = userRowCache.get(String(userId));
      if (!user) { alert('未找到该用户的数据，请刷新列表后重试'); return; }

      let modal = document.getElementById('editUserModal');
      if (!modal) modal = createEditUserModal();
      modal.style.display = 'flex';

      document.getElementById('editUserModalTitle').innerText =
        '编辑' + (currentUserRole === 'teacher' ? '教师' : '学生') + '信息';

      const status = user.status || 'pending';
      document.getElementById('editUserModalFormContainer').innerHTML = `
        <form id="editUserForm" class="form-item">
          <input type="hidden" name="userId" value="${escapeAttr(user.userId)}">
          <div class="form-line"><label>账号</label><input value="${escapeAttr(user.account)}" readonly
               title="账号为登录标识，不可修改"></div>
          <div class="form-line"><label>姓名</label><input name="name" value="${escapeAttr(user.name)}" placeholder="用户姓名"></div>
          <div class="form-line"><label>手机号</label><input name="phone" value="${escapeAttr(user.phone)}" placeholder="手机号（与邮箱至少填一项）"></div>
          <div class="form-line"><label>电子邮箱</label><input name="email" value="${escapeAttr(user.email)}" placeholder="电子邮箱（与手机号至少填一项）"></div>
          <div class="form-line"><label>状态</label><select name="status">
            ${EDITABLE_STATUS.map(s => `<option value="${s.value}"${s.value === status ? ' selected' : ''}>${s.text}</option>`).join('')}
          </select></div>
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
                  window.location.href = `./teacherInfo.html?userId=${userId}`;
                }
               //禁用
                async  function disableTeacher(userId,role) {
                          // 调用 update(User) 把 status 设置为 inactive
                          const user = {userId: userId, status: "pending" };
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