 
 // teacher-course.js
 // teacher---课程管理----编辑、添加排期
 //查找属于自己的课程，可添加、编辑排期 

var localParamter ={ 
  currentPage:1,         // 当前页码（初始值由Thymeleaf渲染）
  pageSize : 10,           // 页大小
  total : 0 ,              // 总条数
  CourseDialogVisible: false, // 弹窗状态
  dialogTitle : '新增课程', // 弹窗标题
  currentCourseId: '', // 当前操作的课程ID
  formEl :'', 
};
// ===================== 核心函数 =====================
 
/**
 * 渲染课程列表（核心：原生JS操作DOM）
 */
async function renderTeacherCourseBrowserCards() {
    const dynamicContentCenter = document.getElementById('dynamic-content-center');
    if (!dynamicContentCenter) return; 
    // 显示加载中
    dynamicContentCenter.innerHTML = '<div style="padding:40px 0;text-align:center;">加载中...</div>';

    // 构建筛选条件 TBD
    const conditionJson = { 
          teacherId:userId,
          templateId:"",
          status:"",
          pageRow: localParamter.pageSize,
          pageNum: localParamter.currentPage
    };
 
    // 渲染HTML
    let html = '';
    { 
      html += `     
    <div class="modal-mask" id="courseModal">
      <div class="modal-content">
        <div class="modal-header">
          <h3 id="modalTitle">课程列表</h3> 
           <hr style="margin: 16px 0; border-top: 1px solid #e9ecef;">
        </div> 
      </div>
    </div> `; 
      
             // 列表表头 ---模板-建立连接-悬浮显示模板内容（学生页面、管理、教师页面），教师--悬浮-显示教师的特色字段（学生页面）
         html += `
            <div style="display:flex;gap:36px;font-weight:bold;border-bottom:1px solid #e9ecef;padding-bottom:8px;margin-bottom:4px;">
              <table width:90%>
                <thead>
                    <tr>
                        <th width:10%>序号</th> <th width:20%>名称</th>  <th width:20%>内容</th>  <th width:20%>特色</th>  <th width:10%>状态</th>  <th width:20% align:center>操作</th>  
                    </tr>
                </thead>
                <tbody id="resultBody"></tbody>
              </table>
            </div>
<div class="modal-header">
          <h3 id="modalTitle">课程排期列表</h3> 
        <hr style="margin: 16px 0; border-top: 1px solid #e9ecef;"> 
        </div> 
            <div style="display:flex;gap:36px;font-weight:bold;border-bottom:1px solid #e9ecef;padding-bottom:8px;margin-bottom:4px;">
              <table width:90%>
                <thead>
                    <tr>
                        <th width:10%>序号</th> <th width:60%>排期信息</th>   <th width:10%>状态</th>  <th width:20% align:center>操作</th>  
                    </tr>
                </thead>
                <tbody id="schduleBody"></tbody>
              </table>
            </div>
        `;
       
    }  // TBD:
    dynamicContentCenter.innerHTML = html;

    // 更新分页组件
    const pagination = document.getElementById('pagination');
    if (pagination) {
        pagination.currentPage = localParamter.currentPage;
        pagination.pageSize    = localParamter.pageSize;
        pagination.total       = localParamter.total;
    }
    
    courseList =  await getCourseList (conditionJson); 
    renderCourseList();
}
 
//刷新课程列表
async function renderCourseList(){
  const body = document.getElementById('resultBody');
  body.innerHTML = ''; 

  if (!courseList.length) {
    body.innerHTML += '<div style="padding:40px 0;text-align:center;color:#999;">暂无数据</div>';
    return;
} 
  if(courseList!= null ) {
    var index=0;
    let teacherInfo=userInfo? userInfo.name : "n/a" ;
    courseList.forEach(item => { 
      index ++; 
        const tr = document.createElement('tr'); 
        
        tr.innerHTML = `<td>${index}</td><td>${item.courseName}</td><td>${item.content}</td> <td>${item.feature}</td>`;
        tr.innerHTML +=  
            item.status === "pending" ? '<td>待审核</td>' :
            item.status === "active" ? '<td>正常</td>' :
            item.status === "inactive" ? '<td>待启用</td>' :
            item.status === "frozen" ? '<td>已删除</td>' :
              `<td>${item.status||"未知"}</td>` 
         
        const applyAddSchBtn = document.createElement('button');
        applyAddSchBtn.className = 'btn btn-success'; //  
        applyAddSchBtn.textContent = '增加排期'; 
        applyAddSchBtn.onclick = function() {
          AddScheduleforTheCourse(item.courseId); 
        }   
        const tdBtn = document.createElement('td');
        tdBtn.appendChild(applyAddSchBtn);
        tr.appendChild(tdBtn);  

        const applyBrwSchBtn = document.createElement('button');
        applyBrwSchBtn.className = 'btn btn-success'; //  
        applyBrwSchBtn.textContent = '查看排期'; 
        applyBrwSchBtn.onclick = function() {
          browseScheduleforTheCourse(item.courseId); 
        }   
        const tdBtn2 = document.createElement('td');
        tdBtn2.appendChild(applyBrwSchBtn);
        tr.appendChild(tdBtn2);  

        body.appendChild(tr);
    });
    
    }
  } 
function  AddScheduleforTheCourse(courseId){
  //添加1个排期
  alert("tbd:AddScheduleforTheCourse " + courseId);

}
 async function  browseScheduleforTheCourse(courseId){
 // 罗列该课程的排期，列表 参考学生预约页面
 // alert("tbd:browseScheduleforTheCourse " + courseId);
   const scheduleList = await fetchScheduleList( courseId,"active");
// scheduleList:CourseScheduleCreateDTO
   if(Array.isArray(scheduleList) && scheduleList.length > 0){ 
    const body = document.getElementById('schduleBody');
    body.innerHTML = ''; 

   scheduleList.forEach(function(item, index) {
        console.log(index,item);
        info= getScheduleInfoByDTO(item);
        const tr = document.createElement('tr'); 
        
        tr.innerHTML = `<td>${index+1}</td><td>${info}</td> `;
        tr.innerHTML +=  
            item.status === "pending" ? '<td>待审核</td>' :
            item.status === "active" ? '<td>正常</td>' :
            item.status === "inactive" ? '<td>待启用</td>' :
            item.status === "frozen" ? '<td>已删除</td>' :
              `<td>${item.status||"未知"}</td>` 
         
        const applyAddSchBtn = document.createElement('button');
        applyAddSchBtn.className = 'btn btn-success'; //  
        applyAddSchBtn.textContent = '查看详情'; 
        applyAddSchBtn.onclick = function() {
         showScheduleCard(item); //显示排期卡片----双时区----admin相关页面
        }   
        const tdBtn = document.createElement('td');
        tdBtn.appendChild(applyAddSchBtn);
        tr.appendChild(tdBtn);   
        body.appendChild(tr);
   });

   }
} 
// 显示排期卡片,双时区----
function showScheduleCard(schObj){
  alert("tbd:showScheduleCard " + schObj); 
}