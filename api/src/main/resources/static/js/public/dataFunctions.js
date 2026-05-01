   


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

 async function getAppointmentsByBookingId( bookingId) {
    const token = getToken();
    if (!token) return;

    try {
        // Axios GET请求（修复response.json()错误，Axios已自动解析）
        const response = await axios.get(`${API_BASE_URL}/course/appointment/getByBookingId`, {
            headers: { "Authorization": "Bearer " + token },
             params: bookingId // 筛选条件通过params传递
        });
        const res = response.data; 
        if (res && res.code === 200) {
           console.info("ppointments:",res.data);   
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

 
 async function saveAppointment( appointdata) {
    console.log("save appoint:",appointdata);
    const token = getToken();
    if (!token) return;
 
    try {
        // Axios GET请求（修复response.json()错误，Axios已自动解析）
        const response = await axios.get(`${API_BASE_URL}/course/appointment/add`, {
            headers: { "Authorization": "Bearer " + token },
             params: appointdata // 筛选条件通过params传递
        });
        const res = response.data; 
        if (res && res.code === 200) {
           console.info("saveAppointment:",res.data);   
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
 async function saveAppointmentList( appointdataList) {
    const token = getToken();
    if (!token) return;

    try {
        // Axios GET请求（修复response.json()错误，Axios已自动解析）
        const response = await axios.get(`${API_BASE_URL}/course/appointment/addBatch`, {
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

  