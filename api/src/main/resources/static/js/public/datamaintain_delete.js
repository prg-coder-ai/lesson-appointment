  
/**
 * 删除模板
 */
async function deleteTemplate(templateId) {     
     
        let bconfirmed = false ;
        // 执行前检查模板是否关联课程，如有关联则不允许删除
        const hasCourses = await checkTemplateHasCourses(templateId);
        if (hasCourses) {
            //alert('该模板有关联课程，无法删除！请先删除或修改基于该模板的课程。');
          //  return;
          const userChoice = confirm('该模板存在课程，是否继续删除？继续将删除该项目下的全部课程。点击“确定”继续，点击“取消”放弃删除。');
          if (!userChoice) {
              return;
                    }
         bcomfirmed = true;
        //DEL all courses By templateId
         let rows=  deleteTemplateNextLavel( templateId);
         console.log("delete courses rows:",rows);
        }

        if(! bcomfirmed) //提示1次
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
// 加载课程列表数据
 async function fetchCourseListPage(params){
    var templateCondition=[];//模板检索
    // var templateList = [];//await  fetchTemplateList(templateCondition); 
      const conditionJsonForTeacher = { role: 'teacher' }; 
      var teacherList =[];// await fetchUserList(conditionJsonForTeacher);
   
     templateList = await  fetchTemplateList('all');  
     teacherList  = await  fetchUserList(conditionJsonForTeacher);
  
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
      var bcomfirmed =false;
        if (scdList && Array.isArray(await scdList) && (await scdList).length > 0) {
      //alert('该课程存在排期，不能删除！');
          const userChoice = confirm('该课程存在排期，是否继续删除？继续将删除该项目下的全部排期。点击“确定”继续，点击“取消”放弃删除。');
          if (!userChoice) {
              return;
                    }
       bcomfirmed = true;
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
         if(!bcomfirmed) //提示1次
           if (!confirm('确定要删除该课程吗？')) return;
    try { 
      const res = await request({url:`/course/deleteById/${id}`,  method: 'DELETE' });
        
    } catch (error) {
      console.error('删除失败：', error);
    }
  }
  

  async function deleteScheduleById(id){
    // INSERT_YOUR_CODE
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
         if (checkAppointmentExistsBookingId(id))
         {
          // INSERT_YOUR_CODE
          const userChoice = confirm('该预订存在预约，是否继续删除？继续将删除该预订下的全部预约。点击“确定”继续，点击“取消”放弃删除。');
          if (!userChoice) {
            return;
          }
          //删除该预定的全部预约
          await deleteAppointmentsByBookingId(id);//appointmentNotes.js
         }
        
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