# 学生端与教师端网页内容展示改进分析

> 生成时间：2026-10-26
> 范围：`frontend/` 网页端（纯静态 HTML + vanilla JS，无框架无打包器）
> 对比基准：`miniprogram/` 小程序端 + 后端已有接口

---

## 第一部分：学生端诊断与改进方案

### 1.1 现状概览

学生端核心页面 8 个，实现了**预约闭环**（选课→选排期→预订→我的预订→取消/请假），但内容展示密度低、与小程序存在功能差距。

| 页面 | 路径 | 用途 | 丰富度 |
|------|------|------|--------|
| 学生工作台 | `frontend/student.html` (767行) | 侧栏菜单+主内容区 | 中等 |
| 登录注册 | `frontend/login.html` (1531行) | 统一登录入口 | 较丰富 |
| 师资落地页 | `frontend/student-landing.html` (168行) | 教师卡片轮播 | 中等 |
| 预约深链路由 | `frontend/booking.html` (124行) | 按角色跳转 | 仅脚本 |
| 我的推广 | `frontend/promo.html` (163行) | 推广码+业绩 | 较丰富 |
| 协议政策 | `frontend/legal.html` (292行) | Markdown 渲染 | 较丰富 |
| 教师公开页 | `frontend/teacherPublishedProfile.html` (418行) | 教师介绍宿主 | 中等 |
| 首页路由 | `frontend/index.html` (331行) | 深链分发 | 仅脚本 |

**侧栏菜单**（`student.html:44-83`）：7 项启用，2 项注释（课程评价 `:71-78`、个人中心 `:75-78`，均为 mock 写死数据）。

### 1.2 核心短板

| # | 短板 | 证据 | 影响 |
|---|------|------|------|
| S1 | **课程卡片仅 3 字段**（名称/语言/难度），后端 `content`/`feature`/`classFee`/`classDuration`/`classForm` 全未展示 | `student-bookingCards.js:245-275`；`Course.java:33,37`、`CourseTemplate.java:22,24,26` | 选课缺乏决策依据 |
| S2 | **个人中心完全缺失**，菜单注释 + mock 数据 | `student.html:75-78` 注释；`:512-554` mock "张三" | 无归属感，无法管理资料 |
| S3 | **无课程详情页** | 小程序有 `booking-detail.wxml`，Web 无 | 卡片信息不足以支撑选课决策 |
| S4 | **课程评价未启用** | `student.html:71-78` 注释；`CourseEvaluation`/`CourseFeedback` 实体无 Controller | 无评价闭环 |
| S5 | **教师展示薄弱**，仅 landing 轮播 5 条 | `teacherCardCarousel.js:23-29` mock 兜底 | 无独立列表/搜索/筛选 |
| S6 | **剩余名额仅数字**，无进度条 | `student-bookingCards.js:841` | 可视化弱 |
| S7 | **日历固定 35 天**，无月份切换 | `student-bookingCards.js:1135` | 时间范围受限 |
| S8 | **预约用 alert**，无确认弹窗/结果页 | `student-bookingCards.js:1148` | 体验粗糙 |
| S9 | **筛选仅按名称**，无教师/语言/难度/价格维度 | `student-bookingCards.js` 筛选栏 | 无法精准找课 |
| S10 | **个人统计接口未用** | 后端 `/course/statistical/byMonth` 等 3 个接口闲置 | 无学习数据可视化 |
| S11 | **无加载骨架/空状态优化** | 空状态仅"暂无数据"四字 | 加载时白屏 |
| S12 | **图片资源匮乏**，仅 3 张 logo jpg | `frontend/images/` | 无课程封面/教师头像 |

### 1.3 后端已有但前端未利用的数据

| 字段/接口 | 后端位置 | 前端现状 |
|-----------|---------|---------|
| `Course.content`（教学内容） | `entity/Course.java:33` | 未展示 |
| `Course.feature`（课程特色） | `entity/Course.java:37` | 未展示 |
| `CourseTemplate.classFee`（课时费） | `entity/CourseTemplate.java:22` | 未展示 |
| `CourseTemplate.classDuration`（课时时长） | `:24` | 未展示 |
| `CourseTemplate.classForm`（授课形式） | `:26` | 未展示 |
| `GET /schedule/listByTeacher` | `ScheduleController.java:311` | 未调用 |
| `GET /course/statistical/byMonth` | `CourseController.java:234` | 未调用 |
| `GET /course/booking/statistical/byMonth` | `BookingController.java:232` | 未调用 |
| `GET /course/appointment/statistical/byMonth` | `AppointmentController.java:214` | 未调用 |

