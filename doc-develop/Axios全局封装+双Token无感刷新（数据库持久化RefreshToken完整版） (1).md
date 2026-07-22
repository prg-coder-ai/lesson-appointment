# Axios全局封装\+双Token无感刷新（数据库持久化RefreshToken完整版）

# Axios全局封装\+双Token无感刷新（数据库持久化RefreshToken完整版）

## 文档目录

1. 整体架构说明

2. 前端Axios完整封装（无感刷新Token不变）

3. 后端完整持久化模块（数据库实体、Mapper、Service、Controller）

4. 踢出指定用户/单点登录实现方案

5. 登录、刷新、登出完整流程

6. 配套DTO、统一返回、JWT工具类

## 一、整体架构说明

### 设计要点

1. **双Token分离**

    - AccessToken：短期5分钟，请求头鉴权，过期返回401触发刷新

    - RefreshToken：7天有效期，持久存入MySQL，一条登录记录对应一条RefreshToken

2. **数据库持久化**
用户每次登录生成一条`user_refresh_token`记录；刷新Token时旧记录作废，新增新记录；登出/踢人直接删除数据库记录

3. **并发防重复刷新**
前端加锁\+请求队列，避免多接口同时401重复调用刷新接口

4. **单点登录/强制踢下线**
根据userId删除数据库所有该用户RefreshToken，该用户所有页面刷新直接跳转登录

5. **安全机制**

    - 刷新Token必须校验数据库是否存在、未过期、未被删除

    - 旧RefreshToken刷新成功后立即失效（删除旧记录）

    - 支持后台手动踢出指定用户

### 数据库表 `user_refresh_token`

```SQL
CREATE TABLE `user_refresh_token` (
  id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
  user_id  varchar(36) NOT NULL COMMENT '登录用户ID',
  refresh_token VARCHAR(512) NOT NULL COMMENT '刷新凭证',
  expire_time DATETIME NOT NULL COMMENT '过期时间',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id),
  INDEX idx_refresh_token (refresh_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT '用户刷新Token持久化表';
```

---

# 二、前端代码（无改动，复用之前无感刷新request\.js）

## src/utils/request\.js

```JavaScript
import axios from 'axios'
import { ElMessage, ElLoading } from 'element-plus'

let loadingInstance = null
let loadingCount = 0
let isRefreshing = false
let requestQueue = []

const service = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json;charset=utf-8'
  }
})

const startLoading = () => {
  loadingCount++
  if (loadingCount === 1) {
    loadingInstance = ElLoading.service({
      lock: true,
      text: '加载中...',
      background: 'rgba(0,0,0.1)'
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

// 独立刷新token实例，不走拦截器
const refreshTokenAxios = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 10000
})
function getNewToken() {
  const refreshToken = localStorage.getItem('refreshToken')
  return refreshTokenAxios.post('/auth/refreshToken', { refreshToken })
}

// 请求拦截
service.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) config.headers.Authorization = `Bearer ${token}`
    if (config.customLoading !== false) startLoading()
    return config
  },
  error => {
    closeLoading()
    ElMessage.error('请求发起失败')
    return Promise.reject(error)
  }
)

// 响应拦截
service.interceptors.response.use(
  response => {
    const config = response.config
    if (config.customLoading !== false) closeLoading()
    const res = response.data
    if (res.code === 200) return res.data
    if (config.customErrorMsg !== false) ElMessage.error(res.msg || '操作失败')
    return Promise.reject(res)
  },
  async error => {
    closeLoading()
    const config = error.config || {}
    // 超时
    if (error.code === 'ECONNABORTED' && error.message.includes('timeout')) {
      const msg = '请求超时，请稍后重试'
      if (config.customErrorMsg !== false) ElMessage.error(msg)
      return Promise.reject(msg)
    }
    // 无网络
    if (!error.response) {
      const msg = '网络连接失败，请检查网络'
      if (config.customErrorMsg !== false) ElMessage.error(msg)
      return Promise.reject(msg)
    }

    const status = error.response.status
    const originalRequest = config
    // 401 Token过期 自动刷新逻辑
    if (status === 401) {
      if (isRefreshing) {
        return new Promise(resolve => {
          requestQueue.push((newToken) => {
            originalRequest.headers.Authorization = `Bearer ${newToken}`
            resolve(service(originalRequest))
          })
        })
      }
      isRefreshing = true
      try {
        const refreshRes = await getNewToken()
        const result = refreshRes.data
        if (result.code === 200) {
          const { token, refreshToken } = result.data
          localStorage.setItem('token', token)
          localStorage.setItem('refreshToken', refreshToken)
          originalRequest.headers.Authorization = `Bearer ${token}`
          requestQueue.forEach(cb => cb(token))
          requestQueue = []
          return service(originalRequest)
        } else {
          throw new Error(result.msg)
        }
      } catch (refreshErr) {
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

    // 其他HTTP错误码
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

## 登录调用示例 api/auth\.js

```JavaScript
import request from '@/utils/request'
export function login(data) {
  return request({ url: '/auth/login', method: 'post', data })
}
// 主动登出
export function logout() {
  return request({ url: '/auth/logout', method: 'post' })
}
// 后台管理：踢出指定用户
export function kickUser(userId) {
  return request({ url: '/auth/kick/' + userId, method: 'delete' })
}
```

## 登录页面存储Token

```JavaScript
async function handleLogin() {
  const form = { username: "admin", password: "123456" }
  const res = await login(form)
  localStorage.setItem('token', res.token)
  localStorage.setItem('refreshToken', res.refreshToken)
  location.href = "/home"
}
// 主动登出
async function handleLogout() {
  await logout()
  localStorage.clear()
  location.href = "/login"
}
```

---

# 三、SpringBoot 后端完整持久化模块

## 3\.1 统一返回 Result\.java

```Java
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

