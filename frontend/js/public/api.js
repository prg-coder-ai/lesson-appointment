/* 跨源导航（前后端分离后默认同源）
 * platform_admin.html 与 admin.html 都是 dist 里的静态页，与业务端同一站点，
 * 因此默认取 location.origin（同源）。只有在把管理端单独部署到独立子域/端口时，
 * 才需要在页面里显式注入 window.ADMIN_ORIGIN / window.FRONTEND_ORIGIN。
 * 旧的默认值 'http://<hostname>:8081' / ':8080' 会在生产跳到不存在的端口，已废弃。 */
window.ADMIN_ORIGIN = window.ADMIN_ORIGIN || location.origin;
window.FRONTEND_ORIGIN = window.FRONTEND_ORIGIN || location.origin;
// API请求封装（简化JS请求，避免重复代码） 
    // 全局定义API服务器地址及端口号、根路径（可根据实际情况修改）
   
    // 可以使用 ES6 的 import 语法引用指定模块，如下：
  
    // 解释：import request from '@/utils/request'
    // 这句代码的作用是引入一个封装好的网络请求工具（request 实例），
    // 它一般基于 axios 或 fetch 做了统一的请求/响应拦截、错误处理等，
    // 用于项目中统一发起 HTTP 网络请求，便于接口复用和维护。
    // 注意：本环境如果没有支持 ES module 的 import 语法，
    // 可使用 require 或直接引用全局 request 对象。 
    // '@/utils/request' 的含义：
    // 这是一个路径别名（@ 通常被配置为 src 目录），/utils/request 指的是 src/utils/request.js 文件。
    // 此文件通常封装了 axios（或 fetch）的实例，进行了全局的请求与响应拦截、token处理、错误统一提示等。
    // 作用是让项目统一导入并复用标准的 HTTP 请求工具，减少重复代码，方便维护和统一错误处理。
    // 前端其他模块可以通过 import request from '@/utils/request' 便捷地引用它。


    //读取application.properties的server.host内容

    // 后端地址。**默认留空 = 与前端同源**（前端页面由 Spring Boot 一并托管，这是本项目部署方式）。
    //
    // 为什么不再写死 host:port：
    //   utility_request.js 在本文件之前加载，那时 window.API_BASE_URL 还是空串，
    //   于是 axios 实例的 baseURL=''（走同源）；而本文件算出的却是绝对地址 http://localhost:8081。
    //   两者不一致 → 后端一旦换端口，用 API_BASE_URL 拼接的请求（如 /course/template/page）
    //   会打向旧端口，相对路径的请求（如 /user/page）却正常，表现为"一半接口好、一半接口坏"，
    //   且现象会随页面切换而变，极难排查。改为同源后两处恒等。
    //
    // 前后端分离部署时，只需填入 host/port（任一非空即按 host:port 拼接，行为同原逻辑）。
    const API_SERVER_HOST = '';
    const API_SERVER_PORT = '';
    const API_BASE_PATH = '';
    //'/api/v1';

    // API 完整前缀
    const API_BASE_URL = (API_SERVER_HOST || API_SERVER_PORT)
      ? `${API_SERVER_HOST}:${API_SERVER_PORT}${API_BASE_PATH}`
      : API_BASE_PATH;
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
      InitUserInfo(); 
      

  // 在公共入口（如 main.js / public/init）初始化一次 --为了处理动态加载的内容，使用 MutationObserver 监听 DOM 变化
  const mo = new MutationObserver(mutations => {
    let needApply = false;
    for (const m of mutations) {
      if (m.addedNodes.length) { needApply = true; break; }
    }
    if (needApply) {
      mo.disconnect();               // 防递归：替换文本本身也触发 mutation
      applyTerms();
      observe();                     // 处理完重新挂上
    }
  });

    function observe() { mo.observe(document.body, { childList: true, subtree: true }); }
    observe(); 

      
   function InitUserInfo() {
       userInfo= getCurrentUserInfo();
      if(userInfo == null || typeof userInfo === 'undefined') { 
          document.cookie = 'currentUser=;expires=Thu, 01 Jan 1970 00:00:01 GMT;path=/';
          // 判断是否是当前页面
          // 检查当前页面是否为登录页，如果不是则重定向到首页
          // 用于防止未登录用户强行访问需要权限的页面
          // 若 URL 带 ?tCode= 则一并带入登录页，使登录页按该租户预填/锁定
          // 保持在登录页时不做跳转；否则带着当前 tCode 回登录页（tCode 由 pageUrl 自动附加）
          if (!window.location.pathname.endsWith('index.html')) {
            window.location.href = pageUrl('index.html');
          }
          } else  { 
        userId = userInfo.userId;
        userRole = userInfo.role; 
        }
    }
 
