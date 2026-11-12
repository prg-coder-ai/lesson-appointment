# classroom 服务与前端交互清单

> 生成日期：2026-11-11
> 范围：`api/classroom-service`（课堂服务，独立部署，端口 8092）↔ `frontend/`（课堂页、巡课/运营台、回放页、平台配置页）
> 每个条目都带 `文件:行号` 锚点，可点击直达代码。

---

## 一、总体形态

| 项 | 结论 | 锚点 |
|---|---|---|
| 服务端口 | `server.port=8092`，无 context-path | [application.properties:2](api/classroom-service/src/main/resources/application.properties#L2) |
| REST 规模 | 20 个 controller / 56 个端点（其中 4 个为服务间 HMAC，前端不调） | — |
| REST 鉴权 | `Authorization: Bearer <JWT>`（与主系统共享 `jwt.secret`），也接受 `?access_token=` | [AuthInterceptor.java:35](api/classroom-service/src/main/java/com/classroom/security/AuthInterceptor.java#L35) |
| 二级闸 | 租户未启用课堂 → 403「课堂未启用」 | [AuthInterceptor.java:58](api/classroom-service/src/main/java/com/classroom/security/AuthInterceptor.java#L58) |
| 三级闸 | 按课堂归属校验（404/跨租户/被踢/非本课教师/不在名单） | [ClassroomAccessGuard.java:54](api/classroom-service/src/main/java/com/classroom/security/ClassroomAccessGuard.java#L54) |
| WebSocket | 3 条通道，握手拦截器校验 JWT + 课堂归属，**token 只能走 query** | [WebSocketConfig.java:42](api/classroom-service/src/main/java/com/classroom/config/WebSocketConfig.java#L42) |
| 文件访问 | `/api/v1/files/{token}?exp=&sig=` URL 签名，免 JWT（`<video>/<img>` 带不了 header） | [FileAccessController.java:35](api/classroom-service/src/main/java/com/classroom/controller/FileAccessController.java#L35) |
| 前端基址 | `getClassroomApiBaseUrl()` / `getClassroomWsBaseUrl()`，同源时为空串 | [feature-flags.js:35](frontend/js/public/feature-flags.js#L35) |
| 前端开关 | `hasClassroom()` → `eclassroomConfig.enabled` | [feature-flags.js:30](frontend/js/public/feature-flags.js#L30) |

**推荐进课堂动作顺序**：`POST /classrooms/{sid}/enter`（JWT 头）→ `GET /classrooms/{sid}/rtc/config` → 连三条 WS（带 `?access_token=`，heartbeat 15s）→ `GET /classrooms/{sid}/materials/current` 补齐讲稿页码。

---

## 二、前端 API 调用函数

### 2.1 `ClassroomAPI`（定义在 [api.js:1065](frontend/js/public/api.js#L1065)，首参 `apiBaseUrl` 由 `_classroomUrl` 拼接，见 [api.js:1061](frontend/js/public/api.js#L1061)）

| 函数 | 方法 + 路径 | 定义锚点 | 调用点 / 触发元素 |
|---|---|---|---|
| `enterClassroom` | POST `/classrooms/{sid}/enter` | [api.js:1067](frontend/js/public/api.js#L1067) | `_boot` [classroom-main.js:87](frontend/js/classroom/classroom-main.js#L87)；页面 onload [classroom-main.js:622](frontend/js/classroom/classroom-main.js#L622) |
| `leaveClassroom` | POST `/classrooms/{sid}/leave` | [api.js:1070](frontend/js/public/api.js#L1070) | `_bestEffortLeave` [classroom-main.js:311](frontend/js/classroom/classroom-main.js#L311)（`#btn-back` / `ctrl-leave` / `pagehide` 间接） |
| `getClassroomStatus` | GET `/classrooms/{sid}/status` | [api.js:1073](frontend/js/public/api.js#L1073) | `_loadStatus` [classroom-main.js:116](frontend/js/classroom/classroom-main.js#L116) |
| `getRtcConfig` | GET `/classrooms/{sid}/rtc/config` | [api.js:1077](frontend/js/public/api.js#L1077) | `_fetchConfig` [classroom-rtc.js:44](frontend/js/classroom/classroom-rtc.js#L44) |
| `startClass` | POST `/classrooms/{sid}/start` | [api.js:1080](frontend/js/public/api.js#L1080) | [classroom-teacher.js:18](frontend/js/classroom/classroom-teacher.js#L18)；**无 UI 按钮** |
| `endClass` | POST `/classrooms/{sid}/end` | [api.js:1083](frontend/js/public/api.js#L1083) | [classroom-teacher.js:27](frontend/js/classroom/classroom-teacher.js#L27) ← `#ctrl-end` [controls.js:156](frontend/js/classroom/classroom-controls.js#L156)（confirm） |
| `kickMember` | POST `/classrooms/{sid}/members/{uid}/kick` | [api.js:1088](frontend/js/public/api.js#L1088) | [classroom-teacher.js:186](frontend/js/classroom/classroom-teacher.js#L186)；**无按钮绑定** |
| `getMembers` | GET `/classrooms/{sid}/members` | [api.js:1092](frontend/js/public/api.js#L1092) | `_refreshMembers` [classroom-main.js:401](frontend/js/classroom/classroom-main.js#L401)（`_boot` [main.js:96](frontend/js/classroom/classroom-main.js#L96) 调用） |
| `getAttendance` | GET `/classrooms/{sid}/attendance` | [api.js:1097](frontend/js/public/api.js#L1097) | 无调用点 |
| `manualAdjust` | POST `/classrooms/{sid}/attendance/manual-adjust` | [api.js:1100](frontend/js/public/api.js#L1100) | `_doManualAdjust` [classroom-main.js:423](frontend/js/classroom/classroom-main.js#L423) ← 动态「补签」`.pt-adjust` [main.js:344](frontend/js/classroom/classroom-main.js#L344)/[359](frontend/js/classroom/classroom-main.js#L359) |
| `getMyAttendanceHistory` | GET `/attendance/history` | [api.js:1104](frontend/js/public/api.js#L1104) | `_showMyAttendance` [classroom-main.js:548](frontend/js/classroom/classroom-main.js#L548) ← `#btn-my-attendance` [classroom.html:46](frontend/classroom.html#L46)（绑定 [main.js:528](frontend/js/classroom/classroom-main.js#L528)） |
| `uploadMaterial` | POST `/classrooms/{sid}/materials` | [api.js:1109](frontend/js/public/api.js#L1109) | 无调用点（实际走 2.2 直传） |
| `getMaterials` | GET `/classrooms/{sid}/materials` | [api.js:1112](frontend/js/public/api.js#L1112) | 无调用点 |
| `getCurrentMaterial` | GET `/classrooms/{sid}/materials/current` | [api.js:1116](frontend/js/public/api.js#L1116) | [classroom-material.js:27](frontend/js/classroom/classroom-material.js#L27) |
| `turnPage` | PUT `/classrooms/{sid}/materials/{mid}/page` | [api.js:1119](frontend/js/public/api.js#L1119) | `_turn` [classroom-material.js:69](frontend/js/classroom/classroom-material.js#L69) ← `#ms-prev`/`#ms-next` [material.js:130](frontend/js/classroom/classroom-material.js#L130) |
| `initiateRollCall` | POST `/classrooms/{sid}/rollcall` | [api.js:1124](frontend/js/public/api.js#L1124) | [classroom-teacher.js:67](frontend/js/classroom/classroom-teacher.js#L67) ← `#rollcall-initiate` [classroom.html:112](frontend/classroom.html#L112)（绑定 [teacher.js:63](frontend/js/classroom/classroom-teacher.js#L63)） |
| `answerRollCall` | POST `/classrooms/{sid}/rollcall/{rcid}/answer` | [api.js:1127](frontend/js/public/api.js#L1127) | [classroom-student.js:59](frontend/js/classroom/classroom-student.js#L59) ← `#rollcall-answer` [classroom.html:100](frontend/classroom.html#L100) |
| `getRollCallList` | GET `/classrooms/{sid}/rollcall` | [api.js:1130](frontend/js/public/api.js#L1130) | 无调用点 |
| `submitWork` | POST `/classrooms/{sid}/submissions`（JSON/TEXT） | [api.js:1135](frontend/js/public/api.js#L1135) | [classroom-main.js:463](frontend/js/classroom/classroom-main.js#L463) ← `#upload-submit` [classroom.html:134](frontend/classroom.html#L134) |
| `getSubmissions` | GET `/classrooms/{sid}/submissions` | [api.js:1138](frontend/js/public/api.js#L1138) | `openReview` [classroom-teacher.js:130](frontend/js/classroom/classroom-teacher.js#L130) ← `#ctrl-review` [controls.js:135](frontend/js/classroom/classroom-controls.js#L135) |
| `reviewSubmission` | PUT `/classrooms/{sid}/submissions/{id}/review` | [api.js:1141](frontend/js/public/api.js#L1141) | [classroom-teacher.js:165](frontend/js/classroom/classroom-teacher.js#L165) ← 动态 `.rv-submit` [teacher.js:158](frontend/js/classroom/classroom-teacher.js#L158) |
| `getRecordings` | GET `/recordings/{sid}` | [api.js:1146](frontend/js/public/api.js#L1146) | `load` [replay.js:62](frontend/js/classroom/replay.js#L62) ← `#rp-load` [replay.js:38](frontend/js/classroom/replay.js#L38) |
| `getPlaybackUrl` | GET `/recordings/{sid}/playback` | [api.js:1149](frontend/js/public/api.js#L1149) | 无调用点（回放用列表行签名 `url` [replay.js:117](frontend/js/classroom/replay.js#L117)） |
| `startRecording` | POST `/classrooms/{sid}/recording/start` | [api.js:1153](frontend/js/public/api.js#L1153) | 无调用点（见 2.2） |
| `stopRecording` | POST `/classrooms/{sid}/recording/{rid}/stop` | [api.js:1156](frontend/js/public/api.js#L1156) | 无调用点（见 2.2） |
| `getRecordingState` | GET `/classrooms/{sid}/recording/state` | [api.js:1159](frontend/js/public/api.js#L1159) | 无调用点 |
| `monitorClassrooms` | GET `/admin/classrooms/monitor?status=` | [api.js:1164](frontend/js/public/api.js#L1164) | `refresh` [classroom-admin.js:44](frontend/js/classroom/classroom-admin.js#L44) ← `#ctrl-monitor` [controls.js:148](frontend/js/classroom/classroom-controls.js#L148) |
| `remoteEndClass` | POST `/admin/classrooms/{sid}/end` | [api.js:1167](frontend/js/public/api.js#L1167) | `forceEnd` [classroom-admin.js:67](frontend/js/classroom/classroom-admin.js#L67) ← 巡课面板内联按钮 [admin.js:52](frontend/js/classroom/classroom-admin.js#L52) |

### 2.2 直连端点（不经 `ClassroomAPI`，用 `ApiPaths.ENDPOINTS` + XHR/fetch）

端点常量来源：[shared/apiPaths.js:295](shared/apiPaths.js#L295)（浏览器镜像 [shared-domain-bridge.js](frontend/js/shared-domain-bridge.js) → `window.ApiPaths.ENDPOINTS`）。

| 动作 | 方法 + 路径 | 锚点 | 触发 |
|---|---|---|---|
| 课堂开关配置 | GET `/api/v1/eclassroom/config` | [classroom-main.js:64](frontend/js/classroom/classroom-main.js#L64)、[api.js:304](frontend/js/public/api.js#L304) | 课堂页补拉 / 登录兜底 |
| 作业文件上传 | POST `/api/v1/classrooms/{sid}/submissions/file`（multipart ≤100MB） | [classroom-main.js:483](frontend/js/classroom/classroom-main.js#L483) | `#upload-submit` 非 TEXT 分支 [main.js:474](frontend/js/classroom/classroom-main.js#L474) |
| 讲稿上传 | POST `/api/v1/classrooms/{sid}/materials/file`（multipart ≤100MB） | [classroom-material.js:160](frontend/js/classroom/classroom-material.js#L160) | `#ms-upload` / `#ms-file-input` [material.js:135](frontend/js/classroom/classroom-material.js#L135) |
| 录制开始 | POST `/api/v1/classrooms/{sid}/recording/start` | [classroom-record.js:161](frontend/js/classroom/classroom-record.js#L161) | `#ctrl-record` [controls.js:140](frontend/js/classroom/classroom-controls.js#L140) |
| 录制停止 | POST `/api/v1/classrooms/{sid}/recording/{rid}/stop`（body `ossKey`） | [classroom-record.js:164](frontend/js/classroom/classroom-record.js#L164) | `MediaRecorder.onstop` [record.js:109](frontend/js/classroom/classroom-record.js#L109) |
| 分片上传 init/part/complete | POST `/api/v1/uploads/init`、PUT `.../parts/{n}`、POST `.../complete` | [record.js:125](frontend/js/classroom/classroom-record.js#L125)、[:139](frontend/js/classroom/classroom-record.js#L139)、[:150](frontend/js/classroom/classroom-record.js#L150) | 录制结束后 `_upload`（5MB/片） |

### 2.3 运营台 `ops.js`（全部走 `window.request`）

| 函数/动作 | 端点 | 锚点 | 触发元素 |
|---|---|---|---|
| `loadMonitor` | GET `/api/v1/admin/monitor/overview`、`/alerts`、`/metrics` | [ops.js:166](frontend/js/classroom/ops.js#L166)、[:195](frontend/js/classroom/ops.js#L195)、[:223](frontend/js/classroom/ops.js#L223) | tab `monitor` [ops.js:117](frontend/js/classroom/ops.js#L117) |
| `loadReport` | GET `/api/v1/admin/reports/learning?from&to` | [ops.js:249](frontend/js/classroom/ops.js#L249) | `#rep-query` [ops.js:92](frontend/js/classroom/ops.js#L92) |
| `_export` | GET `/api/v1/admin/exports/{type}` | [ops.js:303](frontend/js/classroom/ops.js#L303) | `#rep-export-attendance/-recordings` [ops.js:93](frontend/js/classroom/ops.js#L93) |
| `loadReconcile` | GET `/api/v1/admin/reconcile/diffs?status&days` | [ops.js:328](frontend/js/classroom/ops.js#L328) | `#rc-query` [ops.js:95](frontend/js/classroom/ops.js#L95) |
| `_bindActions` | POST `/api/v1/admin/reconcile/run` | [ops.js:97](frontend/js/classroom/ops.js#L97) | `#rc-run` |
| 内联 | POST `/api/v1/admin/reconcile/diffs/{id}/resolve` | [ops.js:356](frontend/js/classroom/ops.js#L356) | `#rc-table [data-resolve]` |
| `loadAudit` | GET `/api/v1/admin/audit/submissions?...` | [ops.js:371](frontend/js/classroom/ops.js#L371) | `#au-query` [ops.js:104](frontend/js/classroom/ops.js#L104) |
| 内联 | POST `/api/v1/admin/audit/submissions/{id}/flag` / `/pass` | [ops.js:402](frontend/js/classroom/ops.js#L402)、[:410](frontend/js/classroom/ops.js#L410) | `#au-table [data-flag]/[data-pass]` |
| `loadAuditLogs` | GET `/api/v1/admin/audit/logs?days=7` | [ops.js:422](frontend/js/classroom/ops.js#L422) | tab `audit` |
| `_bindActions` | POST `/api/v1/admin/audit/chat/{sid}/view` | [ops.js:108](frontend/js/classroom/ops.js#L108) | `#au-chat-view` |
| `loadContract` | GET `/api/v1/admin/contract/events?...` | [ops.js:446](frontend/js/classroom/ops.js#L446) | `#ct-query` |
| `_replay` / `_resync` | POST `/api/v1/admin/contract/replay` / `/resync` | [ops.js:473](frontend/js/classroom/ops.js#L473)、[:488](frontend/js/classroom/ops.js#L488) | `#ct-replay` / `#ct-resync` |

### 2.4 平台配置页 `platform-admin-eclassroom.js`

| 动作 | 方法 + 路径 | 锚点 | 触发元素 |
|---|---|---|---|
| 实例列表 | GET `/eclassroom/instances` | [platform-admin-eclassroom.js:75](frontend/js/platform-admin-eclassroom.js#L75) | 菜单 `eclassroom_instances` [platform_admin.html:54](frontend/platform_admin.html#L54) |
| 保存实例 | POST/PUT `/eclassroom/instances[/{id}]` | [:202](frontend/js/platform-admin-eclassroom.js#L202) | 弹窗「保存」 |
| 删除实例 | DELETE `/eclassroom/instances/{id}` | [:217](frontend/js/platform-admin-eclassroom.js#L217) | 行内「删除」 |
| 租户课堂配置 | GET `/eclassroom/tenant/{tenantId}` + `/eclassroom/instances` | [:226](frontend/js/platform-admin-eclassroom.js#L226) | 租户行「课堂配置」[platform-admin-tenant.js:81](frontend/js/platform-admin-tenant.js#L81) |
| 绑定/禁用/解绑 | PUT `/eclassroom/tenant/{id}/bind?instanceId=`、`/disable`、`/unbind` | [:301](frontend/js/platform-admin-eclassroom.js#L301)、[:316](frontend/js/platform-admin-eclassroom.js#L316)、[:323](frontend/js/platform-admin-eclassroom.js#L323) | 弹窗按钮 [:265-267](frontend/js/platform-admin-eclassroom.js#L265) |

---

## 三、页面元素与事件绑定

### 3.1 `classroom.html`（主课堂页）

脚本装载顺序见 [classroom.html:169-192](frontend/classroom.html#L169)：axios → utility_request → api.js → shared-domain-bridge → feature-flags → rtc 三件套 → rtc → record → whiteboard → material → chat → controls → teacher → student → admin → main。

| 元素 id | 事件 | 处理 | 锚点 |
|---|---|---|---|
| `#btn-back` | click | confirm 后 `ClassroomMain.leave()` | [main.js:284](frontend/js/classroom/classroom-main.js#L284) |
| window | `pagehide` | `_bestEffortLeave()`（RTC leave + WS disconnect + POST leave） | [main.js:290](frontend/js/classroom/classroom-main.js#L290)、[:302](frontend/js/classroom/classroom-main.js#L302) |
| `#btn-replay` | click | 新窗口打开 `replay.html?scheduleId=` | [main.js:518](frontend/js/classroom/classroom-main.js#L518) |
| `#btn-my-attendance` | click | `_showMyAttendance` → GET `/attendance/history` | [main.js:528](frontend/js/classroom/classroom-main.js#L528)、[:538](frontend/js/classroom/classroom-main.js#L538) |
| `#participant-list .pt-adjust`（动态） | click | prompt 原因 → `manualAdjust` | [main.js:359](frontend/js/classroom/classroom-main.js#L359) |
| `.pt-approve`（动态） | click | WS `hand:approve` | [main.js:368](frontend/js/classroom/classroom-main.js#L368) |
| `.pt-wbgrant`（动态） | click | WS `wb:grant` | [main.js:378](frontend/js/classroom/classroom-main.js#L378) |
| `#upload-type` | change | TEXT 时隐藏 `#upload-file` | [main.js:441](frontend/js/classroom/classroom-main.js#L441) |
| `#upload-submit` | click | TEXT→`submitWork`；文件→XHR 上传带进度 | [main.js:450](frontend/js/classroom/classroom-main.js#L450)、[:481](frontend/js/classroom/classroom-main.js#L481) |
| `#chat-send` / `#chat-input` | click / Enter | `ClassroomChat.sendFromInput` → WS `chat` | [classroom-chat.js:24](frontend/js/classroom/classroom-chat.js#L24)、[:26](frontend/js/classroom/classroom-chat.js#L26) |
| `#whiteboard-canvas` | mouse/touch | 绘制 + `sendWhiteboard` | [classroom-whiteboard.js:60](frontend/js/classroom/classroom-whiteboard.js#L60)、[:99](frontend/js/classroom/classroom-whiteboard.js#L99) |
| `.wb-tool[data-tool]` / `#wb-color` / `#wb-size` / `#wb-clear` | click/input | 工具、颜色、笔宽、清屏（WS `{op:'clear'}`） | [whiteboard.js:68-81](frontend/js/classroom/classroom-whiteboard.js#L68)、[:171](frontend/js/classroom/classroom-whiteboard.js#L171) |
| `#ms-prev` / `#ms-next` | click | `prev()/next()` → PUT 翻页 | [material.js:130](frontend/js/classroom/classroom-material.js#L130)、[:60](frontend/js/classroom/classroom-material.js#L60) |
| `#ms-upload` / `#ms-file-input` | click / change | 选文件 → XHR multipart 上传讲稿 | [material.js:135](frontend/js/classroom/classroom-material.js#L135)、[:155](frontend/js/classroom/classroom-material.js#L155) |
| `#material-stage` 系列 | 渲染 | `_apply(state, reveal)` | [material.js:74](frontend/js/classroom/classroom-material.js#L74) |
| `#rollcall-modal` / `#rollcall-answer` | WS + click | 学生应答 | [classroom-student.js:48](frontend/js/classroom/classroom-student.js#L48) |
| `#teacher-rollcall-modal` / `#rollcall-initiate` | click | 发起点名 | [classroom-teacher.js:51](frontend/js/classroom/classroom-teacher.js#L51) |
| `#teacher-review-modal` 内 `.rv-submit` | click | 批阅 | [teacher.js:158](frontend/js/classroom/classroom-teacher.js#L158) |
| `#server-banner` / `#record-banner` / `#record-timer` | WS 驱动 | `_setServerMute` / `_setRecording` | [main.js:234](frontend/js/classroom/classroom-main.js#L234)、[:259](frontend/js/classroom/classroom-main.js#L259) |
| `#video-grid` / `#vt-*` | 动态渲染 | `RtcTiles.local/remote/remove` | [rtc-engine.js:51](frontend/js/classroom/rtc/rtc-engine.js#L51) |

**控制栏 `#classroom-controls`（动态渲染 [controls.js:23-56](frontend/js/classroom/classroom-controls.js#L23)）**

| 按钮 id | 角色 | 行为 | 锚点 |
|---|---|---|---|
| `ctrl-mic` | 教师/学生 | `ClassroomRTC.setMicEnabled`（含全员禁言拦截） | [controls.js:67](frontend/js/classroom/classroom-controls.js#L67) |
| `ctrl-cam` | 教师/学生 | `setCamEnabled` → WS `cam-state` | [controls.js:79](frontend/js/classroom/classroom-controls.js#L79) |
| `ctrl-whiteboard` / `ctrl-material` | 全部 | 切换白板 / 讲稿 | [controls.js:87](frontend/js/classroom/classroom-controls.js#L87)、[:95](frontend/js/classroom/classroom-controls.js#L95) |
| `ctrl-hand` | 学生 | `toggleHand` → WS `hand` | [controls.js:102](frontend/js/classroom/classroom-controls.js#L102) |
| `ctrl-upload` | 学生 | 打开作业弹窗 | [controls.js:127](frontend/js/classroom/classroom-controls.js#L127) |
| `ctrl-mute-all` | 教师/管理员 | WS `mute-all` | [controls.js:109](frontend/js/classroom/classroom-controls.js#L109) |
| `ctrl-record` | 教师/管理员 | 录制开关（直连 REST） | [controls.js:140](frontend/js/classroom/classroom-controls.js#L140) |
| `ctrl-rollcall` / `ctrl-review` | 教师 | 点名弹窗 / 作品批阅 | [controls.js:114](frontend/js/classroom/classroom-controls.js#L114)、[:135](frontend/js/classroom/classroom-controls.js#L135) |
| `ctrl-wb-save` | 教师 | WS 白板 `{op:'wb:save'}` | [controls.js:119](frontend/js/classroom/classroom-controls.js#L119) |
| `ctrl-monitor` | 管理员 | 巡课面板 | [controls.js:148](frontend/js/classroom/classroom-controls.js#L148) |
| `ctrl-end` / `ctrl-leave` | 教师 / 学生·管理员 | 下课（confirm）/ 离开 | [controls.js:156](frontend/js/classroom/classroom-controls.js#L156)、[:163](frontend/js/classroom/classroom-controls.js#L163) |

### 3.2 `classroom-ops.html`（运营台）

| 元素 id | 事件 | 处理 | 锚点 |
|---|---|---|---|
| `.ops-tabs button[data-tab]` | click | 切 tab + `load(tab)` | [ops.js:67](frontend/js/classroom/ops.js#L67) |
| `#ops-refresh` | click | 重新加载当前 tab | [ops.js:82](frontend/js/classroom/ops.js#L82) |
| `#rep-query` / `#rep-export-*` | click | 报表查询 / CSV 导出 | [ops.js:92](frontend/js/classroom/ops.js#L92) |
| `#rc-query` / `#rc-run` / `#rc-table [data-resolve]` | click | 差异查询 / 手动对账 / 处置 | [ops.js:95](frontend/js/classroom/ops.js#L95)、[:97](frontend/js/classroom/ops.js#L97)、[:351](frontend/js/classroom/ops.js#L351) |
| `#au-query` / `#au-chat-view` / `[data-flag]` / `[data-pass]` | click | 抽查 / 留痕 / 标记违规 / 通过 | [ops.js:104](frontend/js/classroom/ops.js#L104)、[:108](frontend/js/classroom/ops.js#L108)、[:398](frontend/js/classroom/ops.js#L398) |
| `#ct-query` / `#ct-replay` / `#ct-resync` | click | 事件对账 / 报文重放 / 批量对表 | [ops.js:112](frontend/js/classroom/ops.js#L112) |

### 3.3 `replay.html`（回放页）

| 元素 id | 事件 | 处理 | 锚点 |
|---|---|---|---|
| `#rp-load` / `#rp-schedule` | click / Enter | `load(scheduleId)` → GET `/recordings/{sid}` | [replay.js:38](frontend/js/classroom/replay.js#L38) |
| `#rp-list .rp-item` | click | `_play(rows[idx])`，`#rp-video.src = r.url` | [replay.js:94](frontend/js/classroom/replay.js#L94)、[:105](frontend/js/classroom/replay.js#L105) |
| `#rp-video` / `#rp-empty` | 播放 / 空态 | `_play` / `_empty` | [replay.js:105](frontend/js/classroom/replay.js#L105)、[:155](frontend/js/classroom/replay.js#L155) |

---

## 四、WebSocket 协议（[classroom-ws.js](frontend/js/public/classroom-ws.js)）

**连接**：`ClassroomWS.connect(scheduleId, token, handlers)` — [classroom-ws.js:62](frontend/js/public/classroom-ws.js#L62)；三条通道同一 `traceId`，query 带 `?access_token=&traceId=`：

| 通道 | 路径 | 锚点 |
|---|---|---|
| 心跳 | `/ws/classrooms/{sid}/heartbeat` | [ws.js:71](frontend/js/public/classroom-ws.js#L71) |
| 信令 | `/ws/classrooms/{sid}/signal` | [ws.js:85](frontend/js/public/classroom-ws.js#L85) |
| 白板 | `/ws/classrooms/{sid}/whiteboard` | [ws.js:93](frontend/js/public/classroom-ws.js#L93) |

连接入口 [classroom-main.js:148](frontend/js/classroom/classroom-main.js#L148)（`_connectWS`）。

**发送**（signal 通道除心跳外均为 `{type:...}`）：

| type | 发送方锚点 |
|---|---|
| `heartbeat`（15s） | [ws.js:79](frontend/js/public/classroom-ws.js#L79) |
| `class-start` / `class-end` / `mute-all` / `member-kicked` | [teacher.js:20](frontend/js/classroom/classroom-teacher.js#L20)、[:29](frontend/js/classroom/classroom-teacher.js#L29)、[:41](frontend/js/classroom/classroom-teacher.js#L41)、[:189](frontend/js/classroom/classroom-teacher.js#L189) |
| `hand` / `hand:approve` / `wb:grant` | [student.js:20](frontend/js/classroom/classroom-student.js#L20)、[main.js:372](frontend/js/classroom/classroom-main.js#L372)、[:383](frontend/js/classroom/classroom-main.js#L383) |
| `cam-state` / `chat` | [rtc.js:121](frontend/js/classroom/classroom-rtc.js#L121)、[chat.js:39](frontend/js/classroom/classroom-chat.js#L39) |
| `rtc-peer-join` / `-leave` / `rtc-offer` / `rtc-answer` / `rtc-ice` | [engine-mesh.js:64](frontend/js/classroom/rtc/engine-mesh.js#L64)、[:214](frontend/js/classroom/rtc/engine-mesh.js#L214)、[:141](frontend/js/classroom/rtc/engine-mesh.js#L141)、[:158](frontend/js/classroom/rtc/engine-mesh.js#L158)、[:100](frontend/js/classroom/rtc/engine-mesh.js#L100) |
| 白板 `draw` / `clear` / `wb:save` | [whiteboard.js:108](frontend/js/classroom/classroom-whiteboard.js#L108)、[:174](frontend/js/classroom/classroom-whiteboard.js#L174)、[controls.js:123](frontend/js/classroom/classroom-controls.js#L123) |

**接收**（统一入口 `_dispatchSignal` [main.js:165](frontend/js/classroom/classroom-main.js#L165)）：

| type | 处理锚点 |
|---|---|
| `hand:state` / `cam:state` / `mute:state` / `mic:grant` / `wb:grant:state` | [main.js:175-192](frontend/js/classroom/classroom-main.js#L175) |
| `record:state` / `page:state` | [main.js:193](frontend/js/classroom/classroom-main.js#L193)、[material.js:43](frontend/js/classroom/classroom-material.js#L43) |
| `rtc-peer-join` / `-leave` / `member-kicked` / `rtc-offer/-answer/-ice` | [main.js:196-202](frontend/js/classroom/classroom-main.js#L196)、[engine-mesh.js:76-80](frontend/js/classroom/rtc/engine-mesh.js#L76) |
| `class-start` / `class-end` | [main.js:203](frontend/js/classroom/classroom-main.js#L203)（end 后 1.2s 自动 leave） |
| `rollcall:start` / `rollcall:answered` | [teacher.js:89](frontend/js/classroom/classroom-teacher.js#L89)、[student.js:42](frontend/js/classroom/classroom-student.js#L42) |
| `chat:msg` / `chat:rejected` | [chat.js:57](frontend/js/classroom/classroom-chat.js#L57) |
| 白板 `wb:init` / `wb:snapshot:saved` / 笔迹广播 | [whiteboard.js:139](frontend/js/classroom/classroom-whiteboard.js#L139) |

---

## 五、进入教室的入口

| 入口 | 元素/函数 | 锚点 |
|---|---|---|
| 教师排期行 | 「进入课堂」按钮 → `enterClassroom(scheduleId)` → `classroom.html?scheduleId=` | [teacher-courseAndScheduleBrowserCards.js:195](frontend/js/teacher-courseAndScheduleBrowserCards.js#L195)、[:457](frontend/js/teacher-courseAndScheduleBrowserCards.js#L457) |
| 学生预约卡 | 「进入课堂」（`hasClassroom() && status==='booked'`） | [student-bookingBrowserCards.js:235](frontend/js/student-bookingBrowserCards.js#L235)、[:592](frontend/js/student-bookingBrowserCards.js#L592) |
| 管理员排期详情 | `#enter-classroom-btn` 容器渲染按钮 | [admin-schedule.js:2288](frontend/js/admin-schedule.js#L2288)、[:2635](frontend/js/admin-schedule.js#L2635) |
| 管理员预订卡片 | 「进入课堂」 | [admin-booking.js:249](frontend/js/admin-booking.js#L249)、[:382](frontend/js/admin-booking.js#L382) |
| 平台管理员 | 「课堂实例」菜单 → 实例/租户绑定管理 | [platform_admin.html:54](frontend/platform_admin.html#L54)、[:167](frontend/platform_admin.html#L167) |

---

## 六、已知缺口与风险（当前代码状态）

1. **`classroom.html` 未引入 `js/public/classroom-ws.js`**（[classroom.html:169-192](frontend/classroom.html#L169) 脚本清单中确无此项，全仓仅该文件自身存在）→ `window.ClassroomWS` 为 undefined，[classroom-main.js:145](frontend/js/classroom/classroom-main.js#L145) 走「信令未就绪」分支：**聊天、举手、白板、点名、RTC 信令、录制状态推送在现有页面装载下全部不可用**。需在 `feature-flags.js` 之后补一行 `<script src="js/public/classroom-ws.js"></script>`。
2. **菜单项无对应路由分支**：`teacher.html`（`my_classroom`，[teacher.html:69](frontend/teacher.html#L69)，switch 在 [:442](frontend/teacher.html#L442)）、`student.html`（[:66](frontend/student.html#L66) / [:516](frontend/student.html#L516)）、`admin.html`（`classroom_monitor`，[:108](frontend/admin.html#L108)）均无 case 分支，点击后内容区为空；实际入口是卡片上的「进入课堂」。
3. **有封装无 UI 的接口**：`startClass`、`getAttendance`、`getMaterials`、`uploadMaterial`、`getRollCallList`、`getPlaybackUrl`、`startRecording`、`stopRecording`、`getRecordingState`、`kickMember`。其中录制/讲稿上传/作业上传走裸 XHR，未复用 `ClassroomAPI`。
4. **角色来源**：课堂页优先取 URL `?role=`，其次登录态（[classroom-main.js:79](frontend/js/classroom/classroom-main.js#L79)）——可用于联调，但存在被手动篡改跳角色视图的风险（服务端仍按 JWT 鉴权，仅影响 UI）。
5. **回放页未引入 `feature-flags.js`**（[replay.html:69-70](frontend/replay.html#L69) 只有 api.js + replay.js），页内不校验课堂开关。

---

## 七、代码锚点索引（按文件）

| 文件 | 关键锚点 |
|---|---|
| [frontend/js/public/api.js](frontend/js/public/api.js#L1065) | `ClassroomAPI` 定义起点 1065，止于 1172 |
| [frontend/js/public/classroom-ws.js](frontend/js/public/classroom-ws.js#L62) | `connect` 62；`disconnect` 118；`disconnectAll` 128 |
| [frontend/js/classroom/classroom-main.js](frontend/js/classroom/classroom-main.js#L41) | `guardClassroom` 41；`_ensureConfig` 59；`_boot` 87；`_connectWS` 148；`_dispatchSignal` 165；`leave` 284 |
| [frontend/js/classroom/classroom-controls.js](frontend/js/classroom/classroom-controls.js#L23) | 渲染 23-56；`_bind` 63-169 |
| [frontend/js/classroom/classroom-teacher.js](frontend/js/classroom/classroom-teacher.js#L18) | start 18；end 27；muteAll 37；rollcall 51；review 118 |
| [frontend/js/classroom/classroom-student.js](frontend/js/classroom/classroom-student.js#L17) | toggleHand 17；kick 处理 35；rollcall 48 |
| [frontend/js/classroom/classroom-material.js](frontend/js/classroom/classroom-material.js#L27) | init 27；`_turn` 69；上传 155 |
| [frontend/js/classroom/classroom-record.js](frontend/js/classroom/classroom-record.js#L120) | `_upload` 120；start/stop 161-164 |
| [frontend/js/classroom/classroom-whiteboard.js](frontend/js/classroom/classroom-whiteboard.js#L60) | 绘制 60/99；`onMessage` 139 |
| [frontend/js/classroom/ops.js](frontend/js/classroom/ops.js#L67) | tab 67；绑定 82-114；各 loader 166-500 |
| [frontend/js/classroom/replay.js](frontend/js/classroom/replay.js#L38) | load 38；`_play` 105 |
| [frontend/js/public/feature-flags.js](frontend/js/public/feature-flags.js#L30) | hasClassroom 30；base url 35/40；菜单显隐 45 |
| [api/…/ClassroomController.java](api/classroom-service/src/main/java/com/classroom/controller/ClassroomController.java#L27) | 类前缀 27；status 55；enter 60；leave 81；start 90；end 100；kick 110；members 120 |
| [api/…/WebSocketConfig.java](api/classroom-service/src/main/java/com/classroom/config/WebSocketConfig.java#L42) | 三条通道注册 42-53 |
| [api/…/ClassroomSignalHandler.java](api/classroom-service/src/main/java/com/classroom/ws/ClassroomSignalHandler.java#L28) | 初始状态推送 48；消息路由 54-71 |
