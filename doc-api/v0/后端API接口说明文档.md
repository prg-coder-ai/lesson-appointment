# 课程预约系统 后端API接口说明文档

---

## 1. 接口基础说明

### 1.1 基础信息

| 项目 | 值 |
|------|-----|
| 服务地址 | `http://{host}:8081`（默认端口8081） |
| API基础路径 | 无统一前缀，接口路径以Controller中的`@RequestMapping`为准 |
| 字符编码 | UTF-8 |
| 数据格式 | 请求：`application/json`；响应：`application/json` |
| 时区 | 接口入参/出参默认使用调用方传的`timeZone`；未指定时不做转换 |
| API文档UI | `http://{host}:8081/swagger-ui.html`（SpringDoc OpenAPI自动生成） |

### 1.2 认证方式（Bearer Token）

除白名单接口外，所有请求必须在HTTP Header中携带JWT Token：

```http
Authorization: Bearer <ACCESS_TOKEN>
```

Token获取方式：调用登录接口 `/auth/login`，成功返回`token`(Access Token) 和 `refreshToken`。

**Token白名单接口**（无需Authorization头）：

| 接口 | 方法 | 用途 |
|------|------|------|
| `/auth/login` | POST | 用户登录 |
| `/auth/refreshToken` | POST | 刷新AccessToken |
| `/auth/logout` | POST | 用户登出 |
| `/user/student/register` | POST | 学生注册 |
| `/user/teacher/register` | POST | 教师注册 |
| `/user/account/exist` | GET | 账号查重 |
| `/teacher/published/latest-public` | GET | 公开查询教师最新发布信息 |
| `/teacher/published/public-get` | GET | 公开查询教师指定发布版本 |
| 静态页面 `/*.html`、`/css/**`、`/js/**` | GET | 前端资源 |

### 1.3 统一响应格式 Result\<T\>

所有接口统一返回以下JSON结构：

```json
{
  "code": 200,
  "message": "操作成功",
  "data": { }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| code | Integer | 状态码（见下表） |
| message | String | 提示信息（成功/错误描述） |
| data | T(泛型) | 业务数据，可能为Object/Array/Null |

**HTTP状态码与业务code对照表**：

| code | HTTP状态 | 含义 |
|------|----------|------|
| 200 | 200 OK | 成功 |
| 400 | 400 Bad Request | 参数错误 / 业务校验失败 |
| 401 | 401 Unauthorized | 未登录 / Token失效 / Token过期 |
| 403 | 403 Forbidden | 已登录但无权限访问该接口 |
| 404 | 404 Not Found | 资源不存在 |
| 500 | 500 Internal Server Error | 服务器内部异常 |

### 1.4 分页响应格式 PageResult\<T\>

分页接口的`data`字段包含以下结构：

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "rows": [ { }, { } ],
    "total": 120,
    "pageNum": 1,
    "pageSize": 10,
    "totalPages": 12
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| rows | Array\<T\> | 当前页数据列表 |
| total | Long | 总记录数 |
| pageNum | Integer | 当前页码（从1开始） |
| pageSize | Integer | 每页条数 |
| totalPages | Integer | 总页数 = ceil(total / pageSize) |

### 1.5 公共请求头

| 请求头 | 必填 | 说明 |
|--------|------|------|
| `Content-Type` | 是 | POST/PUT请求时必须为 `application/json` |
| `Authorization` | 非白名单必选 | 格式 `Bearer <ACCESS_TOKEN>` |
| `Accept` | 否 | 建议使用 `application/json` |

### 1.6 角色权限速查

接口权限标注使用以下简称：

| 简称 | 角色 | 含义 |
|------|------|------|
| 🔓 | 公开 (Public) | 无需登录 |
| 👤 | 全角色 (All) | 任意已登录用户（学生/教师/管理员） |
| 🎓 | 学生 (Student) | 仅学生账号可访问 |
| 👨‍🏫 | 教师 (Teacher) | 仅教师账号可访问 |
| 🔧 | 管理员 (Admin) | 仅管理员账号可访问 |
| 👨‍🏫+🔧 | 教师或管理员 | 教师及管理员可访问 |

---

## 2. 认证模块 API（Auth）

对应代码：[authController.java](file:///h:/2026/lesson-appointment/api/src/main/java/com/reservation/controller/authController.java)

---

### 2.1 用户登录

| 属性 | 值 |
|------|-----|
| 接口路径 | `POST /auth/login` |
| 权限 | 🔓 公开 |
| Content-Type | application/json |

#### 请求体 `LoginDTO`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| account | String | 是 | 登录账号（邮箱 或 手机号），对应user.account |
| password | String | 是 | 密码（明文），后端BCrypt比对 |

#### 请求示例

```json
{
  "account": "teacher01@example.com",
  "password": "123456"
}
```

#### 成功响应 `Result<Map>` (200)

| 字段 | 类型 | 说明 |
|------|------|------|
| userId | String | 用户ID（UUID） |
| account | String | 登录账号 |
| name | String | 用户姓名（教师返回name，学生返回name或空） |
| role | String | 角色：student / teacher / admin |
| token | String | JWT Access Token（放Authorization头使用） |
| refreshToken | String | 刷新Token（用于刷新接口） |

#### 响应示例

```json
{
  "code": 200,
  "message": "登录成功",
  "data": {
    "userId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "account": "teacher01@example.com",
    "name": "李华",
    "role": "teacher",
    "token": "eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiJhMWIyYzNkNC1lNWY2LTc4OTAtYWJjZC1lZjEyMzQ1Njc4OTAiLCJyb2xlIjoidGVhY2hlciIsImV4cCI6MTcyNDAwMDAwMH0.xxx",
    "refreshToken": "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhMWIyYzNkNCIsImV4cCI6MTcyNDYwNDgwMH0.yyy"
  }
}
```

#### 失败响应

- 账号不存在 / 密码错误：`400 {code:400, message:"账号或密码错误"}`
- 账号冻结：`400 {code:400, message:"账号已被冻结，请联系管理员"}`
- 账号待审核：`400 {code:400, message:"账号待审核，请等待管理员审核通过"}`
- 账号停用：`400 {code:400, message:"账号已停用"}`

---

### 2.2 刷新 Access Token

| 属性 | 值 |
|------|-----|
| 接口路径 | `POST /auth/refreshToken` |
| 权限 | 🔓 公开（需有效refreshToken） |
| Content-Type | application/json |

#### 请求体 `RefreshDTO`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| refreshToken | String | 是 | 上一次登录或刷新返回的RefreshToken |
| account | String | 否 | 账号（与RefreshToken关联校验） |
| role | String | 否 | 角色 |

#### 请求示例

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiJ9.xxx.yyy",
  "account": "teacher01@example.com",
  "role": "teacher"
}
```

