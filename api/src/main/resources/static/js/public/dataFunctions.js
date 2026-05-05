   


async function getCourseById( courseId) {
    const token = getToken();
    if (!token) return;

    try {
        // Axios GET请求（修复response.json()错误，Axios已自动解析）
        const response = await axios.get(`${API_BASE_URL}/course/${courseId}`, {
            headers: { "Authorization": "Bearer " + token },
           // params: conditionJson // 筛选条件通过params传递
        });
        const res = response.data; 
        if (res && res.code === 200) {
           console.info("data.courses:",res.data);   
           return  res.data ; 
        } else {
           // alert(res?.message || '获取课程列表失败');
            return  null;
        }
    } catch (e) {
        //alert("网络错误，获取课程列表失败");
        console.error(e);
        return   null;
    }
 }

 //根据bookingId查询预约时间列表--List <Appointment>->List {date:date,time:time }
 async function getAppointmentsByBookingId( bookingId) {
    const token = getToken();
    if (!token) return;

    try {
        // Axios GET请求（修复response.json()错误，Axios已自动解析）
        const response = await axios.get(`${API_BASE_URL}/course/appointment/getByBookingId`, {
            headers: { "Authorization": "Bearer " + token },
            params:{ bookingId:bookingId } // 筛选条件通过params传递
        });
        const results =   response.data.data;
        if (Array.isArray(results)) {
            appointmentResults = results.map(item => {
              let date = "";
              let time = "";
              if (item.appointmentDatetime) {
                // 兼容 'YYYY-MM-DD HH:mm' 或 'YYYY-MM-DDTHH:mm'
                const dtString = item.appointmentDatetime.replace('T', ' ');
                const [d, t] = dtString.split(' ');
                date = d;
                time = t;
              }
              return {
                date: date,
                time: time,
                status: item.status
              };
            });
          } else {
            appointmentResults = [];
          }
        return appointmentResults;
    } catch (e) {
        console.error(e);
        return [];
    }
 }

 
 async function saveAppointment( appointdata) {
    console.log("save appoint:",appointdata.classIndex);
    const token = getToken();
    if (!token) return;
 
    // 分析参数传递是否正确
    // 正确写法：axios.post(url, data, config)
    // 原代码把headers和params放在了data里，实际上应该放在第三个参数
    try {
        // Axios POST请求 
        const response = await axios.post(
            `${API_BASE_URL}/course/appointment/add`,
            appointdata, // appointdata 在这里作为POST请求体body传递
            {
                headers: { "Authorization": "Bearer " + token }
                // 不需要用params，添加预约应走body
            }
        );
        const res = response.data; 
        if (res && res.code === 200) {
           console.info("saveAppointment:",res.data);   
           return  res.data ; 
        } else {
            return  false;
        }
    } catch (e) {
        //alert("网络错误，获取课程列表失败");
        console.error(e);
        return   false;
    }
 }

 //根据bookingId更新所有相关的预约时间状态
 async function updateAppointmentsStatusByBookingId( bookingId,status) {
    const token = getToken();
    if (!token) return;

    try {
        // 注意：后端接口 @RequestParam 需要参数在 params/query，不应放在 body
        // 必须通过 params 配置传递 bookingId 和 status，否则会报“Required request parameter 'bookingId' is not present”
        const response = await axios.put(
            `${API_BASE_URL}/course/appointment/updateStatusByBookingId`,
            null, // PUT无body，参数全部通过params
            {
                headers: { "Authorization": "Bearer " + token },
                params: { bookingId: bookingId, status: status }
            }
        );
        const res = response.data; 
        if (res && res.code === 200) {
            console.info("appointments:", res.data);   
            return res.data ; 
        } else { 
            return false;
        }
    } catch (e) {        
        console.error(e);
        return false;
    }
 }
 async function deleteAppointmentsByBookingId( bookingId) {
    const token = getToken();
    if (!token) return;

    try {
        // Axios GET请求（修复response.json()错误，Axios已自动解析）
        const response = await axios.delete(`${API_BASE_URL}/course/appointment/deleteByBookingId`, {
             headers: { "Authorization": "Bearer " + token },
             params: {bookingId:bookingId} // 筛选条件通过params传递
        });
        const res = response.data; 
        if (res && res.code === 200) {
           
           return  true ; 
        } else {
           // alert(res?.message || '获取课程列表失败');
            return  false;
        }
    } catch (e) {
        //alert("网络错误，获取课程列表失败");
        console.error(e);
        return   false;
    }

 } 
  
 
   /**
    * 详细介绍 fetch 在 GET、POST、PUT、DELETE、PATCH 等方法中携带参数的方式
    * 
    * 1. fetch GET 请求携带参数
    *    - GET 参数直接拼接在 URL 查询字符串上。
    *    例：
    *      fetch(`/api/user?id=123`, {
    *        headers: { "Authorization": "Bearer xxx" }
    *      })
    * 
    *    // 用URLSearchParams拼接参数
    *    const params = new URLSearchParams({ id: 123, foo: 'bar' });
    *    fetch(`/api/user?${params.toString()}`, {
    *      headers: { "Authorization": "Bearer xxx" }
    *    });
    * 
    * 2. fetch POST 请求携带参数
    *    - 通常参数放在 body 里（对象需序列化为JSON）。
    *      fetch('/api/user', {
    *        method: 'POST',
    *        headers: {
    *          'Content-Type': 'application/json',
    *          'Authorization': 'Bearer xxx'
    *        },
    *        body: JSON.stringify({ name: 'Tom', age: 18 })
    *      })
    *    - 上传文件时使用 FormData：
    *      const fd = new FormData();
    *      fd.append('img', fileObj);
    *      fetch('/api/upload', { method: 'POST', body: fd })
    * 
    * 3. fetch PUT、PATCH 请求携带参数
    *    - 与POST类似，将数据序列化后放入 body，并且需指定 method：
    *      fetch('/api/user/1', {
    *        method: 'PUT',
    *        headers: { 'Content-Type': 'application/json' },
    *        body: JSON.stringify({ name: 'Tom', age: 19 })
    *      })
    * 
    * 4. fetch DELETE 请求携带参数
    *    - 若只用ID等主键，可直接拼在URL里：
    *      fetch('/api/user/1', {
    *        method: 'DELETE',
    *        headers: { "Authorization": "Bearer xxx" }
    *      })
    *    - 若需传更复杂的参数：
    *      方案A：作为URL参数：
    *        fetch('/api/user?id=1', { method: 'DELETE' })
    *      方案B：部分后端支持body（但许多不支持）： 
    *        fetch('/api/user', {
    *          method: 'DELETE',
    *          headers: { "Content-Type": "application/json" },
    *          body: JSON.stringify({ id: 1, foo: 'bar' })
    *        })
    *      //（注意：DELETE有无body要看后端实现）
    * 
    * 5. 请求头(headers)处理
    *    - headers字段均可通过fetch的第二个参数对象统一指定：
    *        fetch(url, { headers: { "Authorization": "Bearer token" } })
    * 
    * 6. 例子总结
    *    // GET 带参数
    *    fetch('/api/data?foo=bar')
    * 
    *    // POST 带参数
    *    fetch('/api/save', { method: 'POST', body: JSON.stringify({ foo: 'bar' }), headers: { 'Content-Type': 'application/json' } })
    * 
    *    // PUT
    *    fetch('/api/save', { method: 'PUT', body: JSON.stringify({ foo: 'baz' }), headers: { 'Content-Type': 'application/json' } })
    * 
    *    // DELETE
    *    fetch('/api/remove/1', { method: 'DELETE' })
    *    // 或
    *    fetch('/api/remove?id=1', { method: 'DELETE' })
    * 
    *    // 添加或合并自定义请求头
    *    fetch('/api/data', { headers: { 'Authorization': 'Bearer token', 'abc': '123' } })
    * 
    * 注意事项：
    *  - fetch POST/PUT/PATCH 方法参数通过 body 传递，需序列化为字符串（如 application/json）。
    *  - fetch GET/DELETE 参数通常拼在 URL 查询串上。
    *  - headers 统一通过 headers 字段添加。
    *  - fetch 无自动 JSON 解析，需手动 .json() 处理响应：res.json()
    */

    // INSERT_YOUR_CODE

    /**
     * =============================
     * axios 请求中携带参数的方式详解
     * =============================
     * 
     * axios 是流行的 HTTP 客户端。发送 GET、POST、PUT、DELETE、PATCH 等请求携带参数时，参数放法根据方法有所不同：
     * 
     * 1. GET 请求携带参数
     *    - 推荐写法：将参数写在 config 对象的 params 属性下
     *    - axios 会自动把 params 拼接到 URL 查询字符串上
     * 
     *    axios.get('/api/user', { params: { id: 1, name: 'Tom' } })
     *    // 相当于 GET /api/user?id=1&name=Tom
     *
     *    // 也可直接写参数到 URL 上
     *    axios.get('/api/user?id=1&name=Tom')
     * 
     * 2. POST 请求携带参数
     *    - POST 一般通过请求体 (body) 传递参数
     *    - axios.post(url, data, config)
     * 
     *    axios.post('/api/user', { name: 'Tom', age: 19 })
     *    // data为请求体，后端可用@RequestBody、request.json获取
     * 
     *    // 带请求头、token
     *    axios.post('/api/user', 
     *          { name: 'Tom' }, 
     *          { headers: { 'Authorization': 'Bearer xxxxx' } })
     * 
     * 3. PUT/PATCH 请求携带参数（语法与POST一致）
     *    - 语法及参数方式同 POST，都是参数写在第二个 data 位置
     * 
     *    axios.put('/api/user/1', { name: 'NewName' })
     *    // 或
     *    axios.patch('/api/user/1', { age: 20 })
     * 
     *    // 若还需URL参数
     *    axios.put('/api/user/1?id=1', { name: 'NewName' })
     * 
     * 4. DELETE 请求携带参数
     *    - 常见方式：主键参数直接拼在URL
     * 
     *    axios.delete('/api/user/1')
     *    // 或
     *    axios.delete('/api/user', { params: { id: 1 } })
     * 
     *    // 注：
     *    // axios.delete("url", { params: { ... } }) 会把参数拼到url上，GET同理
     *    // axios.delete 第二参数一定要是 config 对象（不能放 data），否则参数不会生效
     *    // 部分后端支持body体传参（如SpringBoot 3.2+，需要自测），可以：
     *    // axios.delete(url, { data: { foo: 'bar' } })
     *    // 但大多数后端不建议DELETE带body
     * 
     * 5. 通用 headers 及 token 设置
     *    - 推荐每次请求在 config.headers 里传递自定义头/认证信息，如 token
     * 
     *    axios.get('/api/data', {
     *      params: { id: 1 },
     *      headers: { Authorization: 'Bearer xxx' }
     *    })
     * 
     *    axios.post('/api/save', data, {
     *      headers: {
     *        Authorization: 'Bearer xxx',
     *        'Content-Type': 'application/json'
     *      }
     *    })
     * 
     * 6. axios 例子小结
     * 
     *    // GET
     *    axios.get('/api/list', { params: { foo: 'bar' } })
     * 
     *    // POST
     *    axios.post('/api/save', { foo: 'bar' })
     * 
     *    // PUT
     *    axios.put('/api/update/123', { foo: 'baz' })
     * 
     *    // PATCH
     *    axios.patch('/api/update/123', { foo: 'baz' })
     * 
     *    // DELETE
     *    axios.delete('/api/remove/123')
     *    // 或
     *    axios.delete('/api/remove', { params: { id: 123, foo: 'bar' } })
     * 
     *    // DELETE 多参数/条件
     *    axios.delete('/api/remove', { params: { name: 'Tom', status: 0 } })
     * 
     *    // 某些后端接受DELETE带body（不通用，需确认）：
     *    axios.delete('/api/deleteWithBody', { data: { id: 1 } })
     * 
     *    // 全局默认headers设置（如token）：
     *    axios.defaults.headers.common['Authorization'] = 'Bearer xxx'
     * 
     * 常见注意事项:
     *  - GET/DELETE 参数用 params，POST/PUT/PATCH 参数都用请求体（data，axios第2参数）
     *  - POST/PUT/PATCH/DELETE带headers时，第2参数为data，第3参数才是config
     *    比如：axios.put(url, data, config)
     *  - DELETE请求如需带body，需确认后端支持（大多数只识别URL+params）。
     */