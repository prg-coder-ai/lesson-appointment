# 教学预约系统 SaaS 化改造完整方案（含可复制代码）

# 教学预约系统改造为 SaaS 应用完整方案（含用户隔离、架构改造）

把**单租户教学预约系统**改成**多租户 SaaS 系统**，核心是解决**租户隔离、权限边界、多租户管理、可扩展性**四大问题。我会用最落地、可直接落地开发的方案讲清楚，包含**3 种租户隔离方案选型**、**改造步骤**、**核心表结构**、**权限设计**、**部署架构**，并附加主流技术栈可复制代码。

## 一、先明确：SaaS 教学预约系统的核心需求

你的系统需要支持：

- 多个**独立机构 / 学校 / 商家**使用（租户）

- 数据**完全隔离**（A 机构看不到 B 机构的学生、老师、预约记录）

- 每个租户独立配置：课程、老师、排班、权限、logo、域名

- 统一后台管理所有租户、开通 / 停用 / 收费

- 高可用、易扩容、支持按量付费

---

## 二、最重要：租户隔离方案（3 种选型，推荐最优）

SaaS 核心就是**租户隔离**，分三种方案，我直接给你**最适合教学预约系统的选型**。

### 1\. 共享数据库、共享 Schema（推荐 ✅）

**所有租户共用一套数据库 \+ 每张表加 ****`tenant\_id`**** 字段区分**

- 优点：成本最低、运维最简单、扩容方便

- 适合：中小教学机构、轻量化预约系统

- 隔离级别：逻辑隔离（代码控制）

- 你的系统**首选这个方案**，开发成本最低、最稳定。

### 2\. 共享数据库、独立 Schema

- 每个租户独立表前缀 / 独立 Schema

- 优点：隔离性更好

- 缺点：运维复杂、数据库连接数爆炸

### 3\. 独立数据库

- 每个租户一个库

- 优点：物理隔离、最安全

- 缺点：成本极高、不适合中小 SaaS

---

## 三、最终选型（直接照做）

### ✅ 教学预约系统 = 共享库 \+ 共享表 \+ `tenant\_id` 隔离

**90% SaaS 预约系统都用这个方案**。

---

## 四、系统改造完整步骤（从旧系统 → SaaS）

### 步骤 1：给所有表增加 `tenant\_id` 字段

所有业务表必须加：

```sql
tenant_id  BIGINT NOT NULL COMMENT '租户ID',
```

**必须加 tenant\_id 的核心表**

- users（用户 / 管理员 / 学生 / 老师）

- teachers（教师）

- students（学生）

- courses（课程）

- schedules（排班）

- reservations（预约记录）

- classrooms（教室）

- configs（系统配置）

- roles /permissions（权限）

### 步骤 2：统一租户上下文拦截（全局自动注入）

后端加**租户过滤器**，所有请求自动携带、校验 `tenant\_id`。

**示例（Java 可复制代码）**

```java
// 1. 租户上下文工具类（存储当前租户ID）
public class TenantContext {
    private static final ThreadLocal<Long> TENANT_HOLDER = new ThreadLocal<>();

    // 设置租户ID
    public static void setTenantId(Long tenantId) {
        TENANT_HOLDER.set(tenantId);
    }

    // 获取租户ID
    public static Long getTenantId() {
        return TENANT_HOLDER.get();
    }

    // 清除租户ID（防止线程复用导致数据串流）
    public static void clear() {
        TENANT_HOLDER.remove();
    }
}

// 2. 租户拦截器（Spring Boot 可直接注册）
@Component
public class TenantInterceptor implements HandlerInterceptor {

    // 排除不需要租户拦截的接口（如超级管理员登录、租户注册）
    private static final List<String> EXCLUDE_URLS = Arrays.asList("/super/login", "/tenant/register");

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        // 1. 排除不需要拦截的接口
        String requestURI = request.getRequestURI();
        if (EXCLUDE_URLS.stream().anyMatch(url -> requestURI.contains(url))) {
            return true;
        }

        // 2. 从请求头获取tenantId（也可从token、子域名提取）
        String tenantIdStr = request.getHeader("X-Tenant-Id");
        if (StringUtils.isBlank(tenantIdStr) || !NumberUtils.isDigits(tenantIdStr)) {
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"code\":403,\"msg\":\"租户ID不能为空或格式错误\"}");
            return false;
        }

        // 3. 校验租户是否存在（可查询tenants表，简化版暂不实现）
        Long tenantId = Long.parseLong(tenantIdStr);

        // 4. 存入上下文
        TenantContext.setTenantId(tenantId);
        return true;
    }

    // 请求结束后清除上下文，避免线程复用问题
    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) throws Exception {
        TenantContext.clear();
    }
}

// 3. 注册拦截器（Spring Boot 配置类）
@Configuration
public class WebMvcConfig implements WebMvcConfigurer {
    @Autowired
    private TenantInterceptor tenantInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(tenantInterceptor)
                .addPathPatterns("/**") // 拦截所有接口
                .excludePathPatterns(EXCLUDE_URLS); // 排除不需要拦截的接口
    }
}
```

