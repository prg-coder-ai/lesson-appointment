# 以 \`course\` 课程表为例的全链路分页实现梳理

### 以 `course` 课程表为例的全链路分页实现梳理

完全适配你当前 **Spring Boot \+ MyBatis\-Plus \+ 原生 JS 前端** 的技术栈，从数据库表、后端分层（Controller/Service/Mapper）到前端页面渲染，全程对齐你现有管理端的动态页面结构，可直接替换修改。

---

## 一、前置前提

1. 已配置 MyBatis\-Plus 分页插件（`MybatisPlusInterceptor`），如果未配置可参考前文分页配置类；

2. 已封装通用分页基类 `PageQuery`（分页入参）、`PageResult`（分页出参），所有列表复用统一结构；

3. 前端管理端采用「侧边菜单 \+ 动态内容区」结构，课程列表渲染到 `#dynamic-content-center` 容器中。

---

## 二、后端完整实现（course 表全链路）

### 1\. 数据库表结构

```sql
CREATE TABLE `course` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '课程ID',
  `course_name` varchar(100) NOT NULL COMMENT '课程名称',
  `language_type` varchar(32) NOT NULL COMMENT '语言类型：英语/日语/韩语等',
  `level` varchar(32) NOT NULL COMMENT '难度等级：入门/进阶/高级',
  `course_type` varchar(32) DEFAULT 'one2one' COMMENT '课程形式：one2one一对一/small小班课',
  `price` decimal(10,2) NOT NULL COMMENT '课时费（元）',
  `duration` int NOT NULL COMMENT '课程时长（分钟）',
  `teacher_id` bigint NOT NULL COMMENT '授课教师ID',
  `description` varchar(500) DEFAULT '' COMMENT '课程详情/特色',
  `status` tinyint DEFAULT 1 COMMENT '状态：0禁用 1启用',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_teacher` (`teacher_id`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课程表';
```

### 2\. 实体类（Entity）

```java
// entity/Course.java
@Data
@TableName("course")
public class Course {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String courseName;
    private String languageType;
    private String level;
    private String courseType;
    private BigDecimal price;
    private Integer duration;
    private Long teacherId;
    private String description;
    private Integer status;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
```

### 3\. 分页查询入参（Query）

继承通用分页基类，扩展课程专属筛选条件

```java
// query/CourseQuery.java
@Data
public class CourseQuery extends PageQuery {
    private String courseName;    // 课程名称（模糊搜索）
    private String languageType;  // 语言类型（精准筛选）
    private Integer status;       // 状态（启用/禁用）
    private Long teacherId;       // 授课教师ID
}
```

### 4\. Mapper 层

继承 MyBatis\-Plus `BaseMapper`，自动拥有基础 CRUD 和分页能力，无需手写 SQL

```java
// mapper/CourseMapper.java
@Mapper
public interface CourseMapper extends BaseMapper<Course> {
    // 复杂多表查询时再手写SQL，单表分页直接用自带selectPage
}
```

### 5\. Service 层

#### 接口定义

```java
// service/CourseService.java
public interface CourseService extends IService<Course> {
    /**
     * 分页查询课程列表
     */
    PageResult<CourseVO> getCoursePage(CourseQuery query);
}
```

#### 实现类（核心分页逻辑）

```java
// service/impl/CourseServiceImpl.java
@Service
public class CourseServiceImpl extends ServiceImpl<CourseMapper, Course> implements CourseService {

    @Override
    public PageResult<CourseVO> getCoursePage(CourseQuery query) {
        // 1. 构建分页对象：当前页 + 每页条数
        Page<Course> page = new Page<>(query.getPageNum(), query.getPageSize());

        // 2. 构建查询条件（动态拼接）
        LambdaQueryWrapper<Course> wrapper = Wrappers.lambdaQuery();
        // 课程名称模糊搜索
        if (StrUtil.isNotBlank(query.getCourseName())) {
            wrapper.like(Course::getCourseName, query.getCourseName());
        }
        // 语言类型精准筛选
        if (StrUtil.isNotBlank(query.getLanguageType())) {
            wrapper.eq(Course::getLanguageType, query.getLanguageType());
        }
        // 状态筛选
        if (query.getStatus() != null) {
            wrapper.eq(Course::getStatus, query.getStatus());
        }
        // 按创建时间倒序，最新的在前
        wrapper.orderByDesc(Course::getCreateTime);

        // 3. 执行分页查询（自动执行 count统计 + 分页数据两条SQL）
        Page<Course> resultPage = this.page(page, wrapper);

        // 4. 实体转VO，返回给前端（简单场景可直接返回Course实体）
        List<CourseVO> voList = BeanUtil.copyToList(resultPage.getRecords(), CourseVO.class);
        return PageResult.of(resultPage).setRows(voList);
    }
}
```

> 补充：`CourseVO` 为视图对象，可按需扩展字段（如教师姓名，关联查询后填充），纯单表场景可直接返回 `Course` 实体。
> 
> 

### 6\. Controller 层

对外提供接口，和前端交互

```java
// controller/CourseController.java
@RestController
@RequestMapping("/api/course")
public class CourseController {

    @Autowired
    private CourseService courseService;

    /**
     * 分页查询课程列表
     */
    @GetMapping("/page")
    public Result<PageResult<CourseVO>> getCoursePage(CourseQuery query) {
        return Result.success(courseService.getCoursePage(query));
    }

    /**
     * 新增课程
     */
    @PostMapping
    public Result<Void> addCourse(@RequestBody Course course) {
        courseService.save(course);
        return Result.success();
    }

    /**
     * 编辑课程
     */
    @PutMapping
    public Result<Void> updateCourse(@RequestBody Course course) {
        courseService.updateById(course);
        return Result.success();
    }

    /**
     * 删除课程
     */
    @DeleteMapping("/{id}")
    public Result<Void> deleteCourse(@PathVariable Long id) {
        courseService.removeById(id);
        return Result.success();
    }
}
```

---

## 三、前端完整实现（管理端课程列表）

完全贴合你现有 `admin.html` 的动态渲染逻辑，直接放入「课程列表」菜单对应的内容渲染函数中即可。

### 1\. 页面整体结构

课程列表页 = 筛选栏 \+ 操作栏 \+ 数据表格 \+ 分页栏，全部动态渲染到 `#dynamic-content-center` 容器。

### 2\. 核心 JS 代码

#### ① 全局分页状态（脚本顶部定义）

```javascript
// 课程分页状态
const coursePagination = {
  pageNum: 1,
  pageSize: 10,
  total: 0,
  totalPages: 0
};
```

#### ② 课程列表页面渲染入口

放在你现有 `loadAdminPageContent` 函数的 `case '课程列表'` 分支中：

```javascript
case '课程列表':
  dynamicContentCenter.innerHTML = `
    <div class="card">
      <!-- 筛选+操作栏 -->
      <div class="card-header">
        <div class="card-title"><i class="fa fa-book-open"></i> 课程列表</div>
        <button class="btn btn-primary" onclick="openAddCourseModal()">
          <i class="fa fa-plus"></i> 添加课程
        </button>
      </div>
      
      <!-- 筛选条件 -->
      <div class="filter-bar">
        <div class="filter-item">
          <label>课程名称：</label>
          <input type="text" id="course-name-input" placeholder="请输入课程名称">
        </div>
        <div class="filter-item">
          <label>语言类型：</label>
          <select id="language-select">
            <option value="">全部</option>
            <option value="英语">英语</option>
            <option value="日语">日语</option>
            <option value="韩语">韩语</option>
          </select>
        </div>
        <div class="filter-item">
          <label>状态：</label>
          <select id="course-status-select">
            <option value="">全部</option>
            <option value="1">启用</option>
            <option value="0">禁用</option>
          </select>
        </div>
        <button class="btn btn-default" onclick="searchCourse()">
          <i class="fa fa-search"></i> 搜索
        </button>
        <button class="btn btn-default" onclick="resetCourseFilter()">
          <i class="fa fa-redo"></i> 重置
        </button>
      </div>

      <!-- 数据表格 -->
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>课程ID</th>
              <th>课程名称</th>
              <th>语言类型</th>
              <th>难度等级</th>
              <th>课时费</th>
              <th>时长</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody id="course-table-body">
            <!-- 数据由JS动态渲染 -->
          </tbody>
        </table>
      </div>

      <!-- 分页栏 -->
      <div class="pagination-bar">
        <div class="pagination-info">
          共 <span id="course-total">0</span> 条记录，每页 
          <select id="course-page-size" onchange="changeCoursePageSize()">
            <option value="10" selected>10</option>
            <option value="20">20</option>
            <option value="50">50</option>
          </select> 条
        </div>
        <div class="pagination-btns" id="course-pagination-btns"></div>
      </div>
    </div>
  `;
  
  // 页面渲染完成后，加载第一页数据
  loadCourseList();
  break;
```

#### ③ 数据加载与表格渲染

```javascript
// 加载课程列表数据
async function loadCourseList() {
  // 拼接请求参数
  const params = new URLSearchParams({
    pageNum: coursePagination.pageNum,
    pageSize: coursePagination.pageSize,
    courseName: document.getElementById('course-name-input').value.trim(),
    languageType: document.getElementById('language-select').value,
    status: document.getElementById('course-status-select').value
  });

  try {
    const res = await fetch(`/api/course/page?${params.toString()}`, {
      headers: { Authorization: localStorage.getItem('token') }
    });
    const result = await res.json();
    
    if (result.code === 200) {
      const pageData = result.data;
      // 更新分页状态
      coursePagination.total = pageData.total;
      coursePagination.totalPages = pageData.totalPages;
      
      // 渲染表格
      renderCourseTable(pageData.rows);
      // 渲染分页栏
      renderCoursePagination();
    }
  } catch (error) {
    console.error('加载课程列表失败：', error);
  }
}

// 渲染课程表格
function renderCourseTable(list) {
  const tbody = document.getElementById('course-table-body');
  
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#999;padding:40px 0;">暂无数据</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(item => `
    <tr>
      <td>${item.id}</td>
      <td>${item.courseName}</td>
      <td>${item.languageType}</td>
      <td>${item.level}</td>
      <td>¥${item.price}</td>
      <td>${item.duration}分钟</td>
      <td style="color: ${item.status === 1 ? '#52c41a' : '#f5222d'};">
        ${item.status === 1 ? '启用' : '禁用'}
      </td>
      <td>
        <button class="btn btn-default" onclick="editCourse(${item.id})">
          <i class="fa fa-edit"></i> 编辑
        </button>
        <button class="btn btn-danger" onclick="deleteCourse(${item.id})">
          <i class="fa fa-trash"></i> 删除
        </button>
      </td>
    </tr>
  `).join('');
}
```

#### ④ 分页栏渲染与交互

```javascript
// 渲染分页按钮
function renderCoursePagination() {
  const btnContainer = document.getElementById('course-pagination-btns');
  document.getElementById('course-total').textContent = coursePagination.total;
  
  if (coursePagination.total === 0) {
    btnContainer.innerHTML = '<span style="color:#999;">暂无数据</span>';
    return;
  }

  let html = '';
  // 上一页
  html += `<button class="pagination-btn" 
            onclick="changeCoursePage(${coursePagination.pageNum - 1})"
            ${coursePagination.pageNum === 1 ? 'disabled' : ''}>
            上一页
          </button>`;

  // 页码（显示前后3页，超出省略）
  const start = Math.max(1, coursePagination.pageNum - 3);
  const end = Math.min(coursePagination.totalPages, coursePagination.pageNum + 3);
  
  if (start > 1) {
    html += `<button class="pagination-btn" onclick="changeCoursePage(1)">1</button>`;
    if (start > 2) html += '<span style="padding:0 4px;">...</span>';
  }

  for (let i = start; i <= end; i++) {
    html += `<button class="pagination-btn ${i === coursePagination.pageNum ? 'active' : ''}" 
              onclick="changeCoursePage(${i})">${i}</button>`;
  }

  if (end < coursePagination.totalPages) {
    if (end < coursePagination.totalPages - 1) html += '<span style="padding:0 4px;">...</span>';
    html += `<button class="pagination-btn" onclick="changeCoursePage(${coursePagination.totalPages})">${coursePagination.totalPages}</button>`;
  }

  // 下一页
  html += `<button class="pagination-btn" 
            onclick="changeCoursePage(${coursePagination.pageNum + 1})"
            ${coursePagination.pageNum === coursePagination.totalPages ? 'disabled' : ''}>
            下一页
          </button>`;

  btnContainer.innerHTML = html;
}

// 切换页码
function changeCoursePage(targetPage) {
  if (targetPage < 1 || targetPage > coursePagination.totalPages) return;
  coursePagination.pageNum = targetPage;
  loadCourseList();
  // 滚动到卡片顶部
  document.querySelector('.card').scrollIntoView({ behavior: 'smooth' });
}

// 切换每页条数
function changeCoursePageSize() {
  const select = document.getElementById('course-page-size');
  coursePagination.pageSize = Number(select.value);
  coursePagination.pageNum = 1; // 切换条数后重置为第1页
  loadCourseList();
}
```

#### ⑤ 筛选与操作联动

```javascript
// 搜索按钮：重置为第1页再查询
function searchCourse() {
  coursePagination.pageNum = 1;
  loadCourseList();
}

// 重置筛选条件
function resetCourseFilter() {
  document.getElementById('course-name-input').value = '';
  document.getElementById('language-select').value = '';
  document.getElementById('course-status-select').value = '';
  coursePagination.pageNum = 1;
  loadCourseList();
}

// 删除课程（操作后刷新当前页）
async function deleteCourse(id) {
  if (!confirm('确定要删除该课程吗？')) return;
  
  try {
    const res = await fetch(`/api/course/${id}`, { method: 'DELETE' });
    const result = await res.json();
    
    if (result.code === 200) {
      alert('删除成功');
      // 删除后判断当前页是否还有数据，无数据则跳上一页
      const currentPageData = document.querySelectorAll('#course-table-body tr').length;
      if (currentPageData === 1 && coursePagination.pageNum > 1) {
        coursePagination.pageNum--;
      }
      loadCourseList();
    }
  } catch (error) {
    console.error('删除失败：', error);
  }
}
```

---

## 四、完整调用链路梳理

```Plain Text
用户操作（点击页码/搜索/删除）
    ↓
前端JS更新分页状态/筛选参数 → 拼接请求参数
    ↓
fetch 请求后端接口 /api/course/page
    ↓
Controller 接收 CourseQuery 参数 → 调用Service
    ↓
Service 构建查询条件 + 分页对象 → 调用Mapper.selectPage
    ↓
MyBatis-Plus 自动执行两条SQL：
  1. SELECT COUNT(*) FROM course WHERE 筛选条件
  2. SELECT * FROM course WHERE 筛选条件 ORDER BY create_time DESC LIMIT ?, ?
    ↓
Service 封装 PageResult 返回给前端
    ↓
前端更新分页状态 → 重新渲染表格 + 分页栏
```

---

## 五、修改与扩展注意事项

1. **其他列表复用**：教师、学生、预约等列表，只需替换「实体类、查询参数、接口地址、表格字段」四部分，分页逻辑完全复用；

2. **多表关联查询**：如果需要展示教师姓名等关联字段，在 Service 层关联查询后填充到 VO 即可，分页主逻辑不变；

3. **参数名统一**：所有列表统一用 `pageNum/pageSize`，前端无需为每个列表写不同的分页解析逻辑；

4. **异常兜底**：接口请求失败时，表格显示「加载失败，请重试」，避免页面空白；

5. **新增 / 编辑后刷新**：新增课程成功后调用 `coursePagination.pageNum = 1; loadCourseList();`，编辑成功后直接调用 `loadCourseList()` 刷新当前页。

> （注：部分内容可能由 AI 生成）