### 1.4 小程序有而 Web 端没有的功能

1. 课程详情页（`booking-detail`）— hero+教师条+课程介绍+可预约时段
2. 独立教师列表页（`teacher-list`）— 完整列表而非轮播
3. 个人中心页（`pages/mine`）— 账号/改密/微信绑定/切换租户
4. 微信绑定/解绑、切换租户、分享邀请
5. 课程卡内联展开排期（一页完成选课+预订）

### 1.5 学生端改进方案

#### P0-S：纯前端改动，零后端改动

| 编号 | 改动 | 文件:行号 | 改法 |
|------|------|-----------|------|
| P0-S1 | **课程卡片丰富化** | `student-bookingCards.js:245-275` | 卡片补渲染 content（截 2 行）、feature（标签 chip）、classFee/classDuration/classForm（图标行）、名额进度条。数据已在 `GET /course/page` 返回 |
| P0-S2 | **剩余名额进度条** | `student-bookingCards.js:841` | 数字→CSS 进度条 `███░░░ 3/10`，满额变红 |
| P0-S3 | **预约确认弹窗** | `student-bookingCards.js:1148` | alert→Modal 确认（显示课程/时间/教师/价格）→Toast 结果 |
| P0-S4 | **加载骨架+空状态** | `student-bookingCards.js` 渲染前 | Skeleton 灰块闪烁占位 + 空状态引导文案 |
| P0-S5 | **筛选维度扩展** | `student-bookingCards.js` 筛选栏 | 加语言/难度/授课形式下拉，前端本地过滤 |

#### P1-S：对接已有后端接口

| 编号 | 改动 | 文件 | 对接接口 |
|------|------|------|---------|
| P1-S1 | **启用个人中心** | 取消 `student.html:75-78` 注释 | `/user/name/{userId}`、`/course/booking/list`、`/course/appointment/listByPage` |
| P1-S2 | **新增课程详情页** | 新建 `course-detail.html` | `/course/{courseId}` + `/schedule/selectByCourseId/{cid}` + `/teacher/published/public-get` |
| P1-S3 | **新增独立教师列表页** | 新建 `teacher-list.html` | `/teacher/published/public-list`（已在 `teacherCardCarousel.js:54` 用） |
| P1-S4 | **日历月份切换** | `student-bookingCards.js:1135` | 上/下月按钮 + 当月课次高亮 + 点击展开 |

#### P2-S：需后端新增接口

| 编号 | 改动 | 后端新增 | 前端对接 |
|------|------|---------|---------|
| P2-S1 | **启用课程评价** | `CourseEvaluationController`/`Service`/`Mapper` | 取消 `student.html:71-78` 注释，已上完课次显示"去评价" |
| P2-S2 | **个人学习统计** | 无需新增（接口已有） | 个人中心内加统计 tab，调 3 个 statistical 接口 |
| P2-S3 | **微信绑定/切换租户** | 无需新增（`/auth/wechat-status` 等已有） | 个人中心内加绑定状态+按钮 |

---

## 第二部分：教师端诊断与改进方案

### 2.1 现状概览

教师端核心页面 4 个，**课程和排期完全只读**，教师无法在网页端进行任何写操作。

| 页面 | 路径 | 用途 | 丰富度 |
|------|------|------|--------|
| 教师工作台 | `frontend/teacher.html` (664行) | 侧栏菜单+今日课程/我的课程/预订管理 | 中等 |
| 职业信息维护 | `frontend/teacherInfo.html` (420行) | 表单+发布预览+样式自定义 | **高，但仅 admin 可访问** |
| 教师公开页 | `frontend/teacherPublishedProfile.html` (418行) | 免登录查看教师介绍 | 中等 |
| 推广业绩 | `frontend/promo.html` | 与学生/admin 共用 | 中等 |

**侧栏菜单**（`teacher.html:46-92`）：6 项启用，3 项注释（课程通知 `:76-79`、学生评价 `:82-85`、个人中心 `:87-90`，后两项为 mock 数据）。

### 2.2 核心短板

