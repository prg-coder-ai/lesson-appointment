// API请求封装（简化JS请求，避免重复代码） 
    // 全局定义API服务器地址及端口号、根路径（可根据实际情况修改）
    const API_SERVER_HOST = 'http://localhost';
    const API_SERVER_PORT = '8081';
    const API_BASE_PATH = '';
    //'/api/v1';

    // API完整前缀
    const API_BASE_URL = `${API_SERVER_HOST}:${API_SERVER_PORT}${API_BASE_PATH}`;

   // let token =getToken(); 
   const userInfo= getCurrentUserInfo();
   console.log("userInfo",userInfo);
   let userId = userInfo.userId;
   let userRole = userInfo.role;

    console.log("userRole:",userRole);
    // 获取用户时区（关键）
    const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    console.log("tz",userTimeZone);


  let courseList = [];       // 课程列表
  let scheduleObject=null;       // 排期
  let scheduleList =[];
  let bookingList=[];
  let currentCourseId=null;
  let selectedScheuleId = null

const api = {
    // 后端API接口地址（相对路径，端口由Spring Boot配置决定，无需写localhost:8088）
    getDataList: "/api/v1/data/list" // 对应后端IndexController的API接口
};

// 封装GET请求（获取数据库数据）
function getRequest(url, callback) {
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
      const response = await fetch(`${URL}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          credentials: 'include'
        } 
      });
  
      const result = await response.json();
      console.log("fetchUserList"+ response);
      if (!response.ok) throw new Error("获取列表失败");
      console.log("fetchUserList"+ result);
      // 假设后端返回数据结构 { code: 200, data: [{userId, name, email, phone, status, ...}], ... }
      return result.data || [];
    } catch (e) {
      alert(e.message + "网络错误，无法获取数据");
      return [];
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
}
 
 function autoLoginCheck() {
  // 读取本地 localStorage 保存的用户信息
  const userStr = localStorage.getItem('currentUser');
  if (!userStr) {
    window.location.href = './admin.html';
    return;
  }
  let userInfo;
  try {
    userInfo = JSON.parse(userStr);
  } catch (e) {
    localStorage.removeItem('currentUser');
    window.location.href = './admin.html';
    return;
  }
  if (!userInfo || !userInfo.token) {
    // 信息不全，清理，停留
    localStorage.removeItem('currentUser');
    window.location.href = './admin.html';
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
    window.location.href = './admin.html';
    return;
  } 
  const loginInfo = {
         account:userInfo.account,
         password: userInfo.password
      };

  // 调用后端接口验证token有效性（推荐，防止本地token无效）
  fetch(`${API_BASE_URL}/user/login`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Authorization': userInfo.token ? `Bearer ${userInfo.token}` : ''
    },
    body: JSON.stringify(loginInfo)
  })
  .then(response => {
    if (response.status === 403) {
      // token已过期或服务端不认，清理并跳转
      localStorage.removeItem('currentUser');
      document.cookie = 'currentUser=;expires=Thu, 01 Jan 1970 00:00:01 GMT;path=/';
      alert('403登录状态已过期，请重新登录');
      window.location.href = './index.html';
     throw new Error('未登录或登录已失效');
    }
    return response.json();
  })
  .then(data => {
    // 如果验证通过，根据用户角色跳转到对应主页
    if (data && data.code === 200 && data.data) {
      const role = data.data.role || userInfo.role;
      // 按角色跳转
      if (role === 'admin') {
        window.location.href = './admin.html';
      } else if (role === 'teacher') {
        window.location.href = './teacher.html';
      } else if (role === 'student') {
        window.location.href = './student.html';
      }
    } else if (data && data.code === 401) {
      // 失效处理
      localStorage.removeItem('currentUser');
      document.cookie = 'currentUser=;expires=Thu, 01 Jan 1970 00:00:01 GMT;path=/';
      alert('登录状态已过期，请重新登录');
    }
  })
  .catch(err => {
    // 自动登录错误（如网络），这里一般保守处理不跳转
    console.error('自动登录校验异常:', err);
  });
} ;
