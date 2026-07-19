
            async function renderTeacherCards() {
              dynamicContentCenter.innerHTML = '<div style="padding:40px 0;text-align:center;">加载中...</div>';
              console.log("enter");
              const conditionJson = { role: 'teacher' };//TBD:当前admin所属的群组等过滤条件
              const teachers = await fetchUserList(conditionJson);
              console.log("list:"+teachers);
              let html = `
                <div class="card">
                  <div class="card-header">
                    <div class="card-title"><i class="fa fa-chalkboard-teacher"></i> 教师列表</div>
                    <button class="btn btn-primary" onclick="alert('TODO: 打开添加教师弹窗')"><i class="fa fa-plus"></i> 添加教师</button>
                  </div>
                  <div class="teacher-list-cards" style="margin:6px 0;display:flex;flex-direction:column;gap:16px;">
              `;

              if (!teachers.length) {
                html += `<div style="padding:40px 0;text-align:center;color:#999;">暂无教师数据</div>`;
              } else {
                html += `
                  <div class="teacher-card"  style="display:flex;gap:36px;font-weight:bold;border-bottom:1px solid #e9ecef;padding-left:8px;padding-bottom:8px;margin-bottom:4px;">
                    <div style="width:120px;display:none;"><strong>ID</strong></div>
                    <div style="width:90px;"><strong>姓名</strong></div>
                    <div style="width:180px;"><strong>电子邮箱</strong></div>
                    <div style="width:130px;"><strong>手机号</strong></div>
                    <div style="width:120px;"><strong>状态</strong></div>
                    <div style="width:120px;display:none;"><strong>操作</strong></div>
                  </div>
                `;
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
                        <button class="btn btn-success"  onclick="confirmTeacher('${tea.userId}', '${tea.role}')"><i class="fa fa-check"></i> 确认/启用</button>
                        <button class="btn btn-warning" onclick="disableTeacher('${tea.userId}', '${tea.role}')"><i class="fa fa-ban"></i> 禁用</button>
                        <button class="btn btn-danger" onclick="deleteTeacher('${tea.userId}', '${tea.role}')"><i class="fa fa-trash"></i> 删除</button>
                        <button class="btn btn-warning" onclick="resetUserPasswd('${tea.userId}')"><i class="fa fa-trash"></i> 重置密码</button>
                      </div>
                    </div>
                  `;
                });
              }
              html += `</div></div>`;
              dynamicContentCenter.innerHTML = html;
            }

            async function renderStudentCards() {
              dynamicContentCenter.innerHTML = '<div style="padding:40px 0;text-align:center;">加载中...</div>';
              console.log("enter");
              const conditionJson = { role: 'student' };//TBD:当前admin所属的群组等过滤条件
              const students = await fetchUserList(conditionJson);
             // console.log("list:"+students);
              let html = `
                <div class="card">
                  <div class="card-header">
                    <div class="card-title"><i class="fa fa-chalkboard-teacher"></i> 学员列表</div>
                    <button class="btn btn-primary" onclick="alert('TODO: 打开添加学员弹窗')"><i class="fa fa-plus"></i> 添加学员</button>
                  </div>
                   <div class="filter-bar">
                <div class="filter-item">
                  <label>查询：</label>
                  <input type="text" placeholder="请输入学生姓名/账号/手机号">
                </div>
                <button class="btn btn-default"><i class="fa fa-search"></i> 搜索</button>
              </div>
                  <div class="teacher-list-cards" style="margin:16px 0;display:flex;flex-direction:column;gap:16px;">
              `;

              if (!students.length) {
                html += `<div style="padding:40px 0;text-align:center;color:#999;">暂无数据</div>`;
              } else {
                html += `
                  <div class="teacher-card"  style="display:flex;gap:36px;font-weight:bold;border-bottom:1px solid #e9ecef;padding-left:8px;padding-bottom:8px;margin-bottom:4px;">
                    <div style="width:120px;display:none;"><strong>ID</strong></div>
                    <div style="width:90px;"><strong>姓名</strong></div>
                    <div style="width:180px;"><strong>电子邮箱</strong></div>
                    <div style="width:130px;"><strong>手机号</strong></div>
                    <div style="width:120px;"><strong>状态</strong></div>
                    <div style="width:240px;display:none;"><strong>操作</strong></div>
                  </div>
                `;
                students.forEach(tea => {
                  html += `
                    <div class="teacher-card" style="background:#fff;border:1px solid #e9ecef;padding:16px;border-radius:8px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 2px 8px #0000000a;">
                      <div style="display:flex;gap:36px;">
                        <div style="display:none;">${tea.userId || ""}</div>
                        <div style="width:90px;" title="${tea.userId || ''}">${tea.name || ""}</div>

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
                        <button class="btn btn-success" onclick="confirmTeacher('${tea.userId}', '${tea.role}')"><i class="fa fa-check"></i> 确认/启用</button>
                         <button class="btn btn-warning" onclick="disableTeacher('${tea.userId}', '${tea.role}')"><i class="fa fa-ban"></i> 禁用</button>
                        <button class="btn btn-danger" onclick="deleteTeacher('${tea.userId}', '${tea.role}')"><i class="fa fa-trash"></i> 删除</button>
                         <button class="btn btn-warning" onclick="resetUserPasswd('${tea.userId}')"><i class="fa fa-trash"></i> 重置密码</button>
                      </div>
                    </div>
                  `;
                });
              }
              html += `</div></div>`;
              dynamicContentCenter.innerHTML = html;
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