#### 成功响应 `Result<TokenDTO>` (200)

| 字段 | 类型 | 说明 |
|------|------|------|
| token | String | 新的Access Token |
| refreshToken | String | 新的RefreshToken（旧的会被删除失效） |

#### 响应示例

```json
{
  "code": 200,
  "message": "刷新成功",
  "data": {
    "token": "eyJhbGciOiJIUzUxMiJ9.new.xxx",
    "refreshToken": "eyJhbGciOiJIUzI1NiJ9.new.yyy"
  }
}
```

#### 失败响应

- RefreshToken无效/过期：`401 {code:401, message:"登录状态已过期，请重新登录"}`

**注意**：该接口采用**轮换策略**——成功后旧RefreshToken立即从数据库删除，只能使用新的RefreshToken。

---

### 2.3 用户登出

| 属性 | 值 |
|------|-----|
| 接口路径 | `POST /auth/logout` |
| 权限 | 🔓 公开（建议携带Token） |

#### 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| refreshToken | String | 否 | 若提供则从数据库删除该RefreshToken使其失效 |

#### 成功响应

```json
{ "code": 200, "message": "退出成功", "data": null }
```

---

### 2.4 强制踢出用户（管理员）

| 属性 | 值 |
|------|-----|
| 接口路径 | `DELETE /auth/kick/{userId}` |
| 权限 | 🔧 管理员 |

#### 路径参数

| 参数 | 类型 | 说明 |
|------|------|------|
| userId | String | 要踢出的用户ID（UUID） |

#### 成功响应

```json
{ "code": 200, "message": "已强制踢出该用户", "data": null }
```

**效果**：删除该userId在数据库中的所有RefreshToken，所有设备的自动刷新都将失效，需要重新登录。

---

### 2.5 重置用户密码（管理员）

| 属性 | 值 |
|------|-----|
| 接口路径 | `POST /auth/password/reset` |
| 权限 | 🔧 管理员 |

#### Query参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| account | String | 是 | 要重置密码的账号 |

#### 成功响应

```json
{ "code": 200, "message": "密码重置成功", "data": null }
```

**重置后默认密码**：`12345678`（BCrypt加密存入），用户登录后应立即修改。

---

## 3. 用户模块 API（User）

