# student-bookingCards.js 改造为 HTML + JS 方案

- 日期：2026-09-28
- 对象：`frontend/js/student-bookingCards.js`（1509 行 / 85 KB）
- 目标：结构回到 HTML，JS 只负责**取数 + 填值 + 绑事件**
- 状态：**仅分析，未改代码**

---

## 0. 结论

**可以做，而且这个文件比 `admin-overall.js` 更适合动手**——主骨架 159 行里只有 **2 处插值**，本质是一份"伪模板"。

但动工前必须先处理一个**已经存在的地雷**：本文件与 `student-bookingBrowserCards.js` 有 **5 个 ID 重名**（`calendar` / `course-name-input` / `resultBody` / `resultPanelCalendar` / `resultPanelList`），另有 `admin-AppointmentNotes.js` 也用 `course-name-input`。

这个地雷直接决定选型：

| 方案 | 是否引爆 ID 冲突 | 结论 |
|---|---|---|
| A. `<template>` + clone | **不引爆**（同一时刻只有一份进 DOM） | ✅ 推荐 |
| B. 静态 `<section>` + 显隐切换 | **立刻引爆**（多页共存，`getElementById` 取到先出现的那个） | ⚠ 需先做 ID 前缀化 |

---

## 1. 现状取证：四类 HTML 生成点

| 类别 | 位置 | 规模 | 性质 | 处置 |
|---|---|---|---|---|
| **① 页面主骨架** | 第 98–256 行（`html += \`` × 2 段） | 159 行，**仅 2 处插值** | 实质是静态 HTML | **搬进 `student.html`** |
| **② 行级动态结构** | `renderCourseCards` 337–400、`renderResult` 1152–1162、`renderCalendar` 1165–1209 | 3 处 | 已用 DOM API，但结构与样式硬编码在 JS（`cssText`） | 改 `<template>` clone |
| **③ 小片段占位** | `resetScheduleSelect` 806、908、空态 342 | 4 处（各 1 行） | 单行字符串 | 保留（不值得抽象） |
| **④ 已是目标形态** | `resetScheduleInfoPanel` 744–800、`renderStudentBookingStatus` 1127–1149、`switchResultTab` 1212–1219 | 3 个函数 | 纯 `getElementById` + `value` / `hidden` | **不动，是榜样** |

第 ④ 类是本次分析最有价值的发现：**同一个文件里已经存在两种范式**——"排期信息面板"的**清空**走 DOM API（744–800），"构建"却走字符串（110–256）。改造成本因此集中在一处，而不是全文件重写。

### 1.1 关键量化（主骨架第 98–256 行）

| 指标 | 数值 |
|---|---|
| 行数 | 159 |
| `${}` 插值 | **2 处**：`${getPagebar()}`（第 107 行）、`style="display:${userTimeZoneDisplay};"`（第 157 行） |
| 内联 `onclick` | 10 个（**全文件仅这 10 个**） |
| `data-term` | 3 处（`course`×2、`teacher`×1） |
| 定义的 ID | 34 个 |

### 1.2 全文件其他指标

- `getElementById` **76 处**
- `addEventListener` **0 处**
- 第 **723–737 行**：15 行"人工注册表"，把 12 个块作用域函数逐个挂到 `window`

```js
window.previewSchedule = previewSchedule;
window.displaySchedule = displaySchedule;
window.submitBooking = submitBooking;
// ... 共 12 个
```

**这段注册表存在的唯一理由，就是让内联 `onclick` 能从全局找到它们**——因为函数定义在 `renderStudentBookingCards()` 的块作用域内。内联事件与块作用域互为因果，改造后可以整段删除。

---

## 2. 推荐方案：A′ 混合式（三步）

### 步骤 1：主骨架外迁（159 行 → `<template>`）

在 `student.html` 的 `#dynamic-content-center` **之后**新增：

```html
<template id="tpl-student-booking">
  <div class="card">
    <div class="card-title"><i class="fa fa-book"></i> <span data-term="course">课程</span>选择</div>
    <div class="filter-form" ...>
      <input type="text" id="course-name-input" placeholder="搜索课程名称" ...>
      <button class="btn" data-action="search-course"><i class="fa fa-search"></i> 搜索</button>
      <button class="btn btn-default" data-action="reset-course-filter"><i class="fa fa-redo"></i> 重置</button>
    </div>
    <div id="courseCardList" ...></div>
    <div id="coursePagebar"></div>          <!-- 取代 ${getPagebar()} -->
  </div>
  <!-- ...其余 140 余行原样搬运... -->
  <div class="schedule-column" id="rightBlock" hidden>   <!-- 取代 display:${userTimeZoneDisplay} -->
  <!-- ... -->
</template>
```