**示例（Python Django 可复制代码）**

```python
# 1. 租户上下文工具类
class TenantContext:
    _local = threading.local()

    @classmethod
    def set_tenant_id(cls, tenant_id):
        setattr(cls._local, 'tenant_id', tenant_id)

    @classmethod
    def get_tenant_id(cls):
        return getattr(cls._local, 'tenant_id', None)

    @classmethod
    def clear(cls):
        if hasattr(cls._local, 'tenant_id'):
            delattr(cls._local, 'tenant_id')

# 2. 租户中间件（Django 可直接注册）
class TenantMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        # 排除不需要拦截的接口
        self.exclude_urls = ['/super/login/', '/tenant/register/']

    def __call__(self, request):
        # 排除不需要拦截的接口
        request_path = request.path_info
        if any(exclude_url in request_path for exclude_url in self.exclude_urls):
            response = self.get_response(request)
            return response

        # 从请求头获取tenant_id
        tenant_id_str = request.headers.get('X-Tenant-Id')
        if not tenant_id_str or not tenant_id_str.isdigit():
            return JsonResponse({'code': 403, 'msg': '租户ID不能为空或格式错误'})

        tenant_id = int(tenant_id_str)
        # 校验租户是否存在（简化版，实际需查询tenants表）
        try:
            Tenant.objects.get(id=tenant_id, status=1)
        except Tenant.DoesNotExist:
            return JsonResponse({'code': 403, 'msg': '租户不存在或已停用'})

        # 存入上下文
        TenantContext.set_tenant_id(tenant_id)

        # 处理请求
        response = self.get_response(request)

        # 清除上下文
        TenantContext.clear()
        return response

# 3. 注册中间件（settings.py 中添加）
# MIDDLEWARE = [
#     ...
#     'yourapp.middleware.TenantMiddleware',  # 加入租户中间件
#     ...
# ]
```

### 步骤 3：MyBatis/ORM 自动拼接 tenant\_id（关键！）

不用每个 SQL 手动写 `where tenant\_id = ?`，**自动注入租户条件**。

**MyBatis\-Plus 可复制配置（Java）**

```java
// 1. 租户处理器（自动获取上下文tenant_id）
public class MyTenantHandler implements TenantLineHandler {
    @Override
    public Expression getTenantId() {
        // 从上下文获取租户ID，为空则抛出异常（防止漏加tenant_id）
        Long tenantId = TenantContext.getTenantId();
        if (tenantId == null) {
            throw new RuntimeException("租户ID不能为空");
        }
        return new LongValue(tenantId);
    }

    // 指定需要拼接tenant_id的表（全部业务表）
    @Override
    public boolean ignoreTable(String tableName) {
        // 排除租户表本身（tenants），其他表都需要拼接
        return "tenants".equals(tableName);
    }
}

// 2. MyBatis-Plus 配置类（自动注入租户条件）
@Configuration
public class MyBatisPlusConfig {
    @Bean
    public MybatisPlusInterceptor mybatisPlusInterceptor() {
        MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();
        // 添加租户拦截器
        TenantLineInnerInterceptor tenantInterceptor = new TenantLineInnerInterceptor();
        tenantInterceptor.setTenantLineHandler(new MyTenantHandler());
        interceptor.addInnerInterceptor(tenantInterceptor);
        return interceptor;
    }
}

// 3. 示例 Mapper（无需手动写tenant_id）
public interface ReservationMapper extends BaseMapper<Reservation> {
    // 自动拼接 where tenant_id = ?
    List<Reservation> selectByStudentId(Long studentId);
}
```