## 3\.2 持久化实体 RefreshTokenPO\.java

```Java
import lombok.Data;
import java.time.LocalDateTime;

@Data
public class RefreshTokenPO {
    private Long id;
    private String userId;
    private String refreshToken;
    private LocalDateTime expireTime;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
```

## 3\.3 Mapper 持久层 RefreshTokenMapper\.java

```Java
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import java.time.LocalDateTime;

public interface RefreshTokenMapper {

    // 根据refreshToken查询记录
    @Select("SELECT * FROM user_refresh_token WHERE refresh_token = #{refreshToken}")
    RefreshTokenPO selectByToken(@Param("refreshToken") String refreshToken);

    // 根据用户ID删除所有记录（踢下线）
    @Delete("DELETE FROM user_refresh_token WHERE user_id = #{userId}")
    int deleteByUserId(@Param("userId") Long userId);

    // 删除单条旧刷新token（刷新后失效旧凭证）
    @Delete("DELETE FROM user_refresh_token WHERE refresh_token = #{refreshToken}")
    int deleteSingleToken(@Param("refreshToken") String refreshToken);

    // 插入新刷新Token
    @Insert("INSERT INTO user_refresh_token(user_id, refresh_token, expire_time) VALUES(#{userId}, #{refreshToken}, #{expireTime})")
    int insert(RefreshTokenPO po);

    // 清理过期Token（定时任务调用）
    @Delete("DELETE FROM user_refresh_token WHERE expire_time < #{now}")
    int clearExpired(@Param("now") LocalDateTime now);
}
```

## 3\.4 业务层 RefreshTokenService\.java