对应代码：[UserController.java](file:///h:/2026/lesson-appointment/api/src/main/java/com/reservation/controller/UserController.java)

---

### 3.1 学生注册

| 属性 | 值 |
|------|-----|
| 接口路径 | `POST /user/student/register` |
| 权限 | 🔓 公开 |
| Content-Type | application/json |

#### 请求体 User (实体字段子集)

| 字段 | 类型 | 必填 | 约束 | 说明 |
|------|------|------|------|------|
| account | String | 是 | 唯一，账号格式（邮箱@ 或 纯数字+短横线） | 登录账号 |
| email | String | 与phone至少1个 | 含@，唯一 | 邮箱 |
| phone | String | 与email至少1个 | 数字+短横线≤30位，唯一 | 手机号 |
| password | String | 是 | ≥6位 | 密码（明文，后端BCrypt加密） |
| name | String | 否 | | 学生姓名 |
| role | String | 是 | 固定值 "student" | 角色标识 |
| learnGoal | String | 否 | ≤200字 | 学习目标 |
| languageLevel | String | 否 | 枚举：入门/进阶/中级/高级/精通 | 语言水平 |

#### 请求示例

```json
{
  "account": "student01@example.com",
  "email": "student01@example.com",
  "phone": null,
  "password": "123456",
  "name": "张三",
  "role": "student",
  "learnGoal": "想通过雅思7分，去英国读研",
  "languageLevel": "中级"
}
```

#### 成功响应 `Result<Map>`

```json
{
  "code": 200,
  "message": "注册成功，请等待管理员审核",
  "data": {
    "userId": "s1234567-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "account": "student01@example.com",
    "role": "student",
    "status": "pending"
  }
}
```

**注册后状态**：`status=pending`（待审核），需管理员审核通过变为`active`后才能正常登录。

---

### 3.2 教师注册

| 属性 | 值 |
|------|-----|
| 接口路径 | `POST /user/teacher/register` |
| 权限 | 🔓 公开 |
| Content-Type | application/json |

#### 请求体 User

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| account | String | 是 | 登录账号（邮箱/手机号） |
| email | String | 与phone至少1个 | 邮箱（唯一） |
| phone | String | 与email至少1个 | 手机号（唯一） |
| password | String | 是 | 密码（明文） |
| name | String | 是 | 教师真实姓名 |
| role | String | 是 | 固定值 "teacher" |
| languageType | String | 是 | 枚举：英语/日语/韩语/法语/德语/西班牙语 |
| qualification | String | 否 | 教师资质图片（Base64编码字符串） |

#### 请求示例

```json
{
  "account": "13800000001",
  "email": null,
  "phone": "13800000001",
  "password": "123456",
  "name": "李华",
  "role": "teacher",
  "languageType": "英语",
  "qualification": "data:image/png;base64,iVBORw0KGgoAAAANS..."
}
```

#### 成功响应

同学生注册，返回`userId` + 状态`pending`。

---

### 3.3 账号查重

| 属性 | 值 |
|------|-----|
| 接口路径 | `GET /user/account/exist` |
| 权限 | 🔓 公开 |

#### Query参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| account | String | 是 | 待检测的账号名 |

#### 成功响应 `Result<Boolean>`

```json
// 返回 true 表示已存在，false 表示可用
{ "code": 200, "message": "success", "data": false }
```

---

### 3.4 管理员添加用户

| 属性 | 值 |
|------|-----|
| 接口路径 | `POST /user/add` |
| 权限 | 🔧 管理员 |

#### 请求体 User 完整字段

与3.1/3.2注册相同，区别：
- 添加后默认 `status=active`（直接可用，无需审核）
- 支持创建任意角色（包括`admin`）

#### 成功响应 `Result<String>`：返回新用户 userId

---

### 3.5 修改用户状态（审核/冻结/停用）

| 属性 | 值 |
|------|-----|
| 接口路径 | `POST /user/updateStatus` |
| 权限 | 🔧 管理员 |

#### 请求体（JSON）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| userId | String | 是 | 目标用户ID |
| status | String | 是 | 目标状态：pending / active / inactive / frozen |

#### 状态流转说明

```
注册 → pending ──审核通过──→ active
                 └──不通过──→ inactive
              active ──冻结──→ frozen（禁止登录）
              active ──停用──→ inactive（保留数据）
```

#### 成功响应

```json
{ "code": 200, "message": "状态修改成功", "data": null }
```

---

### 3.6 查询用户列表（条件）

| 属性 | 值 |
|------|-----|
| 接口路径 | `GET /user/list` |
| 权限 | 🔧 管理员 |

#### Query参数（多条件组合，均可选）

| 参数 | 类型 | 说明 |
|------|------|------|
| role | String | student / teacher / admin |
| status | String | pending / active / inactive / frozen |
| name | String | 姓名模糊匹配（like %name%） |
| account | String | 账号模糊匹配 |
| email | String | 邮箱模糊匹配 |
| phone | String | 手机号模糊匹配 |
| languageType | String | 教师：语言类型 |
| languageLevel | String | 学生：语言水平 |

#### 成功响应 `Result<List<User>>`

> 返回字段包含userId/account/phone/email/role/status/name/...等User实体字段（**password字段已置为null，脱敏返回**）。

---

### 3.7 分页查询用户

| 属性 | 值 |
|------|-----|
| 接口路径 | `GET /user/page` |
| 权限 | 🔧 管理员 |

#### Query参数

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| pageNum | Integer | 1 | 页码（从1开始） |
| pageSize | Integer | 10 | 每页条数 |
| role / status / name / account / phone / email | String | - | 与3.6一致 |

#### 成功响应 `Result<PageResult<User>>`

结构见1.4节。

---

### 3.8 查询所有学生列表

| 属性 | 值 |
|------|-----|
| 接口路径 | `GET /user/student/list` |
| 权限 | 🔧 管理员 |

返回条件：`role='student'` 的所有用户列表。

---

### 3.9 查询所有教师列表

| 属性 | 值 |
|------|-----|
| 接口路径 | `GET /user/teacher/list` |
| 权限 | 🔧 管理员 |

返回条件：`role='teacher'` 的所有用户列表。

---

### 3.10 修改密码

| 属性 | 值 |
|------|-----|
| 接口路径 | `POST /user/account/changePassword` |
| 权限 | 👤 全角色 |

#### Query参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| userId | String | 是 | 目标用户ID |
| password | String | 是 | 新密码（明文，后端加密） |

---

### 3.11 月度用户统计

| 属性 | 值 |
|------|-----|
| 接口路径 | `GET /user/statistical/byMonth` |
| 权限 | 🔧 管理员 |

#### Query参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| year | Integer | 是 | 年份，如 2026 |
| month | Integer | 是 | 月份：1-12 |

#### 成功响应 `Result<Map<String, Integer>>`

| 字段 | 说明 |
|------|------|
| teacherMonthStart | 该月1日00:00时已有的教师总数（create_time <= 当月月初且status=active） |
| teacherMonthEnd | 该月最后一天23:59时的教师总数 |
| studentMonthStart | 月初学生总数 |
| studentMonthEnd | 月末学生总数 |

#### 响应示例

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "teacherMonthStart": 45,
    "teacherMonthEnd": 50,
    "studentMonthStart": 180,
    "studentMonthEnd": 195
  }
}
```

---

## 4. 课程模板模块 API

对应代码：[CourseController.java](file:///h:/2026/lesson-appointment/api/src/main/java/com/reservation/controller/CourseController.java)

---

### 4.1 新增课程模板

| 属性 | 值 |
|------|-----|
| 接口路径 | `POST /course/template/insert` |
| 权限 | 🔧 管理员 |
| Content-Type | application/json |

#### 请求体 CourseTemplate

| 字段 | 类型 | 必填 | 约束 | 说明 |
|------|------|------|------|------|
| templateId | String | 否 | | 留空，后端生成UUID |
| languageType | String | 是 | 枚举6种语言 | 语言类型 |
| difficultyLevel | String | 是 | 入门/进阶/中级/高级 | 难度等级 |
| classFee | BigDecimal | 是 | ≥0 | 课时费（元） |
| classDuration | Integer | 是 | ≥15，且为15的倍数 | 单课时长（分钟） |
| classForm | String | 是 | 一对一/小班课/大班课 | 授课形式 |
| description | String | 是 | 10-500字 | 课程描述 |
| status | String | 是 | active/inactive/frozen | 初始状态 |

**唯一约束**：`(languageType, difficultyLevel)` 联合唯一，相同组合不允许重复创建。

#### 请求示例

```json
{
  "languageType": "英语",
  "difficultyLevel": "入门",
  "classFee": 120.00,
  "classDuration": 60,
  "classForm": "一对一",
  "description": "针对零基础学员，从26字母48音标开始，掌握1000+基础词汇与日常对话",
  "status": "active"
}
```

#### 成功响应 `Result<String>`：返回 templateId

---

### 4.2 修改课程模板

| 属性 | 值 |
|------|-----|
| 接口路径 | `POST /course/template/update` |
| 权限 | 🔧 管理员 |

#### 请求体 CourseTemplate（含templateId）

修改时templateId必填，其余字段与4.1相同，按提交值覆盖更新。

---

### 4.3 修改模板状态

| 属性 | 值 |
|------|-----|
| 接口路径 | `POST /course/template/updateStatus` |
| 权限 | 🔧 管理员 |

#### Query参数

| 参数 | 类型 | 说明 |
|------|------|------|
| templateId | String | 目标模板ID |
| status | String | active / inactive / frozen |

---

### 4.4 删除课程模板

| 属性 | 值 |
|------|-----|
| 接口路径 | `DELETE /course/template/{id}` |
| 权限 | 🔧 管理员 |

#### 路径参数

| 参数 | 类型 | 说明 |
|------|------|------|
| id | String | templateId（模板ID） |

#### 级联删除

由于外键配置 `ON DELETE CASCADE`，删除模板会自动删除：
- 基于该模板创建的 course（教师课程）
- course 下的 course_schedule（排期）
- 排期下的 booking（预约）
- booking 下的 appointment（课时）

⚠️ 谨慎使用，会级联清除所有关联数据。

---

### 4.5 查询模板列表

| 属性 | 值 |
|------|-----|
| 接口路径 | `GET /course/template/list` |
| 权限 | 👨‍🏫+🔧 教师或管理员 |

#### Query参数（可选）

| 参数 | 类型 | 说明 |
|------|------|------|
| languageType | String | 按语言类型过滤 |
| status | String | 按状态过滤 |

---

### 4.6 分页查询模板

| 属性 | 值 |
|------|-----|
| 接口路径 | `POST /course/template/page` |
| 权限 | 👨‍🏫+🔧 教师或管理员 |
| Content-Type | application/json |

#### 请求体 TemplateQueryPage

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| pageNum | Integer | 1 | 页码 |
| pageSize | Integer | 10 | 每页条数 |
| languageType | String | - | 筛选条件 |
| difficultyLevel | String | - | 筛选条件 |
| status | String | - | 筛选条件 |
| classForm | String | - | 筛选条件 |
| sortField | String | createTime | 排序字段 |
| sortOrder | String | desc | asc / desc |

---

## 5. 教师课程模块 API

---

### 5.1 新增教师课程

| 属性 | 值 |
|------|-----|
| 接口路径 | `POST /course/insert` |
| 权限 | 👨‍🏫+🔧 教师或管理员 |

#### 请求体 Course

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| templateId | String | 是 | 关联课程模板ID（外键） |
| courseName | String | 是 | 课程名（2-50字） |
| content | String | 否 | 教学内容（0-1000字） |
| feature | String | 否 | 课程特色（0-1000字） |
| teacherId | String | 教师：自动填，管理员：可选 | 授课教师ID；教师自己创建时自动取Token中的userId |
| status | String | 否 | 默认为 pending（待审核） |

**教师创建约束**：`teacherId` 必须等于当前登录教师的userId（后端`PermissionCheck.checkTeacherOwner`校验），防止越权创建他人课程。

#### 请求示例（教师创建）

```json
{
  "templateId": "tpl-xxx-xxx-xxx",
  "courseName": "雅思口语陪练（进阶）",
  "content": "围绕雅思口语4个评分标准（流利度/词汇/语法/发音），每次课真题演练+即时点评+录音反馈",
  "feature": "课后录音复盘、作业批改、备考规划",
  "status": "pending"
}
```

#### 成功响应 `Result<String>`：返回 courseId

---

### 5.2 修改课程

| 属性 | 值 |
|------|-----|
| 接口路径 | `POST /course/update` |
| 权限 | 👨‍🏫+🔧 教师或管理员 |

请求体Course（含courseId）；教师仅可修改自己创建的课程。

---

### 5.3 修改课程状态（发布/回收）

| 属性 | 值 |
|------|-----|
| 接口路径 | `POST /course/updateStatus` |
| 权限 | 👨‍🏫+🔧 教师或管理员 |

#### Query参数

| 参数 | 类型 | 说明 |
|------|------|------|
| id | String | courseId |
| status | String | pending / active / inactive / frozen |

---

### 5.4 按模板ID批量修改关联课程状态

| 属性 | 值 |
|------|-----|
| 接口路径 | `POST /course/updateStatusByLastId/{id}` |
| 权限 | 👨‍🏫+🔧 教师或管理员 |

#### 路径参数 + Query参数

| 参数 | 位置 | 说明 |
|------|------|------|
| id (templateId) | 路径 | 模板ID |
| status | Query | 目标状态 |

**影响范围**：所有 `template_id = {id}` 的 Course 记录。

---

### 5.5 删除单个课程

| 属性 | 值 |
|------|-----|
| 接口路径 | `DELETE /course/deleteById/{id}` |
| 权限 | 👨‍🏫+🔧 教师或管理员 |

级联删除关联的排期/预约/课时。

---

### 5.6 按模板ID批量删除课程

| 属性 | 值 |
|------|-----|
| 接口路径 | `DELETE /course/deleteByTemplateId/{id}` |
| 权限 | 👨‍🏫+🔧 教师或管理员 |

删除 `template_id = {id}` 的所有课程。

---

### 5.7 条件查询课程列表

| 属性 | 值 |
|------|-----|
| 接口路径 | `GET /course/list` |
| 权限 | 👨‍🏫+🔧 教师或管理员 |

#### 可选Query筛选

| 参数 | 说明 |
|------|------|
| courseId / templateId / teacherId | 精确匹配 |
| courseName | 模糊 like |
| status / languageType / difficultyLevel / classForm | 精确匹配 |

---

### 5.8 分页查询课程（全角色）

| 属性 | 值 |
|------|-----|
| 接口路径 | `GET /course/page` |
| 权限 | 👤 全角色（学生端课程预订用此接口浏览） |

#### Query参数

| 参数 | 类型 | 说明 |
|------|------|------|
| pageNum / pageSize | Integer | 分页参数 |
| teacherId | String | 按教师过滤（学生端只看某位老师的课程） |
| languageType | String | 语言类型过滤 |
| difficultyLevel | String | 难度过滤 |
| keyword | String | 课程名关键词模糊搜索 |
| status | String | 仅 active 状态的课程对学生展示 |

---

### 5.9 查询单条课程详情

| 属性 | 值 |
|------|-----|
| 接口路径 | `GET /course/{courseid}` |
| 权限 | 👤 全角色 |

---

### 5.10 月度课程统计

| 属性 | 值 |
|------|-----|
| 接口路径 | `GET /course/statistical/byMonth` |
| 权限 | 🔧 管理员 |

#### Query参数

| 参数 | 类型 | 说明 |
|------|------|------|
| year | Integer | 年份 |
| month | Integer | 月份 1-12 |

#### 响应字段

| 字段 | 说明 |
|------|------|
| courseMonthStart | 月初已激活课程数 |
| courseMonthEnd | 月末已激活课程数 |

---

## 6. 排期模块 API

对应代码：[ScheduleController.java](file:///h:/2026/lesson-appointment/api/src/main/java/com/reservation/controller/ScheduleController.java)

---

### 6.1 创建排期

| 属性 | 值 |
|------|-----|
| 接口路径 | `POST /schedule/create` |
| 权限 | 👨‍🏫+🔧 教师或管理员 |
| Content-Type | application/json |

#### 请求体 `ScheduleCreateDTO`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| scheduleId | String | 否 | 留空，后端生成 |
| courseId | String | 是 | 所属课程ID |
| name | String | 否 | 排期名称，如"每周一三五晚班" |
| timeZone | String | 是 | 本排期使用的时区（如`Asia/Shanghai`、`America/Toronto`） |
| startDate | LocalDate | 是 | 重复起始日期（yyyy-MM-dd） |
| startTime | LocalTime | 是 | 每次课开始时间（HH:mm:ss） |
| endDate | LocalDate | 是 | 重复结束日期（含该日） |
| endTime | LocalTime | 是 | 每次课结束时间（HH:mm:ss） |
| repeatType | Integer/String | 是 | 0=none单次，1=day每天，2=week每周，3=month每月（同时支持数字和英文别名） |
| repeatInterval | Integer | 否 | 重复间隔，默认1。如每2周一次传2 |
| repeatDays | List\<Integer\> | 按类型决定 | 周重复(1~7周一~周日)；月重复(1~31号)；单次/每天可空 |
| availableSites | Integer | 否 | 可预约席位数，默认1（一对一）；小班课可设多值 |
| status | String | 否 | 默认 active，可选 active/inactive |

#### repeatType 智能解析说明

后端 `@JsonSetter` 支持多种入参格式：
- 数字：`0`/`1`/`2`/`3`
- 字符串：`"none"`/`"0"`、`"day"`/`"1"`、`"week"`/`"2"`、`"month"`/`"3"`

#### 请求示例（每周一三五晚，共3个月）

```json
{
  "courseId": "course-xxx-xxx",
  "name": "2026Q3 英语入门周中晚班",
  "timeZone": "Asia/Shanghai",
  "startDate": "2026-09-01",
  "startTime": "20:00:00",
  "endDate": "2026-11-30",
  "endTime": "21:00:00",
  "repeatType": "week",
  "repeatInterval": 1,
  "repeatDays": [1, 3, 5],
  "availableSites": 4,
  "status": "active"
}
```

#### 成功响应 `Result<String>`：返回 scheduleId

---

### 6.2 修改排期

| 属性 | 值 |
|------|-----|
| 接口路径 | `POST /schedule/update` |
| 权限 | 👨‍🏫+🔧 教师或管理员 |

请求体 `CourseSchedule`（含 scheduleId），字段同6.1。

---

### 6.3 增减可用席位

| 属性 | 值 |
|------|-----|
| 接口路径 | `POST /schedule/incSite` |
| 权限 | 👨‍🏫+🔧 教师或管理员 |

#### 请求体 `IncSiteBody`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| scheduleId | String | 是 | 目标排期ID |
| inc | int | 是 | +1 表示增加1席位；-1 表示减少1席位（实际增减可用席位数） |

**注意**：当席位数已为0且再递减时，后端会阻止并返回业务错误。

---

### 6.4 修改排期状态

| 属性 | 值 |
|------|-----|
| 接口路径 | `POST /schedule/updateStatus` |
| 权限 | 👨‍🏫+🔧 教师或管理员 |

#### 请求体 `StatusBody`

| 字段 | 类型 | 说明 |
|------|------|------|
| scheduleId | String | 目标排期ID |
| status | String | active / inactive |

---

### 6.5 删除单个排期

| 属性 | 值 |
|------|-----|
| 接口路径 | `DELETE /schedule/delete/{id}` |
| 权限 | 👨‍🏫+🔧 教师或管理员 |

级联删除该排期下的所有Booking + Appointment。

---

### 6.6 按课程ID删除所有排期

| 属性 | 值 |
|------|-----|
| 接口路径 | `DELETE /schedule/deleteByCourseId/{id}` |
| 权限 | 👨‍🏫+🔧 教师或管理员 |

删除 `course_id = {id}` 的所有排期。

---

### 6.7 生成排期预览（本地时区，不入库）

| 属性 | 值 |
|------|-----|
| 接口路径 | `POST /schedule/generate` |
| 权限 | 👤 全角色 |
| Content-Type | application/json |

#### 请求体 `ScheduleGenerateDTO`

| 字段 | 类型 | 说明 |
|------|------|------|
| startDate / endDate | LocalDate | 日期范围 |
| startTime / endTime | LocalTime | 每日时段 |
| repeatType | String | none / day / week / month |
| interval | Integer | 重复间隔 |
| repeatDays | List\<Integer\> | 重复日列表 |
| timeZone | String | 排期所在时区 |
| userTimeZone | String | **用户本地时区**（此为与create区别），返回结果按该时区换算后的date+time |

#### 成功响应 `Result<List<ScheduleVO>>`

`ScheduleVO` 字段：
| 字段 | 类型 | 说明 |
|------|------|------|
| date | String | yyyy-MM-dd（用户本地时区日期） |
| time | String | HH:mm:ss（用户本地时区时间） |

#### 响应示例

```json
{
  "code": 200,
  "data": [
    { "date": "2026-09-01", "time": "20:00:00" },
    { "date": "2026-09-03", "time": "20:00:00" },
    { "date": "2026-09-05", "time": "20:00:00" }
  ]
}
```

---

### 6.8 排期冲突检测

| 属性 | 值 |
|------|-----|
| 接口路径 | `POST /schedule/checkConflict` |
| 权限 | 👨‍🏫+🔧 教师或管理员 |

#### 请求体 `ScheduleCreateDTO`（与create完全一致）

#### 成功响应 `Result<List<ScheduleException>>`

返回与**同教师其他排期**存在时间重叠的排期列表：
| 字段 | 类型 | 说明 |
|------|------|------|
| id | String | 已存在的冲突排期ID |
| name | String | 已存在的冲突排期名称 |

**算法规则**：以1小时为互斥区间，两节课的区间有交集即视为冲突（边界相等不算）。

---

### 6.9 分配学生到排期（原子操作）

| 属性 | 值 |
|------|-----|
| 接口路径 | `POST /schedule/assign-student` |
| 权限 | 👨‍🏫+🔧 教师或管理员 |
| 事务 | 全流程`@Transactional`，任一步失败全部回滚 |

#### 请求体（JSON）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| scheduleId | String | 是 | 目标排期ID |
| studentId | String | 是 | 学生ID |
| teacherId | String | 是 | 教师ID（用于归属校验） |

#### 执行流程（3步原子操作）

```
Step1. 创建Booking：
       scheduleId + studentId + status=booked → booking表