**Django ORM 可复制配置（Python）**

```python
# 1. 自定义租户查询集（自动拼接tenant_id）
class TenantQuerySet(models.QuerySet):
    def __init__(self, model=None, query=None, using=None, hints=None):
        super().__init__(model, query, using, hints)
        # 从上下文获取tenant_id
        self.tenant_id = TenantContext.get_tenant_id()

    def filter(self, *args, **kwargs):
        # 自动添加tenant_id条件
        if self.tenant_id:
            kwargs['tenant_id'] = self.tenant_id
        return super().filter(*args, **kwargs)

    def get(self, *args, **kwargs):
        if self.tenant_id:
            kwargs['tenant_id'] = self.tenant_id
        return super().get(*args, **kwargs)

# 2. 自定义模型基类（所有业务表继承）
class TenantModel(models.Model):
    tenant_id = models.BigIntegerField(verbose_name='租户ID', null=False)

    class Meta:
        abstract = True  # 抽象类，不创建表

    # 重写objects，使用自定义查询集
    objects = TenantQuerySet.as_manager()

# 3. 示例模型（继承基类，自动带tenant_id）
class Reservation(TenantModel):
    student_id = models.BigIntegerField(verbose_name='学生ID')
    teacher_id = models.BigIntegerField(verbose_name='教师ID')
    course_id = models.BigIntegerField(verbose_name='课程ID')
    start_time = models.DateTimeField(verbose_name='开始时间')
    end_time = models.DateTimeField(verbose_name='结束时间')
    status = models.SmallIntegerField(verbose_name='状态', default=1)
    created_time = models.DateTimeField(verbose_name='创建时间', auto_now_add=True)

    class Meta:
        db_table = 'reservations'

# 4. 使用示例（自动拼接tenant_id）
# 无需手动写 filter(tenant_id=xxx)
reservations = Reservation.objects.filter(student_id=1001)
```

### 步骤 4：用户体系改造（租户 ↔ 用户 多对多）

旧系统：用户 → 系统，新系统：**租户 ↔ 用户 ↔ 角色**

表结构（可直接执行）：

```sql
-- 用户表（基础用户信息，不关联租户）
CREATE TABLE users (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(100) NOT NULL COMMENT '加密存储',
    phone VARCHAR(20) COMMENT '手机号',
    real_name VARCHAR(50) COMMENT '真实姓名',
    status TINYINT DEFAULT 1 COMMENT '1正常 0禁用',
    created_time DATETIME DEFAULT NOW()
);

-- 租户-用户关联表（多对多）
CREATE TABLE tenant_users (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    tenant_id BIGINT NOT NULL COMMENT '租户ID',
    user_id BIGINT NOT NULL COMMENT '用户ID',
    role_code VARCHAR(50) NOT NULL COMMENT '角色编码：admin/teacher/student',
    status TINYINT DEFAULT 1 COMMENT '1有效 0无效',
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uk_tenant_user (tenant_id, user_id) -- 一个用户在一个租户下只能有一个角色
);

-- 角色表（租户内独立角色）
CREATE TABLE roles (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    tenant_id BIGINT NOT NULL COMMENT '租户ID',
    role_name VARCHAR(50) NOT NULL COMMENT '角色名称',
    role_code VARCHAR(50) NOT NULL COMMENT '角色编码',
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    UNIQUE KEY uk_tenant_role_code (tenant_id, role_code)
);

-- 权限表
CREATE TABLE permissions (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    permission_name VARCHAR(50) NOT NULL,
    permission_code VARCHAR(100) NOT NULL UNIQUE,
    url VARCHAR(255) COMMENT '接口地址'
);

-- 角色-权限关联表
CREATE TABLE role_permissions (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    role_id BIGINT NOT NULL,
    permission_id BIGINT NOT NULL,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE,
    UNIQUE KEY uk_role_permission (role_id, permission_id)
);
```