两处插值的具体处置：

| 原写法 | 改法 | 理由 |
|---|---|---|
| `${getPagebar()}` | 静态占位 `<div id="coursePagebar"></div>`，JS 填 `innerHTML = getPagebar()` | `getPagebar` 定义在 `js/public/pagefoot.js:160`，被 8+ 模块共用，**不属本次改造范围** |
| `style="display:${userTimeZoneDisplay};"` | `hidden` 属性，JS 切 `el.hidden = ...` | 去掉最后一处插值，模板达成"零 `${}`" |

> 改完主骨架里的 `${}` 数量 = **0**，这是"结构已完全静态化"的客观判据。

### 步骤 2：JS 侧改为 clone + 绑事件

```js
async function renderStudentBookingCards() {
    const tpl = document.getElementById('tpl-student-booking');
    if (!tpl || !dynamicContentCenter) return;

    // 1) 注入结构（等价于原来的 innerHTML = html）
    dynamicContentCenter.replaceChildren(tpl.content.cloneNode(true));

    // 2) 术语替换：必须在 clone 之后
    if (typeof applyTerms === 'function') applyTerms(dynamicContentCenter);

    // 3) 默认结束日期 = 今天 + 30 天（原第 260–269 行，保持位置）
    initDefaultEndDate();

    // 4) 取数
    await loadAndRenderCourse_student();

    // 5) 深链处理（原第 273–282 行，位置不能挪）
    if (window.pendingDeepLink) { /* ... */ }

    // 6) 事件绑定 —— 取代 10 个内联 onclick + 删除 723–737 的 window 注册表
    bindStudentBookingEvents();

    // ...块内函数定义...
}

function bindStudentBookingEvents() {
    document.querySelector('[data-action="search-course"]').addEventListener('click', localsearchCourse);
    document.querySelector('[data-action="book"]').addEventListener('click', () => submitBooking('booking'));
    document.getElementById('refreshBtn').addEventListener('click', refreshData_student);
    document.getElementById('scheduleSelect').addEventListener('change', displaySchedule);
    // ... 共 10 处
}
```

**⚠ 时序约束（必须遵守）**：`bindStudentBookingEvents()` 要放在**块内函数全部定义之后**（即原 723–737 注册表的位置）。函数声明在块内虽然提升，但 `addEventListener` 需要拿到真实的函数引用，放在块首会引用到未初始化的绑定。

### 步骤 3：行级结构改 `<template>`

| 目标 | 现状 | 改法 |
|---|---|---|
| 课程卡片 | `createElement` 链 + `card.style.cssText = '...'`（350–397） | `<template id="tpl-course-card">` + clone，**样式移入 CSS 类** |
| 排期结果行 | `tr.innerHTML = \`<td>…</td>\``（1158） | `<template id="tpl-result-row">` |
| 日历格 | `createElement('div')` × 36（1195–1208） | `<template id="tpl-calendar-day">` |

附带收益：`renderCourseCards` 现在把边框、内边距、悬停阴影全写在 `cssText` 里（353–355 行），**CSS 文件里搜不到这些样式**——这正是"样式改了没生效/找不到在哪"的常见来源。

---

## 3. 明确不做的部分（边界）

1. `renderStudentBookingStatus`、`resetScheduleInfoPanel`、`switchResultTab` —— 已是目标形态，**不动**
2. `getPagebar` / `renderPagination`（`pagefoot.js`）—— 跨模块公共组件，**不动**
3. ③ 类小片段（下拉占位、空态提示）—— 单行字符串，抽象成本 > 收益
4. `student.html` 的菜单切换机制（`loadStudentPageContent` 清空容器）—— **保留**，正是它让方案 A 天然无 ID 冲突
5. `build.js` —— **不需要改**。已确认它只对 `dist/*.html` 做 `</head>` / `</body>` 字符串注入（第 144–152 行），**不做 HTML 压缩或结构改写**，`<template>` 内容安全

---

## 4. 验收方案

### 4.1 现有测试的影响：**零改动可跑通**

