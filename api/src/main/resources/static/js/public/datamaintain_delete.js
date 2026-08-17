  
/**
 * 删除模板
 */
async function deleteTemplate(templateId) {     
     
        let bConfirmed = false ;
        // 执行前检查模板是否关联课程，如有关联则不允许删除
        const hasCourses = await checkTemplateHasCourses(templateId);
        if (hasCourses) { 
          const userChoice = confirm('该模板存在课程，是否继续删除？继续将删除该项目下的全部课程。点击“确定”继续，点击“取消”放弃删除。');
          if (!userChoice) {
              return;
                    }
         bConfirmed = true;
        //DEL all courses By templateId
         let rows=  deleteTemplateNextLavel( templateId);
         console.log("delete courses rows:",rows);
        }

        if(! bConfirmed) //提示1次
          if (!confirm('确定要删除该模板吗？')) return;

        try {
            const res = await request({
                url: `${API_BASE_URL}/course/template/${templateId}`,
                method: 'DELETE'
            });
            if (res >0) {
                alert('模板删除成功,rows'+ res);             
            } 
        } catch (err) {
            alert('网络异常，模板删除失败');
            console.error(err);
        }
    ; 
}

function deleteTemplateNextLavel(templateId){
//  
    // 强制删除模板及其下所有课程
    (async () => {
        try {
            // 调用后端 /course/deleteByTemplateId/{id} 强制删除
            const res = await request({
                url: `${API_BASE_URL}/course/deleteByTemplateId/${templateId}`,
                method: 'DELETE'
            });
               return res;//
        } catch (err) {
            alert('网络异常，模板批量删除失败');
            console.error(err);
        }
    })();    
}
// 1. 判断是否存在基于该模板的课程（即该模板是否被课程表引用）
async function checkTemplateHasCourses(templateId) {
try {
  // 假设有接口: /course/list 查询课程列表，参数支持 templateId
  // 检查参数传递，getCourseList 可以接收 { templateId: ... }
  // 但要确保参数名和后端（如 CourseQueryParam DTO）一致
  const res = await getCourseList({ templateId });
  //console.error("check:",res);
  if (res && Array.isArray(res) && res.length > 0) {
    //console.error("check:",true);
    return true;
  }
  //console.error("check:",false);
  return false;
} catch (error) {
  console.error('检查模板是否有关联课程时出错', error);
  // 出错视为有，阻止误删
  return true;
}
}
window.fetchCourseListPage = fetchCourseListPage;
// 加载课程列表数据
 async function fetchCourseListPage(params){
    var templateCondition=[];//模板检索
    // var templateList = [];//await  fetchTemplateList(templateCondition); 
      const conditionJsonForTeacher = { role: 'teacher' }; 
      var teacherList =[];// await fetchUserList(conditionJsonForTeacher);
   
    // 并行异步获取模板列表和教师列表，提升加载速度
    [templateList, teacherList] = await Promise.all([
      fetchTemplateList('all'),
      fetchUserList(conditionJsonForTeacher)
    ]);
  
    try {
      const result = await request({url:`/course/page`,
                                    method:"GET",
                                    params: params });//GET 
     
      if (result && Array.isArray(result.rows)) {
        result.rows.forEach(Course => { 
          // 根据Course.templateId在templateList中查找对应的模板对象
          const templateObj = templateList ? templateList.find(t => t.templateId === Course.templateId) : null;
          const teacherObj = teacherList ? teacherList.find(t => t.userId === Course.teacherId) : null;

          let tempInfo = templateObj ? templateObj.languageType + " " + templateObj.difficultyLevel + " " + templateObj.classFee : "n/a";
          let teacherInfo = teacherObj ? teacherObj.name : "n/a";
          // 这里只是补充处理，具体逻辑请根据实际业务调整，如可在Course对象上新增处理结果：
          Course.tempInfo = tempInfo;
          Course.teacherInfo = teacherInfo;
        });
      } 
       return result; 
    } catch (error) {
      console.error('加载课程列表失败：', error);
    }
  }
   