//按照传入的条件，检索用户列表，eg：const conditionJson = { role: 'teacher' };
//TBD条件：公司、分部、管理员
async function fetchUserList(conditionJson) {
  const URL = `${API_BASE_URL}/user/${conditionJson.role}/list`; 
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
      // 假设后端返回数据结构 { code: 200, data: [...] }
      return res  || [];
    } catch (e) {
      alert(e.message + "网络错误，无法获取数据");
      return [];
    }
  }

  async function  getUserNameById(teacherId) {
    // 入参保护：空值/undefined/非字符串直接返回 n/a，避免拼出 /user/name/ 或 /user/name/undefined
    // 触发后端 NoResourceFoundException: No static resource user/name.
    if (!teacherId || typeof teacherId !== 'string' || !teacherId.trim()) {
      return "n/a";
    }
    // 去除可能的尾随空白/点号，防止 /user/name/abc. 被当作静态资源
    const safeId = teacherId.trim().replace(/[.\s]+$/, '');
    if (!safeId) return "n/a";

    try {
      // 用request改写（相对路径，由 baseURL 自动拼接前缀）
      const res = await request({
        url: `/user/name/${encodeURIComponent(safeId)}`,
        method: "get"
      });
      // request 拦截器在 code===200 时已剥皮，返回 res.data（即 String 名称）
      return res || "n/a";
    } catch (e) {
      console.error("getUserNameById:", e);
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
      // 修正：旧版跳 '/login'（该页面并不存在）且丢失 tCode；统一走登录页并带上租户编码
      window.location.href = pageUrl('index.html');
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
 // 关键修复：登录成功后，优先读取 auth_redirect_info（来自 401 或 logout）跳转回原页面；
 //         没有 redirect 时，才按角色跳默认页（admin/teacher/student）。
 function redirectToUserPage(user) {
   console.groupCollapsed(
     '%c[AuthRedirect] redirectToUserPage 触发（登录成功后的跳转决策）',
     'color:#fff;background:#7c3aed;padding:2px 6px;border-radius:3px;'
   );
/*
   // 1. 优先消费登录 redirect（一次性读取，读完即删）
   let redirectUrl = null;
   if (typeof window.consumeLoginRedirect === 'function') {
     redirectUrl = window.consumeLoginRedirect();
   } else {
     console.warn('[AuthRedirect] 1. window.consumeLoginRedirect 不存在（utility_request.js 未加载？）');
   }

   if (redirectUrl) {
     undefined;
     console.groupEnd();
     // 不 window.location.href：用 assign 更可读
     setTimeout(() => {
       window.location.assign(redirectUrl);
     }, 100);
     return;
   }

   console.groupEnd();
*/
  if(user && user.role){
  // 根据角色跳转对应页面
  // 统一用 pageUrl 拼接：自动携带 tCode，避免 ?tCode=undefined / 写死 default 两类丢失
  switch(user.role) {
     case 'platform_admin': // 平台管理员
      window.location.href = pageUrl('platform_admin.html', null, true, user); // resolveTenantCode 对平台账号恒返回 platform
      break;
    case 'admin':
      window.location.href = pageUrl('admin.html', null, true, user);
      break;
    case 'teacher':
      window.location.href = pageUrl('teacher.html', null, false, user);
      break;
    case 'student':
      window.location.href = pageUrl('student.html', null, false, user);
      break;
    default:
      alert('未知用户身份，请联系管理员1');
      resetLoginForm();
      window.location.href = pageUrl('index.html', null, false, user);
  } 
} else {
    alert('未知用户身份，请联系管理员2');
      // 判断当前页面是否为index.html
      const isIndexPage = window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || window.location.pathname === '';
     if(isIndexPage ) resetLoginForm(); 
      else 
      window.location.href = pageUrl('index.html', null, false, user);
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
    window.location.href = pageUrl('index.html'); // tCode 由 pageUrl 自动附加
    return;
  }
  //let userInfo;
    try {
      userInfo = JSON.parse(userStr);
    } catch (e) {
      localStorage.removeItem('currentUser');
      window.location.href = pageUrl('index.html'); // tCode 由 pageUrl 自动附加
      return; 
    if (!userInfo || !userInfo.token) {
      // 信息不全，清理，停留
      localStorage.removeItem('currentUser');
      window.location.href = pageUrl('index.html'); // tCode 由 pageUrl 自动附加
      return;
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
        return false; // 没有exp就当未过期
  }
  

  // 检查token是否过期
  if (isJwtExpired(userInfo.token)) {
    localStorage.removeItem('currentUser');
    // 清除Cookie
    document.cookie = 'currentUser=;expires=Thu, 01 Jan 1970 00:00:01 GMT;path=/';
    alert('登录状态已过期，请重新登录');
    window.location.href = pageUrl('index.html');
    return;
  } 
  const loginInfo = {
         account:userInfo.account,
         password: userInfo.password,
         tenantCode: userInfo.tenantCode,
         role: userInfo.role,
         token: userInfo.token
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
       if (role === 'platform_admin') {
        window.location.href = pageUrl('platform_admin.html', null, true, { role: role });
      } else
      if (role === 'admin') {
        window.location.href = pageUrl('admin.html', null, true, { role: role });
      } else if (role === 'teacher') {
        window.location.href = pageUrl('teacher.html', null, false, { role: role });
      } else if (role === 'student') {
        window.location.href = pageUrl('student.html', null, false, { role: role });
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
      window.location.href = pageUrl('index.html');
      throw new Error('未登录或登录已失效');
    }*/
  })
  .catch(err => {
    // 自动登录错误（如网络），这里一般保守处理不跳转
    console.error('自动登录校验异常:', err);
  });
} };

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
      try {
        // 'weekday' 选项设置为 'long' 表示全名
        // 修正：将日期对象加1天，防止获取的星期提前一天
        const correctedDate = new Date(dateObj.getTime() + 0 * 60 * 60 * 1000);
        const wkd = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(correctedDate);

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

// INSERT_YOUR_CODE

  /**
   * 更换密码接口，调用后端API完成用户密码修改
   * @param {string} userId  当前用户Id
   * @param {string} newPwd 新密码
   * @returns {Promise<object>} API返回数据
   */
  async function changePasswordAPI(userId, newPwd) {
   // if (!getToken()) throw new Error('用户未登录');
    try {
     
       const res = await request({
        url: '/user/account/changePassword',
        method: "post",
        params: {
          userId: userId,
          password: newPwd
        }, 
      });
      return res;
    } catch (e) {
      console.error("changePasswordAPI:",e);
      throw e;
    }
  }

  /**
   * 绑定到界面：弹出修改密码窗口，用户输入旧密码和新密码并提交
   */
  function showChangePasswordDialog() {
    // 简单的prompt实现；可替换为更友好的UI弹窗
   // const currentPwd = window.prompt('请输入当前密码:');
   // if (!currentPwd) return;
    const newPwd = window.prompt('请输入新密码:');
    if (!newPwd) return;

    changePasswordAPI(userId, newPwd)
      .then((data) => {
        alert(data.message || '密码修改成功');
        // 可选：修改密码成功后自动登出
        // handleLogout();
      })
      .catch((err) => {
        alert(typeof err === 'string' ? err : (err.message || '密码修改失败'));
      });
  }


  function addChangePasswordButton(){
    // 找到一个合适的容器插入按钮（例如头部或用户菜单），此处假设有id="user-menu"
  let menu = document.getElementById('user-name');
  // 创建二级菜单，绑定到"user-name"元素旁作为触发点，点击出现下拉菜单
  // 确保菜单只创建一次
  if (!document.getElementById('custom-user-dropdown')) {
    // 创建下拉菜单容器
    const dropdown = document.createElement('div');
    dropdown.id = 'custom-user-dropdown';
    dropdown.style.position = 'absolute';
    dropdown.style.minWidth = '120px';
    dropdown.style.background = '#fff';
    dropdown.style.border = '1px solid #eee';
    dropdown.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
    dropdown.style.display = 'none';
    dropdown.style.zIndex = 1000;
    dropdown.style.fontSize = '14px';

    // 菜单项 - 修改密码
    const changePwdItem = document.createElement('div');
    changePwdItem.textContent = '修改密码';
    changePwdItem.style.padding = '10px 16px';
    changePwdItem.style.cursor = 'pointer';
    changePwdItem.onmouseover = function() { changePwdItem.style.background = "#f5f5f5"; };
    changePwdItem.onmouseout = function() { changePwdItem.style.background = "#fff"; };
    changePwdItem.onclick = function(e) {
      e.stopPropagation();
      dropdown.style.display = 'none';
      showChangePasswordDialog();
    };
    dropdown.appendChild(changePwdItem);

    // 菜单项 - 退出登录
    const logoutItem = document.createElement('div');
    logoutItem.textContent = '退出登录';
    logoutItem.style.padding = '10px 16px';
    logoutItem.style.cursor = 'pointer';
    logoutItem.onmouseover = function() { logoutItem.style.background = "#f5f5f5"; };
    logoutItem.onmouseout = function() { logoutItem.style.background = "#fff"; };
    logoutItem.onclick = function(e) {
      e.stopPropagation();
      dropdown.style.display = 'none';
      if (typeof window.handleLogout === 'function') {
        window.handleLogout();
      } else if (window.parent && window.parent.logout) {
        window.parent.logout();
      }
    };
    dropdown.appendChild(logoutItem);

    document.body.appendChild(dropdown);

    // 触发器: user-name 元素
    if (menu) {
      menu.style.cursor = 'pointer'; 
        menu.style.textDecoration = 'underline';  
 
      menu.onclick = function(event) {
        event.stopPropagation();
        // 计算位置
        const rect = menu.getBoundingClientRect();
        dropdown.style.left = (rect.left + window.scrollX) + "px";
        dropdown.style.top = (rect.bottom + window.scrollY + 3) + "px";
        dropdown.style.display = (dropdown.style.display === "none" ? "block" : "none");
      };
      // menu鼠标悬浮时变色可选增加 underline
      menu.onmouseover = function() { menu.style.fontWeight = 'bold'; }
      menu.onmouseout = function() { menu.style.fontWeight = 'normal'; }
 
    }

    // 点击页面其他地方自动收起菜单
    document.addEventListener('click', function() {
      dropdown.style.display = 'none';
    });
    dropdown.addEventListener('click', function(e){
      e.stopPropagation(); // 防止点击菜单本身也触发隐藏
    });
  }
  /*if (menu) {
      const btn = document.createElement('button');
      btn.textContent = '修改密码';
      btn.style.marginLeft = '16px';
      btn.onclick = showChangePasswordDialog;
      menu.appendChild(btn);
      } 
*/
      
  }


  
/** HTML 转义，防止数据中的尖括号破坏页面结构 */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 属性值转义（用于 input value="..." / href="..." 等） */
function escapeAttr(str) {
  return escapeHtml(str);
}

/** 数据脱敏：手机号 —— 11 位保留前3后4；其余保留首尾、中间用 * 代替（≤4 位全盘星） */
function maskPhone(phone) {
  if (phone == null) return "";
  const s = String(phone).trim();
  const L = s.length;
  if (L === 0) return "";
  if (L === 11) return s.substring(0, 3) + "****" + s.substring(7);
  if (L <= 4) return "*".repeat(L);
  return s.substring(0, 1) + "*".repeat(L - 2) + s.substring(L - 1);
}

/** 数据脱敏：电子邮箱 —— 地址中间 4 个字符用 * 代替（居中）；
 *  长度 ≤ 6 时仅替换中间最多 4 个，前后各保留 1 个字符；≤ 2 位太短则全盘星。 */
function maskEmail(email) {
  if (email == null) return "";
  const s = String(email).trim();
  const L = s.length;
  if (L === 0) return "";
  if (L <= 2) return "*".repeat(L);                 // 太短无法保留前后，全盘星
  if (L <= 6) {                                     // 短地址：保留首尾各 1 个，中间用 * 代替（最多 4 个）
    return s.charAt(0) + "*".repeat(L - 2) + s.charAt(L - 1);
  }
  const front = Math.floor((L - 4) / 2);            // 正常地址：居中替换中间 4 个字符
  return s.substring(0, front) + "****" + s.substring(front + 4);
}


    function goBack() {
      // 优先返回来源页，没有则回到管理首页
      const from = new URLSearchParams(window.location.search).get('from');
    if (from) {
      // 来源地址已经带齐参数时直接回跳
      window.location.href = from;
    } else if (document.referrer) {
      window.history.back();
    } else {
      window.location.href = pageUrl('admin.html', null, true);
    }
    }

  // ============================================================
  // 入口登录态守卫（tenantCode / 角色一致性校验）
  // 适用：受保护页面（admin/teacher/student/platform_admin/booking）onload 最前面调用
  // 触发强制登录的三种不匹配：
  //   1) URL 携带的 tCode 与本地保存的上次登录 tenantCode 不一致
  //   2) 登录角色与 tenantCode 不匹配
  //        - platform_admin 必须对应 'platform'
  //        - 租户角色(admin/teacher/student) 的 tenantCode 必须非空且不等于 'platform'
  //   3) 当前页面要求的角色与上次登录角色不一致
  // 注意：index.html 内联脚本已声明 const PLATFORM_TENANT_CODE，classic 脚本共享同一全局词法环境，
  //       此处禁止再用同名 const，故直接以字面量 'platform' 表示平台租户编码。
  // ============================================================

  /** 读取 URL 查询参数（去空格，异常兜底返回空串） */
  function getUrlParam(name) {
    try {
      const params = new URLSearchParams(window.location.search);
      const v = params.get(name);
      return v && v.trim() ? v.trim() : '';
    } catch (e) {
      return '';
    }
  }

  // ============================================================
  // 租户编码（tCode）保持 —— 所有页面跳转必须走下面的 helper，禁止手写 '?tCode=' + x
  //
  // 背景：URL 携带 ?tCode=xxx 表示「租户专属链接」。一旦某次跳转忘了带它，目标页
  //       的 guardEntryPage 会发现「URL 无 tCode / 与本地 tenantCode 不一致」而踢回登录页，
  //       表现为「登录后闪一下又回到登录页」的跳转死循环。
  //
  // 优先级：平台账号恒 platform > 当前 URL 的 tCode > 传入用户的 tenantCode
  //         > 本地登录态的 tenantCode > ''（拿不到线索时不附加 tCode 参数）
  //
  // 为什么兜底不回填 'default'：登录页 index.html 一见 tCode 就会隐藏/锁定租户输入框
  // （applyTenantCodeRule），把「让用户自己填租户编码」的普通入口变成写死的 default 入口。
  // ============================================================

  /** 求「本次跳转应当携带的租户编码」 */
  function resolveTenantCode(user) {
    // 平台管理员跨租户，不属于任何租户，恒为 platform（与守卫 isRoleTenantCodeMatch 一致）
    const role = (user && user.role) || ((getCurrentUserInfo() || {}).role);
    if (role === 'platform_admin') return 'platform';

    const urlCode = getUrlParam('tCode');
    if (urlCode) return urlCode;

    if (user && user.tenantCode) return user.tenantCode;

    const local = getCurrentUserInfo();
    if (local && local.tenantCode) return local.tenantCode;

    return '';
  }

  /**
   * 拼带 tCode 的页面地址
   * @param {string} file        目标页文件名，如 'admin.html'
   * @param {object|string} [extra] 额外参数（对象或 query 串），如 { scdid: 'S1' } / 'sid=u1'
   * @param {boolean} [absolute]  true = 拼 FRONTEND_ORIGIN 绝对地址（跨子域部署管理端时使用）
   * @param {object} [user]     当前用户对象，用于推断租户编码（可选，缺省时按 URL/本地登录态推断）
   * @returns {string} 形如 './admin.html?tCode=xxx' 的地址
   */
  function pageUrl(file, extra, absolute, user) {
    const params = new URLSearchParams();
    if (typeof extra === 'string') {
      try {
        new URLSearchParams(extra.replace(/^\?/, '')).forEach((v, k) => params.set(k, v));
      } catch (e) { /* 非法 query 忽略 */ }
    } else if (extra && typeof extra === 'object') {
      Object.keys(extra).forEach((k) => {
        const v = extra[k];
        if (v !== undefined && v !== null && String(v) !== '') params.set(k, String(v));
      });
    }
    // tCode 放在最后：保证存在且不会被 extra 里的同名参数冲掉；
    // 解析不出租户时（''）不附加该参数，保持原有「无租户链接」的行为
    const tCode = resolveTenantCode(user);
    if (tCode) params.set('tCode', tCode);
    const base = absolute ? (window.FRONTEND_ORIGIN + '/' + file) : ('./' + file);
    return params.toString() ? base + '?' + params.toString() : base;
  }

  window.resolveTenantCode = resolveTenantCode;
  window.pageUrl = pageUrl;

  /** 校验「角色 ↔ 租户编码」是否匹配 */
  function isRoleTenantCodeMatch(role, tenantCode) {
    if (role === 'platform_admin') {
      return tenantCode === 'platform';
    }
    // 租户端角色：tenantCode 必须非空且不能是 platform
    return !!tenantCode && tenantCode !== 'platform';
  }

  /** 强制跳登录页：清理本地登录态，并按需携带 ?tCode= 参数（作为登录页预填/锁定的租户编码） */
  function forceEntryLogin(urlTCode) {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('currentUser');
    document.cookie = 'currentUser=;expires=Thu, 01 Jan 1970 00:00:01 GMT;path=/';
    // tCode 优先取 URL 上的租户链接参数，其次才回填 urlTCode；两处都没有时 pageUrl 会兜 default
    window.location.href = urlTCode
      ? pageUrl('index.html', { tCode: urlTCode })
      : pageUrl('index.html');
  }

  /**
   * 入口守卫
   * @param {string} [requiredRole] 当前页面要求的角色
   *        platform_admin.html -> 'platform_admin'；admin.html -> 'admin'；
   *        teacher.html -> 'teacher'；student.html -> 'student'；
   *        booking.html 为多角色路由页，可不传（仅做会话/租户一致性校验）
   * @returns {boolean} true=放行；false=已触发强制登录跳转
   */
  function guardEntryPage(requiredRole) {
    const urlTCode = getUrlParam('tCode');
    const localUser = getCurrentUserInfo(); // 可能返回 null

    // 1) 完全无登录态 → 强制登录
    if (!localUser || !localUser.token || !localUser.role) {
      forceEntryLogin(urlTCode);
      return false;
    }

    // 2) 角色与 tenantCode 必须匹配
    if (!isRoleTenantCodeMatch(localUser.role, localUser.tenantCode)) {
      forceEntryLogin(urlTCode);
      return false;
    }

    // 3) URL 携带 tCode 时，必须与本地保存的上次登录 tenantCode 一致（换了租户需重新登录）
    if (urlTCode && urlTCode !== localUser.tenantCode) {
      forceEntryLogin(urlTCode);
      return false;
    }

    // 4) 当前页面要求的角色必须与上一次登录角色一致
    if (requiredRole && requiredRole !== localUser.role) {
      forceEntryLogin(urlTCode);
      return false;
    }

    return true;
  }

  // 在页面全局导出
  window.guardEntryPage = guardEntryPage;
  window.getUrlParam = getUrlParam;
  window.changePasswordAPI = changePasswordAPI;
  window.showChangePasswordDialog = showChangePasswordDialog;
  window.addChangePasswordButton = addChangePasswordButton;
  window.redirectToUserPage = redirectToUserPage;