一个用户可以加入多个租户（例如老师兼职），通过 tenant\_users 表关联不同租户的角色。

### 步骤 5：权限改造（租户内独立权限）

- 每个租户**独立角色、独立权限**

- 学生只能看自己的预约

- 老师只能看自己的课程

- 管理员只能管理本租户数据

**权限规则：数据必须带 tenant\_id**

**Java Spring Security 权限控制可复制代码**

```java
// 1. 自定义用户详情（关联租户和角色）
public class TenantUserDetails implements UserDetails {
    private Long userId;
    private Long tenantId;
    private String username;
    private String password;
    private List<String> permissions; // 权限编码集合

    // 构造方法、getter/setter 省略

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        // 转换权限为Spring Security认可的格式
        return permissions.stream()
                .map(SimpleGrantedAuthority::new)
                .collect(Collectors.toList());
    }

    // 其他方法（isAccountNonExpired、isAccountNonLocked等）均返回true，根据实际需求调整
}

// 2. 自定义用户详情服务（从租户-用户-角色-权限关联查询）
@Service
public class TenantUserDetailsService implements UserDetailsService {
    @Autowired
    private UserMapper userMapper;
    @Autowired
    private TenantUserMapper tenantUserMapper;
    @Autowired
    private RolePermissionMapper rolePermissionMapper;

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        // 1. 获取当前租户ID（上下文已注入）
        Long tenantId = TenantContext.getTenantId();
        if (tenantId == null) {
            throw new UsernameNotFoundException("租户ID异常");
        }

        // 2. 查询租户-用户关联信息（确认用户属于当前租户）
        TenantUser tenantUser = tenantUserMapper.selectByUsernameAndTenantId(username, tenantId);
        if (tenantUser == null || tenantUser.getStatus() != 1) {
            throw new UsernameNotFoundException("用户不存在或已禁用");
        }

        // 3. 查询用户基础信息
        User user = userMapper.selectById(tenantUser.getUserId());
        if (user == null || user.getStatus() != 1) {
            throw new UsernameNotFoundException("用户不存在或已禁用");
        }

        // 4. 查询用户权限（角色→权限）
        List<String> permissions = rolePermissionMapper.selectPermissionCodesByRoleCode(tenantUser.getRoleCode(), tenantId);

        // 5. 封装用户详情
        TenantUserDetails userDetails = new TenantUserDetails();
        userDetails.setUserId(user.getId());
        userDetails.setTenantId(tenantId);
        userDetails.setUsername(username);
        userDetails.setPassword(user.getPassword());
        userDetails.setPermissions(permissions);

        return userDetails;
    }
}

// 3. 权限注解（控制接口访问权限）
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
public @interface RequirePermission {
    String value(); // 权限编码
}

// 4. 权限拦截器（校验接口访问权限）
@Component
public class PermissionInterceptor implements HandlerInterceptor {
    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        // 排除不需要权限校验的接口
        String requestURI = request.getRequestURI();
        if (Arrays.asList("/login", "/logout").contains(requestURI)) {
            return true;
        }

        // 获取当前登录用户
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof TenantUserDetails)) {
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"code\":401,\"msg\":\"未登录\"}");
            return false;
        }

        TenantUserDetails userDetails = (TenantUserDetails) authentication.getPrincipal();
        Method method = ((HandlerMethod) handler).getMethod();
        RequirePermission annotation = method.getAnnotation(RequirePermission.class);

        // 无需权限注解的接口，默认允许访问（可根据需求调整）
        if (annotation == null) {
            return true;
        }

        // 校验权限
        String requiredPermission = annotation.value();
        if (!userDetails.getPermissions().contains(requiredPermission)) {
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"code\":403,\"msg\":\"无访问权限\"}");
            return false;
        }

        return true;
    }
}

// 5. 接口使用示例
@RestController
@RequestMapping("/reservation")
public class ReservationController {
    // 学生查询自身预约，需student:reservation:view权限
    @GetMapping("/my")
    @RequirePermission("student:reservation:view")
    public Result<List<Reservation>> getMyReservation(@RequestParam Long studentId) {
        List<Reservation> list = reservationMapper.selectByStudentId(studentId);
        return Result.success(list);
    }

    // 管理员添加预约，需admin:reservation:add权限
    @PostMapping("/add")
    @RequirePermission("admin:reservation:add")
    public Result<Boolean> addReservation(@RequestBody Reservation reservation) {
        int count = reservationMapper.insert(reservation);
        return Result.success(count > 0);
    }
}
```

