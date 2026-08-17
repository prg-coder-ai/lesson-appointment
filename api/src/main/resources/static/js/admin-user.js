
    /*let  Pagination = {
      pageNum: 1, // 当前页码
      pageSize: 10,  // 页大小
      total: 0,   // 总条数
      totalPages: 0 // // 总页数
    };*/
   // 引入分页组件js
   document.write('<script src="/js/public/pagefoot.js"></script>');
   
   window.renderTeacherCards = renderTeacherCards;
   let currentUserRole ="";
   async function renderTeacherCards(role) {
           currentUserRole     = role;
           assignLoadobjectListFunction( loadAndRenderUserList);

               let html = `
                <div class="card">
                  <div class="card-header">
                    <div class="card-title"><i class="fa fa-chalkboard-teacher"></i> ${role=="teacher"?"教师列表":"学生列表" } </div>
                    <button class="btn btn-primary" onclick="alert('TODO: 打开添加用户弹窗')"><i class="fa fa-plus"></i> 添加用户</button>
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
                    <option value="active">有效</option>
                    <option value="pending">待审核</option>
                    <option value="frozen">冻结</option>
                    <option value="delete">已删除</option>
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
  
          function renderUserTable(userList,role){
                
            const tbody = document.getElementById('user-table-body');
         //   console.error("1 tbody",tbody);
         //   console.error("2 tbody",userList);
            if (userList.length === 0) {
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
                    <td>${tea.email || ""}</td>
                    <td>${tea.phone || ""}</td>
                    <td>
                      ${ tea.status === "pending" ? '<span style="color:#faad14;">待审核</span>' :
                        tea.status === "active" ? '<span style="color:#52c41a;">正常</span>' :                        
                        tea.status === "frozen" ? '<span style="color:#f5222d;">冻结</span>' :
                        tea.status === "inactive" ? '<span style="color:#faad14;">失效</span>' :
                        tea.status === "delete" ? '<span style="color:#faad14;">已删除</span>' :
                        `<span>${tea.status||"未知"}</span>`
                      }
                      </td>
                  
                  <td>
                    <button class="btn btn-success"  onclick="confirmTeacher('${tea.userId}', '${tea.role}')"><i class="fa fa-check"></i> 启用</button>
                    <button class="btn btn-warning" onclick="disableTeacher('${tea.userId}', '${tea.role}')"><i class="fa fa-ban"></i> 冻结</button>
                    <button class="btn btn-danger" onclick="deleteTeacher('${tea.userId}', '${tea.role}')"><i class="fa fa-trash"></i> 删除</button>
                    <button class="btn btn-warning" onclick="resetUserPasswd('${tea.userId}')"><i class="fa fa-trash"></i> 重置密码</button>

                     
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
    
    //Detail--教师信息,用于提交图片、专业信息、时间段等，输出该教师的可用时段及推广信息
     function teacherInfoBoard(userId) {
      window.location.href = `./teacherInfo.html?userId=${userId}`;
    }
               //禁用
                async  function disableTeacher(userId,role) {
                          // 调用 update(User) 把 status 设置为 inactive
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
                              data: { userId: userId, status: "delete" }
                            }).then(res => {
                                //  刷新列表
                                loadUserList(role);
                            }).catch(e => {
                              alert("网络错误，删除失败");
                            });

                          }
                        }