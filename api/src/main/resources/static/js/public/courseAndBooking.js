 
// axios 依赖应由HTML或全局引入，如未引入，请在页面头部 
 
async function getCourseById( courseId) { 
  try {
      // Axios GET请求（修复response.json()错误，Axios已自动解析）
      const res  = await request({url:`${API_BASE_URL}/course/${courseId}`,  
      });
     
         return  res ; 
  } catch (e) {
      //alert("网络错误，获取课程列表失败");
      console.error("getCourseById",e);
      return   null;
  }
}
 
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
/*const params = {
        courseName: document.getElementById('courseName').value,
        languageType: document.getElementById('language').value,
        difficultyLevel: document.getElementById('difficulty').value,
        teacher: document.getElementById('teacher').value
    };
*/
async function getCourseList(conditionJson) {  
    console.log("getCourseList",conditionJson);
    try {
        // axios GET请求不能使用 body/params 的用法如下, 正确是用 params 字段传递 URL 查询参数
        const res = await request({
            url: `${API_BASE_URL}/course/list`,
            method: 'GET',
            params: conditionJson, // 正确传递查询参数，自动加到URL上 
        });

        //console.log("courseList response:", res);
         
        // 若是标准result结构  
            let courseList = res || [];
            courseList.forEach(item => {
                if (!item.status)
                   item.status = 'inactive';
            });
            return courseList || [];
        
    } catch (e) {
        alert("网络错误，获取课程列表失败");
        console.error(e); 
        return [];
    }
  }

  
/**
 * TBD:根据课程id，调用后端接口获取模板列表. status:null/""，不参与检索，否则按条件过滤。
 * 返回：排期列表或[]
 */
async function fetchScheduleList( cid,status) {
   
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

        // 用 request 方法改写 axios GET
        const res = await request({
            url: `${API_BASE_URL}/schedule/selectByCourseId/${cid}`,
            method: 'GET',
            params: conditionJson // params 自动附加到 URL 上（被 @RequestParam 接收） 
        }); 
            console.info("fetchScheduleList:", res );
            return res  || []; // TBD: 对于多个排期的情况进行区分
 
    } catch (e) {
       // alert("网络错误，获取排期失败");
        console.error("网络错误"+e);
        return [];
    }
}

 async function createOrUpdateBookingObj(bookingid,bookingCreateDTO ){
  const url = bookingid !=""? `course/booking/update/${bookingid}` : `course/booking`;
    try {
      const result = await request({
        url: `${API_BASE_URL}/${url}`,
        method: 'POST', 
        data: bookingCreateDTO,
        // credentials: 'include' // 如果request实现中默认带cookie则无需此项
      });
    console.log("createOrUpdateBookingObj:",result);
   return result;//id    
  } catch (err) {
    //alert('网络异常，操作失败');
    console.error(err);  
    return null;
  }
  }
/**
 *取消、删除
 */
 async function operateBookingStatus(bookid, action) {
  console.log("operateBookingStatus",bookid,action);
  
    const payload = {
        id: bookid,  // 注意小写，和后端命名对应
        status: action
  };
    //  console.log("payload：",payload,token); 
    // credentials 与 Authorization 并不冲突，credentials: 'include' 用于携带 cookie，而 Authorization 是用于 token 鉴权，通常二者可以并存
    try {
      const res = await request({
        url: `${API_BASE_URL}/course/booking/updateStatus`,
        method: 'POST',
        data: payload 
      });
     console.log('operateBookingStatus',res); 
    } catch (e) {
      alert("网络错误或数据解析异常，操作失败");
      console.error(e);
    }
   
    } ;
     
    
//返回1个排期对象
async function fetchSchedule( scheduleid) {
  console.log("fetchSchedule :" ,scheduleid); 
  try { 
      const res = await request({
        url: `${API_BASE_URL}/schedule/detail/${scheduleid}`,
        method: 'GET' 
      }); 
          //console.info("fetchSchedule:",res.data);
          return res || null; // 
    } catch (e) {
       // alert("网络错误，获取排期失败");
        console.error("网络错误，获取排期失败",e,scheduleid);
        return null;
    }
}


/**
 * 发布/回收排期、
 */