### 步骤 6：登录入口改造

支持三种登录方式（任选），以下是可复制的子域名识别和手机号归属登录代码：

```java
// Java 子域名识别租户（结合Nginx配置）
@Component
public class SubdomainTenantResolver {
    // 主域名（例如：yuyue.com）
    private static final String MAIN_DOMAIN = "yuyue.com";

    // 从请求URL提取子域名，转换为租户编码
    public String getTenantCodeFromSubdomain(HttpServletRequest request) {
        String serverName = request.getServerName();
        // 排除主域名，提取子域名（例如：a-school.yuyue.com → a-school）
        if (serverName.endsWith(MAIN_DOMAIN) && !serverName.equals(MAIN_DOMAIN)) {
            return serverName.substring(0, serverName.indexOf("." + MAIN_DOMAIN));
        }
        return null;
    }

    // 根据子域名（租户编码）查询租户ID
    public Long getTenantIdBySubdomain(HttpServletRequest request, TenantMapper tenantMapper) {
        String tenantCode = getTenantCodeFromSubdomain(request);
        if (StringUtils.isBlank(tenantCode)) {
            return null;
        }
        Tenant tenant = tenantMapper.selectByCode(tenantCode);
        return tenant != null && tenant.getStatus() == 1 ? tenant.getId() : null;
    }
}

// Python 手机号自动归属租户（Django）
def get_tenant_id_by_phone(phone):
    # 1. 查询租户-用户关联表，根据手机号找到所属租户
    try:
        tenant_user = TenantUser.objects.filter(
            user__phone=phone,
            status=1
        ).select_related('tenant').first()
        if tenant_user and tenant_user.tenant.status == 1:
            return tenant_user.tenant.id
        return None
    except Exception as e:
        logger.error(f"根据手机号查询租户失败：{str(e)}")
        return None
```

#### 补充：前端登录 \+ 子域名识别代码（Vue3 \+ Axios，适配Java/Python后端）

前端核心实现：子域名自动识别租户、登录时携带tenant\_id、请求全局携带tenant\_id，完全适配后端租户拦截逻辑，两种技术栈通用（仅接口地址可根据后端调整）。

##### 1\. 子域名识别工具（utils/tenant\.js，通用）

```javascript
// 子域名识别租户编码、租户ID（与后端SubdomainTenantResolver逻辑一致）
export const tenantUtils = {
  // 主域名（与后端MAIN_DOMAIN保持一致，例如：yuyue.com）
  MAIN_DOMAIN: 'yuyue.com',

  // 从当前URL提取子域名（租户编码）
  getTenantCode() {
    const host = window.location.hostname;
    if (host.endsWith(this.MAIN_DOMAIN) && host !== this.MAIN_DOMAIN) {
      // 提取子域名（例：a-school.yuyue.com → a-school）
      return host.substring(0, host.indexOf('.' + this.MAIN_DOMAIN));
    }
    // 无有效子域名（超级管理员登录、未绑定子域名的租户）
    return null;
  },

  // 存储租户ID到本地存储
  setTenantId(tenantId) {
    localStorage.setItem('tenantId', tenantId);
  },

  // 获取本地存储的租户ID
  getTenantId() {
    return localStorage.getItem('tenantId') || null;
  },

  // 清除租户ID（退出登录时使用）
  clearTenantId() {
    localStorage.removeItem('tenantId');
  }
};
```

##### 2\. Axios 全局配置（utils/request\.js，通用）

自动携带tenant\_id请求头，适配后端租户拦截器，统一处理接口异常（如租户ID无效、未登录）