Step2. 可用席位 -1：
       course_schedule.available_sites = available_sites - 1

Step3. 生成所有Appointment课时：
       按Schedule规则展开日期 → 为每个日期+时间插入一条appointment
       (booking_id关联，class_index从1递增，status默认active)
```

#### 成功响应

```json
{ "code": 200, "message": "分配成功", "data": { "bookingId": "bk-xxx" } }
```

---

### 6.10 其他查询接口

| 接口 | 方法 | 权限 | 说明 |
|------|------|------|------|
| `/schedule/detail/{id}` | GET | 👤 | 查询单条排期详情（含course信息） |
| `/schedule/list` | GET | 👤 | 条件查询（scheduleId/courseId/teacherId/status） |
| `/schedule/page` | POST | 👤 | 分页查询（CourseScheduleQueryPage） |
| `/schedule/selectByCourseId/{courseId}` | GET | 👤 | 查询某课程下所有排期（最常用，前端课程详情展开排期用） |

---

## 7. 预约（Booking）模块 API

对应代码：[BookingController.java](file:///h:/2026/lesson-appointment/api/src/main/java/com/reservation/controller/BookingController.java)

---

### 7.1 创建预约（学生端）

| 属性 | 值 |
|------|-----|
| 接口路径 | `POST /course/booking/create` |
| 权限 | 👤 全角色（通常🎓学生调用） |

#### 请求体 `BookingCreateDTO`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| scheduleId | String | 是 | 预约的目标排期ID |
| studentId | String | 是 | 学生ID（后端校验归属，防止替他人预约） |
| status | String | 否 | 默认 booked，可选 booked/cancelled/completed/cancelling/overtime |

⚠️ 注意：使用6.9的`/schedule/assign-student`接口可以一步完成「席位扣减+创建Booking+生成Appointments」，避免分接口调用导致的不一致问题。推荐使用assign-student接口！

---

### 7.2 - 7.9 预约标准CRUD

| 编号 | 接口 | 方法 | 权限 | 说明 |
|------|------|------|------|------|
| 7.2 | `/course/booking/update/{id}` | POST | 👨‍🏫+🔧 | 修改预约（含scheduleId、studentId、status等） |
| 7.3 | `/course/booking/updateStatus` | POST | 👤 | 修改状态；请求体：`{bookingId, status}` |
| 7.4 | `/course/booking/ListByScheduleId/{scheduleId}` | GET | 👤 | 查某排期下的所有预约（教师查看该排期都有哪些学生预约） |
| 7.5 | `/course/booking/list` | POST | 👤 | 条件查询列表（BookingDTO） |
| 7.6 | `/course/booking/page` | POST | 👤 | 分页查询（BookingQueryPage，含筛选+排序） |
| 7.7 | `/course/booking/{id}` | GET | 👤 | 查单条详情 |
| 7.8 | `/course/booking/delete/{id}` | DELETE | 👨‍🏫+🔧 | 删除单个预约（Appointment级联删除） |
| 7.9 | `/course/booking/deleteByScheduleId/{id}` | DELETE | 👨‍🏫+🔧 | 删除某排期下全部预约 |

#### Booking状态枚举

| 状态值 | 说明 | 颜色（前端建议） |
|--------|------|------------------|
| booked | 已预约 | 蓝色 |
| completed | 已完成 | 绿色 |
| cancelled | 已取消 | 灰色 |
| cancelling | 申请取消中 | 橙色 |
| overtime | 已过时（超过上课时间未使用） | 红色 |

---

### 7.10 月度预约统计

| 属性 | 值 |
|------|-----|
| 接口路径 | `GET /course/booking/statistical/byMonth` |
| 权限 | 🔧 管理员 |

#### Query参数

| 参数 | 类型 | 说明 |
|------|------|------|
| year | Integer | 年份 |
| month | Integer | 月份 1-12 |

#### 响应字段

| 字段 | 说明 |
|------|------|
| bookingMonth | 当月预约总数（create_time在本月区间内） |
| bookingMonthLast | 上月预约总数（用于环比对比） |

---

## 8. 课时（Appointment）模块 API

对应代码：[AppointmentController.java](file:///h:/2026/lesson-appointment/api/src/main/java/com/reservation/controller/AppointmentController.java)

---

### 8.1 Appointment 状态说明

| 状态值 | 说明 |
|--------|------|
| active | 生效中（等待上课） |
| noted1 | 第一次上课通知已发送 |
| noted2 | 第二次上课通知已发送 |
| completed | 已完成（已上课） |
| cancelled | 已取消 |
| s-cancelling | 学生申请取消中 |
| t-cancelling | 教师申请取消中 |

---

### 8.2 - 8.8 课时标准CRUD

| 接口 | 方法 | 权限 | 说明 |
|------|------|------|------|
| `/course/appointment/add` | POST | 👨‍🏫+🔧 | 新增单条课时（AppointmentDTO含bookingId、时间、状态） |
| `/course/appointment/update` | PUT | 👨‍🏫+🔧 | 修改单条（含改期：修改appointmentDatetime，修改前会自动备份到last_datetime） |
| `/course/appointment/updateStatusById` | PUT | 👤 | 按ID修改状态（发通知noted1/noted2、完成completed、取消cancelled） |
| `/course/appointment/updateStatusByBookingId` | PUT | 👨‍🏫+🔧 | 按BookingID批量修改该预约下所有课时状态 |
| `/course/appointment/delete/{id}` | DELETE | 👨‍🏫+🔧 | 按ID删除 |
| `/course/appointment/deleteByBookingId` | DELETE | 👨‍🏫+🔧 | 按BookingID删除所有课时 |
| `/course/appointment/get/{id}` | GET | 👤 | 按ID查单条 |
| `/course/appointment/getByBookingId` | GET | 👤 | 按BookingID查课时列表（展开预约看具体每节课） |

---

### 8.9 查询全部课时

| 属性 | 值 |
|------|-----|
| 接口路径 | `GET /course/appointment/list` |
| 权限 | 👤 全角色 |

可选筛选：bookingId / status / appointmentDatetime起止时间。

---

### 8.10 分页查询课时

| 属性 | 值 |
|------|-----|
| 接口路径 | `POST /course/appointment/listByPage` |
| 权限 | 👤 全角色 |

请求体：AppointmentQueryPage（pageNum/pageSize + 多条件筛选 + sortField/sortOrder）。

---

### 8.11 按状态查询课时

| 属性 | 值 |
|------|-----|
| 接口路径 | `GET /course/appointment/getByStatus` |
| 权限 | 👤 全角色 |

Query参数：`status`（例如传 `active` 列出所有待上课课时）。

---

### 8.12 未来N日课时列表（课表浏览）

| 属性 | 值 |
|------|-----|
| 接口路径 | `GET /course/appointment/statistical/listByDays` |
| 权限 | 👤 全角色 |

#### Query参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| days | int | 是 | - | 近N天（如3=今+明+后共3天） |
| userId | String | 否 | - | 过滤某用户（自己）的课表；为空查全部 |
| role | String | 否 | - | student/teacher，配合userId使用（查学生表或教师表） |
| sortField | String | 否 | appointmentDatetime | 排序字段 |
| sortOrder | String | 否 | asc | asc升序（按时间从早到晚） |

#### 适用场景

| 端 | days | userId | role | 效果 |
|----|------|--------|------|------|
| 管理员「上课通知」 | 3 | 空 | 空 | 3日内全校所有课时 |
| 教师「今日课程」 | 7 | 登录教师userId | teacher | 教师7日内课表 |
| 学生「今日课程」 | 7 | 登录学生userId | student | 学生7日内课表 |

---

### 8.13 未来N日课时（分页版）

| 属性 | 值 |
|------|-----|
| 接口路径 | `POST /course/appointment/statistical/listByDaysByPage` |
| 权限 | 👤 全角色 |

与8.12参数一致，额外支持：`days<=0` 表示不限制天数（查询所有历史+未来）。返回PageResult分页结构。

---

### 8.14 月度课时统计

| 属性 | 值 |
|------|-----|
| 接口路径 | `GET /course/appointment/statistical/byMonth` |
| 权限 | 🔧 管理员 |

#### Query参数：year + month

#### 响应字段

| 字段 | 说明 |
|------|------|
| appMonth | 当月（active + completed）的课时数 |
| appMonthLast | 上月（active + completed）课时数（环比） |

---

### 8.15 未来N日课时总数

| 属性 | 值 |
|------|-----|
| 接口路径 | `GET /course/appointment/statistical/onDays` |
| 权限 | 🔧 管理员 |

#### Query参数

| 参数 | 类型 | 说明 |
|------|------|------|
| ondays | int | 未来N天（含当日），如 7 = 一周课时总量 |

#### 成功响应 `Result<Integer>`

```json
{ "code": 200, "message": "success", "data": 58 }
```

---

## 9. 教师职业信息模块 API

对应代码：[TeacherProfessionalController.java](file:///h:/2026/lesson-appointment/api/src/main/java/com/reservation/controller/TeacherProfessionalController.java)

---

### 9.1 新增教师职业信息

| 属性 | 值 |
|------|-----|
| 接口路径 | `POST /teacher/professional/addTeacherProfessionalInfo` |
| 权限 | 👨‍🏫+🔧 教师或管理员 |
| Content-Type | application/json |

#### 请求体 `TeacherProfessionalDTO`（主表 + 证书列表 + 可预约时段列表）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| teacherProfessionalId | String | 否 | 留空生成 |
| teacherId | String | 是 | 关联user.userId（唯一，一教师一条） |
| subject | String | 否 | 学科（冗余languageType） |
| personalPhotoUrl | String | 否 | 头像照片URL（优先使用） |
| personalPhotoBase64 | String | 否 | 头像Base64（无URL时兜底） |
| bioText | String | 否 | ≤2000字 教师简介 |
| bioUrl | String | 否 | 外部简历/博客链接 |
| availabilityRule | String | 否 | 可预约规则JSON |
| minBookingHours | Integer | 否 | 单次最小预约课时数，默认4 |
| weeklyAvailableHours | Integer | 否 | 每周可预约上限课时，默认20 |
| certificateText | String | 否 | 证书文字描述 |
| status | String | 否 | active/inactive/frozen |
| certificateList | List\<TeacherCertificateDTO\> | 否 | 多张证书列表 |
| availableTimeList | List\<TeacherAvailableTimeDTO\> | 否 | 可预约时段列表 |

#### TeacherCertificateDTO 结构

| 字段 | 说明 |
|------|------|
| teacherCertificateId | （新增留空） |
| certificateType | 证书类型：学历/资格证/其他 |
| certificateName | 证书名称：如"剑桥TKT证书" |
| issuingAuthority | 颁发机构 |
| issueDate | 颁发日期 yyyy-MM-dd |
| certificateUrl | 图片URL（优先） |
| certificateBase64 | 图片Base64 |
| sortNo | 排序序号，小的在前 |

#### TeacherAvailableTimeDTO 结构

| 字段 | 说明 |
|------|------|
| teacherAvailableTimeId | （新增留空） |
| timeType | weekly（周模板）/ override（某日覆盖）/ holiday（节假日不可约） |
| dayOfWeek | 1-7 周一~周日（weekly用） |
| specificDate | 具体日期 yyyy-MM-dd（override/holiday用） |
| startTime / endTime | 时段HH:mm:ss |
| isAvailable | 1可约/0不可约 |

#### 成功响应 `Result<String>`：返回 teacherProfessionalId

---

### 9.2 - 9.5 其他接口

| 接口 | 方法 | 权限 | 说明 |
|------|------|------|------|
| `/teacher/professional/updateTeacherProfessionalInfo` | POST | 👨‍🏫+🔧 | 修改（含证书/时段全量替换：旧的删除+新的重插） |
| `/teacher/professional/deleteTeacherProfessionalInfo` | POST | 🔧 | 删除；请求体：`{teacherProfessionalId}` |
| `/teacher/professional/queryTeacherProfessionalInfo` | GET | 👤 | 查询单条；参数：teacherProfessionalId **或** teacherId |
| `/teacher/professional/listByPage` | GET | 🔧 | 分页查询（TeacherProfessionalQueryPage） |

`queryTeacherProfessionalInfo` 响应：`TeacherProfessionalDetailVO`（包含主表信息 + certificateList + availableTimeList）。

---

## 10. 教师发布信息模块 API

对应代码：[TeacherPublishedProfileController.java](file:///h:/2026/lesson-appointment/api/src/main/java/com/reservation/controller/TeacherPublishedProfileController.java)

---

### 10.1 状态说明

| 状态 | 说明 | 公开可见 |
|------|------|----------|
| draft | 草稿（编辑中） | ❌ |
| published | 已发布（对外分享） | ✅ |
| archived | 已归档（历史版本） | ❌ |

---

### 10.2 公开接口（白名单，无需登录）

#### 10.2.1 查询指定教师最新发布版本

| 属性 | 值 |
|------|-----|
| 接口路径 | `GET /teacher/published/latest-public` |
| 权限 | 🔓 公开 |

#### Query参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| teacherId | String | 是 | 教师ID |

#### 成功响应 `Result<TeacherPublishedProfile>`

返回该教师 **status=published** 中 createdTime 最新的一条记录。
其中 `staticHtml` 字段可直接作为完整HTML页面展示（内嵌图片Base64、字体、样式）。

---

#### 10.2.2 按ID查询已发布版本（固定分享链接用）

| 属性 | 值 |
|------|-----|
| 接口路径 | `GET /teacher/published/public-get` |
| 权限 | 🔓 公开 |

#### Query参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| profileId | String | 是 | 发布记录ID |

⚠️ 仅当该记录 `status=published` 时返回；draft/archived 返回404。

---

### 10.3 管理员接口

| 接口 | 方法 | 权限 | 说明 |
|------|------|------|------|
| `/teacher/published/list` | GET | 🔧 | 查询某教师所有发布记录（含draft/archived）；参数 teacherId |
| `/teacher/published/get` | GET | 🔧 | 按ID查单条（所有状态均可）；参数 profileId |
| `/teacher/published/save` | POST | 🔧 | **保存/发布**：status=published 时自动将该教师旧published批量置为archived |
| `/teacher/published/update` | POST | 🔧 | 仅更新title/status等，不触发归档逻辑 |
| `/teacher/published/delete` | POST | 🔧 | 软删除：将 status 改为 archived |

#### `save` 接口请求体 `TeacherPublishedProfileDTO` 关键字段

| 字段 | 类型 | 说明 |
|------|------|------|
| teacherId | String | 目标教师ID |
| title | String | 标题（如"李华老师2026年夏季版简介"） |
| status | String | draft / published / archived |
| fieldConfig | JSON | 字段勾选与排序：`[{key:"bioText",label:"简介",enabled:true,sort:1},...]` |
| styleConfig | JSON | 样式：`{fontFamily,fontSizePx,accentColor,bgColor,textAlign,enableHeader,enableFooter,headerText}` |
| draftData | JSON | 编辑时的数据快照（原始职业信息） |
| staticHtml | String | 生成的完整静态HTML（用于分享/下载） |

---

## 11. 时区换算模块 API

对应代码：[TimezoneCalcController.java](file:///h:/2026/lesson-appointment/api/src/main/java/com/reservation/controller/TimezoneCalcController.java)

---

### 11.1 时区转换

| 属性 | 值 |
|------|-----|
| 接口路径 | `POST /tz/switch` |
| 权限 | 👤 全角色 |
| Content-Type | application/json |

#### 请求体 `TzSwitchPO`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| dateTime | String | 是 | 源日期时间 `yyyy-MM-dd HH:mm:ss` |
| timeZone | String | 是 | 源时区（ZoneId格式） |
| switchToTimeZone | String | 是 | 目标时区 |

#### 请求示例（上海→多伦多）

```json
{
  "dateTime": "2026-09-01 20:00:00",
  "timeZone": "Asia/Shanghai",
  "switchToTimeZone": "America/Toronto"
}
```

#### 成功响应 `Result<TzSwitchVO>`

| 字段 | 类型 | 说明 |
|------|------|------|
| dateTime | String | 转换后的日期时间（目标时区） |
| timeZone | String | 目标时区（回显） |
| weekday | String | 目标时区下的星期中文名：星期一…星期日 |
| weekdayNumber | int | 周内序号：周一=1，周二=2 … 周日=7 |

#### 响应示例

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "dateTime": "2026-09-01 08:00:00",
    "timeZone": "America/Toronto",
    "weekday": "星期一",
    "weekdayNumber": 1
  }
}
```