| # | 短板 | 证据 | 影响 |
|---|------|------|------|
| T1 | **🔴 教师无法维护职业信息** | `teacherInfo.html:396` 拒绝 `role !== 'admin'`；后端 `checkTeacherSelfOrAdmin` 已支持教师本人 | 必须找管理员代劳 |
| T2 | **🔴 教师无法创建/编辑/删除排期** | 排期详情全 `readonly`/`nofocus`（`teacher.html:286-364`）；"增加排期"按钮注释，函数体 `alert("tbd")`（`teacher-courseAndScheduleBrowserCards.js:146-148`） | 排期管理依赖管理员或小程序 |
| T3 | **🟠 教师无法创建/编辑课程** | 后端 `/course/insert`/`/course/update` 已存在，前端未调用 | 课程管理依赖管理员 |
| T4 | **🟠 学生评价是 mock** | `teacher.html:487-510` hardcoded 张三/李四评价 | 无真实评价数据 |
| T5 | **🟠 个人中心是 mock** | `teacher.html:512-554` hardcoded "李华/5年/英语口语" | 无个人资料管理 |
| T6 | **🟡 预订管理复用学生端 JS** | `teacher.html:579` 引入 `student-bookingBrowserCards.js` | 未针对教师视角优化 |
| T7 | **🟡 后端大量接口闲置** | 教师职业信息 CRUD 7 个、教师发布 8 个接口，网页端教师 0 调用 | 接口浪费 |
| T8 | **🟡 TBD 代码残留** | `teacher-courseAndScheduleBrowserCards.js:445` `//TBD :增加排期、删除排期` | 明知缺失未实现 |

### 2.3 后端已有但网页端教师未利用的接口

| 接口 | 用途 | 前端调用 |
|------|------|---------|
| `POST /teacher/professional/addTeacherProfessionalInfo` | 新增职业信息 | ✗ 仅 admin |
| `POST /teacher/professional/updateTeacherProfessionalInfo` | 修改职业信息 | ✗ |
| `GET /teacher/professional/queryTeacherProfessionalInfo` | 查询职业信息 | ✗ |
| `POST /teacher/professional/upload` | 上传教师图片 | ✗ |
| `GET /teacher/published/list` | 我的发布历史 | ✗ 仅 admin |
| `POST /teacher/published/save` | 保存草稿/发布 | ✗（后端已支持教师本人） |
| `POST /course/insert` / `POST /course/update` | 课程写操作 | ✗ |
| `POST /schedule/create` / `POST /schedule/update` / `DELETE /schedule/delete/{id}` | 排期写操作 | ✗ |
| `POST /schedule/updateStatus` | 排期冻结/发布 | ✗ |

### 2.4 小程序有而 Web 端没有的功能

| 功能 | 小程序 | Web 端 |
|------|--------|--------|
| 排期编辑/创建页 | ✓ `schedule-edit.wxml`（102行）+ `schedule-edit.js`（398行） | ✗ 缺失 |
| 排期冻结/发布/删除 | ✓ `schedule.wxml:33-37` 按钮 | ✗ 全 readonly |
| 教师简介只读查看 | ✓ `profile.wxml` | ✗ 无入口 |
| 预订管理教师视角 | ✓ 按排期合并+学生列表 | △ 复用学生端 JS |

### 2.5 教师端改进方案

#### P0-T：高优先级，解锁教师核心能力

| 编号 | 改动 | 文件:行号 | 改法 |
|------|------|-----------|------|
| P0-T1 | **开放教师职业信息维护入口** | `teacherInfo.html:396` | 移除 `role !== 'admin'` 拒绝，改为允许 `teacher` 角色访问自己的信息（后端 `checkTeacherSelfOrAdmin` 已支持）；`teacher.html` 加"我的职业信息"菜单项 |
| P0-T2 | **实现排期创建/编辑** | `teacher-courseAndScheduleBrowserCards.js:146-148` | 实现 `AddScheduleforTheCourse`，参照小程序 `schedule-edit.js` 或 `admin-schedule.js`，对接 `POST /schedule/create`、`POST /schedule/update` |
| P0-T3 | **排期详情去 readonly** | `teacher.html:286-364` | 去掉 `readonly`/`nofocus` class，加"编辑/保存"按钮，对接 `POST /schedule/update` |
| P0-T4 | **排期删除/状态切换** | `teacher-courseAndScheduleBrowserCards.js` | 加删除按钮（`DELETE /schedule/delete/{id}`）+ 冻结/发布按钮（`POST /schedule/updateStatus`） |

#### P1-T：中优先级