async function operateSchedule(scheduleId, action) { 
    const payload = {
        scheduleId: scheduleId,  // 注意小写，和后端命名对应
        status: action
      };
      console.log("payload：",payload); 
    const  res = await request({url:`${API_BASE_URL}/schedule/updateStatus`,  
      method: 'POST', 
      data:  payload  //controller: @RequestBody IncSiteBody dto
    });
       
        return res ;   
    } ;

/** 将表单数据转为后端 ScheduleCreateDTO（repeatType 为 0-3 整数） */
function toScheduleCreateDto(formData) {
    const repeatTypeMap = { none: 0, day: 1, week: 2, month: 3 };
    const raw = formData.repeatType;
    let repeatType = 0;
    if (typeof raw === 'number') {
        repeatType = raw;
    } else if (raw != null && raw in repeatTypeMap) {
        repeatType = repeatTypeMap[raw];
    } else if (raw != null && !isNaN(Number(raw))) {
        repeatType = Number(raw);
    }
    return {
        scheduleId: formData.scheduleId || '',
        courseId: formData.courseId || '',
        startDate: formData.startDate || '',
        startTime: formData.startTime || '',
        endDate: formData.endDate || '',
        endTime: formData.endTime || formData.startTime || '',
        repeatType,
        repeatInterval: formData.repeatInterval ?? formData.interval ?? 1,
        repeatDays: formData.repeatDays || [],
        timeZone: formData.timeZone || (typeof userTimeZone !== 'undefined' ? userTimeZone : '') || '',
        availableSites: formData.availableSites || 1,
        status: formData.status || '',
        name: formData.name || ''
    };
}

// 
    async function saveScheduleToServer(bExists,dto) {
       const url = bExists? `schedule/update` : `schedule/create`; 
       console.log("saveScheduleToServer:",bExists,dto);
    try{
      const result = await request({url: `${API_BASE_URL}/${url}`, 
                method: 'POST',     
                 data:  dto  //ok--
                      });
       //  console.log("res:",res);   
      console.log("result:",result);
      return result ;//{id:id}
    }  catch(err){
        alert('网络异常，操作失败');
        console.error(err);  
    } 
    return null; 
  }

///获取排期的时间列表 
async function generateAppointmentList( scheduleId ,timeZone){
  const scheduleInfo = await fetchSchedule(scheduleId); 
  let ScheduleGenerateDTO= {
   courseId:  scheduleInfo.courseId,
   scheduleId:  scheduleInfo.scheduleId,
   startDate:  scheduleInfo.startTime.split(' ')[0], 
   startTime: scheduleInfo.startTime.split(' ')[1],

   repeatType: (function(val) {
       if (val == 0 || val === "0" || val === "none") return "none";
       if (val == 1 || val === "1" || val === "day") return "day";
       if (val == 2 || val === "2" || val === "week") return "week";
       if (val == 3 || val === "3" || val === "month") return "month";
       return val; // fallback
   })(scheduleInfo.repeatType),

   interval:  scheduleInfo.repeatInterval,
   status:    scheduleInfo.status,
   timeZone:  scheduleInfo.timeZone,
   userTimeZone:timeZone,
   repeatDays: scheduleInfo.repeatDays
     ? scheduleInfo.repeatDays.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n))
     : [],

   endDate:  scheduleInfo.endTime.split(" ")[0]
  }
  //console.log("ScheduleGenerateDTO:",ScheduleGenerateDTO);
  const appointmentResults = await generateScheduleListFromServer(ScheduleGenerateDTO); 
  //console.log("appointmentResults:",appointmentResults);

return appointmentResults;
}


//根据排期id及用户信息，获取所有的预订信息
function getBookingObject(bookingId) { 
 /*
  const params = {  
      id:bookingId,
      scheduleId: null,
      userRole: null,
      userId: null,
      status: null
  }; 
  return  getBookingInfoByCondition(params) ;*/
  return fetchBooking(bookingId);
}
//same as getBookingObject TBTEST
async function fetchBooking( bookingId) { 
  try {
      // Axios GET请求（修复response.json()错误，Axios已自动解析）
      const res =await request({ url:`${API_BASE_URL}/course/booking/${bookingId}` 
      });    
       
         return  res ;   
  } catch (e) {
      //alert("网络错误，获取课程列表失败");
      console.error(e);
      return   false;
  }

}
//根据排期id及用户信息，获取所有的预订信息
 function getBookingInfo(scheduleid, userRole, userid) { 
 
  const params = {  
      id:null,
      scheduleId: scheduleid,
      userRole: userRole,
      userId: userid,
      status: null
  }; 
  return  getBookingInfoByCondition(params) ;
}