**说明**：上海20:00 = 多伦多当天早上8:00（夏令时通常时差-12小时，冬令时-13小时，后端自动处理夏令时规则）。

---

## 12. 接口错误码汇总

| 场景 | code | 典型message |
|------|------|-------------|
| 登录账号不存在/密码错误 | 400 | 账号或密码错误 |
| 注册账号重复 | 400 | 该账号已注册，请登录或重置密码 |
| 账号状态：pending/frozen/inactive | 400 | 账号待审核/已冻结/已停用 |
| 参数校验失败（NotBlank/Size/Pattern） | 400 | 具体字段 + 原因 |
| Token缺失/格式错误/过期 | 401 | 未登录或登录已过期 |
| 无权限访问（如学生访问admin接口） | 403 | 无权限访问该资源 |
| 资源不存在（profileId非published） | 404 | 资源不存在 |
| 唯一键冲突（uk_phone/uk_email/uk_lang_level） | 400 | 邮箱/手机号/模板组合已存在 |
| 席位数不足仍预约 | 400 | 席位数不足 |
| 重复预约同排期同学生 | 400 | 该学生已预约此排期 |
| 教师越权操作他人课程/排期 | 403 | 无权限操作他人资源 |
| 服务器异常 | 500 | 服务器内部错误 |

---

*文档版本: v1.0.0 | 生成日期: 2026-08-18*