| 编号 | 改动 | 文件 | 改法 |
|------|------|------|------|
| P1-T1 | **移除 mock 评价/个人中心** | `teacher.html:487-554` | 删除 hardcoded case 分支，接入真实接口或彻底移除菜单 |
| P1-T2 | **教师视角预订管理** | `teacher.html:579` | 不复用学生端 JS，改为按排期聚合+学生列表视图（参考小程序 `booking.wxml`） |
| P1-T3 | **课程编辑入口**（如设计允许） | `teacher-courseAndScheduleBrowserCards.js:131-138` | "查看排期"旁加"编辑课程"按钮，对接 `/course/update` |

#### P2-T：低优先级

| 编号 | 改动 | 说明 |
|------|------|------|
| P2-T1 | 清理 TBD 残留 | 删除 `teacher-courseAndScheduleBrowserCards.js:445` 注释、`:54` TBD 注释 |
| P2-T2 | 课程通知菜单 | 取消 `teacher.html:76-79` 注释，对接今日课程筛选 |

---

## 第三部分：综合优先级排序

### 按 ROI（收益/成本）排序的执行路线图

| 优先级 | 编号 | 改动 | 后端改动 | 收益 |
|--------|------|------|---------|------|
| **🔴 立即** | P0-S1 | 学生课程卡片丰富化（+5 字段+进度条） | 零 | 信息密度翻倍，选课体验立即改善 |
| **🔴 立即** | P0-T1 | 教师职业信息维护入口开放 | 零（后端已支持） | 教师可自主维护简历，摆脱管理员代劳 |
| **🔴 立即** | P0-T2+T3+T4 | 教师排期创建/编辑/删除/状态切换 | 零（接口已有） | 教师网页端具备排期管理能力，对齐小程序 |
| **🟠 短期** | P0-S3 | 学生预约确认弹窗替代 alert | 零 | 预约体验专业化 |
| **🟠 短期** | P0-S5 | 学生筛选维度扩展 | 零 | 精准找课 |
| **🟠 短期** | P1-S1 | 学生个人中心启用 | 零（接口已有） | 补齐小程序功能差距 |
| **🟠 短期** | P1-S2 | 学生课程详情页 | 零（接口已有） | 选课决策依据 |
| **🟠 短期** | P1-T1 | 教师移除 mock 评价/个人中心 | 零 | 清理假数据 |
| **🟡 中期** | P1-S3 | 学生独立教师列表页 | 零（接口已有） | 师资浏览体验 |
| **🟡 中期** | P1-S4 | 学生日历月份切换 | 零 | 时间范围灵活 |
| **🟡 中期** | P1-T2 | 教师视角预订管理 | 零 | 教师效率提升 |
| **🟢 远期** | P2-S1 | 学生课程评价功能 | 新增 Controller | 评价闭环 |
| **🟢 远期** | P2-S2 | 学生个人学习统计 | 零（接口已有） | 学习数据可视化 |
| **🟢 远期** | P2-S3 | 学生微信绑定/切换租户 | 零（接口已有） | 账号管理 |

### 分阶段实施建议

**第 1 阶段（零后端改动，纯前端）**：
- P0-S1（课程卡片丰富化）+ P0-S3（确认弹窗）+ P0-S5（筛选扩展）
- P0-T1（教师信息入口）+ P0-T2/T3/T4（排期管理）
- P1-S1（学生个人中心）+ P1-S2（课程详情页）
- P1-T1（移除 mock）

**第 2 阶段（对接已有接口）**：
- P1-S3（教师列表页）+ P1-S4（日历增强）
- P1-T2（教师视角预订）+ P1-T3（课程编辑入口）
- P2-S2（学习统计）+ P2-S3（微信绑定）

**第 3 阶段（需后端新增）**：
- P2-S1（课程评价：新增 CourseEvaluationController/Service/Mapper）

---

## 附录：技术栈约束

- 前端：纯静态 HTML + vanilla JS，无框架无打包器（`frontend/readme.md:10`）
- 样式：`theme.css`（设计 Token）+ `base.css`（共享骨架）+ `student.css`/`teacher.css`，紫色主题 `#722ed1`
- 响应式：768px/1024px 双断点
- 后端：Spring Boot 3.3.5 + Java 17 + MyBatis Plus + Jakarta
- 部署：微信云托管，Dockerfile `eclipse-temurin:17-jre-jammy`
- 约束：已用 `record` 关键字 + jakarta 命名空间，无法降级 Java 8 / Spring Boot 2.x