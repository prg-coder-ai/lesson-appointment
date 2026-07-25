
    const  Pagination = {
      pageNum: 1, // 当前页码
      pageSize: 10,  // 页大小
      total: 0,   // 总条数
      totalPages: 0 // // 总页数
    };

   async function renderTeacherCards(role) {
            //  dynamicContentCenter.innerHTML = '<div style="padding:40px 0;text-align:center;">加载中...</div>';
            //  console.log("enter");
            //  const conditionJson = { role: 'teacher' };//TBD:当前admin所属的群组等过滤条件
            //  const teachers = await fetchUserList(conditionJson);
             // console.log("list:"+teachers);
              let html = `
                <div class="card">
                  <div class="card-header">
                    <div class="card-title"><i class="fa fa-chalkboard-teacher"></i> ${role=="teacher"?"教师列表":"学生列表" } </div>
                    <button class="btn btn-primary" onclick="alert('TODO: 打开添加教师弹窗')"><i class="fa fa-plus"></i> 添加教师</button>
                  </div>
                  <div class="teacher-list-cards" style="margin:6px 0;display:flex;flex-direction:column;gap:16px;">
               
              <!-- 筛选条件 -->
              <div class="filter-bar">  
                <div class="filter-item">
                  <label  style="width:0px;display:none" >角色：</label>
                  <input type="text" style="width:0px;display:none"  id="user-role-input" ,value = ${role}>
                </div>

                <div class="filter-item">
                  <label>姓名：</label>
                  <input type="text" id="user-name-input" placeholder="姓名">
                </div>
                <div class="filter-item">
                   <label>电子邮件：</label>
                  <input type="text" id="user-email-input" placeholder="xx@xx">
                </div>
                <div class="filter-item">
                   <label>电话号码：</label>
                  <input type="text" id="user-phone-input" placeholder="(8610)1361234567">
                </div>
                 <div class="filter-item">
                   <label>账号</label>
                  <input type="text" id="user-account-input" placeholder="账号">
                </div>

                <div class="filter-item">
                  <label>状态：</label>
                  <select id="user-status-select">
                    <option value="">全部</option>
                    <option value="active">有效</option>
                    <option value="pending">挂起</option>
                  </select>
                </div> 
                <button class="btn btn-default" onclick="localsearchUsers()">
                  <i class="fa fa-search"></i> 搜索
                </button>
                <button class="btn btn-default" onclick="resetUserFilter()">
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
                    <th>电子邮箱</th> 
                    <th>电话号码</th>
                    <th>账号</th> 
                    <th>状态</th>
                    <th>操作</th>
                </tr>
                </thead>
                <tbody id="course-table-body">
                <!-- 数据由JS动态渲染 -->
                 </tbody>
              </table>
              </div> 
                `;             
              
          // <!-- 分页栏 -->
            html += `
            <div class="pagination-bar">
              <div class="pagination-info">
                共 <span id="course-total">0</span> 条记录，每页 
                <select id="course-page-size" onchange="changeCoursePageSize()">
                  <option value="5" selected>5</option>
                  <option value="10" selected>10</option>
                  <option value="20">20</option>
                  <option value="50">50</option>
                </select> 条
              </div>
              <div class="pagination-btns" id="course-pagination-btns"></div>
            </div>
          </div>
          `;
              dynamicContentCenter.innerHTML = html;
              loadUserList("teacher");
            }

            function localsearchUsers() {
              Pagination.pageNum = 1;
              const role = document.getElementById('user-role-input').value.trim();//
              loadUserList(role);
            }
              // 重置筛选条件
        function resetUserFilter() {
            document.getElementById('user-name-input').value = '';
            document.getElementById('user-email-input').value = '';
            document.getElementById('user-phone-input').value = '';
            document.getElementById('user-account-input').value = '';
            document.getElementById('user-status-select').value = '';
            coursePagination.pageNum = 1;
            const role = document.getElementById('user-role-input').value.trim();//
            loadUserList(role);
        }


        
// ===================== 交互函数 =====================
/**
 * 筛选条件变化
 */
async function handleSearchChange() {
  localParamter.currentPage = 1; // 重置页码
  await renderCourseCards();
}


function changeCourseStatus(courseId, status) { 
operateCourse(courseId, status);
loadCourseList();

} 
 

/**
* 分页大小变化
*/
async function handlePageSizeChange(val) {
  localParamter.pageSize = val;
  await renderCourseCards();
}

/**
* 页码变化
*/
async function handleCurrentPageChange(val) {
  localParamter.currentPage = val;
  await renderCourseCards();
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
                renderUserTable(pageData.rows);
                // 渲染分页栏
                renderPagination();
              }
            } catch (error) {
              console.error('加载列表失败：', error);
            }
          }
  
          function renderUserTable(userList){

            teachers.forEach(tea => {
              html += `
                <div class="teacher-card" style="background:#fff;border:1px solid #e9ecef;padding:16px;border-radius:8px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 2px 8px #0000000a;">
                  <div style="display:flex;gap:36px;">
                    <div style="display:none;">${tea.userId || ""}</div>
                    <div style="width:90px;" title="${tea.userId || ''}" >${tea.name || ""}</div>
                    <div style="width:180px;">${tea.email || ""}</div>
                    <div style="width:130px;">${tea.phone || ""}</div>
                    <div style="width:120px;">
                      ${ tea.status === "pending" ? '<span style="color:#faad14;">待审核</span>' :
                        tea.status === "active" ? '<span style="color:#52c41a;">正常</span>' :
                        tea.status === "inactive" ? '<span style="color:#faad14;">待启用</span>' :
                        tea.status === "frozen" ? '<span style="color:#f5222d;">已删除</span>' :
                        `<span>${tea.status||"未知"}</span>`
                      }
                    </div>
                  </div>
                  <div class="teacher-actions" style="display:flex;gap:10px;flex-shrink:0;">
                    <button class="btn btn-success"  onclick="confirmTeacher('${tea.userId}', '${tea.role}')"><i class="fa fa-check"></i> 启用</button>
                    <button class="btn btn-warning" onclick="disableTeacher('${tea.userId}', '${tea.role}')"><i class="fa fa-ban"></i> 冻结</button>
                    <button class="btn btn-danger" onclick="deleteTeacher('${tea.userId}', '${tea.role}')"><i class="fa fa-trash"></i> 删除</button>
                    <button class="btn btn-warning" onclick="resetUserPasswd('${tea.userId}')"><i class="fa fa-trash"></i> 重置密码</button>
                  </div>
                </div>
              `;
             })
  
          }
               //禁用
                async  function disableTeacher(userId,role) {
                          // 调用 update(User) 把 status 设置为 inactive
                          const user = {userId: userId, status: "inactive" };
                          request({
                            url: `${API_BASE_URL}/user/updateStatus`,
                            method: 'POST',
                            data: user
                          }).then(res => {

                              renderCards(role);
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
                              renderCards(role);
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
                                renderCards(role);
                            }).catch(e => {
                              alert("网络错误，删除失败");
                            });

                          }
                        }