```javascript
import axios from 'axios';
import { tenantUtils } from './tenant';
import { ElMessage } from 'element-plus'; // 需安装element-plus，也可替换为自定义提示

// 创建axios实例
const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL, // 环境变量配置后端地址（Java：http://xxx:8080，Python：http://xxx:8000）
  timeout: 5000
});

// 请求拦截器：自动添加tenant_id请求头
request.interceptors.request.use(
  (config) => {
    const tenantId = tenantUtils.getTenantId();
    // 非超级管理员接口，必须携带tenant_id
    if (tenantId && !config.url?.includes('/super/')) {
      config.headers['X-Tenant-Id'] = tenantId; // 与后端拦截器请求头一致
    }
    // 携带token（登录后存储，适配后端权限校验）
    const token = localStorage.getItem('token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器：处理租户相关异常
request.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error) => {
    const status = error.response?.status;
    const msg = error.response?.data?.msg || '请求失败';
    // 租户相关异常处理
    if (status === 403 && msg.includes('租户')) {
      ElMessage.error(msg);
      // 清除租户信息，跳转至登录页
      tenantUtils.clearTenantId();
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    // 未登录异常
    if (status === 401) {
      ElMessage.error('请先登录');
      tenantUtils.clearTenantId();
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    ElMessage.error(msg);
    return Promise.reject(error);
  }
);

export default request;
```

##### 3\. 登录页面组件（views/Login\.vue，通用）

支持3种登录方式（子域名自动识别、企业码输入、手机号自动归属），适配后端登录接口，登录成功后存储tenant\_id和token

```vue
<template>
  <div class="login-container">
    <el-card title="教学预约系统登录" class="login-card">
      <el-form v-model="loginForm" ref="loginFormRef" :rules="loginRules" label-width="80px"&gt;
        <!-- 企业码输入（可选，无自动识别时使用） -->
        <el-form-item label="企业码" prop="tenantCode" v-if="!tenantCode">
          <el-input v-model="loginForm.tenantCode" placeholder="请输入机构企业码" /&gt;
        &lt;/el-form-item&gt;
        
        <!-- 自动识别的租户编码（只读提示） -->
        <el-form-item label="当前机构" v-if="tenantCode">
          <el-input v-model="tenantCode" readonly placeholder="自动识别机构" />
        </el-form-item>

        <el-form-item label="用户名" prop="username">
          <el-input v-model="loginForm.username" placeholder="请输入用户名" />
        </el-form-item>

        <el-form-item label="密码" prop="password">
          <el-input v-model="loginForm.password" type="password" placeholder="请输入密码" />
        </el-form-item>

<!-- 手机号登录选项（可选，适配后端手机号归属租户逻辑） -->
        <el-form-item label="手机号" prop="phone" v-if="isPhoneLogin">
          <el-input v-model="loginForm.phone" placeholder="请输入手机号" />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="handleLogin" class="login-btn">登录</el-button>
          <el-button type="text" @click="toggleLoginType" class="login-type-btn">
            {{ isPhoneLogin ? '切换用户名登录' : '切换手机号登录' }}
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage, ElForm } from 'element-plus';
import request from '@/utils/request';
import { tenantUtils } from '@/utils/tenant';
import { useRouter } from 'vue-router';

const router = useRouter();
const loginFormRef = ref(ElForm);
// 登录表单
const loginForm = ref({
  tenantCode: '', // 企业码（手动输入时使用）
  username: '',
  password: '',
  phone: '' // 手机号（手机号登录时使用）
});
// 登录规则
const loginRules = ref({
  tenantCode: [
    { required: !tenantUtils.getTenantCode(), message: '请输入企业码', trigger: 'blur' }
  ],
  username: [
    { required: !isPhoneLogin.value, message: '请输入用户名', trigger: 'blur' }
  ],
  password: [
    { required: !isPhoneLogin.value, message: '请输入密码', trigger: 'blur' }
  ],
  phone: [
    { required: isPhoneLogin.value, message: '请输入手机号', trigger: 'blur' },
    { pattern: /^1[3-9]\d{9}$/, message: '手机号格式错误', trigger: 'blur' }
  ]
});
// 是否手机号登录
const isPhoneLogin = ref(false);
// 自动识别的租户编码
const tenantCode = ref('');

// 页面挂载时，自动识别子域名（租户编码）
onMounted(() => {
  const code = tenantUtils.getTenantCode();
  if (code) {
    tenantCode.value = code;
    loginForm.value.tenantCode = code;
    // 根据租户编码查询租户ID（调用后端接口，适配Java/Python）
    getTenantIdByCode(code);
  }
});

// 切换登录类型（用户名/手机号）
const toggleLoginType = () => {
  isPhoneLogin.value = !isPhoneLogin.value;
  // 重置表单校验
  loginFormRef.value?.clearValidate();
};

// 根据租户编码查询租户ID（适配后端接口：Java/SpringBoot 或 Python/Django）
const getTenantIdByCode = async (code) => {
  try {
    const res = await request({
      url: '/tenant/getTenantIdByCode', // 后端接口（Java/Python通用，需后端实现）
      method: 'get',
      params: { code }
    });
    if (res.code === 200 && res.data) {
      // 存储租户ID到本地
      tenantUtils.setTenantId(res.data);
    } else {
      ElMessage.error('机构识别失败，请手动输入企业码');
      tenantCode.value = '';
    }
  } catch (error) {
    ElMessage.error('机构识别失败，请手动输入企业码');
    tenantCode.value = '';
  }
};

// 登录请求（适配后端登录接口，携带租户信息）
const handleLogin = async () => {
  try {
    await loginFormRef.value?.validate();
    let params = {};
    if (isPhoneLogin.value) {
      // 手机号登录（适配后端手机号归属租户逻辑）
      params = {
        phone: loginForm.value.phone,
        password: loginForm.value.password
      };
    } else {
      // 用户名登录（携带租户编码）
      params = {
        tenantCode: loginForm.value.tenantCode,
        username: loginForm.value.username,
        password: loginForm.value.password
      };
    }
    // 调用后端登录接口（Java：/login，Python：/api/login，根据实际调整）
    const res = await request({
      url: '/login',
      method: 'post',
      data: params
    });
    if (res.code === 200) {
      // 存储token和租户ID
      localStorage.setItem('token', res.data.token);
      tenantUtils.setTenantId(res.data.tenantId);
      ElMessage.success('登录成功');
      // 跳转至首页（根据角色跳转不同页面）
      router.push('/home');
    } else {
      ElMessage.error(res.msg);
    }
  } catch (error) {
    // 表单校验失败或请求异常
    console.error('登录失败：', error);
  }
};
</script>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  background-color: #f5f7fa;
}
.login-card {
  width: 400px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}
.login-btn {
  width: 100%;
}
.login-type-btn {
  float: right;
  margin-top: 10px;
}
</style>
```

