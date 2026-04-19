
/**
 *条件：{status:active}等
 * @param {*} conditionJson 
 * @returns 课程列表
 */
async function getCourseList(conditionJson) { 
    const token = getToken();
    
    if (!token) return [];
    try {
        const response = await axios.get(`${API_BASE_URL}/course/list`, {
            headers: { "Authorization": "Bearer " + token },
            params: conditionJson
        });
        const res = response.data;
        console.info("get response data:", res);
        if (res && res.code === 200) {
            courseList = res.data || [];
            localParamter.total = courseList.length || 0;
            console.info("total:", localParamter.total, courseList);
            courseList.forEach(item => {
                if (!item.status) item.status = 'active';
            });
            return res.data || [];
        } else {
            alert(res?.message || '获取课程列表失败');
            return [];
        }
    } catch (e) {
        alert("网络错误，获取模板列表失败");
        console.error(e);
        return [];
    }
  }

  
/**
 * TBD:根据课程id，调用后端接口获取模板列表. status:null/""，不参与检索，否则按条件过滤。
 * 返回：排期列表或[]
 */
async function fetchScheduleList( cid,status) {
    const token = getToken();
    if (!token)  return [];
   let conditionJson ={ status:status};
    try { 
        const response = await axios.get(`${API_BASE_URL}/course/schedule/selectByCourseId/${cid}`, {
            headers: { "Authorization": "Bearer " + token },
            params: conditionJson
        });
        // response对象结构：{ status, statusText, headers, config, data }
        // 通常我们只关心response.data，它对应后端的Result结构
        const res = response.data;
        
        if (res && res.code === 200) {
          //console.info("data.schedules:",res.schedules);
            return  res.data|| []; // TBD:对于多个排期的情况进行区分
 
        } else {
            alert(res?.message || '获取排期失败');
            return [];
        }
    } catch (e) {
        alert("网络错误，获取排期失败");
        console.error(e);
        return [];
    }
}