```Java
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class RefreshTokenService {

    private final RefreshTokenMapper refreshTokenMapper;

    /**
     * 保存新刷新Token，删除该用户旧凭证（单设备登录）
     */
    @Transactional(rollbackFor = Exception.class)
    public void saveNewToken(Long userId, String refreshToken, LocalDateTime expireTime) {
        // 可选：实现单设备登录，登录时删除该用户全部旧刷新Token
        refreshTokenMapper.deleteByUserId(userId);

        RefreshTokenPO po = new RefreshTokenPO();
        po.setUserId(userId);
        po.setRefreshToken(refreshToken);
        po.setExpireTime(expireTime);
        refreshTokenMapper.insert(po);
    }

    /**
     * 校验刷新Token是否有效（存在+未过期）
     */
    public RefreshTokenPO checkValidToken(String refreshToken) {
        RefreshTokenPO po = refreshTokenMapper.selectByToken(refreshToken);
        if (po == null) return null;
        // 判断是否过期
        if (po.getExpireTime().isBefore(LocalDateTime.now())) {
            // 过期直接删除脏数据
            refreshTokenMapper.deleteSingleToken(refreshToken);
            return null;
        }
        return po;
    }

    /**
     * 刷新成功后删除旧token
     */
    public void removeOldToken(String oldRefreshToken) {
        refreshTokenMapper.deleteSingleToken(oldRefreshToken);
    }

    /**
     * 踢出指定用户：删除该用户所有刷新凭证
     */
    @Transactional(rollbackFor = Exception.class)
    public int kickUser(Long userId) {
        return refreshTokenMapper.deleteByUserId(userId);
    }

    /**
     * 用户主动登出，删除当前刷新凭证
     */
    public void logout(String refreshToken) {
        refreshTokenMapper.deleteSingleToken(refreshToken);
    }

    /**
     * 定时清理过期Token
     */
    @Transactional
    public void clearExpiredToken() {
        refreshTokenMapper.clearExpired(LocalDateTime.now());
    }
}
```

## 3\.5 JWT工具类 JwtUtil\.java

```Java
import io.jsonwebtoken.*;
import org.springframework.stereotype.Component;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Date;

@Component
public class JwtUtil {
    // AccessToken 5分钟
    private static final long ACCESS_EXPIRE = 5 * 60 * 1000;
    // RefreshToken 7天
    private static final long REFRESH_EXPIRE = 7 * 24 * 60 * 60 * 1000;
    private static final String SECRET_KEY = "jwt-secret-key-2026-custom";

    // 生成短期访问token
    public String generateAccessToken(Long userId) {
        Date expire = new Date(System.currentTimeMillis() + ACCESS_EXPIRE);
        return Jwts.builder()
                .setSubject(userId.toString())
                .setExpiration(expire)
                .signWith(SignatureAlgorithm.HS256, SECRET_KEY)
                .compact();
    }

    // 生成长期刷新token
    public String generateRefreshToken(Long userId) {
        Date expire = new Date(System.currentTimeMillis() + REFRESH_EXPIRE);
        return Jwts.builder()
                .setSubject(userId.toString())
                .setExpiration(expire)
                .signWith(SignatureAlgorithm.HS256, SECRET_KEY)
                .compact();
    }

    // 获取刷新Token过期时间（存入数据库）
    public LocalDateTime getRefreshExpireTime() {
        return new Date(System.currentTimeMillis() + REFRESH_EXPIRE)
                .toInstant()
                .atZone(ZoneId.systemDefault())
                .toLocalDateTime();
    }

    // 从刷新Token解析用户ID
    public Long getUserIdByRefreshToken(String token) {
        Jws<Claims> claimsJws = Jwts.parser().setSigningKey(SECRET_KEY).parseClaimsJws(token);
        String uid = claimsJws.getBody().getSubject();
        return Long.valueOf(uid);
    }

    // 校验AccessToken（拦截器鉴权使用）
    public boolean verifyAccessToken(String token) {
        try {
            Jwts.parser().setSigningKey(SECRET_KEY).parseClaimsJws(token);
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
```

## 3\.6 相关DTO

### TokenDTO\.java

```Java
import lombok.Data;
@Data
public class TokenDTO {
    private String token;
    private String refreshToken;
}
```

### LoginDTO\.java

```Java
import lombok.Data;
@Data
public class LoginDTO {
    private String username;
    private String password;
}
```

### RefreshDTO\.java

```Java
import lombok.Data;
@Data
public class RefreshDTO {
    private String refreshToken;
}
```

## 3\.7 认证控制器 AuthController\.java（登录/刷新/登出/踢人）

