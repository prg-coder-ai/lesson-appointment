# Axios 全局封装增强版：新增 Token 过期自动无感刷新

## 文档完整版（含前端完整 request\.js \+ SpringBoot 刷新 Token 接口代码）

新增能力：

1. 401 时自动拦截，缓存当前排队请求队列

2. 调用刷新 Token 接口获取新令牌

3. 使用新 Token 重放所有等待中的请求

4. 刷新失败直接清登录态跳登录页

5. 防止并发请求重复刷新 Token（加锁控制）

## 一、前端完整封装 src/utils/request\.js

```javascript
import axios from 'axios'
import { ElMessage, ElLoading } from 'element-plus'

// 全局loading控制
let loadingInstance = null
let loadingCount = 0

// Token刷新锁 & 请求等待队列
let isRefreshing = false
let requestQueue = []

// 后端标准返回结构
/*
{
  code: 200,
  data: {},
  msg: '提示文本'
}
*/
const service = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json;charset=utf-8'
  }
})

// Loading工具函数
const startLoading = () => {
  loadingCount++
  if (loadingCount === 1) {
    loadingInstance = ElLoading.service({
      lock: true,
      text: '加载中...',
      background: 'rgba(0,0,0,0.1)'
    })
  }
}
const closeLoading = () => {
  loadingCount--
  if (loadingCount <= 0) {
    loadingInstance?.close()
    loadingCount = 0
  }
}

// 刷新Token专用请求实例（不走拦截器，避免死循环）
const refreshTokenAxios = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 10000
})

/**
 * 刷新token方法
 */
function getNewToken() {
  const refreshToken = localStorage.getItem('refreshToken')
  return refreshTokenAxios.post('/auth/refreshToken', {
    refreshToken
  })
}

// ===================== 请求拦截器 =====================
service.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    // 自定义关闭loading
    if (config.customLoading !== false) startLoading()
    return config
  },
  (error) => {
    closeLoading()
    ElMessage.error('请求发起失败')
    return Promise.reject(error)
  }
)

// ===================== 响应拦截器 =====================
service.interceptors.response.use(
  (response) => {
    const config = response.config
    if (config.customLoading !== false) closeLoading()
    const res = response.data

    if (res.code === 200) return res.data

    // 业务错误弹窗
    if (config.customErrorMsg !== false) ElMessage.error(res.msg || '操作失败')
    return Promise.reject(res)
  },
  async (error) => {
    closeLoading()
    const config = error.config || {}
    // 超时处理
    if (error.code === 'ECONNABORTED' && error.message.includes('timeout')) {
      const msg = '请求超时，请稍后重试'
      if (config.customErrorMsg !== false) ElMessage.error(msg)
      return Promise.reject(msg)
    }
    // 断网
    if (!error.response) {
      const msg = '网络连接失败，请检查网络'
      if (config.customErrorMsg !== false) ElMessage.error(msg)
      return Promise.reject(msg)
    }

    const status = error.response.status
    const originalRequest = config

    // ========== 核心：401 Token过期自动刷新逻辑 ==========
    if (status === 401) {
      // 1. 如果正在刷新，将当前请求存入队列等待
      if (isRefreshing) {
        return new Promise(resolve => {
          requestQueue.push((newToken) => {
            originalRequest.headers.Authorization = `Bearer ${newToken}`
            resolve(service(originalRequest))
          })
        })
      }

      // 2. 加锁，开始刷新token
      isRefreshing = true
      try {
        const refreshRes = await getNewToken()
        const result = refreshRes.data
        if (result.code === 200) {
          const { token, refreshToken } = result.data
          // 存储新令牌
          localStorage.setItem('token', token)
          localStorage.setItem('refreshToken', refreshToken)
          // 更新当前失败请求的token并重试
          originalRequest.headers.Authorization = `Bearer ${token}`
          // 放行队列中所有等待的请求
          requestQueue.forEach(cb => cb(token))
          requestQueue = []
          // 返回重发后的请求
          return service(originalRequest)
        } else {
          // 刷新Token失败，清除登录态跳转登录
          throw new Error(result.msg)
        }
      } catch (refreshErr) {
        // 刷新失败，清空所有缓存、清空队列、跳登录
        localStorage.removeItem('token')
        localStorage.removeItem('refreshToken')
        requestQueue = []
        ElMessage.error('登录已过期，请重新登录')
        location.href = '/login'
        return Promise.reject(refreshErr)
      } finally {
        isRefreshing = false
      }
    }

    // 其他状态码统一提示
    let errMsg = ''
    switch (status) {
      case 403: errMsg = '无权限访问该资源'; break
      case 404: errMsg = '接口地址不存在'; break
      case 500: errMsg = '服务器内部错误'; break
      default: errMsg = `请求错误：${status}`
    }
    if (config.customErrorMsg !== false) ElMessage.error(errMsg)
    return Promise.reject(error)
  }
)

export default service
```

