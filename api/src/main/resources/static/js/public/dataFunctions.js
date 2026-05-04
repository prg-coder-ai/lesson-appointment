   


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

 //TBD:根据bookingId查询预约时间列表--List <Appointment>
 async function getAppointmentsByBookingId( bookingId) {
    const token = getToken();
    if (!token) return;

    try {
        // Axios GET请求（修复response.json()错误，Axios已自动解析）
        const response = await axios.get(`${API_BASE_URL}/course/appointment/getByBookingId`, {
            headers: { "Authorization": "Bearer " + token },
             params:{ bookingId:bookingId } // 筛选条件通过params传递
        });
        return response.data.data;
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
        // Axios GET请求（修复response.json()错误，Axios已自动解析）
        const response = await axios.put(`${API_BASE_URL}/course/appointment/updateStatusByBookingId`, {
            headers: { "Authorization": "Bearer " + token },
             params: { bookingId:bookingId,status:status} // 筛选条件通过params传递
        });
        const res = response.data; 
        if (res && res.code === 200) {
           console.info("ppointments:",res.data);   
           return  res.data ; 
        } else { 
            return  false;
        }
    } catch (e) {        
        console.error(e);
        return   false;
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
 /*
 async function saveAppointmentList( appointdataList) {
    const token = getToken();
    if (!token) return;

    try {
        // Axios GET请求（修复response.json()错误，Axios已自动解析）
        const response = await axios.post(`${API_BASE_URL}/course/appointment/addBatch`, {
            headers: { "Authorization": "Bearer " + token },
             params: appointdataList // 筛选条件通过params传递
        });
        const res = response.data; 
        if (res && res.code === 200) {
           console.info("saveAppointmentList:",res.data);   
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
*/
  