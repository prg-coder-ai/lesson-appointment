 
  /*const searchForm = reactive({
    languageType: '',
    difficultyLevel: ''
  });*/
  // 引入axios定义（确保axios已通过<script>标签在HTML中引入）
  // 若未引入，可使用：<script src="https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js"></script>
  const templateDialogVisible = false;
  const dialogTitle =  '新增课程模板' ;
  const templateFormRef = null;
  const templateForm = {
    templateId: '',
    languageType: '',
    difficultyLevel: '',
    classForm: '',
    classDuration: '',
    classFee: '',
    description: ''
  };
  console.log("template.js");
  const templateRules =  {
    languageType: [{ required: true, message: '请选择语言类型', trigger: 'change' }],
    difficultyLevel: [{ required: true, message: '请选择难度等级', trigger: 'change' }],
    classForm: [{ required: true, message: '请选择课程形式', trigger: 'change' }],
    classDuration: [{ required: true, message: '请输入课时时长', trigger: 'blur' }],
    classFee: [{ required: true, message: '请输入课时费', trigger: 'blur' }],
    description: [{ required: true, message: '请输入模板描述', trigger: 'blur' }]
  } ;
  // 接口基础路径
  const baseUrl = "";
  // 设置Axios请求头（携带管理员Token）
  //const currentUser = localStorage.getItem('currentUser');
  //const token = currentUser.getItem('token');

  axios.defaults.headers.common['Authorization'] = 'Bearer ' + localStorage.getItem('currentUser').getItem('token');
  axios.defaults.headers.post['Content-Type'] = 'application/json';
   templateList =[];

 async function renderTemplateCards() {
              dynamicContentCenter.innerHTML = '<div style="padding:40px 0;text-align:center;">加载中...</div>';
              console.log("enter");
              const conditionJson = { language: 'france',level: 'B1',pageRow:10,pageNum:1 };//TBD:当前admin所属的群组等过滤条件 
               await fetchTemplateList(conditionJson);
              console.log("list:"+ templateList.length);

              let html = `
                <div class="card">
                  <div class="card-header">
                    <div class="card-title"><i class="fa fa-chalkboard-teacher"></i> 模板列表</div>
                    <button class="btn btn-primary" onclick="alert('TODO: 打开添加模板弹窗')"><i class="fa fa-plus"></i> 添加模板</button>
                  </div>
                  <div class="teacher-list-cards" style="margin:16px 0;display:flex;flex-direction:column;gap:16px;">
              `;

              if (!templateList.length) {
                html += `<div style="padding:40px 0;text-align:center;color:#999;">暂无模板数据</div>`;
              } else { 
                html += `
                  <div style="display:flex;gap:36px;font-weight:bold;border-bottom:1px solid #e9ecef;padding-bottom:8px;margin-bottom:4px;">
                    <div style="width:120px;"><strong>模板ID</strong></div>
                    <div style="width:90px;"><strong>语言类型</strong></div>
                    <div style="width:180px;"><strong>难度等级</strong></div>
                    <div style="width:130px;"><strong>课程形式</strong></div>
                    <div style="width:130px;"><strong>课时时长(分钟)</strong></div>
                    <div style="width:130px;"><strong>课时费(元)</strong></div>
                    <div style="width:120px;"><strong>状态</strong></div>
                    <div style="width:240px;"><strong>操作</strong></div>  
                  </div>
                `;
                templateList.forEach(template => {
                  html += `
                    <div class="teacher-card" style="background:#fff;border:1px solid #e9ecef;padding:16px;border-radius:8px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 2px 8px #0000000a;">
                      <div style="display:flex;gap:36px;">
                        <div>${template.id || ""}</div>
                        <div>${template.language || ""}</div>
                        <div>${template.level || ""}</div>
                        <div>${template.courseFormat || ""}</div>
                        <div>                          
                          ${ template.status === "pending" ? '<span style="color:#faad14;">待审核</span>' :
                            template.status === "active" ? '<span style="color:#52c41a;">正常</span>' :
                            template.status === "inactive" ? '<span style="color:#faad14;">待启用</span>' :
                            template.status === "frozen" ? '<span style="color:#f5222d;">已删除</span>' :
                            `<span>${template   .status||"未知"}</span>`
                          }
                        </div>
                      </div>
                      <div class="teacher-actions" style="display:flex;gap:10px;flex-shrink:0;"> 
                       <button class="btn btn-success" onclick="updateTemplate('${template.id}')"><i class="fa fa-check"></i> 修改</button>
                        <button class="btn btn-success" onclick="confirmTeacher('${template.id}')"><i class="fa fa-check"></i> 发布</button>
                        <button class="btn btn-warning" onclick="disableTeacher('${template.id}')"><i class="fa fa-ban"></i> 回收</button>
                        <button class="btn btn-danger" onclick="deleteTeacher('${template.id}')"><i class="fa fa-trash"></i> 删除</button>
                      </div>
                    </div>
                  `;
                });
              }
              html += `</div></div>`;
              dynamicContentCenter.innerHTML = html;
            }
 
       
        // 核心函数：渲染模板列表（参照async function renderTeacherCards()写法）
         async function fetchTemplateList() { 
        //  loading.value = true;
          try {
            const res = await axios.get(`${baseUrl}/course/template/list`, {
              params: { 
              //  ...searchForm,
               // page: currentPage.value,
               // size: pageSize.value
              }
            });
            if (res.data.code === 200) {
              templateList.value = res.data.data.templates;
              total.value = res.data.data.total;
              // 补全模板状态，默认已发布 active
              templateList.value.forEach(item => {
                if (!item.status) item.status = 'active';
              });

            } else {
              alert(res.data.message || '获取模板列表失败');
            }
          } catch (err) {
            alert('网络异常，获取模板列表失败');
            console.error(err);
          } finally {
           // loading.value = false;
          }
        };
  
        // 1. 获取模板列表（调用核心渲染函数）
     //   async function getTemplateList() {
      //    await renderTemplateCards();
      //  };

        // 2. 筛选条件变化处理
        async function handleSearchChange() {
          currentPage.value = 1; // 筛选条件变化，重置页码
          await renderTemplateCards();
        };

        // 3. 分页大小变化处理
        async function handlePageSizeChange(val) {
          pageSize.value = val;
          await renderTemplateCards();
        };

        // 4. 页码变化处理
        async function handleCurrentPageChange(val) {
          currentPage.value = val;
          await renderTemplateCards();
        };

        // 5. 重置筛选表单
        async function resetSearchForm() {
          searchForm.languageType = '';
          searchForm.difficultyLevel = '';
          currentPage.value = 1;
          await renderTemplateCards();
        };

        // 6. 打开新增模板弹窗
        function openAddTemplateDialog() {
          dialogTitle.value = '新增课程模板';
          resetTemplateForm();
          templateDialogVisible.value = true;
        };

        // 7. 打开修改模板弹窗
        function openEditTemplateDialog(row) {
          dialogTitle.value = '修改课程模板';
          // 赋值表单数据
          for (const key in templateForm) {
            templateForm[key] = row[key] || '';
          }
          templateDialogVisible.value = true;
        };

        // 8. 重置模板表单
        function resetTemplateForm() {
          templateFormRef.value?.resetFields();
          for (const key in templateForm) {
            templateForm[key] = '';
          }
        };

        // 9. 提交新增/修改模板
        async function submitTemplateForm() {
          const valid = await templateFormRef.value.validate();
          if (!valid) return;
          try {
            let res;
            if (templateForm.templateId) {
              // 修改模板
              res = await axios.put(`${baseUrl}/admin/course/manage`, {
                templateId: templateForm.templateId,
                operation: 'edit',
                data: {
                  languageType: templateForm.languageType,
                  difficultyLevel: templateForm.difficultyLevel,
                  classForm: templateForm.classForm,
                  classDuration: templateForm.classDuration,
                  classFee: templateForm.classFee,
                  description: templateForm.description
                }
              });
            } else {
              // 新增模板
              res = await axios.post(`${baseUrl}/course/template/add`, templateForm);
            }
            if (res.data.code === 200) {
              ElMessage.success(templateForm.templateId ? '模板修改成功' : '模板新增成功');
              templateDialogVisible.value = false;
              await renderTemplateCards(); // 刷新列表
            } else {
              alert(res.data.message || (templateForm.templateId ? '模板修改失败' : '模板新增失败'));
            }
          } catch (err) {
            alert('网络异常，操作失败');
            console.error(err);
          }
        };

        // 10. 模板发布/回收操作
        async function operateTemplate(row, type) {
          try {
            const res = await axios.put(`${baseUrl}/admin/course/manage`, {
              templateId: row.templateId,
              operation: 'edit',
              data: { status: type }
            });
            if (res.data.code === 200) {
              ElMessage.success(type === 'publish' ? '模板发布成功' : '模板回收成功');
              await renderTemplateCards(); // 刷新列表
            } else {
              alert(res.data.message || (type === 'publish' ? '模板发布失败' : '模板回收失败'));
            }
          } catch (err) {
            alert('网络异常，操作失败');
            console.error(err);
          }
        };

        // 11. 删除模板
        async function deleteTemplate(templateId) {
          try {
            await ElMessageBox.confirm(
              '确定要删除该课程模板吗？删除后基于该模板的课程基础参数将不受统一管控！',
              '温馨提示',
              {
                confirmButtonText: '确定',
                cancelButtonText: '取消',
                type: 'warning'
              }
            );
            const res = await axios.put(`${baseUrl}/admin/course/manage`, {
              templateId: templateId,
              operation: 'delete'
            });
            if (res.data.code === 200) {
              ElMessage.success('模板删除成功');
              await renderTemplateCards(); // 刷新列表
            } else {
              alert(res.data.message || '模板删除失败');
            }
          } catch (err) {
            if (err.name !== 'Error') { // 排除取消确认的异常
              alert('网络异常，删除失败');
              console.error(err);
            } else {
              ElMessage.info('已取消删除');
            }
          }
        };

        // 页面初始化，渲染模板列表
        (async function init() {
          await renderTemplateCards();
        })();

        // 暴露函数和状态，供模板调用
       /* return {
          loading,
          templateList,
          currentPage,
          pageSize,
          total,
          searchForm,
          templateDialogVisible,
          dialogTitle,
          templateFormRef,
          templateForm,
          templateRules,
          getTemplateList,
          handleSearchChange,
          handlePageSizeChange,
          handleCurrentPageChange,
          resetSearchForm,
          openAddTemplateDialog,
          openEditTemplateDialog,
          resetTemplateForm,
          submitTemplateForm,
          operateTemplate,
          deleteTemplate
        };*/
       
  
    // 注册Element Plus组件
    //for (const key in ElementPlus) {
    //  app.component(key, ElementPlus[key]);
   // }
    // app.mount('#adminApp'); 的含义是：将Vue应用实例`app`挂载到页面上id为`adminApp`的DOM元素上，
    // 这样这个DOM节点中的内容就会被Vue接管，可以使用模板、数据响应等功能。
  //  app.mount('#adminApp'); 