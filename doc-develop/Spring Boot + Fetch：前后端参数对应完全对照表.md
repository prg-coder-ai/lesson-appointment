# Spring Boot \+ Fetch：前后端参数对应完全对照表

# SpringBoot \+ Fetch 前后端参数对应完全对照表

## 一、请求方式总览

|请求方式|常用场景|传参主流方案|后端接收注解|
|---|---|---|---|
|GET|查询、列表、详情|URL 拼接参数|`@RequestParam` / 实体接收|
|POST|新增、提交表单、复杂数据|JSON 结构体|`@RequestBody`|
|PUT|全量修改|JSON 结构体|`@RequestBody`|
|PATCH|局部修改|JSON / 表单|`@RequestBody`/`@RequestParam`|
|DELETE|删除|URL 参数 / JSON|`@RequestParam` / `@RequestBody`|

---

# 二、细分传参类型 \+ 前端 Fetch 写法 \+ 后端接收写法

## 1\. GET 请求

### 方式 1：普通拼接 URL 参数

**前端 Fetch**

```javascript
const courseId = 1001;
const status = 1;
fetch(`/api/schedule/get?courseId=${courseId}&status=${status}`)
  .then(res=>res.json())
```

**后端 Controller**

```java
@GetMapping("/get")
public Result getInfo(@RequestParam Long courseId, @RequestParam Integer status){
    // 业务逻辑
}
```

### 方式 2：URLSearchParams 规范拼接（推荐）

**前端**

```javascript
const params = new URLSearchParams({
    courseId:1001,
    page:1,
    size:10
})
fetch(`/api/schedule/page?${params}`)
```

**后端**

```java
@GetMapping("/page")
public Result pageList(@RequestParam Long courseId,
                       @RequestParam Integer page,
                       @RequestParam Integer size){
}
```

### 方式 3：GET 直接绑定实体类

**后端**

```java
@GetMapping("/query")
public Result query(ScheduleQuery query){
    // 实体字段名和参数名一致即可
}
// 实体
@Data
public class ScheduleQuery{
    private Long courseId;
    private Integer page;
    private Integer size;
}
```

**前端不变，依旧拼 URL 参数**

> 注意：**GET 请求 Fetch 不能携带 body**，带了也无效
> 
> 

---

## 2\. POST 请求

### 方式 1：application/json 传 JSON 对象（项目最常用）

**前端 Fetch**

```javascript
const formData = {
    startDate:"2026-05-20",
    startTime:"14:00",
    repeatType:"week",
    repeatDays:[1,2,3],
    timeZone:"Asia/Shanghai"
}
fetch("/api/schedule/save",{
    method:"POST",
    headers:{
        "Content-Type":"application/json"
    },
    body:JSON.stringify(formData)
}).then(res=>res.json())
```

**后端接收**

```java
@PostMapping("/save")
public Result save(@RequestBody ScheduleDTO dto){
    return Result.success();
}
```

### 方式 2：application/x\-www\-form\-urlencoded 表单键值对

**前端**

```javascript
const params = new URLSearchParams()
params.append("name","课程A")
params.append("sort",1)
fetch("/api/course/add",{
    method:"POST",
    body:params
})
```

**后端**

```java
@PostMapping("/add")
public Result add(@RequestParam String name,@RequestParam Integer sort){
}
```

### 方式 3：FormData 表单（含文件上传）

**前端**

```javascript
let form = new FormData()
form.append("title","排期标题")
form.append("file",fileFile) // 文件对象
fetch("/api/upload",{
    method:"POST",
    body:form
})
```

**后端**

```java
@PostMapping("/upload")
public Result upload(@RequestParam String title,
                    @RequestParam MultipartFile file){
}
```

---

## 3\. PUT 请求（全量更新）

统一使用 JSON 传参
**前端**

```javascript
const editData = {
    id:1,
    startDate:"2026-05-20",
    endDate:"2026-06-20"
}
fetch("/api/schedule/update",{
    method:"PUT",
    headers:{
        "Content-Type":"application/json"
    },
    body:JSON.stringify(editData)
})
```

**后端**

```java
@PutMapping("/update")
public Result update(@RequestBody ScheduleDTO dto){
}
```

---

## 4\. PATCH 请求（局部更新）

**前端**

```javascript
fetch("/api/schedule/patch",{
    method:"PATCH",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({id:1,status:2})
})
```

**后端**

```java
@PatchMapping("/patch")
public Result patchUpdate(@RequestBody Map<String,Object> map){
}
```

---

## 5\. DELETE 请求

### 写法 1：URL 路径传参（rest 风格）

**前端**

```javascript
const id = 10;
fetch(`/api/schedule/del/${id}`,{method:"DELETE"})
```

**后端**

```java
@DeleteMapping("/del/{id}")
public Result delete(@PathVariable Long id){
}
```

### 写法 2：URL 问号传参

**前端**

```javascript
fetch(`/api/schedule/remove?id=10`,{method:"DELETE"})
```

**后端**

```java
@DeleteMapping("/remove")
public Result remove(@RequestParam Long id){
}
```

### 写法 3：JSON 传参批量删除

**前端**

```javascript
fetch("/api/schedule/batchDel",{
    method:"DELETE",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({ids:[1,2,3]})
})
```

**后端**

```java
@DeleteMapping("/batchDel")
public Result batchDel(@RequestBody List<Long> ids){
}
```

---

# 三、请求头与 Content\-Type 严格对应表

|传参格式|Content\-Type|后端接收注解|
|---|---|---|
|URL 拼接参数|无|@RequestParam|
|JSON 对象|application/json|@RequestBody|
|普通表单键值对|application/x\-www\-form\-urlencoded|@RequestParam|
|表单含文件|multipart/form\-data|@RequestParam \+ MultipartFile|

---

# 四、高频踩坑对照表

1. **前端传 JSON 没写 Content\-Type:application/json**
→ 后端 @RequestBody 接收不到，报错 400

2. **前端忘记 JSON\.stringify \(\)**
→ 后端拿到 \[object Object\] 无法解析

3. **GET 请求写 body 传参**
→ 参数丢失，后端拿不到

4. **@RequestBody 接收普通表单参数**
→ 直接报错解析失败

5. **LocalDate/LocalDateTime 前后端格式不一致**
→ 日期反序列化报错，统一全局 Jackson 格式化即可

---

# 五、项目开发通用规范（直接沿用）

1. 查询列表、详情 → **GET \+ URL 参数 \+ @RequestParam**

2. 新增、复杂表单、排期提交 → **POST \+ JSON \+ @RequestBody**

3. 修改数据 → **PUT/PATCH \+ JSON**

4. 删除单条 → **DELETE 路径变量 @PathVariable**

5. 批量删除 → **DELETE \+ JSON 数组**

6. 文件上传统一使用 **FormData \+ POST**

> （注：文档部分内容可能由 AI 生成）
