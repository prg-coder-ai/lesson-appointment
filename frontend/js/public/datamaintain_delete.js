  
/**
 * 删除模板
 */
async function deleteTemplate(templateId) {
    // 数据维护页批量删除已在 batchDeleteMaintain 统一确认一次（含“此操作不可恢复”），此处不再二次确认。
    // 若模板关联课程，静默级联删除其下全部课程，避免外键/约束冲突。
    try {
        const hasCourses = await checkTemplateHasCourses(templateId);
        if (hasCourses) {
            deleteTemplateNextLavel(templateId);
        }
        const res = await request({
            url: `${API_BASE_URL}/course/template/${templateId}`,
            method: 'DELETE'
        });
        if (!res) {
            alert('模板删除失败');
        }
    } catch (err) {
        alert('网络异常，模板删除失败');
        console.error(err);
    }
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

          let tempInfo = templateObj ? courseTypeText(templateObj.languageType) + " " + enumTermText('classLevel', templateObj.difficultyLevel) + " " + templateObj.classFee : "n/a";
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
// 数据维护页批量删除专用：统一确认已在 batchDeleteMaintain 完成（含“此操作不可恢复”），不再二次确认、删除后也不弹“删除成功”。
// 课程下若存在排期，静默级联删除其全部排期，避免外键/约束冲突。
async function deleteCourseById(id) {
    try {
        const scdList = await fetchScheduleList(id, null);
        if (scdList && Array.isArray(scdList) && scdList.length > 0) {
            try {
                await request({ url: `/schedule/deleteByCourseId/${id}`, method: 'DELETE' });
            } catch (err) {
                console.error('删除课程排期失败:', id, err);
                alert('删除课程排期时出错，请检查后端接口与数据。');
                return;
            }
        }
        const res = await request({ url: `/course/deleteById/${id}`, method: 'DELETE' });
        if (!res) {
            alert('课程删除失败');
        }
    } catch (error) {
        console.error('删除失败：', error);
        alert('网络异常，课程删除失败');
    }
}
  

  async function deleteScheduleById(id) {
    if (!id) {
        console.warn('排期ID不能为空');
        return false;
    }
    try {
        // 该排期存在预约/预定时，先级联删除其下的全部预约/预定，避免外键/约束冲突
        if (typeof deleteBookingsByScheduleId === 'function') {
            await deleteBookingsByScheduleId(id);
        }
        const result = await request({ url: `/schedule/delete/${id}`, method: 'DELETE' });
        return result;
    } catch (error) {
        console.error('删除排期时出错:', error);
        alert('网络异常，排期删除失败');
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
        // 调用后端删除预订接口（假定全局已定义 request 方法和 API_BASE_URL）
        // 批量删除已在 batchDeleteMaintain 统一确认一次（含“此操作不可恢复”），此处不再二次确认
        try {
            // 该预订存在预约时，先级联删除其下的全部预约，避免外键/约束冲突
            if (checkAppointmentExistsBookingId(id)) {
              await deleteAppointmentsByBookingId(id); // appointmentNotes.js
            }
            const res = await request({
                url: `${API_BASE_URL}/course/booking/delete/${id}`,
                method: 'delete'
            });
            // 删除成功不再单独弹提示，由批量删除流程统一刷新列表
            if (!res) {
                alert('删除失败');
            }
            return res;
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
  const pageResult = await fetchScheduleListPage_direct(query);
  if (!pageResult || !Array.isArray(pageResult.rows)) {
    return pageResult;
  }

  // 1.增加缓存：同一个courseId只请求一次
  const courseCache = new Map();
  const cachedGetCourseById = async (courseId) => {
    if (!courseId) return null;
    if (courseCache.has(courseId)) {
      return courseCache.get(courseId);
    }
    try {
      const courseObj = await getCourseById(courseId);
      courseCache.set(courseId, courseObj);
      return courseObj;
    } catch (err) {
      courseCache.set(courseId, null);
      return null;
    }
  };

  // 2. 使用map生成Promise数组 + await Promise.all等待全部完成，替代forEach(async)
  // 注意：不要直接修改后端原始item对象，优先浅拷贝消除引用副作用（可选但推荐）
  const processPromises = pageResult.rows.map(async (rawItem) => {
    try {
      // 浅拷贝，不改动原始接口返回对象，消除外部对象被异步改写的副作用
      const item = { ...rawItem };
      item.status = checkStatus_schedule(item.status);
      const courseObj = await cachedGetCourseById(item.courseId);
      item.courseName = courseObj?.courseName || item.courseId || '';
      return item;
    } catch (e) {
      console.error("处理单条排期补充课程名称失败", e);
      // 出错返回原始数据，保证列表不会整体崩溃
      return {
        ...rawItem,
        status: checkStatus_schedule(rawItem.status),
        courseName: rawItem.courseId || ""
      };
    }
  });

  // 等待所有行异步查询全部结束
  const processedRows = await Promise.all(processPromises);

  // 替换为处理完成后的数据集
  pageResult.rows = processedRows;

  return pageResult;
}
        async function fetchScheduleListPage_direct(query = {}) { 
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
                return res;
            } catch (error) {
                console.error('分页加载排期列表失败:', error);
                return { rows: [], total: 0 };
            }
        }

      function checkStatus_schedule(status){
        switch (status) {
          case 'active':
            return '已排期';
          case 'noted1':
            return '已预约';
          case 'noted2':
            return '已预约';
          case 'completed':
            return '已完成';
          case 'cancelling':
            return '已取消';
          case 't-cancelling':
            return '已取消';
          case 'booked':
            return '已预约';
          case 'cancelled':
            return '已取消';
          case 'deleted':
            return '已删除';
          case 't-reject':
            return '已拒绝';
          case 'reject':
            return '已拒绝';
          default:
            return '未知状态';
        }
      }
        //Appointment
        //调用fetchAppointmentListPage查询预约列表，然后根据预约id显示课程名称、状态      
 async function datamaintain_fetchAppointmentListPage(params){
    let listObj = await datamaintain_fetchAppointmenPage(params);//appointmentNotes.js
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
  