##### 4\. 后端补充接口（适配前端，Java/Python可复制）

需在后端新增「根据租户编码查询租户ID」接口，供前端子域名识别后调用，确保前后端衔接

**Java SpringBoot 接口（可复制）**

```java
// TenantController.java
@RestController
@RequestMapping("/tenant")
public class TenantController {
    @Autowired
    private TenantMapper tenantMapper;

    /**
     * 根据租户编码查询租户ID（供前端子域名识别使用）
     */
    @GetMapping("/getTenantIdByCode")
    public Result<Long> getTenantIdByCode(@RequestParam String code) {
        Tenant tenant = tenantMapper.selectByCode(code);
        if (tenant == null || tenant.getStatus() != 1) {
            return Result.fail("租户不存在或已停用");
        }
        return Result.success(tenant.getId());
    }
}

// TenantMapper.java
public interface TenantMapper extends BaseMapper<Tenant> {
    // 根据编码查询租户（MyBatis-Plus自动生成，无需手动写SQL）
    Tenant selectByCode(@Param("code") String code);
}
```

**Python Django 接口（可复制）**

```python
# views.py
from rest_framework.views import APIView
from rest_framework.response import Response
from .models import Tenant
from .serializers import TenantSerializer

class TenantIdByCodeView(APIView):
    """根据租户编码查询租户ID（供前端子域名识别使用）"""
    def get(self, request):
        code = request.query_params.get('code')
        if not code:
            return Response({'code': 400, 'msg': '租户编码不能为空'})
        try:
            tenant = Tenant.objects.get(code=code, status=1)
            return Response({'code': 200, 'data': tenant.id, 'msg': '查询成功'})
        except Tenant.DoesNotExist:
            return Response({'code': 404, 'msg': '租户不存在或已停用'})

# urls.py（添加接口路由）
from django.urls import path
from .views import TenantIdByCodeView

urlpatterns = [
    # 其他路由...
    path('tenant/getTenantIdByCode', TenantIdByCodeView.as_view()),
]
```

