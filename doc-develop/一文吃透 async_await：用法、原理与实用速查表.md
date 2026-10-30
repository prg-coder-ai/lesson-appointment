# 一文吃透 async/await：用法、原理与实用速查表

在前端开发中，异步操作是常态（如接口请求、文件读取），`async/await` 作为 ES2017 引入的异步编程语法，彻底解决了传统 Promise 链式调用的繁琐问题，让异步代码写起来像同步代码一样简洁易懂。本文将从「用法」「原理」「速查表」三个维度，帮你彻底掌握 `async/await`，并结合你之前的排期管理项目（fetch 接口调用），让知识快速落地。

## 一、async/await 核心用法（基础必学）

`async/await` 不是新的异步技术，而是 **Promise 的语法糖**，它基于 Promise 实现，简化了 Promise 的调用方式，核心是“用同步的写法，执行异步的逻辑”。

### 1. 核心规则（3句记住）

- **async 关键字**：必须放在函数声明/表达式前面，标记该函数为“异步函数”，异步函数的返回值会自动封装为 Promise 对象。

- **await 关键字**：只能在 async 函数内部使用，用于“等待”一个 Promise 对象的状态变更（resolved/rejected），等待期间会暂停当前函数执行，不会阻塞整个主线程。

- **返回值特性**：async 函数的返回值，若为普通值（非 Promise），会被自动包装为 `Promise.resolve(普通值)`；若返回 Promise，则直接返回该 Promise。

### 2. 基础示例（入门必练）

先看一个最简单的 async/await 用法，对比传统 Promise 链式调用，感受其简洁性：

#### 传统 Promise 写法（繁琐）

```javascript
// 模拟接口请求（返回Promise）
function fetchData() {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve("接口返回的数据");
    }, 1000);
  });
}

// 调用：链式.then()
fetchData()
  .then(data => {
    console.log("拿到数据：", data);
  })
  .catch(err => {
    console.error("请求失败：", err);
  });
```

#### async/await 写法（简洁）

```javascript
// 模拟接口请求（不变）
function fetchData() {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve("接口返回的数据");
    }, 1000);
  });
}

// async 标记异步函数
async function getData() {
  try {
    // await 等待 Promise 完成，拿到 resolved 结果
    const data = await fetchData();
    console.log("拿到数据：", data); // 1秒后输出
  } catch (err) {
    // 捕获 Promise 被 reject 的错误
    console.error("请求失败：", err);
  }
}

// 调用异步函数
getData();
```

### 3. 结合你的项目场景（实用重点）

你之前的排期管理页面中，用 fetch 调用后端接口 `fetch(${API_BASE_URL}/course/schedule/selectByCourseId/${cid})`，用 async/await 改造后，代码更简洁、可读性更高，且便于调试：

```javascript
// 结合 fetch 调用后端排期接口（项目实战）
const API_BASE_URL = "http://localhost:8080";

// 异步函数：根据课程ID查询排期
async function loadSchedule(cid) {
  try {
    // 1. await 等待 fetch 请求完成（fetch 本身返回 Promise）
    const response = await fetch(`${API_BASE_URL}/course/schedule/selectByCourseId/${cid}`);
    
    // 2. await 等待响应体解析为 JSON（response.json() 也返回 Promise）
    const result = await response.json();
    
    // 3. 拿到结果后，渲染到页面（贴合你的排期页面需求）
    console.log("课程排期列表：", result.data);
    renderScheduleList(result.data); // 你自己的渲染函数
    return result.data; // 返回结果，供其他函数调用
  } catch (error) {
    // 捕获所有错误（网络错误、接口报错等）
    console.error("获取排期失败：", error);
    alert("加载排期失败，请重试");
    return []; // 错误时返回空数组，避免页面报错
  }
}

// 调用该函数（注意：调用async函数也需要用await，或.then()）
async function init() {
  const courseId = 1001; // 假设选中的课程ID
  const scheduleList = await loadSchedule(courseId);
  // 后续操作...
}

init();
```

### 4. 错误处理（必掌握）

async/await 的错误处理有两种常用方式，根据场景选择：

#### 方式1：try/catch（推荐，适合多步异步操作）

当一个 async 函数中有多个 await 操作时，try/catch 可以捕获所有 await 对应的 Promise 错误，统一处理：

```javascript
async function multiAsync() {
  try {
    const res1 = await fetch("/api/course/list");
    const courseList = await res1.json();
    
    const res2 = await fetch(`/api/course/schedule/selectByCourseId/${courseList[0].id}`);
    const scheduleList = await res2.json();
    
    console.log("课程列表：", courseList);
    console.log("排期列表：", scheduleList);
  } catch (err) {
    // 只要其中一个 await 失败，就会进入catch
    console.error("异步操作失败：", err);
  }
}
```

#### 方式2：.catch() 单独捕获（适合单个异步操作）

给 await 后面的 Promise 直接加 .catch()，单独处理该异步操作的错误，不影响其他 await 执行：

```javascript
async function singleAsync() {
  // 单独捕获当前await的错误
  const res = await fetch("/api/course/list").catch(err => {
    console.error("获取课程列表失败：", err);
    return null; // 返回默认值，避免后续代码报错
  });
  
  if (res) {
    const courseList = await res.json();
    console.log(courseList);
  }
}
```

## 二、async/await 底层原理（理解不踩坑）

前面说过，`async/await` 是 Promise 的语法糖，其底层依赖 **Promise + 生成器（Generator）** 实现，核心是“暂停执行 + 恢复执行”的机制。

### 1. 先了解 Generator 基础