//获取指定用户的所有排期--可指定状态
async function getBookingList( userRole, userid, status) { 
 
  const params = {  
      id:null,
      scheduleId: null,
      userRole: userRole,
      userId: userid,
      status: status
  }; 
  //console.log("getBookingList: params", params); 
  return  await getBookingInfoByCondition(params) ; 
}

async function  getBookingInfoByCondition(params) {
  const url = `course/booking/list` ; 
  //console.log("getBookingInfoByCondition- params：", params); 
try {
      const res =await request( { url:`${API_BASE_URL}/${url}`,method: 'POST',data:params}) ; //data:{params}-->data:params
  //console.log('getBookingInfoByCondition: res', res); 
  return res ; 
    //  alert(result?.message || '排期时间表为空，请联系老师');
  
} catch (err) {
  //alert('获取排期时间表失败');
  console.error('获取排期时间表失败'+err);  
}
return [];
}

/* form{
 courseId:  
        scheduleId:  
        startDate:  
        startTime: 
        repeatType:  
        interval:  
        status:   
        timeZone:  
        userTimeZone:  
        repeatDays: 
        endDate:  
    }; */
// 分析：可能由于日期时区或构造Date的方式导致了前端和后端实际天数偏差。例如直接用new Date('yyyy-MM-dd')会因时区差别导致日期减少1天。可以尝试使用new Date(year, month, day)规避。
async function generateScheduleListFromServer(formData) { 
  const url = `schedule/generate` ;
 // const token = getToken();
//  const queryString = new URLSearchParams(form).toString(); ccc?${queryString}
  try { 
       const result = await  request({url:`${API_BASE_URL}/${url}`, 
                              method: 'POST', 
                              data:    formData//controller: @RequestBody ScheduleGenerateDTO dto
                                        });
      // 修正后端返回的日期数组，确保日期不因本地解析减少1天
      // 尝试将日期转为本地日期字符串再渲染 
          // result : [{date:'2024-06-01',time:'09:00'}, ...] 
          return result ;  
  } catch (err) {
      alert('获取排期时间表失败');
      console.error(err);  
      return [];
  } 
} 

    /**
     * 设置输入元素为只读，但不改变其显示颜色或样式
     * @param {HTMLElement} el 输入元素（如input/textarea）
     * 通过nofocus： pointer-events: none;     禁止鼠标交互，包括点击、选中、聚焦  
        user-select: none;       禁止选中内容  
        outline: none !important; 
   
      pointer-events: none;   禁用交互（点击、输入、焦点）  
      user-select: none; 
    function setReadOnlyById(itemName){  
     const  el = document.getElementById(itemName);
     setReadOnlyKeepStyle(el);
    }

    function setReadOnlyKeepStyle(el) {
      if (!el) return;
      el.readOnly = true;
      // 一些表单元素（如select、checkbox、radio）没有readonly属性，可用disabled，但会变灰
      // 此处推荐通过阻止交互而不设置disabled，保证视觉样式不变
      el.addEventListener('keydown', function(e) { e.preventDefault(); }, { once: true });
      el.addEventListener('beforeinput', function(e) { e.preventDefault(); }, { once: true });
      // 可选：为input添加pointer-events:none，但如果要选中文字可省略
      // el.style.pointerEvents = 'none';
      
      forbidSelectExpand(el);

      if(hasChildElements(el)){// for input
         traverseChildElements(el,forbidInput);
       }
  }

  // 判断一个元素是否有子元素，遍历其子元素
function hasChildElements(element) {
  if (!element) return false;
  // 返回元素是否至少有一个子元素节点（HTMLElement）
  return element.children && element.children.length > 0;
}
function traverseChildElements(element, callback) {
  if (!element || !element.children) return;
  // 遍历所有子元素，并对每个子元素执行callback
  for (let i = 0; i < element.children.length; i++) {
      const child = element.children[i];
      callback(child);
      // 可递归遍历后代
      //traverseChildElements(child, callback);
  }
}

/**
 * 禁止下拉框(select)展开，可用以下方式：
 * 1. 设置disabled=true，最简单，但会变灰。
 *    例如：document.getElementById("yourSelectId").disabled = true;
 * 2. 若不想变灰，可用JS阻止其交互行为（推荐方法）：
 *    给select元素添加事件监听，阻止鼠标和键盘操作，从而禁止展开，但保持外观。
 */