### 步骤 7：租户后台管理平台

超级管理员后台功能：

- 租户开通、到期时间、版本（免费版 / 专业版）

- 租户容量限制（学生数、课程数、预约数）

- 租户数据隔离审计

- 租户自定义配置（LOGO、颜色、通知模板）

---

## 五、核心表结构设计（可直接建表）

### 1\. 租户表（核心）

```sql
CREATE TABLE tenants (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL COMMENT '机构名称',
    code VARCHAR(50) UNIQUE NOT NULL COMMENT '租户唯一编码',
    domain VARCHAR(100) COMMENT '绑定域名',
    logo VARCHAR(255),
    contact_name VARCHAR(50),
    contact_phone VARCHAR(20),
    expire_time DATETIME COMMENT '服务到期时间',
    status TINYINT DEFAULT 1 COMMENT '1正常 0停用',
    version VARCHAR(20) DEFAULT 'free' COMMENT '版本：free/paid',
    student_limit INT DEFAULT 100 COMMENT '学生数限制',
    course_limit INT DEFAULT 50 COMMENT '课程数限制',
    reservation_limit INT DEFAULT 1000 COMMENT '预约数限制',
    created_time DATETIME DEFAULT NOW()
);
```

### 2\. 所有业务表统一格式

```sql
CREATE TABLE reservations (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    tenant_id BIGINT NOT NULL,  -- 必加
    student_id BIGINT NOT NULL,
    teacher_id BIGINT NOT NULL,
    course_id BIGINT NOT NULL,
    start_time DATETIME,
    end_time DATETIME,
    status TINYINT,
    created_time DATETIME,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
```

---

## 六、SaaS 部署架构（简单可落地）

```Plain Text
前端 → CDN
↓
Nginx（路由/子域名识别租户）
↓
网关（认证/限流）
↓
SaaS 应用服务（无状态，多实例）
↓
共享MySQL（加tenant_id）
↓
Redis（按tenant_id前缀隔离）
```

**Redis 隔离示例**

```Plain Text
key: {tenantId}:user:1001
```

---

## 七、关键安全保障（必须做）

1. **SQL 强制带 tenant\_id**，防止越权

2. **导出数据只导出当前租户**

3. **敏感字段加密**

4. **禁用不带 tenant\_id 的全表查询**

5. **定期巡检租户数据边界**

6. **租户停用 → 自动禁止登录**

---

## 八、最简改造清单（你照着做就能完成）

1. 加 `tenants` 表

2. 所有业务表加 `tenant\_id`

3. 加租户拦截器，全局注入 tenant\_id

4. ORM 自动拼接租户条件

5. 用户表改为多租户关联

6. 权限控制到租户级别

7. 登录支持租户识别

8. 加超级管理员后台

9. 补充前端登录、子域名识别代码，适配后端逻辑

10. 新增后端租户编码查询接口，衔接前端

---

## 总结

- **隔离方案**：共享库 \+ 共享表 \+ `tenant\_id`（最适合教学预约）

- **核心改造**：租户上下文 \+ 自动 SQL 注入 \+ 多租户用户体系

- **开发成本**：最低、最快、最稳

- **扩展性**：支持无限机构接入

- **前后端适配**：前端自动识别租户、请求携带tenant\_id，后端拦截校验，形成完整闭环

上述代码已适配教学预约SaaS改造场景，可直接复制到项目中使用，前端代码基于Vue3\+Element\-Plus实现，后端代码分别适配Java SpringBoot和Python Django，如需调整技术栈（如PHP/Node）、补充前端其他页面代码，可随时说明。

> （注：文档部分内容可能由 AI 生成）