// 删除课程（操作后刷新当前页）
async function deleteCourse(id) {  
    try {
      const scdList = fetchScheduleList(id,null);     
    // 判断scdList是否为空数组
      var bConfirmed =false;
        if (scdList && Array.isArray(await scdList) && (await scdList).length > 0) {
      //alert('该课程存在排期，不能删除！');
          const userChoice = confirm('该课程存在排期，是否继续删除？继续将删除该项目下的全部排期。点击“确定”继续，点击“取消”放弃删除。');
          if (!userChoice) {
              return;
                    }
       bConfirmed = true;
      //删除该课程的所有排期
         try {
        var rows= await request({ url: `/schedule/deleteByCourseId/${id}`, method: 'DELETE' });
        console.log("deleted schedule",rows);
         } catch (err) {
        console.error('删除课程排期失败:',id,err);
        alert('删除课程排期时出错，请检查后端接口与数据。');
        return;     
      }
    } // if
    } 
     catch(error){
      console.error('查询排期失败：',id, error);
     }
         if(!bConfirmed) //提示1次
           if (!confirm('确定要删除该课程吗？')) return;
    try { 
      const res = await request({url:`/course/deleteById/${id}`,  method: 'DELETE' });
        
    } catch (error) {
      console.error('删除失败：', error);
    }
  }
  

  async function deleteScheduleById(id){ 

        if (!id) {
            console.warn('排期ID不能为空');
            return false;
        }
        try {
            // 调用后端接口删除指定id的排期
            // 假设后端API为: /schedule/delete/{id}，使用DELETE请求
            const result = await request({url: `/schedule/delete/${id}`, method: 'DELETE'});
            console.log("deleteScheduleById",result);
            return result;
        } catch (error) {
            console.error('删除排期时出错:', error);
            return false;
        }    
     }

      async function deleteBookingsByScheduleId(scheduleId){
        if (!scheduleId) {
            console.warn('排期ID不能为空');
            return false;
        }
        try {
            // 假设后端有对应的API接口: /api/schedule/{scheduleId}/bookings/count
            const result = await request({ url:`/course/booking/deleteByScheduleId/${scheduleId}`, 
                method: 'DELETE'
            });  
            return result;//; 
        } catch (error) {
            console.error('请求预订booking时出错:', error);
            return 0;
        }    
      }
    

      async function deleteBooking(id){
        // 调用后端删除预约接口（假定全局已定义 request 方法和 API_BASE_URL）
        // 查询是否存在以此id为排期id的appointment（预约/子项），返回结果布尔型
        let bConfirmed =false;
         if (checkAppointmentExistsBookingId(id))
         { 
          const userChoice = confirm('该预订存在预约，是否继续删除？继续将删除该预订下的全部预约。点击“确定”继续，点击“取消”放弃删除。');
          if (!userChoice) {
            return;
          }
          bConfirmed = true;
          //删除该预定的全部预约
          await deleteAppointmentsByBookingId(id);//appointmentNotes.js
         }
         if(!bConfirmed) //提示1次
           if (!confirm('确定要删除该预订吗？')) return;
        try {
            const res = await request({
                url: `${API_BASE_URL}/course/booking/delete/${id}`,
                method: 'delete',
              //  params: { id: id }
            });
        
            if (res ) {
                // 删除成功，刷新列表
                alert('删除成功');

            } else {
                alert('删除失败 ');
            }
        } catch (e) {
            alert('网络错误，删除失败');
            console.error(e);
        }
        
        }  
 
        /**
         * 分页加载排期(schedule)列表数据。
         * @param {Object} params - 查询参数对象，例如 { pageNum: 1, pageSize: 10, courseName: '', status: '' }
         * @returns {Promise<Object>} - 包含分页数据和总数的对象 { list: [], total: number }
         */
        async function fetchScheduleListPage(query = {}) {
           
            try {
                const res = await request({
                    url: `${API_BASE_URL}/schedule/page`,
                    method: 'post',
                    data: query
                });
                // 通常返回格式 { list: [...], total: 123 }
                if (!res || !Array.isArray(res.rows)) {
                  res = res || {};
                  res.rows = [];
                }
                // 为每个 schedule 补充 scheduleName
                res.rows.forEach(item => {
                  item.scheduleName = item.scheduleName || '';
                  item.status = checkStatus_booking(item.status);
                  item.courseName = (await getCourseById(item.course_id))?.courseName || '';
                });
                return res;
            } catch (error) {
                console.error('分页加载排期列表失败:', error);
                return { list: [], total: 0 };
            }
        }

        //Appointment
        //调用fetchAppointmentListPage查询预约列表，然后根据预约id显示课程名称、状态      
 async function datamaintain_fetchAppointmentListPage(params){
   // console.log("params:",params); 
    let listObj = await datamaintain_fetchAppointmenPage(params);//appointmentNotes.js
  //  console.log("listObj:",listObj); 
    if (!listObj || !Array.isArray(listObj.rows)) {
      listObj = listObj || {};
      listObj.rows = [];
    }

    // ===== 并行 + 缓存：为每个 appointment 补充 scheduleName 和状态可视化 =====
    // appointment 对象结构说明（与 booking 不同！）：
    //   appointment 本身只有 bookingId / appointmentDatetime / classIndex / status
    //   不直接带 scheduleId / studentId / teacherId / courseId
    //   需要先通过 bookingId 查 booking 对象，再通过 booking.scheduleId 查排期
    //   schedule.courseId 查课程，booking.studentId/teacherId 查姓名
    //
    // 状态可视化：appointment 用 checkAppointmentStatus（不是 checkStatus_booking）
    //   appointment.status 枚举：active / noted1 / noted2 / completed / cancelling / t-cancelling / booked / cancelled / deleted / t-reject / reject

    const bookingCache = new Map();    // bookingId  → Promise<bookingObject>
    const scheduleCache = new Map();   // scheduleId → Promise<scheduleObject>
    const courseCache = new Map();     // courseId   → Promise<courseObject>
    const userCache = new Map();       // userId     → Promise<string>

    const cachedGetBookingObject = (id) => {
      if (!id) return Promise.resolve(null);
      if (!bookingCache.has(id)) {
        bookingCache.set(id, getBookingObject(id).catch(() => null));
      }
      return bookingCache.get(id);
    };
    const cachedFetchSchedule = (id) => {
      if (!id) return Promise.resolve(null);
      if (!scheduleCache.has(id)) {
        scheduleCache.set(id, fetchSchedule(id).catch(() => null));
      }
      return scheduleCache.get(id);
    };
    const cachedGetCourseById = (id) => {
      if (!id) return Promise.resolve(null);
      if (!courseCache.has(id)) {
        courseCache.set(id, getCourseById(id).catch(() => null));
      }
      return courseCache.get(id);
    };
    const cachedGetUserNameById = (id) => {
      if (!id) return Promise.resolve('');
      if (!userCache.has(id)) {
        userCache.set(id, getUserNameById(id).catch(() => ''));
      }
      return userCache.get(id);
    };

    await Promise.all(listObj.rows.map(async (item) => {
      try {
        // 【层 A】第一步：appointment → booking（唯一入口，必须先拿到 booking 才能继续）
        const bookedObject = item.bookingId ? await cachedGetBookingObject(item.bookingId) : null;

        // 预约状态可视化（appointment 专用映射，不依赖任何关联查询，先填上）
        item.appointmentStatus = checkAppointmentStatus(item.status);

        if (!bookedObject) {
          // 没找到 booking：只能填状态，其余名称留空
          item.scheduleName = ''; 
          item.studentName = '';
          item.teacherName = '';
          item.courseName = ''; 
        }
 item.appointmentTime = item.appointmentDatetime ? String(item.appointmentDatetime).replace('T', ' ') : '';
        // 【层 B】booking 拿到后，三个互不依赖的请求并行：
        //   - fetchSchedule(bookedObject.scheduleId)
        //   - getUserNameById(bookedObject.studentId)
        //   - getUserNameById(bookedObject.teacherId)
        const [scheduleObject, studentNameRaw, teacherNameRaw] = await Promise.all([
          cachedFetchSchedule(bookedObject.scheduleId),
          cachedGetUserNameById(bookedObject.studentId),
          cachedGetUserNameById(bookedObject.teacherId)
        ]);

        item.scheduleName = scheduleObject ? (scheduleObject.name || '') : '';
       // item.scheduleInfo = scheduleObject ? getScheduleInfo(scheduleObject, true) : '';
        item.studentName = studentNameRaw || '';
        item.teacherName = teacherNameRaw || '';
        item.studentId = bookedObject.studentId;   // 顺带回填，便于后续操作
        item.teacherId = bookedObject.teacherId;

        // 【层 C】schedule.courseId → 查课程，拿到课程名（教师名已在层 B 取过，无需重复查）
        const courseObject = scheduleObject && scheduleObject.courseId
          ? await cachedGetCourseById(scheduleObject.courseId)
          : null;
        item.courseName = courseObject ? (courseObject.courseName || courseObject.name || '') : '';
        item.courseId = scheduleObject ? scheduleObject.courseId : '';

        // 预约时间格式化（去掉 ISO 的 T 分隔符）
        item.appointmentTime = item.appointmentDatetime
          ? String(item.appointmentDatetime).replace('T', ' ')
          : '';
        item.appointmentStatus =  checkAppointmentStatus(item.status) || item.status || '';
        console.log("info:", item);
      } catch (e) {
        // 单条失败不影响整体，保证列表仍能渲染
        console.error('fetchAppointmentListPage_datamaintain 补充信息失败，item=', item, 'error=', e);
        item.scheduleName = item.scheduleName ||  item.scheduleId  || '';
        item.studentName = item.studentName || item.studentId || '';
        item.teacherName = item.teacherName || item.teacherId || '';
        item.courseName = item.courseName || item.courseId ||  '';
        item.appointmentTime = item.appointmentDatetime ? String(item.appointmentDatetime).replace('T', ' ') : '';
        item.appointmentStatus = item.appointmentStatus ||  item.status || '';
      }
    }));

 return listObj;
 }    
  