Generator 函数（用 function* 声明）是 ES6 引入的，它可以“暂停执行”和“恢复执行”，通过 yield 关键字标记暂停点，next() 方法恢复执行，这是 async/await 实现的核心基础：

```javascript
// Generator 函数示例
function* generatorFn() {
  console.log("开始执行");
  const res1 = yield fetch("/api/course/list"); // 暂停，等待next()调用
  const res2 = yield res1.json(); // 再次暂停
  return res2;
}

// 调用 Generator 函数，得到迭代器
const iterator = generatorFn();

// 第一次调用next()：执行到第一个yield，返回yield后面的值（Promise）
iterator.next(); // 输出：开始执行，返回 { value: Promise, done: false }

// 第二次调用next()：将参数作为上一个yield的返回值，继续执行到下一个yield
iterator.next(response); // 执行 res1.json()，返回 { value: Promise, done: false }

// 第三次调用next()：继续执行，返回return的值，done变为true
iterator.next(courseList); // 返回 { value: courseList, done: true }
```

### 2. async/await 与 Generator 的关系

async/await 本质上是对 Generator 函数的“自动执行封装”，我们不需要手动调用 next() 方法，JS 引擎会自动帮我们完成“暂停 → 等待 Promise 完成 → 恢复执行”的流程，具体原理如下：

1. 当 async 函数被调用时，JS 引擎会创建一个 **异步执行上下文**，并将该函数标记为“异步任务”，放入微任务队列。

2. 执行到 await 关键字时，会将 await 后面的 Promise 对象放入 Promise 队列，同时 **暂停当前 async 函数的执行**，并跳出异步执行上下文，继续执行主线程的同步代码。

3. 当 await 后面的 Promise 状态变为 resolved（成功）或 rejected（失败）时，会将该 Promise 对应的回调函数（包含恢复 async 函数执行的逻辑）放入微任务队列。

4. 当主线程同步代码执行完毕后，JS 引擎会读取微任务队列，执行对应的回调函数，**恢复 async 函数的执行**，并将 Promise 的结果作为 await 表达式的返回值，继续执行后续代码。

5. 若 Promise 状态为 rejected，且没有 try/catch 捕获，async 函数会返回一个 rejected 状态的 Promise，否则继续执行，直到函数结束，将返回值封装为 resolved 状态的 Promise。

### 3. 关键原理总结（避坑重点）

- async/await 不是“同步代码”，它依然是异步执行的，只是写法像同步，不会阻塞主线程。

- await 暂停的是“当前 async 函数”，不是整个 JS 进程，主线程会继续执行其他同步代码。

- 多个 await 会“串行执行”（上一个 await 完成，才会执行下一个），若想并行执行，需用 Promise.all() 配合。

- async 函数的错误，本质是其返回的 Promise 被 rejected，必须用 try/catch 或 .catch() 捕获，否则会报未捕获错误。

## 三、async/await 实用速查表（开发直接查）

整理了开发中最常用的场景、语法和注意事项，打印或保存，遇到问题直接查，高效避坑。

### 1. 基础语法速查

|场景|代码示例|说明|
|---|---|---|
|声明async函数|`async function fn() { ... }` `const fn = async () => { ... }`|两种声明方式，箭头函数更简洁|
|await基本用法|`const res = await fetch(url);`|等待fetch返回的Promise完成|
|错误捕获（try/catch）|`try { ... } catch (err) { ... }`|捕获所有await的错误，推荐使用|
|错误捕获（.catch()）|`await fetch(url).catch(err => { ... })`|单独捕获单个异步操作的错误|
|返回值处理|`async fn() { return 123; }` `fn().then(res => console.log(res))`|返回普通值，自动包装为Promise|
### 2. 项目实战场景速查（贴合你的排期项目）

|场景|代码示例|
|---|---|
|调用排期接口（fetch）|`async function loadSchedule(cid) {
  try {
    const res = await fetch(`${API_BASE_URL}/course/schedule/selectByCourseId/${cid}`);
    const result = await res.json();
    return result.data;
  } catch (err) {
    console.error(err);
    return [];
  }
}`|
|并行请求（多课程排期）|`async function loadMultiSchedule(courseIds) {
  const promises = courseIds.map(cid => fetch(`${API_BASE_URL}/course/schedule/selectByCourseId/${cid}`).then(res => res.json()));
  const results = await Promise.all(promises);
  return results.map(r => r.data);
}`|
|async函数调用（嵌套）|`async function init() {
  const cid = await getSelectedCourseId(); // 另一个async函数
  const scheduleList = await loadSchedule(cid);
  renderSchedule(scheduleList);
}`|
### 3. 常见坑速查（避坑必备）

|常见错误|错误原因|解决方案|
|---|---|---|
|Uncaught SyntaxError: await is only valid in async functions|await 用在了非async函数中|给await所在的函数添加async关键字|
|异步操作失败，未捕获错误|await的Promise被reject，未用try/catch或.catch()|添加try/catch捕获错误，或给Promise加.catch()|
|多个await串行执行，效率低|不需要顺序执行的异步操作，用了串行await|用Promise.all()并行执行多个异步操作|
|async函数返回值拿不到|直接调用async函数，未用await或.then()|用await调用async函数，或用.then()获取返回值|
## 四、总结

`async/await` 是前端异步编程的“最优解”，它基于 Promise 实现，用同步的写法解决异步问题，兼顾简洁性和可读性。核心记住：async 标记异步函数，await 等待 Promise，错误用 try/catch 捕获。

结合你之前的排期管理项目，async/await 能完美适配 fetch 接口调用，让代码更简洁、更易维护。配合本文的速查表，开发中遇到相关问题可直接查询，高效避坑。
> （注：文档部分内容可能由 AI 生成）