```Java
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class AuthController {

    private final JwtUtil jwtUtil;
    private final RefreshTokenService refreshTokenService;

    /**
     * 登录接口，生成双Token并持久化RefreshToken
     */
    @PostMapping("/login")
    public Result<TokenDTO> login(@RequestBody LoginDTO loginDTO) {
        // 1. 校验账号密码（自行实现用户逻辑）
        Long userId = 10001L;

        // 2. 生成双Token
        String accessToken = jwtUtil.generateAccessToken(userId);
        String refreshToken = jwtUtil.generateRefreshToken(userId);

        // 3. 持久化刷新Token到数据库
        refreshTokenService.saveNewToken(userId, refreshToken, jwtUtil.getRefreshExpireTime());

        TokenDTO dto = new TokenDTO();
        dto.setToken(accessToken);
        dto.setRefreshToken(refreshToken);
        return Result.success(dto);
    }

    /**
     * 无感刷新AccessToken核心接口
     */
    @PostMapping("/refreshToken")
    public Result<TokenDTO> refreshToken(@RequestBody RefreshDTO refreshDTO) {
        String oldRefreshToken = refreshDTO.getRefreshToken();
        // 1. 校验数据库中凭证是否存在、未过期
        RefreshTokenPO tokenPo = refreshTokenService.checkValidToken(oldRefreshToken);
        if (tokenPo == null) {
            return Result.unauthorized("刷新凭证已失效，请重新登录");
        }
        Long userId = tokenPo.getUserId();

        // 2. 生成新双Token
        String newAccess = jwtUtil.generateAccessToken(userId);
        String newRefresh = jwtUtil.generateRefreshToken(userId);

        // 3. 删除旧刷新Token，存入新凭证（旧凭证立即失效）
        refreshTokenService.removeOldToken(oldRefreshToken);
        refreshTokenService.saveNewToken(userId, newRefresh, jwtUtil.getRefreshExpireTime());

        TokenDTO dto = new TokenDTO();
        dto.setToken(newAccess);
        dto.setRefreshToken(newRefresh);
        return Result.success(dto);
    }

    /**
     * 用户主动登出，销毁当前刷新凭证
     */
    @PostMapping("/logout")
    public Result<Void> logout(@RequestBody RefreshDTO refreshDTO) {
        refreshTokenService.logout(refreshDTO.getRefreshToken());
        return Result.success(null);
    }

    /**
     * 后台管理：强制踢出指定用户（删除该用户全部刷新凭证）
     * 调用后该用户所有页面401自动跳转登录
     */
    @DeleteMapping("/kick/{userId}")
    public Result<Integer> kickUser(@PathVariable Long userId) {
        int count = refreshTokenService.kickUser(userId);
        return Result.success(count);
    }
}
```

---

# 四、踢出用户功能完整实现说明

## 4\.1 实现原理

1. 用户登录时，所有刷新凭证存入 `user_refresh_token` 表；

2. 调用 `/auth/kick/{userId}` 接口，Service执行`deleteByUserId`删除该用户全部记录；

3. 用户现有页面发起请求时AccessToken过期，前端自动调用`refreshToken`；

4. 后端查询数据库找不到对应RefreshToken，直接返回401；

5. 前端捕获401，清空本地存储，强制跳转到登录页，完成下线。

## 4\.2 两种登录模式可选

### 模式1：单设备登录（当前代码默认）

登录时执行 `deleteByUserId(userId)`，删除该用户所有旧刷新Token，同一账号只能一台设备在线。

### 模式2：多设备同时在线

删除 `saveNewToken` 方法内 `deleteByUserId(userId)` 代码，允许多设备同时登录，每条登录一条记录。

## 4\.3 后台管理页面调用示例

```JavaScript
// 管理员操作，踢出用户ID=10001
async function kickTargetUser(userId) {
  await kickUser(userId)
  ElMessage.success("已强制该用户下线")
}
```

## 4\.4 定时任务清理过期Token（补充）

```Java
import org.springframework.scheduling.annotation.Scheduled;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class TokenClearTask {
    private final RefreshTokenService refreshTokenService;
    // 每日凌晨2点清理过期刷新Token
    @Scheduled(cron = "0 0 2 * * ?")
    public void clearExpired() {
        refreshTokenService.clearExpiredToken();
    }
}
```

# 五、整体安全优势

1. RefreshToken持久化到数据库，可后台管控、强制踢人；

2. 刷新成功旧Token立即作废，防止重复利用；

3. 过期Token定时清理，减少数据库数据；

4. 多设备/单设备登录可灵活切换；

5. 前端无感刷新，用户无感知，体验流畅；

6. 统一异常拦截、全局Loading、自动错误弹窗一套封装。

> （注：文档部分内容可能由 AI 生成）