function forbidSelectExpand(selectElement) {
  if (!selectElement) return;
  // 阻止鼠标展开
  selectElement.addEventListener('mousedown', function (e) {
    e.preventDefault();
    this.blur();
  });
  // 阻止键盘展开（方向键、回车、空格等）
  selectElement.addEventListener('keydown', function (e) {
    e.preventDefault();
    this.blur();
  });
  // 禁止获得焦点
  selectElement.addEventListener('focus', function (e) {
    e.target.blur();
  });
} 
// 用法示例：禁止"id为scheduleSelect"的下拉框展开
// forbidSelectExpand(document.getElementById('scheduleSelect'));
/**
 * 禁止 input 元素的输入，有几种常见方法：
 * 
 * 1. 设置 readonly 属性（不可编辑，但能选中复制，外观不变）：
 *    document.getElementById('yourInputId').readOnly = true;
 *    // 取消禁用输入：
 *    document.getElementById('yourInputId').readOnly = false;
 * 
 * 2. 设置 disabled 属性（完全禁用且变灰，不能选中）：
 *    document.getElementById('yourInputId').disabled = true;
 *    // 取消禁用输入：
 *    document.getElementById('yourInputId').disabled = false;
 * 
 * 3. 用 JS 阻止所有输入行为（维持完全外观，但禁止输入）：
 */
function forbidInput(inputElement) {
  if (!inputElement) return;
  // 禁止键入
  inputElement.addEventListener('keydown', function(e) {
    e.preventDefault();
  });
  // 禁止粘贴
  inputElement.addEventListener('paste', function(e) {
    e.preventDefault();
  });
  // 禁止拖拽输入
  inputElement.addEventListener('drop', function(e) {
    e.preventDefault();
  });
}
/*
fetch中，方法为PUT时，如何传递参数？
答：常见做法是将参数对象序列化为JSON字符串，并放在fetch的body属性中，同时设置headers中的Content-Type为'application/json'。

例如：
const payload = { name: "Tom", age: 23 };
fetch('your-api-url', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(payload)
})
.then(response => response.json())
.then(data => console.log(data));

如果后端要求参数在URL中（极少见），可以直接拼接到url后面，不过绝大多数Restful风格后端均推荐用body传递JSON。
*/

//更新预约时间的状态
async function operateAppointmentStatus(aid, action) { 
  const payload = {
          id: aid,  // 注意小写，和后端命名对应
          status: action
    };
    console.log(" operateAppointmentStatus- payload：",payload ); 
   try {
     const res = await request({
       url: `${API_BASE_URL}/course/appointment/updateStatusById`,
       method: 'PUT',
       data: payload
     });
     // 防御：确保res对象和有code字段
     const code = typeof res === "object" && res !== null && "code" in res ? res.code : undefined;
     const msg = (typeof res === "object" && res !== null && res.message) ? res.message : '';
     if (res != "") {  
       console.log('更新预约时间 操作成功'); 
       // const bid = res.data;
       // reloadBooking(bid);  调用者提供刷新
     } else {
       alert("更新预约时间"+(msg || '操作失败'));
     }
   } catch (e) {
     alert("网络错误或数据解析异常，操作失败");
     console.error(e);
   }
 
  } ;
   
