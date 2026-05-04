// INSERT_YOUR_CODE
// axios 依赖应由HTML或全局引入，如未引入，请在页面头部 


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
            console.log("courseList:",courseList);
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
           // alert(res?.message || '获取排期失败');
            return [];
        }
    } catch (e) {
       // alert("网络错误，获取排期失败");
        console.error("网络错误"+e);
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
          console.log('操作成功');//+msg+res.data); 
        const bid = res.data;
       // reloadBooking(bid);  调用者提供刷新
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
     
    
//返回1个排期对象
async function fetchSchedule( scheduleid) {
  console.log("fetchSchedule  " ,'scheduleid');
  const token = getToken();
  if (!token)  return []; 
  try { 
      const response = await axios.get(`${API_BASE_URL}/course/schedule/detail/${scheduleid}`, {
          headers: { "Authorization": "Bearer " + token },
         // params: JSON.stringify([]) // 对应后端@RequestParam， 
        });
       // console.log("fetchSchedule:" ,response.data);
        const res = response.data;
        if (res && res.code === 200) {
            //console.info("fetchSchedule:",res.data);
            return  res.data|| null; //
 
        } else {
           console.log(res?.message  ,'获取排期失败',scheduleid);
            return null;
        }
    } catch (e) {
       // alert("网络错误，获取排期失败");
        console.error("网络错误，获取排期失败",e,scheduleid);
        return null;
    }
}
//根据排期id及用户信息，获取所有的预定信息
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
async function getBookingList( userRole, userid,status) { 
 
  const params = {  
      id:null,
      scheduleId: null,
      userRole: userRole,
      userId: userid,
      status: status
  }; 
  return  getBookingInfoByCondition(params) ; 
}

async function  getBookingInfoByCondition(params) {
  const url = `course/booking/list` ;
  const token = getToken();
try {
  const res = await fetch(`${API_BASE_URL}/${url}`, {
      method: 'POST',
      headers: {
          'Content-Type': 'application/json',
          "Authorization": "Bearer " + token
      },
      credentials: 'include',
      body: JSON.stringify(params)
  });
  
  const result = await res.json(); 
  console.log('getBookingInfo: result', result);
  if (result && result.code === 200) {
      return result.data;
  } else {
      alert(result?.message || '排期时间表为空，请联系老师');
  }
  return [];
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
    }; 
*/
// 分析：可能由于日期时区或构造Date的方式导致了前端和后端实际天数偏差。例如直接用new Date('yyyy-MM-dd')会因时区差别导致日期减少1天。可以尝试使用new Date(year, month, day)规避。
async function generateScheduleListFromServer(form) { 
  const url = `course/schedule/generate` ;
  const token = getToken();
//  const queryString = new URLSearchParams(form).toString(); ccc?${queryString}
  try {
      const res = await fetch(`${API_BASE_URL}/${url}`, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              "Authorization": "Bearer " + token
          },
          credentials: 'include',
         body: JSON.stringify(form)
      });

      const result = await res.json();
      
      // 修正后端返回的日期数组，确保日期不因本地解析减少1天
      // 尝试将日期转为本地日期字符串再渲染
      if (result && result.code === 200) {
          // result.data: [{date:'2024-06-01',time:'09:00'}, ...] 
          return result.data;
      } else {
          alert(result?.message || '排期时间表为空，请联系老师');
      }
      return [];
  } catch (err) {
      alert('获取排期时间表失败');
      console.error(err);  
  }
  return [];
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