# HTTP 状态码契约（29-b 方案 A，2026-10-10 生效）

> 适用服务：booking（8081）、message-service（8090），两者规则一致。
> 实现类：`com.reservation.common.ResultHttpStatusAdvice`、`com.messagecenter.common.ResultHttpStatusAdvice`。
> 本文取代此前「所有业务响应一律 HTTP 200」的旧口径。**对接/联调前必读。**

## 一、映射规则

服务端在统一出口处按 `Result.code` 设置 HTTP 状态：

| Result.code | HTTP 状态 | 说明 |
|---|---|---|
| 200（成功） | **200** | 正常业务成功 |
| 400 | **400** | 业务参数/规则错误（`ErrorCodes` 语义：Business/IllegalArgument） |
| 404 | **404** | 资源/用户不存在 |
| 409 | **409** | 业务冲突（如重复预订） |
| 500 | **500** | 服务器内部错误（兜底 handler） |
| **401（业务层）** | **200** | ⚠️ 刻意不映射，见下 |
| **403（业务层）** | **200** | ⚠️ 刻意不映射，见下 |
| 1001 | **200** | 微信登录专用业务码，保持 200 |
| 非 Result 体内 | 不介入 | 原样放行（含 message-service 兜底返回 null 场景） |

## 二、为什么业务 401/403 保持 HTTP 200（重点）

业务层的 401/403 大量存在且**大多不是鉴权问题**（如「您无权限执行该操作」的业务规则提示）。若映射成真 HTTP 401/403，会命中前端/小程序拦截器的鉴权分支：

- HTTP 401 → 清 token → 刷新重试 → 仍失败则踢回登录页（复现「刚登录被弹回登录页」历史 bug）
- HTTP 403 → 触发权限失败提示分支

因此约定：**真鉴权 401/403 由 Security/JwtFilter 过滤器层直出（JSON body 用 `message` 字段）**；业务层 401/403 保持 HTTP 200 + body.code 401/403，客户端走 `resolveResult` 提示，不清会话、不踢登录。

## 三、客户端对接要求

### 错误文案取值（两端已落地，2026-10-10）
HTTP 级错误（非 200）时：**优先读 body 的 `message`（或 `msg`）字段展示真实原因，固定文案仅兜底**：
- 401 分支例外：前端清态跳转路径保持固定文案
- Security 过滤器层的 401/403 JSON 同样用 `message` 字段，body 优先策略对它成立

### 必须同时处理的两个失败通道
1. **HTTP 非 200**：`error.response.status` 判定（400/404/409/500 会真实出现）
2. **HTTP 200 + body.code != 200**：判定 `res.code`（401/403/1001/其他业务码都在此通道）

只处理其中一个通道会漏掉一半错误。

## 四、给监控/告警的指引

4xx 不再等于「系统故障」——**业务规则失败（如注册重名→400、冲突→409）现在是正常语义**。建告警时：
- 5xx 比率：可告警
- 404 比率：可告警（接口路径错误/资源不存在突增）
- 400/409：仅作趋势观察，不建议一见 4xx 就告警
- 仓库内现有探针（healthcheck.sh、nginx、巡检手册）均指向 actuator/静态页，不受本变更影响

## 五、测试与守卫

- 单测：`api/src/test/java/com/reservation/common/ResultHttpStatusAdviceTest.java`（4 用例）
- 守卫：`npm run check:result-contract` 第⑤条钉住两个出口类；`fail(200)` 为静态禁形
- 反向测试：`node tests/check_result_contract_guard.js`（8 变异用例）