// 在 XML (如 HTML, SVG 等) 中，元素的 class 属性以空格分隔多个类名：
// 例如：
/*
<element class="class1 class2"></element>
*/
/* 
  利用 CSS 设置 web 元素禁止鼠标焦点和禁止修改，可以通过如下方式：

  1. 禁止获得焦点（如 input/select/textarea）：
     使用 pointer-events 和 user-select 结合 outline: none;
     对 input/textarea 可直接加 readonly 或 disabled
     对于 class 控制，可定义如下 CSS:
*/
//.nofocus {
 // pointer-events: none;    /* 禁止鼠标交互，包括点击、选中、聚焦 */
 // user-select: none;       /* 禁止选中内容 */
  //outline: none !important;
  /* 还可以加 filter: grayscale(0.8); 让元素更灰一点，看起来像只读 */
//}

/* 
  如果需要禁止修改（如 input/textarea），class 控制只样式不够，还需要加 readonly/disabled 属性。
  但用于只读样式可这样写：
*/
//.readonly-style {
 // background: #f5f5f5;
 // color: #999;
 // border-color: #ddd;
 // pointer-events: none;    /* 禁用交互（点击、输入、焦点） */
 // user-select: none;
//}

/*
  示例用法：
  <input class="readonly-style" readonly>
  <button class="nofocus">不可用按钮</button>
  <select class="nofocus" tabindex="-1"></select>
*/


/* 用法举例： */
// forbidInput(document.getElementById('yourInputId'));

//更具排期数据构造可读描述，用于teacher排期管理和student预约管理
//可简化为：日期范围，时间，排期计划
//此处为scdedule Entity,从数据库读取的
function getScheduleInfo(scheduleObject,withName=true) {
  if (!scheduleObject) return;
   let info="";

    // 排期名称 在预约审核中不显示在时间信息中，在学生预约管理中显示
    if (withName && scheduleObject.name)          info += scheduleObject.name;

  // 起始日期、结束日期和上课时间组成一句简洁文字
  if (scheduleObject.startTime || scheduleObject.endTime ) {
      let dateStr = '';
      if (scheduleObject.startTime && scheduleObject.endTime && scheduleObject.startTime !== scheduleObject.endTime) {
          // 截取日期部分（假设startTime/endTime为"yyyy-MM-dd HH:mm:ss"格式，仅取日期部分）
          const startDate = scheduleObject.startTime ? scheduleObject.startTime.split(" ")[0] : "";
          const endDate   = scheduleObject.endTime   ? scheduleObject.endTime.split(" ")[0] : "";
          const startTime = scheduleObject.startTime ? scheduleObject.startTime.split(" ")[1] : "";
          dateStr = `${startDate} ~ ${endDate} ${startTime}`;
  
      } else if (scheduleObject.startTime) {
          dateStr = scheduleObject.startTime;
      } 
      
      info += dateStr ? ` ${dateStr}` : '';
  }

  // 刷新重复类型 
  info += getRepeatDescription(scheduleObject.repeatType, scheduleObject.interval);
 //TBD:每x周 xx/xx/xx 或者每x月 xx/xx/xx/ 
      return info;
}

//区分代入的参数 ,转为CourseScheduleCreateDTO的数据
function getScheduleInfoByDTO(scheduleObject) {
  if (!scheduleObject) return;
   let info="";

    // 排期名称
    if (scheduleObject.name)          info += scheduleObject.name;

  // 起始日期、结束日期和上课时间组成一句简洁文字
  if (scheduleObject.startDate || scheduleObject.endDate ) {
      let dateStr = ''; 
          // 截取日期部分（假设startTime/endTime为"yyyy-MM-dd HH:mm:ss"格式，仅取日期部分）
          const startDate = scheduleObject.startDate  ;
          const endDate   = scheduleObject.endDate   ;
          const startTime = scheduleObject.startTime  ;
          dateStr = `${startDate} ~ ${endDate} ${startTime}`;
   
      info += dateStr ? ` ${dateStr}` : '';
  }

  // 刷新重复类型 
  info += getRepeatDescription(scheduleObject.repeatType, scheduleObject.interval);
 //TBD:每x周 xx/xx/xx 或者每x月 xx/xx/xx/ 
      return info;
}
/* 
   * 生成重复周期的说明语句
   * @param {string} repeatType - 重复类型，可为 "none", "day", "week", "month"
   * @param {number} interval - 重复周期，如每几天/周/月一次
   * @returns {string} - 周期说明语句
   */
