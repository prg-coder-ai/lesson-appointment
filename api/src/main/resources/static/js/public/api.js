// API请求封装（简化JS请求，避免重复代码）

    // 全局定义API服务器地址及端口号、根路径（可根据实际情况修改）
    const API_SERVER_HOST = 'http://localhost';
    const API_SERVER_PORT = '8081';
    const API_BASE_PATH = '';
    //'/api/v1';

    // API完整前缀
    const API_BASE_URL = `${API_SERVER_HOST}:${API_SERVER_PORT}${API_BASE_PATH}`;

    let token =getToken(); 
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
    try {
      const URL = `${API_BASE_URL}/user/list`;
      const response = await fetch(URL, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json' ,
          'credentials': 'include'
        },
        body: JSON.stringify(conditionJson)
      }); 
      if (!response.ok) throw new Error("获取列表失败");
      const result = await response.json();
      // 假设后端返回数据结构 { code: 200, data: [{userId, name, email, phone, status, ...}], ... }
      return result.data || [];
    } catch (e) {
      alert(e.message || "网络错误，无法获取数据");
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
 