`tests/check_schedule_refresh_behavior.js` 的做法是自建 `DOM_HTML = '<div id="dynamic-content-center"></div>'`，再 `await window.renderStudentBookingCards()` 把真实模板注入（第 36 / 120 行）。改造后 `renderStudentBookingCards()` 依然会把模板 clone 进容器 → **这套测试的取 DOM 方式完全不受影响**。

配套回归（应全绿）：`check_schedule_refresh_behavior`(45) / `check_remaining_sites_display`(42) / `check_readonly_display_style`(40) / `check_teacher_profile_login_gate`(33) / `check_login_redirect_roundtrip`(28)。

### 4.2 新增守卫测试 `tests/check_booking_html_separation.js`

| 断言 | 判据 |
|---|---|
| T1 模板零插值 | `tpl-student-booking` 的 `innerHTML` 中 `/\\$\\{/` 匹配数 = 0 |
| T2 结构等价 | clone 后的 DOM 与改造前快照对比：**34 个 ID 全部存在**，关键层级一致 |
| T3 ID 唯一性（**最高价值**） | 扫 `student.html` 全部 `<template>` + `bookingCards`/`browserCards` 的 ID 集合，**重名即 FAIL** |
| T4 注册表已删 | `grep -c 'window.previewSchedule ='` = 0，且 `addEventListener` 数 ≥ 10 |
| T5 事件真通 | 模拟点击「刷新」→ 断言进入 `refreshData_student`（而非静默无响应） |
| T6 术语仍生效 | clone 后 `data-term` 节点的 `textContent` 已被替换 |

**T3 的阴性对照现成可用**：把 ID 检查指向 `student-bookingBrowserCards.js`，应立刻报出 **5 处冲突**（`calendar`/`course-name-input`/`resultBody`/`resultPanelCalendar`/`resultPanelList`）——证明断言有判别力。

---

## 5. 风险清单

| 级别 | 风险 | 处置 |
|---|---|---|
| **高** | ID 重名引爆（选方案 B 时必然发生） | 选方案 A；并用 T3 守卫长期防住 |
| **中** | 内联 `onclick` → `addEventListener` 后失去"全局可调用"特性 | 已核实 `previewSchedule` / `loadSchedule` 等名字在 `admin-schedule.js` / `admin-schedule-waitlist.js` 中**各有自己的实现**并各自挂 window。需在动工前 grep 确认无跨模块调用；已初查：student.html 只加载 bookingCards，不受影响 |
| **中** | 术语替换时机 | 现状：`student-bookingCards.js` **从未调用 `applyTerms`**，全靠 `termsFunction.js` 的 DOMContentLoaded / 拉取词表成功时全量跑一次 → **动态注入的内容可能保持锚点词未替换**。改造时显式补 `applyTerms(dynamicContentCenter)`，顺带修掉这个既有隐患 |
| **低** | 深链逻辑位置 | `window.pendingDeepLink` 处理必须在取数之后，搬移时保持原位 |
| **低** | 构建产物 | `build.js` 不改写 HTML 结构，已验证 |

---

## 6. 实施顺序建议

1. **前置核查**（半小时）：grep 确认 10 个内联函数无跨模块调用；确认 `student.html` 菜单切换仍清空容器
2. **步骤 1 + 2**（主体）：主骨架外迁 + clone/绑事件 + 删注册表 → 跑 4.1 全量回归
3. **步骤 3**（可选，独立提交）：行级结构改 template + 样式移入 CSS
4. **补 T3 守卫**：先跑一次，确认能报出 browserCards 的 5 处冲突（阴性对照），再指向本页

**回滚成本**：步骤 1+2 是单文件 + 单 HTML 的对称改动，`git checkout` 两个文件即可；步骤 2 的 34 个 ID 保持不变，因此**不必同步改任何调用方**。

---

## 7. 与一码多端的关系

改造后 `student-bookingCards.js` 会变成：

- **数据层**：`loadAndRenderCourse_student` / `reloadBooking_student` / 时区换算（可下沉 `shared/domain`）
- **视图层**：`<template>` 结构 + 填值函数（各端各写）
- **事件层**：`bindStudentBookingEvents`（各端各写）

即：**这份改造就是 P1 领域层下沉的前置**——不先把结构从 JS 里拿出来，小程序端拿到的仍然是一堆 `innerHTML` 字符串，一行都用不上。