function getRepeatDescription(repeatType, interval) {
  switch (repeatType) {
      case "none":
          return "单次课";
      case "day":
          return `每${interval > 1 ? interval : ''}天一次`;
      case "week":
          return `每${interval > 1 ? interval : ''}周一次`;
      case "month":
          return `每${interval > 1 ? interval : ''}月一次`;
      default:
          return "";
  }
}


/**
 * 发布/回收模板、
 */
async function operateTemplate(templateId, action) {
 // const token = getToken();
      const payload = {
        templateid: templateId,  // 注意小写，和后端命名对应
        status: action
    };
 
      // 这里分析参数带入方式：接口说明需要 templateId 和 action（操作类型/状态）作为参数。
      // axios.put 发送到 /course/template/manage，后端期望参数格式为 { templateId, action } （或 status）。
      // 但你的写法是 { templateId: ..., status: ... }，后端如期望 action 字段，需要修正字段名。
      // 根据后端接口 CourseController.updateTemplate 需要 {templateid, action} 作为 JSON 请求体字段（不是直接字符串参数）。
      // 且参数名注意为 templateid（小写），后端 Spring 不能自动映射 templateId，需和后端代码严格匹配
      // 如果后端 Controller 层要求 RequestBody Json对象，请传:
      // { templateid: templateId, action: action }
      // 不是 params、不是 query、不是 array；是object。
      // axios 等库请求时，发送 request body 只需将数据对象作为第二个参数（POST、PUT），第三个参数为 headers 配置。
      // 例如：axios.put(url, { key1: value1, key2: value2 }, { headers: { ... } })
      // 在 fetch，用 fetch(url, { method: 'POST', body: JSON.stringify(data), headers: { ... } });
      // 后端 expects @RequestBody JSON，所以务必用对象并确保字段名与后端参数完全一致
      
     /* const res = await axios.put(
          `${baseUrl}/course/template/updateStatus`,
          {
            data:{  templateId: templateId, 
              status: action // 使用 action 字段传递类型（如 edit, publish, recall, ...）
            }
          },
          { headers: { "Authorization": "Bearer " + token } }         
      );

      if (res.data.code === 200) {
        console.success( '模板操作成功');
          await renderTemplateCards();
      } else {
          alert( '模板操作失败');
      }
  } catch (err) {
      alert('网络异常，操作失败');
      console.error(err);
  }*/

  // 这段代码中 `res && res.code === 200` 会出现异常的根本原因可能如下：
  // 1. fetch的response未必能被正常解析为json（如接口返回204/空/非json字符串），那么response.json()会抛出异常，进入catch。
  // 2. 如果后端接口出错返回了HTML、null、undefined或其他非对象内容，.then(res => ...)这里的res不是期望的对象，访问res.code会抛出。
  // 3. 某些情况下res实际为null/undefined或格式不符（如res为字符串），则res.code === 200会抛异常。
  //
  // 更安全的写法，需先确认res为对象且有code属性，再判断。推荐加类型检查与默认值防御。
  await request({
    url: `${API_BASE_URL}/course/template/updateStatus`,
    method: 'POST' ,
    data: payload 
  })
  .then(res => {
    // res对象：{ data, code, message ... }  
      if (console.success) { 
        console.success('模板操作成功',res);
      }
      //renderTemplateCards(); 
  })
  .catch(e => {
    alert("网络错误或数据解析异常，操作失败");
    console.error(e);
  });
 
  }   

  
/**
 * 调用后端接口获取模板列表
 */
async function fetchTemplateList(conditionJson) { 
  try {
      // 用 request 方法替换 axios
      const res = await request({
          url: `${API_BASE_URL}/course/template/list`,
          method: 'GET', 
          params: conditionJson // 筛选条件通过params传递
      }); 
      console.info("fetchTemplateList:", res); 
          templateList = res  || [];

          total = templateList.length || 0;

          console.info("total:", total, templateList);
          // 补全默认状态
          templateList.forEach(item => {
              if (!item.status) item.status = 'active';
          });
          return templateList; 
  } catch (e) {
      alert("网络错误，获取模板列表失败");
      console.error(e);
      return null;
  }
}
   
 

 //TBD To Be test ,if the conditionJson tooked infact.
 async function fetchCourseList(conditionJson) {
  
  try {
      // 用 request 方法替换 axios
      const res = await request({
          url: `${API_BASE_URL}/course/list`,
          method: 'GET', 
          params: conditionJson // 筛选条件通过params传递
      }); 
         //console.info("data.courses:", res );   
         return res  || []; 
     
  } catch (e) {
      //alert("网络错误，获取课程列表失败");
      console.error(e);
      return [];
  }
}

