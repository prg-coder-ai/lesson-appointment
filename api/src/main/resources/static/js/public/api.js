// API请求封装（简化JS请求，避免重复代码） 
    // 全局定义API服务器地址及端口号、根路径（可根据实际情况修改）
   
    // 可以使用 ES6 的 import 语法引用指定模块，如下：
  
    // 解释：import request from '@/utils/request'
    // 这句代码的作用是引入一个封装好的网络请求工具（request 实例），
    // 它一般基于 axios 或 fetch 做了统一的请求/响应拦截、错误处理等，
    // 用于项目中统一发起 HTTP 网络请求，便于接口复用和维护。
    // 注意：本环境如果没有支持 ES module 的 import 语法，
    // 可使用 require 或直接引用全局 request 对象。
    // INSERT_YOUR_CODE
    // '@/utils/request' 的含义：
    // 这是一个路径别名（@ 通常被配置为 src 目录），/utils/request 指的是 src/utils/request.js 文件。
    // 此文件通常封装了 axios（或 fetch）的实例，进行了全局的请求与响应拦截、token处理、错误统一提示等。
    // 作用是让项目统一导入并复用标准的 HTTP 请求工具，减少重复代码，方便维护和统一错误处理。
    // 前端其他模块可以通过 import request from '@/utils/request' 便捷地引用它。


    
    const API_SERVER_HOST = 'http://localhost';
    const API_SERVER_PORT = '8081';
    const API_BASE_PATH = '';
    //'/api/v1';

    // API完整前缀
    const API_BASE_URL = `${API_SERVER_HOST}:${API_SERVER_PORT}${API_BASE_PATH}`;
    window.API_BASE_URL = API_BASE_URL;
    let courseList = [];       // 课程列表
    let scheduleObject=null;       // 排期
    let scheduleList =[];
    let bookingList=[];
    let currentCourseId=null;
    let selectedScheuleId = null;

    let userId = "";
    let userRole =  "";
    let userInfo = {};

      // 获取用户时区（关键）
      const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      console.log("tz",userTimeZone); 
      InitUserInfo();
      
   function InitUserInfo() {
       userInfo= getCurrentUserInfo();
      console.log("userInfo",userInfo);
      if(userInfo == null || typeof userInfo === 'undefined') { 
          document.cookie = 'currentUser=;expires=Thu, 01 Jan 1970 00:00:01 GMT;path=/';
          // 判断是否是当前页面
          // 检查当前页面是否为登录页，如果不是则重定向到首页
          // 用于防止未登录用户强行访问需要权限的页面
          if (!window.location.pathname.endsWith('index.html')) 
            { 
              window.location.href  =  './index.html';
            }
          } else  { 
        userId = userInfo.userId;
        userRole = userInfo.role; 
        }
    }

//const api = {
    // 后端API接口地址（相对路径，端口由Spring Boot配置决定，无需写localhost:8088）
   // getDataList: "/api/v1/data/list" // 对应后端IndexController的API接口
//};

// 封装GET请求（获取数据库数据）
/*function getRequest(url, callback) {
    fetch(url, {
        method: "GET",
        headers: {
            "Content-Type": "application/json;charset=UTF-8"
        }
    })
    .then(response => response.json()) // 解析后端返回的JSON数据
    .then(data => {
        callback(data); // 回调函数，将数据传递给页面渲染
    })
    .catch(error => {
        console.error("API请求失败：", error);
    });
}
*/
//按照传入的条件，检索用户列表，eg：const conditionJson = { role: 'teacher' };
//TBD条件：公司、分部、管理员
async function fetchUserList(conditionJson) {
  const URL = `${API_BASE_URL}/user/${conditionJson.role}/list`; 
  console.log("URL"+ URL); 
    try { 
      // 语法分析：使用ES6的await等待fetch请求，URL通过模板字符串拼接。配置对象包含：
      // method: 请求方法为'GET'
      // headers: 指定内容类型为'application/json'
      // credentials: 'include'用于携带cookie以实现跨域认证
      // 使用封装的request方法改写
      const res = await request({
        url: URL,
        method: "get",
        data: {}, // 没有请求体
        // 可选：如果request已经统一处理token/cookie，则无需额外添加headers
      });
      console.log("fetchUserList response:", res); 
     // console.log("fetchUserList result:", res.data);
      // 假设后端返回数据结构 { code: 200, data: [...] }
      return res  || [];
    } catch (e) {
      alert(e.message + "网络错误，无法获取数据");
      return [];
    }
  }

  async function  getUserNameById(teacherId) {
    const URL = `${API_BASE_URL}/user/name/${teacherId}`; 
    console.log("URL"+ URL); 
      try {    
        // 用request改写
        const res = await request({
          url: URL,
          method: "get",
          data: {}, // 无请求体
        });
        console.log("getUserNameById response:", res);
 
      //  if (!res || res.code !== 200) throw new Error("获取失败");

        console.log("getUserNameById", res);

        // 假设后端返回数据结构 { code: 200, data: [{userId, name, ...}], ... }
        return res  || "n/a";
      } catch (e) {
        alert(e.message + "网络错误，无法获取数据");
        return "n/a";
      } 
  }
  