## 二、配套 API 调用示例 src/api/auth\.js

```javascript
import request from '@/utils/request'

// 登录接口（同时返回token、refreshToken）
export function login(data) {
  return request({
    url: '/auth/login',
    method: 'post',
    data
  })
}
```

## 三、SpringBoot 后端刷新 Token 完整代码

### 1\. Token 返回 DTO

```java
import lombok.Data;

@Data
public class TokenDTO {
    private String token;
    private String refreshToken;
    // 过期时间戳
    private Long expireTime;
}
```

### 2\. 统一返回 Result

```java
import lombok.Data;

@Data
public class Result<T> {
    private Integer code;
    private String msg;
    private T data;

    public static <T> Result<T> success(T data) {
        Result<T> r = new Result<>();
        r.setCode(200);
        r.setMsg("操作成功");
        r.setData(data);
        return r;
    }

    public static <T> Result<T> fail(String msg) {
        Result<T> r = new Result<>();
        r.setCode(500);
        r.setMsg(msg);
        return r;
    }

    public static <T> Result<T> unauthorized(String msg) {
        Result<T> r = new Result<>();
        r.setCode(401);
        r.setMsg(msg);
        return r;
    }
}
```

### 3\. 登录 / 刷新 Token Controller

```java
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/auth")
public class AuthController {

    // 模拟JWT工具类，自行替换项目JWT工具
    private final JwtUtil jwtUtil;

    public AuthController(JwtUtil jwtUtil) {
        this.jwtUtil = jwtUtil;
    }

    /**
     * 登录，返回双token
     */
    @PostMapping("/login")
    public Result<TokenDTO> login(@RequestBody LoginDTO loginDTO) {
        // 校验账号密码逻辑省略
        Long userId = 10001L;
        // 生成短期业务token（5分钟）
        String accessToken = jwtUtil.generateAccessToken(userId);
        // 生成长期刷新token（7天）
        String refreshToken = jwtUtil.generateRefreshToken(userId);

        TokenDTO tokenDTO = new TokenDTO();
        tokenDTO.setToken(accessToken);
        tokenDTO.setRefreshToken(refreshToken);
        return Result.success(tokenDTO);
    }

    /**
     * 刷新Token接口
     */
    @PostMapping("/refreshToken")
    public Result<TokenDTO> refreshToken(@RequestBody RefreshDTO refreshDTO) {
        String refreshToken = refreshDTO.getRefreshToken();
        // 校验刷新token是否有效、未过期
        boolean valid = jwtUtil.validateRefreshToken(refreshToken);
        if (!valid) {
            return Result.unauthorized("刷新凭证失效，请重新登录");
        }
        // 获取用户ID
        Long userId = jwtUtil.getUserIdByRefreshToken(refreshToken);
        // 生成新的双Token
        String newAccessToken = jwtUtil.generateAccessToken(userId);
        String newRefreshToken = jwtUtil.generateRefreshToken(userId);

        TokenDTO tokenDTO = new TokenDTO();
        tokenDTO.setToken(newAccessToken);
        tokenDTO.setRefreshToken(newRefreshToken);
        return Result.success(tokenDTO);
    }
}
```

