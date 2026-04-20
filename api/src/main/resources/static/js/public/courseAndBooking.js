
/**
 *条件：{status:active}等
 * @param {*} conditionJson 
 * @returns 课程列表
 */
// INSERT_YOUR_CODE
//
// 该错误原因：MyBatis 调用 SQL 时，参数对象 params（通常为Map或DTO）为 null 或未包含 teacherId 键，导致 params.teacherId != null and params.teacherId != '' 这句OGNL表达式报错。
// 解决方案：确保接口层传入 params 时，永远传一个对象/Map，哪怕没有实际筛选条件。
// 示例：如果没有 teacherId，也要传 { teacherId: null } 或 {}，不要直接传 null。
// 代码层建议：查询前如果参数为 null，置为 {}。MyBatis XML 可增加 <if test="params != null and params.teacherId != null ..."> 保护。

async function getCourseList(conditionJson) { 
    const token = getToken();

    if (!token) return [];
    console.log("getCourseList",conditionJson);
    try {
        // axios GET请求不能使用 body/params 的用法如下, 正确是用 params 字段传递 URL 查询参数
        const response = await axios.get(`${API_BASE_URL}/course/list`, {
            headers: { "Authorization": "Bearer " + token },
            params: conditionJson // 正确传递查询参数
        });

        const res = response.data;
        console.info("get response data:", res);
        if (res && res.code === 200) {
            let courseList = res.data || [];
            //localParamter.total = courseList.length || 0;
            //console.info("total:", localParamter.total, courseList);
            courseList.forEach(item => {
                if (!item.status) item.status = 'inactive';
            });
            
     
            return courseList || [];
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
        // 如果希望让前端通过URL参数传递 status 或其它过滤条件，应在后端controller方法参数上用 @RequestParam 注解接收，而不是 @RequestBody。
        // 例如：
        // @GetMapping("/selectByCourseId/{courseId}")
        // public Result<List<CourseScheduleCreateDTO>> getScheduleByCourseId(
        //     @PathVariable String courseId,
        //     @RequestParam(required = false) String status,
        //     @RequestHeader("Authorization") String token) { ... }
        // 前端 axios GET 的 params 字段会自动附加在URL参数上，被@RequestParam接收。

        const response = await axios.get(`${API_BASE_URL}/course/schedule/selectByCourseId/${cid}`, {
            headers: { "Authorization": "Bearer " + token },
            params: conditionJson // 对应后端@RequestParam，如果controller未定义status参数会被忽略
        });
        // response对象结构：{ status, statusText, headers, config, data }
        // 通常我们只关心response.data，它对应后端的Result结构
        const res = response.data;
        
        if (res && res.code === 200) {
            console.info("fetchScheduleList:",res.data);
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


/**
 *取消、删除
 */
 async function operateBookingStatus(bookid, action) {
    const token = getToken();
    const payload = {
        id: bookid,  // 注意小写，和后端命名对应
        status: action
  };
      console.log("payload：",payload); 
    fetch(`${API_BASE_URL}/course/booking/updateStatus`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        "Authorization": "Bearer " + token
      },
      credentials: 'include',
      body: JSON.stringify(payload)
    })
    .then(response => {
      // 判定http请求结果，如果不是2xx，直接抛出
      if (!response.ok) {
        throw new Error(`服务器错误，状态码: ${response.status}`);
      }
      // 某些接口如204/无内容, 直接返回空对象防止解析异常
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        {
            return response.json();
        }
      }
      // 不是json时返回空对象，避免res为undefined或字符串
      return {};
    })
    .then(res => {
      // 防御：确认res是对象且有code字段
      const code = typeof res === "object" && res !== null && "code" in res ? res.code : undefined;
      const msg = (typeof res === "object" && res !== null && res.message) ? res.message : '';
      if (code === 200) { 
        if (console.success) {
          console.success(msg);
          console.success('操作成功');
        }
        console.success( result.data);
        const bid = result.data;
        reloadBooking(bid);
        
      } else {
        alert(msg || '操作失败');
      }
    })
    .catch(e => {
      // 网络错误或json解析异常都能捕获
      alert("网络错误或数据解析异常，操作失败");
      console.error(e);
    });
   
    } ;
      