
 
   //把tzDataPO格式数据
  async function tzSwitchTo( tz,dateTime,userTz){
     
    const dataIn = {timeZone:tz,
        dateTime:dateTime,
        switchToTimeZone:userTz
     } 
     try {
        // Axios GET请求（修复response.json()错误，Axios已自动解析）
        const res  = await request({url:`${API_BASE_URL}/tz/switch`, 
           method:"POST",
          data:  dataIn   //controller: @RequestBody TzSwitchPO dataIn
           }); 
        return res  ; 
           
    } catch (e) {
        //alert("网络错误，获取课程列表失败");
        console.error(e);
        return   null;
    }

 }
 
 // 截至指定月份，检索教师人数，
 
/**
 * 前端 JS 使用 axios 查询用户月度统计的示例方法
 * 后端接口文档: GET /user/statics/byMonth?year=2024&month=06
 * 响应示例: { code: 200, message: "查询成功", data: { teacherMonthStart: 100, teacherMonthEnd: 110, studentMonthStart: 250, studentMonthEnd: 270 } }
 * 
 * 推荐前端 dataFunctions.js 添加如下函数:
 * */
   // 获取某年月的教师/学生月初月末统计
   async function getUserStatisticByMonth(year, month ) {
  //  const token = getToken && typeof getToken === 'function' ? getToken() : '';
   try {
       const res  =  await  request({ url:`${API_BASE_URL}/user/statistical/byMonth`,
        Method:"get", 
        params: { year:year, month:month }//controller: @RequestParam("year") int year, @RequestParam("month") int month
      });

       // 返回统计结果对象，如:{ teacherMonthStart, teacherMonthEnd, studentMonthStart, studentMonthEnd }
         
          return res  ;  
     } catch (e) {
       // 网络或服务器异常处理
      console.error(e);
      return null;
     }
   }
   // INSERT_YOUR_CODE
   /*
    分析错误原因：

    错误信息：
    org.springframework.web.bind.MissingServletRequestParameterException: Required request parameter 'days' for method parameter type int is not present
    ...
    2026-06-08 18:23:05.570  WARN ... Resolved [org.springframework.web.bind.MissingServletRequestParameterException: Required request parameter 'days' for method parameter type int is not present]

    主要分析：
    1. 出错接口（从堆栈可判断及项目约定推测）：某个Controller的方法需要days这个请求参数（@RequestParam），类型为int。
    2. 前端在调对应接口时，没有提供days参数，导致Spring无法将参数绑定到方法参数上，抛出MissingServletRequestParameterException。
    3. 此异常是常见的请求参数缺失，后端接口已经定义days为必填项（没有required=false），前端未传或者写错参数名。

    排查（解决）思路：
    - 检查前端调用时URL和参数拼接，确认days是否传递。搜索所有相关axios/fetch请求代码。
    - 检查后端Controller方法签名，如：public Result xx(@RequestParam int days, ...) 是否存在，没有默认值，且required=true。
    - 可以给@RequestParam增加required=false或默认值，如 @RequestParam(defaultValue="1")
    - 优先修复前端，确保所有请求days参数都传递且非空。

    结合前端代码（如 getCountOfTodayAppointment/getAppointmentList），应始终传days参数，切勿遗漏。

    总结：
    - 问题本质：前端未传必填的days参数，或参数名写错
    - 解决方法：确保前端传days，后端可视情况给参数加默认值
   */

    /* 
 * // 用法示例:
 * // const stats = await getUserStaticsByMonth(2024, 6);
 * // if (stats) { console.log(stats.teacherMonthStart, stats.studentMonthEnd); }
 */
  
  /**
   * 获取某年月的课程月初（月初0点）和月末（23:59:59）已发布数量
   * 对应后端接口: GET /course/statistical/byMonth?year=2024&month=6
   * 返回示例: { courseMonthStart: 10, courseMonthEnd: 12 }
   */
  async function getCourseStaticsByMonth(year, month) {
   // const token = getToken && typeof getToken === 'function' ? getToken() : '';
    try {
      const res  = await request({url:`${API_BASE_URL}/course/statistical/byMonth`,  
        Method:"get", 
        params: { year:year, month:month }
      });
     
        // 返回: { courseMonthStart, courseMonthEnd } 
          return res ; 
    } catch (e) {
      console.error(e);
      return null;
    }
  }
   // INSERT_YOUR_CODE

   /**
    * 获取某年月的预订（Booking）月初（月初0点）和月末（23:59:59）数量
    * 对应后端接口: GET /course/booking/statistical/byMonth?year=2024&month=6
    * 返回示例: { bookingMonth: 32, bookingMonthLast: 44 }
    */
   async function getBookingStaticsByMonth(year, month) {
    // const token = getToken && typeof getToken === 'function' ? getToken() : '';
     try {
       const res  = await request({url:`${API_BASE_URL}/course/booking/statistical/byMonth`,  
        Method:"get", 
        params: { year, month }
       }); 
         // 返回: { bookingMonthLast, bookingMonth }
          return res ;
       
     } catch (e) {
       console.error("getBookingStaticsByMonth"+e);
       return null;
     }
   }

 async function getAppointmentStatisticByMonth(year, month ) {
    try {
        const res  = await request({url:`${API_BASE_URL}/course/appointment/statistical/byMonth`,
         Method:"get",
         params: { year:year, month:month } //TBD data:
       });
        // 返回统计结果对象，如:{ teacherMonthStart, teacherMonthEnd, studentMonthStart, studentMonthEnd }
        return res  ;

      } catch (e) {
        // 网络或服务器异常处理
       console.error(e);
       return null;
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