/**
 * 获取Token（修复localStorage解析逻辑）
 */

function getToken() {
  const currentUserStr = localStorage.getItem('currentUser');
  if (!currentUserStr) {
      alert('未登录，请重新登录');
      window.location.href = '/login'; // 跳转到登录页
      return '';
  }
  const currentUser = JSON.parse(currentUserStr);
  return currentUser.token || '';
}

function  getCurrentUserInfo() { 
const userStr = localStorage.getItem('currentUser');
  if(userStr)
     return  JSON.parse(userStr);
    else return null;
}

 // 页面跳转函数（根据用户角色）
 function redirectToUserPage(user) {
       
  //alert('redirectToUserPage:'+ user.role );
  // 存储用户信息到本地（实际项目中使用token）
 // localStorage.setItem('currentUser', JSON.stringify(user));
  if(user && user.role){
  // 根据角色跳转对应页面
  switch(user.role) {
    case 'admin':
      window.location.href = './admin.html';
      break;
    case 'teacher':
      window.location.href = './teacher.html';
      break;
    case 'student':
      window.location.href = './student.html';
      break;
    default:
      alert('未知用户身份，请联系管理员1');
      resetLoginForm();
      window.location.href = './index.html';
  } 
} else {
 // alert('未知用户身份，请联系管理员2');
      // 判断当前页面是否为index.html
      const isIndexPage = window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || window.location.pathname === '';
     if(isIndexPage ) resetLoginForm(); 
      else 
      window.location.href = './index.html'; 
}
}

  // 这里假设token是JWT，尝试判断是否过期
  function isJwtExpired(token) {
    if (!token) return true;
    const parts = token.split('.');
    if (parts.length !== 3) return false; // 不一定是JWT，视实际情况而定
    try {
      const payload = JSON.parse(atob(parts[1]));
      if (payload.exp) {
        const now = Math.floor(Date.now() / 1000);
        return now > payload.exp;
      }
    } catch (e) {
      // 解码失败，忽略
    }
    return false; // 没有exp就当未过期
  }

 function autoLoginCheck() {
  const userStr = localStorage.getItem('currentUser');
  if (!userStr) {
    return null;
  }
  let userInfo;
  try {
    userInfo = JSON.parse(userStr);
  } catch (e) {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    return;
  }

  const token = userInfo.token || localStorage.getItem('token');
  if (!token || !userInfo.role) {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    return;
  } 

  if (isJwtExpired(token)) {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    document.cookie = 'currentUser=;expires=Thu, 01 Jan 1970 00:00:01 GMT;path=/';
    return;
  }
  return userInfo;
}

 function autoLoginCheck1() {
  // 读取本地 localStorage 保存的用户信息
  const userStr = localStorage.getItem('currentUser');
  if (!userStr) {
    window.location.href = './index.html';
    return;
  }
  //let userInfo;
  try {
    userInfo = JSON.parse(userStr);
  } catch (e) {
    localStorage.removeItem('currentUser');
    window.location.href = './index.html';
    return;
  }
  if (!userInfo || !userInfo.token) {
    // 信息不全，清理，停留
    localStorage.removeItem('currentUser');
    window.location.href = './index.html';
    return;
  }
  
  // 这里假设token是JWT，尝试判断是否过期
  function isJwtExpired(token) {
    if (!token) return true;
    const parts = token.split('.');
    if (parts.length !== 3) return false; // 不一定是JWT，视实际情况而定
    try {
      const payload = JSON.parse(atob(parts[1]));
      if (payload.exp) {
        const now = Math.floor(Date.now() / 1000);
        return now > payload.exp;
      }
    } catch (e) {
      // 解码失败，忽略
    }
    return false; // 没有exp就当未过期
  }

  // 检查token是否过期
  if (isJwtExpired(userInfo.token)) {
    localStorage.removeItem('currentUser');
    // 清除Cookie
    document.cookie = 'currentUser=;expires=Thu, 01 Jan 1970 00:00:01 GMT;path=/';
    alert('登录状态已过期，请重新登录');
    window.location.href = './index.html';
    return;
  } 
  const loginInfo = {
         account:userInfo.account,
         password: userInfo.password
      };

  // 调用后端接口验证token有效性（推荐，防止本地token无效）
  request({
    url: `${API_BASE_URL}/auth/login`,
    method: 'POST' ,
    data: loginInfo
  })
  .then(data => {
    // 由于这里request返回的是已解析的data，无需response.json()
    // 如果验证通过，根据用户角色跳转到对应主页
     {
      const role = data.role || userInfo.role;
      // 按角色跳转
      if (role === 'admin') {
        window.location.href = './admin.html';
      } else if (role === 'teacher') {
        window.location.href = './teacher.html';
      } else if (role === 'student') {
        window.location.href = './student.html';
      }
    } /*else if (data && data.code === 401) {
      // 失效处理
      localStorage.removeItem('currentUser');
      document.cookie = 'currentUser=;expires=Thu, 01 Jan 1970 00:00:01 GMT;path=/';
      alert('登录状态已过期，请重新登录');
    } else if (data && data.code === 403) {
      // token已过期或服务端不认，清理并跳转
      localStorage.removeItem('currentUser');
      document.cookie = 'currentUser=;expires=Thu, 01 Jan 1970 00:00:01 GMT;path=/';
      alert('403登录状态已过期，请重新登录');
      window.location.href = './index.html';
      throw new Error('未登录或登录已失效');
    }*/
  })
  .catch(err => {
    // 自动登录错误（如网络），这里一般保守处理不跳转
    console.error('自动登录校验异常:', err);
  });
} ;

   // 计算日期 dateTimeStr 对应的 weekday（1=周一, 2=周二,...,7=周日），可用于调试辅助
   function getWeekdayFromDateTime(dateTimeStr) {
    // dateTimeStr 形如 'yyyy-MM-dd HH:mm:ss' 或 'yyyy-MM-dd'
    if (!dateTimeStr) return "";
    let datePart = dateTimeStr.split(" ")[0];
    let d = new Date(datePart);
    // JS getDay(): 0=Sunday, 1=Monday,...6=Saturday
    //let jsDay = d.getDay();
    //let cursorWeek = jsDay === 0 ? 7 : jsDay; // 1=Monday,...7=Sunday 
    // 获取浏览器当前的文化区域设置
    function getBrowserLocale() {
      // 获取首选语言环境，形如 "zh-CN"、"en-US" 等
      if (navigator.languages && navigator.languages.length > 0) {
        return navigator.languages[0];
      }
      return navigator.language || navigator.userLanguage || "en-US";
    }
  
    // 利用Intl.DateTimeFormat获得浏览器当前语言下的星期名称
    function getWeekdayNameInBrowserLang(dateObj) { 
      if (!(dateObj instanceof Date)) return "";
      // 使用浏览器语言
      const locale = getBrowserLocale();
      console.log(locale,dateObj);
      try {
        // 'weekday' 选项设置为 'long' 表示全名
        // 修正：将日期对象加1天，防止获取的星期提前一天
        const correctedDate = new Date(dateObj.getTime() + 24 * 60 * 60 * 1000);
        const wkd = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(correctedDate);

        console.log(wkd);
        return  wkd;
      } catch (e) {
        // 兼容错误时返回中文，或英文
        const fallbackNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
        // getDay: 0=Sunday~6
        return fallbackNames[dateObj.getDay()];
      }
    }

    return getWeekdayNameInBrowserLang(d);
}