### 4\. 请求 DTO

```java
// 登录DTO
@Data
public class LoginDTO {
    private String username;
    private String password;
}

// 刷新Token DTO
@Data
public class RefreshDTO {
    private String refreshToken;
}
```

### 5\. JWT 工具类关键逻辑（示意）

```java
import io.jsonwebtoken.*;
import java.util.Date;

public class JwtUtil {
    // AccessToken 5分钟过期
    private static final long ACCESS_EXPIRE = 5 * 60 * 1000;
    // RefreshToken 7天过期
    private static final long REFRESH_EXPIRE = 7 * 24 * 60 * 60 * 1000;
    private static final String SECRET_KEY = "自定义加密密钥";

    // 生成业务token
    public String generateAccessToken(Long userId) {
        return Jwts.builder()
                .setSubject(userId.toString())
                .setExpiration(new Date(System.currentTimeMillis() + ACCESS_EXPIRE))
                .signWith(SignatureAlgorithm.HS256, SECRET_KEY)
                .compact();
    }

    // 生成刷新token
    public String generateRefreshToken(Long userId) {
        return Jwts.builder()
                .setSubject(userId.toString())
                .setExpiration(new Date(System.currentTimeMillis() + REFRESH_EXPIRE))
                .signWith(SignatureAlgorithm.HS256, SECRET_KEY)
                .compact();
    }

    // 校验刷新token有效性
    public boolean validateRefreshToken(String token) {
        try {
            Jws<Claims> claimsJws = Jwts.parser().setSigningKey(SECRET_KEY).parseClaimsJws(token);
            Claims claims = claimsJws.getBody();
            return claims.getExpiration().after(new Date());
        } catch (Exception e) {
            return false;
        }
    }

    // 从刷新token获取用户ID
    public Long getUserIdByRefreshToken(String token) {
        Jws<Claims> claimsJws = Jwts.parser().setSigningKey(SECRET_KEY).parseClaimsJws(token);
        String userId = claimsJws.getBody().getSubject();
        return Long.valueOf(userId);
    }
}
```

## 四、核心刷新机制说明

1. **双 Token 设计**

    - AccessToken：短期（5min），接口鉴权用，过期返回 401

    - RefreshToken：长期（7 天），仅用于刷新令牌，失效则强制登出

2. **并发防重复刷新锁 isRefreshing**
多个接口同时 401 时，仅执行一次刷新，其余请求存入队列等待新 Token

3. **独立刷新请求实例 refreshTokenAxios**
不挂载全局拦截器，防止刷新接口 401 造成死循环

4. **队列重放**
获取新 Token 后，遍历队列中所有等待请求，替换 Header 并重发

5. **降级处理**
刷新 Token 校验失败（过期 / 篡改），清空本地令牌、清空队列、跳转登录

## 五、登录页面存储令牌示例

```javascript
import { login } from '@/api/auth'

async function handleLogin() {
  const loginForm = { username: 'admin', password: '123456' }
  const res = await login(loginForm)
  // 存储双token到本地存储
  localStorage.setItem('token', res.token)
  localStorage.setItem('refreshToken', res.refreshToken)
  // 跳转首页
  location.href = '/home'
}
```

## 六、可自定义修改点

1. 存储方式：localStorage → Pinia/Vuex

2. Token 前缀：Bearer 替换为后端约定格式

3. 过期时长：调整 JwtUtil 内过期毫秒值

4. 弹窗组件：ElementPlus 替换为项目 UI 库

5. 跳转登录逻辑：SPA 路由使用 `router.push('/login')` 替代 location\.href

6. 刷新策略：可改为刷新后使旧 RefreshToken 失效（Redis 黑名单）提升安全性

> （注：文档部分内容可能由 AI 生成）
