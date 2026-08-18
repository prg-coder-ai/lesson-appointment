# 教学预约系统 SaaS 化改造完整方案

# 教学预约系统改造为 SaaS 应用完整方案（含用户隔离、架构改造）

把**单租户教学预约系统**改成**多租户 SaaS 系统**，核心是解决**租户隔离、权限边界、多租户管理、可扩展性**四大问题。我会用最落地、可直接落地开发的方案讲清楚，包含**3 种租户隔离方案选型**、**改造步骤**、**核心表结构**、**权限设计**、**部署架构**。

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

**示例（Java 伪代码）**

```java
// 租户拦截器
public class TenantInterceptor implements HandlerInterceptor {
    @Override
    public boolean preHandle(...) {
        // 从 token / header / domain 获取当前租户ID
        Long tenantId = getTenantIdFromRequest(request);
        // 存入线程上下文
        TenantContext.set(tenantId);
        return true;
    }
}
```

**示例（Python Django）**

```python
# 中间件自动注入租户
class TenantMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
    def __call__(self, request):
        request.tenant_id = get_tenant_from_header(request)
        return self.get_response(request)
```

### 步骤 3：MyBatis/ORM 自动拼接 tenant\_id（关键！）

不用每个 SQL 手动写 `where tenant\_id = ?`
**自动注入租户条件**。

**MyBatis 示例**

```xml
<insert id="addReservation">
    insert into reservations(..., tenant_id)
    values(..., #{tenantId})  <!-- 自动取上下文 -->
</insert>
```

**MyBatis\-Plus / JPA / Django ORM 都支持租户插件**
这一步能**节省 80% 改造工作量**。

### 步骤 4：用户体系改造（租户 ↔ 用户 多对多）

旧系统：用户 → 系统
新系统：**租户 ↔ 用户 ↔ 角色**

表结构：

```sql
tenant_users (
    id BIGINT,
    tenant_id BIGINT,  -- 所属机构
    user_id BIGINT,
    role_code VARCHAR(50),  -- admin/teacher/student
    status TINYINT
)
```

一个用户可以加入多个租户（例如老师兼职）。

### 步骤 5：权限改造（租户内独立权限）

- 每个租户**独立角色、独立权限**

- 学生只能看自己的预约

- 老师只能看自己的课程

- 管理员只能管理本租户数据

**权限规则：数据必须带 tenant\_id**

### 步骤 6：登录入口改造

支持三种登录方式（任选）

1. 子域名：`a\-school\.yuyue\.com` → 自动识别 tenant\_id

2. 企业码：登录时输入机构编码

3. 手机号自动归属：根据手机号匹配所属租户

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
    created_time DATETIME
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

---

## 总结

- **隔离方案**：共享库 \+ 共享表 \+ `tenant\_id`（最适合教学预约）

- **核心改造**：租户上下文 \+ 自动 SQL 注入 \+ 多租户用户体系

- **开发成本**：最低、最快、最稳

- **扩展性**：支持无限机构接入

我可以根据你**当前系统的技术栈（Java/Python/PHP/Node）**，给你生成：

- 完整可运行的租户拦截代码

- 完整 SQL 建表语句

- 多租户权限控制代码

- 前端登录 / 子域名识别逻辑

你需要我直接给你**对应技术栈的可复制代码**吗？

> （注：文档部分内容可能由 AI 生成）