/**
 * 
 * 发布/回收课程
 */
async function operateCourse(courseId, action) { 
  const payload = {
    courseid: courseId,  // 注意小写，和后端命名对应
    status: action
};
    console.log("payload：",payload); 
  try {
    const res = await request({
      url: `${API_BASE_URL}/course/updateStatus`,
      method: 'POST',
      data: payload
    });   
    //  if (console.success) {
       // console.success(msg);
     //   console.success('操作成功');
    //  }
    //  renderCourseCards();//TBD
    return res;
  } catch (e) {
    alert("operateCourse:网络错误或数据解析异常，操作失败");
    console.error(e);
  }
  }  
 
 async function updateORCreateCourse(url, formData) { 
    try {
      const res = await request({
        url: `${API_BASE_URL}/${url}`,
        method: 'POST',
        data: formData
      });
      return res;//return id
  } catch (err) {
      alert('网络异常，操作失败');
      console.error(err);
      return null;
  }
  
  }

          /*
        * assignStudentToTheSchedule: 指定学生studentId预约排期scdid，并生成对应的appointment数据，保障原子性。
        * 由于JS前端不具备数据库事务能力，此处通过调用后端API完成实际的事务创建。
        * 若失败则友好提示。
        */
          async function assignStudentToTheSchedule(scdid, studentId,teacherId) {
            if (!scdid || !studentId) {
                //alert("排期或学生ID无效！");
                return false ;
            }
            try {
                const url = `schedule/assign-student`; 
                // 用 request 方法发送请求
                const result = await request({
                    url: `${API_BASE_URL}/${url}`,
                    method: 'POST',
                    data: {
                        scheduleId: scdid,
                        studentId: studentId,
                        teacherId: teacherId
                    }
                });
                console.log("assignStudentToTheSchedule result:", result); 
                return  result;
            } catch (error) {
                alert("分配学生到排期时发生错误: " + error.message);
            }
            return false;
       }
 

       
// 分析：可能由于日期时区或构造Date的方式导致了前端和后端实际天数偏差。例如直接用new Date('yyyy-MM-dd')会因时区差别导致日期减少1天。可以尝试使用new Date(year, month, day)规避。
//用request方法改写
//controller: @RequestBody ScheduleGenerateDTO dto
async function generateScheduleListFromServer(formData) { 
  const url = `schedule/generate` ; 
  try {
      // 用 request 方法改写
      const result = await request({
          url: `${API_BASE_URL}/${url}`,
          method: 'POST',
          data: formData
      });

      // 修正后端返回的日期数组，确保日期不因本地解析减少1天
      // 尝试将日期转为本地日期字符串再渲染 
          // result.data: [{date:'2024-06-01',time:'09:00'}, ...]
          // 兼容性修正：如后端返回的date为'yyyy-MM-dd'字符串，前端用new Date(date)在不同时区下解析会出现日期偏移。
          // 方案：把date字符串分解为年月日，用new Date(year, month-1, day)组成本地时间，或渲染时直接使用原字符串。
          // 这里只返回数据，渲染时renderCalendar里（下方）再修正用法
          return result ;
      
  } catch (err) {
      alert('获取排期失败');
      console.error(err);  
  }
} 
//CourseScheduleCreateDTO
async function checkScheduleConflict(cto){
// INSERT_YOUR_CODE
    // cto: CourseScheduleCreateDTO 结构
    const url = `schedule/checkConflict`;
    try {
        const result = await request({
            url: `${API_BASE_URL}/${url}`,
            method: 'POST',
            data: cto
        });
        // 预期返回：Result<Set<String,String>>，即冲突的排期 scheduleId 与 name 的集合
        return result; // {code, message, data}
    } catch (err) {
        alert('检测排期冲突失败');
        console.error(err);
        return null;
    }

   
}