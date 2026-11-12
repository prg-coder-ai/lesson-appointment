# 多实例部署下 MySQL 侧风险分析与应对

> 编写时间：2026-11-05 21:15（GMT+8）
> 适用对象：`api`（booking-api，8081）+ `api/message-service`（8090）双服务横向扩实例
> 结论依据：以**当前仓库代码与配置的实际内容**为准，逐条标注证据位置；不包含凭经验的泛泛之谈。
> 范围说明：本文只讨论「多实例 × 单一 MySQL」引入的风险。MySQL 高可用（主从/集群）作为部署选项单列，不假设已经具备。

---

## 0. 结论摘要

### 0.1 一句话结论

本项目的**并发正确性基本押在数据库上**（行锁、唯一键、`ON DUPLICATE KEY UPDATE`），这个选择让横向扩实例的代价远低于「靠 JVM 内存做一致性」的系统——**核心业务不会因为加实例而超卖或重复发通知**。

真正的短板不在业务逻辑，在**三处进程内存**（SSE 连接表、刷新令牌轮换缓存、会话续期节流）和**一批没有 leader election 的定时任务**。这四处会在加第二个实例的当天就出问题。

### 0.2 风险总览

| 编号 | 风险 | 等级 | 是否当天暴露 | 影响面 |
|---|---|---|---|---|
| R-01 | 8 个 `@Scheduled` 无分布式锁，每实例全量重复执行 | **P0** | 是 | 监控数据失真、重复外部 HTTP |
| R-02 | 连接池未配置（默认 10），连接数随实例线性爆 | **P0** | 是（压测/高峰） | 全站 503 雪崩 |
| R-03 | MySQL 单点，`readiness` 含 db → 库挂全实例摘流 | **P0** | 是（故障时） | 全站不可用、无降级 |
| R-04 | SSE 在线表在进程内存（`emitters`） | P1 | 是 | 实时推送丢一半 |
| R-05 | 上传文件落本地磁盘，`/file/**` 由本实例伺服 | P1 | 是 | 图片 404 |
| R-06 | `RefreshTokenRotationCache` 进程内，30s TTL | P1 | 是（多标签页） | 用户被踢下线 |
| R-07 | `UserSessionService.touchCache` 进程内节流 | P2 | 否（放大 N 倍） | 写库量 ×N |
| R-08 | 雪花 `workerId` 未显式配置 | P2 | 否（概率性） | 偶发主键冲突 |
| R-09 | 无死锁/锁等待重试；`aggregateHourly` 先查后插竞态 | P1 | 是（并发高时） | 任务抛异常、500 |
| R-10 | nginx 单上游硬编码，无健康检查与故障转移 | **P0** | 是 | 扩了实例也没用 |
| R-11 | `devtools` 热部署在生产开启 | P2 | 否 | 重启抖动 |
| R-12 | `SysConfigService` 无缓存，每请求查库 | P2 | 否 | DB QPS 放大 |
| R-13 | 日志路径同机冲突 / 容器卷 | P2 | 视部署 | logback 互相踩 |
| R-14 | DDL 手工执行、无版本化迁移 | P2 | 滚动发布时 | 新旧版本撞 schema |

**优先级判断**：R-01 / R-02 / R-10 是「加了实例反而更糟」的三项，必须同批处理；R-04 / R-05 / R-06 是「功能肉眼可见坏掉」的三项，随扩实例一起改；其余可排期。

---

## 1. 现状基线（事实层）

### 1.1 部署拓扑（当前）

```
nginx (127.0.0.1)  ──8081──▶  booking-api   ×1
       └───8090──▶  message-service ×1
                          │
                          ▼
                   MySQL 8 (单实例, localhost:3306 / lesson_appointment)
```

证据：`deploy/nginx/booking.conf:63-114`（全部 `proxy_pass http://127.0.0.1:8081` / `:8090`，**无 `upstream` 块、无健康检查、无 `ip_hash`**）。

### 1.2 已核实的配置事实

| 项 | 现状 | 证据 |
|---|---|---|
| 连接池 | **未配置**，HikariCP 全默认（`maximum-pool-size=10`、`minimum-idle=10`、`connection-timeout=30000ms`） | `api/src/main/resources/application.properties:93-103`（仅 4 行 datasource，无 hikari 段） |
| MySQL `max_connections` | 1000 | `docker/mysql8/conf/my.cnf.txt:7` |
| MySQL `innodb_buffer_pool_size` | 256M | `docker/mysql8/conf/my.cnf.txt:6` |
| 隔离级别 | 未显式配置 → 默认 REPEATABLE READ | 全仓库无 `transaction-isolation` |
| 中间件 | **无 Redis、无 MQ** | `grep -ri redis api/pom.xml api/**/*.properties` 零匹配 |
| 定时任务 | 8 个 `@Scheduled`，无任何 leader 选举 | `NotifyTask.java:91`、`MonitorTask.java:55/73/88/108/123/139/171` |
| 调度线程池 | `pool.size=4` + 优雅停机 20s | `application.properties:272-281` |
| 主键策略 | `ASSIGN_ID`（雪花），部分表 `AUTO` | `Booking.java:20`、`Course.java:22`、`AuthRateCounter.java:36` |
| DDL 管理 | 手工执行 `.sql` patch，无 flyway/liquibase | `api/sql/patch/`、无 `spring.sql.init` |
| 业务健康探针 | `readiness` 组包含 `db` | `application.properties:228` |

### 1.3 天然适配多实例的设计（这是本项目的资产）

这五项不靠任何进程内状态，扩实例**零改动**，改动时不要破坏它们：

| 机制 | 实现 | 证据 |
|---|---|---|
| **席位不超卖** | 排期行锁 `FOR UPDATE` + 锁定读计数，且调用方全在 `@Transactional` 内 | `BookingSeatService.java:82-103`、`BookingService.java:59/137/182/273` 均有 `@Transactional` |
| **登录风控计数** | `auth_rate_counter` 的 `INSERT ... ON DUPLICATE KEY UPDATE cnt+1` | `AuthRateCounterMapper.java:33-35` |
| **滑块票据** | `auth_challenge` 落库，非内存 | `AuthChallenge.java:35`（`IdType.INPUT`） |
| **通知不重发** | `notification_dispatch_log` 唯一键 `uk_dispatch_once(appointment_id, seq, receiver_user_id, dedup_key)`，靠撞键幂等 | `schema/20261013-0400-...sql:381`、`NotifyTask.java:87-88` |
| **重复预约** | `booking` 唯一键 `uk_booking_schedule_student(schedule_id, student_id)` | `schema/...sql:100` |
| **踢下线** | `user_refresh_token` 落库，不是内存黑名单 | `RefreshTokenService.java:90` |
| **租户隔离** | `ThreadLocal` + `TenantAwareExecutor` 在工作线程内显式 set/clear | `TenantAwareExecutor.java:36-46` |
| **JWT 无状态** | 密钥走环境变量，各实例一致即可 | `application.properties:172` |

> 关键判断：**席位守卫的正确性依赖 `@Transactional` 边界**。当前 4 个占位入口全部有事务注解，行锁在事务提交时释放——这条链路在多实例下是成立的。若日后有人把某个调用方的事务注解去掉，超卖会立刻在双实例下复现，且单实例压测不一定能复现。建议补守卫钉住这 4 个方法上的 `@Transactional`。

---

## 2. P0 风险

### R-01 定时任务无 leader 选举，每个实例全量重复执行

**触发条件**：实例数 ≥ 2，`monitor.task.enabled=1`。

**证据**：8 个 `@Scheduled` 全部是裸注解，无 `@SchedulerLock`、无租约表、无 Redis。`MonitorTask` 的类注释甚至直接写明「单机部署」。

**后果（按任务逐个拆）**：

| 任务 | 多实例后果 | 严重度 |
|---|---|---|
| `MonitorTask.sampleMetrics`（60s） | 每实例采**自己的** JVM/CPU/磁盘，`sys_metric_sample` **无唯一键**（`schema:529-547`，只有 `idx_sample_time`）→ 行数 ×N；监控页 `avg` 把不同实例的指标混算 → **数字完全失真**，且清理任务按行数算保留期，历史窗口被动缩短 | 🔴 用户可见 |
| `MonitorTask.aggregateHourly`（每小时 05 分） | `selectOne` → `insert`（`MonitorService.java:203-211`）。两实例同时在 05 分进去，都查到 null，都 insert → 后到的撞 `uk_hour`（`schema:517`）抛 `DuplicateKeyException`，整轮任务中断 | 🟠 日志噪音+任务中断 |
| `NotifyTask.dispatchLessonReminders`（60s） | 靠 `uk_dispatch_once` 幂等，**不会重复发通知**；但 N 个实例各扫一遍全租户 → 对 message-service 的 HTTP 调用 ×N，被唯一键拒掉的无效写入 ×N。`TenantAwareExecutor` 队列只有 64，满后走 `CallerRuns` 压回调度线程（`TenantAwareExecutor.java:64-76`）→ 多实例下更容易压满 | 🟠 资源浪费 |
| `snapshotTenantStats` / `reconcileQuota` / `cleanHistory` / `cleanExpiredSession` | 幂等，但白跑一遍，吃连接 | 🟡 |

**应对（三选一，推荐 B）**：

| 方案 | 做法 | 优点 | 代价 |
|---|---|---|---|
| A. 分工部署 | 用 profile 区分「跑任务的实例」与「只接流量的实例」，只让 1 台 `monitor.task.enabled=1` | 零代码、零中间件 | 那台挂了任务全停；扩缩容要人工维护 |
| **B. DB 租约（推荐）** | 引入 `shedlock-spring` + `shedlock-provider-jdbc-template`，用现成的 MySQL 建一张 `shedlock` 表，每个任务加 `@SchedulerLock(name="sampleMetrics", lockAtMostFor="PT2M")` | 复用已有关键基础设施，**不引 Redis**；故障自动接管 | 每个任务多 1 次 DB 往返（可忽略） |
| C. 自建租约表 | 自己写 `sys_job_lock(job_name, holder, expire_at)`，抢到才跑 | 无新依赖 | 要自己处理续租、时钟漂移、释放 |

方案 B 的最小落地：

```xml
<!-- pom.xml -->
<dependency>
  <groupId>net.javacrumbs.shedlock</groupId>
  <artifactId>shedlock-spring</artifactId>
  <version>5.13.0</version>
</dependency>
<dependency>
  <groupId>net.javacrumbs.shedlock</groupId>
  <artifactId>shedlock-provider-jdbc-template</artifactId>
  <version>5.13.0</version>
</dependency>
```

```sql
CREATE TABLE shedlock (
  name       VARCHAR(64)  NOT NULL PRIMARY KEY,
  lock_until TIMESTAMP(3) NOT NULL,
  locked_at  TIMESTAMP(3) NOT NULL,
  locked_by  VARCHAR(255) NOT NULL
) ENGINE=InnoDB;
```

```java
@Configuration
@EnableSchedulerLock(defaultLockAtMostFor = "PT10M")
public class SchedulerLockConfig {
    @Bean
    public LockProvider lockProvider(DataSource ds) {
        return new JdbcTemplateLockProvider(JdbcTemplateLockProvider.Configuration.builder()
                .withJdbcTemplate(new JdbcTemplate(ds))
                // 关键：用数据库时钟，不用各实例的本地时钟，避免多机时钟漂移导致租约提前失效
                .withUsingDbTime()
                .build());
    }
}
```

> ⚠️ `withUsingDbTime()` 不能省。多实例部署在**不同机器**上时，NTP 漂移几十秒是常态，用本地时钟会让租约提前过期 → 两个实例同时持有锁，等于没加。

**顺带修掉 `aggregateHourly` 的竞态**（即使有锁也只治了并发，治不了重跑）：

```java
// MonitorService.java:203-211 现写法（先查后插）
// 改为依赖 uk_hour 的原子 upsert：
INSERT INTO sys_metric_hourly (hour_time, sample_count, cpu_system_avg, ...)
VALUES (...)
ON DUPLICATE KEY UPDATE
  sample_count = VALUES(sample_count), cpu_system_avg = VALUES(cpu_system_avg), ...
```
（`ON DUPLICATE KEY UPDATE ... VALUES()` 在 MySQL 8.0.20+ 已标记废弃，8.4 环境建议改用别名语法：`INSERT ... AS new ON DUPLICATE KEY UPDATE col = new.col`。）

**`sys_metric_sample` 需要多实例改造**：给 `sample_time` 维度加实例标识，或者接受「每实例一行」但把监控页的查询改成 `GROUP BY 实例`。最小的正确做法是加一列 `instance_id`：

```sql
ALTER TABLE sys_metric_sample ADD COLUMN instance_id VARCHAR(64) NOT NULL DEFAULT 'default' COMMENT '实例标识',
  ADD KEY idx_instance_time (instance_id, sample_time);
```
并在监控页按实例分开展示——否则「平台 CPU 45%」这种数字在多实例下本就无意义，它是 N 个进程的平均值。

---

### R-02 连接池未配置，连接需求随实例数线性叠加

**触发条件**：并发请求上升，或实例数 ≥ 3 后叠加定时任务。

**证据**：`application.properties:93-103` 只有 url/username/password/driver，**没有任何 `spring.datasource.hikari.*`**。HikariCP 默认 `maximumPoolSize=10`、`minimumIdle=10`、`connectionTimeout=30000`。

**后果链**：

```
实例 ×3，每实例 10 连接（api）+ 10（message-service 同款默认）
        → 打底 60 连接，全部是 minimumIdle 常驻
        → 突发时 60 涨到 max，MySQL 侧 60 个活跃会话
        → 若某条 SQL 变慢（缺索引/锁等待），池被占满
        → connectionTimeout=30s，Tomcat 200 线程全部堵在 getConnection 上 30 秒
        → 探针 /actuator/health 也要 DB（readiness 组含 db）→ 超时 → 摘流
        → 全部实例同时被摘 → 全站 503
```

最后两步是本项目特有的放大项：**`readiness` 组包含 `db`**（`application.properties:228`），连接池耗尽时健康检查会跟着失败，把「局部慢」升级成「全实例摘流」。

**应对：显式配置连接池（每个服务各配一份）**

```properties
# 每实例上限 15：按 Tomcat 200 线程 × 单请求平均持有连接 < 10% 估算，
# 低于此值在高峰会排队，高于此值只是把 MySQL 的连接预算提前吃掉。
spring.datasource.hikari.maximum-pool-size=15
spring.datasource.hikari.minimum-idle=5
# 3s 而不是默认 30s：拿不到连接要快速失败，让 Tomcat 线程尽早归还，
# 而不是把 200 个线程一起挂在 30 秒的等待上（那才是雪崩的形状）。
spring.datasource.hikari.connection-timeout=3000
spring.datasource.hikari.validation-timeout=2000
# 必须小于 MySQL 的 wait_timeout，否则会拿到已被服务端掐掉的长连接（报 "Communications link failure"）。
# 本机 my.cnf 未设置 → 默认 28800s；云数据库常被调到 60~600s，**部署前必须 SELECT @@wait_timeout 核对**。
spring.datasource.hikari.max-lifetime=1200000
spring.datasource.hikari.keepalive-time=60000
spring.datasource.hikari.pool-name=booking-api
```

**容量核算（部署前必须过一遍）**：

| 项 | 公式 | 示例（api×3 + msg×2） |
|---|---|---|
| 峰值连接需求 | `api实例数×15 + msg实例数×15` | 45 + 30 = **75** |
| MySQL 侧安全上限 | `max_connections × 0.8` | 1000 × 0.8 = 800 |
| 单实例常驻 | `minimum-idle` | 5 + 5 = 25 |
| 是否通过 | 75 ≤ 800 ✅ | 余量充足 |

但**通过不等于健康**：`innodb_buffer_pool_size=256M`（`my.cnf.txt:6`）对 SaaS 偏小。每连接还要吃 `sort_buffer_size`(256K) + `join_buffer_size`(256K) + 线程栈，75 连接约 40~60MB，加上 buffer pool 共 320MB 左右——若 MySQL 容器内存限制是 512M，高峰会 OOM。部署时把 `innodb_buffer_pool_size` 提到物理内存的 50~60%，并给容器留 1G 以上余量。

**另需注意**：`max_connections=1000` 不是越大越好。1000 连接在 256M buffer pool 下，一旦真有 1000 个并发活跃会话，纯内存开销就会压垮实例。建议按实际需求调成 `200`，让连接打满时快速报错（`Too many connections`）而不是把 MySQL 拖到 swap。

---

### R-03 MySQL 单点，且没有降级路径

**触发条件**：MySQL 重启、网络抖动、主从切换、磁盘满。

**证据**：连接串写死单点 `localhost:3306`（`application.properties:94`），无 failover 参数；`readiness` 组含 `db`。

**后果**：MySQL 一挂，N 个实例的 `readiness` 同时报 DOWN，nginx/k8s 全部摘流。这**语义正确**（不能服务就不该接流量），但系统从「部分可用」直接跌到「完全不可用」，且没有任何兜底。

**应对（按投入排序）**：

1. **必做**：`liveness` 保持只查存活（已是现状，`application.properties:227`）——不要在 DB 挂时触发重启，重启救不了 DB，只会把连接池冷启动叠加上去，形成「DB 抖动 → 全实例重启 → 更抖」的雪崩。这条已经做对了，**别改**。
2. **必做**：开启 binlog + 每日全量备份 + 定期恢复演练。多实例下 PITR 是唯一救命手段，`deploy/backup.sh` 需确认是否含 `--single-transaction --source-data=2`（`--source-data` 是 8.4 的新名，旧名 `--master-data`）。
3. **建议**：一主一从 + 只读走从库。本项目读远多于写（仪表盘、列表、统计），`@Transactional(readOnly=true)` 已有基础（如 `BookingService.java:316`），可据此路由。
4. **可选**：连接串加 `failover`/中间件（ProxySQL、MySQL Router）。注意 MySQL Connector/J 原生不支持多主机 failover，需要外部组件。

---

### R-10 nginx 单上游硬编码，扩实例等于白扩

**触发条件**：立刻。你现在把 api 起 3 个实例，nginx 只往 127.0.0.1:8081 打。

**证据**：`deploy/nginx/booking.conf` 全部 `proxy_pass http://127.0.0.1:8081`、`:8090`，无 `upstream` 块。

**应对**：

```nginx
# http 上下文（或 conf.d 独立文件）
upstream booking_api {
    server 127.0.0.1:8081 max_fails=3 fail_timeout=10s;
    server 127.0.0.1:8082 max_fails=3 fail_timeout=10s;
    server 127.0.0.1:8083 max_fails=3 fail_timeout=10s;
    keepalive 32;              # 复用连接：不配的话每个请求都建一次 TCP
}

upstream message_api {
    # SSE 必须粘性，见 R-04
    ip_hash;
    server 127.0.0.1:8090 max_fails=3 fail_timeout=10s;
    server 127.0.0.1:8091 max_fails=3 fail_timeout=10s;
    keepalive 32;
}
```

```nginx
location /api/v1/ {
    proxy_pass http://booking_api;
    include /etc/nginx/proxy_params;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    # ⚠️ 默认 proxy_next_upstream 会把 POST 也重放到下一台 → 重复下单。
    # 只对幂等方法开故障转移，"non_idempotent" 明确排除。
    proxy_next_upstream error timeout http_502 http_503 http_504;
    proxy_next_upstream_tries 2;
    proxy_next_upstream_timeout 5s;
}
```

> `proxy_next_upstream` 的默认值**包含** `non_idempotent` 之外的所有 error/timeout 情况，即 POST 也可能被重放。本项目下单、支付类接口（`POST /booking`）必须排除，否则「超时→重放到另一台」会造成重复业务动作。**唯一键能挡住重复插入，但挡不住重复的副作用**（如余额扣减、优惠券核销）。要么显式关闭 non-idempotent 重放，要么确保这些接口自身带幂等键。

**健康检查**：nginx 开源版没有主动健康检查，只能靠 `max_fails` 被动探测。若用云 LB 或 nginx plus，把 `/actuator/health/readiness` 配成主动探测（该端点已就绪，`application.properties:226-228`）。

---

## 3. P1 风险

### R-04 SSE 在线连接表在进程内存

**证据**：`message-service/.../SsePushService.java:31` — `private final Map<String, SseEmitter> emitters = new ConcurrentHashMap<>();`

**后果**：
- 用户连在实例 1，消息由实例 2 处理 → `pushTo(userId)` 在实例 2 找不到 emitter，**静默不推送**（`SsePushService.java:68-78` 的分支）；
- `onlineCount()` 只统计本实例，监控页在线数变成 1/N（而 `sys_user_session` 表才是权威统计源，两处数字会打架）；
- 同一个用户在两台各建一条连接（重连落到不同实例），旧连接不会被 `emitters.put` 覆盖清理（`SsePushService.java:39` 的旧连接替换只在**同实例内**生效）→ 连接泄漏，直到 TCP 超时。

**应对（分层）**：

| 层 | 做法 | 说明 |
|---|---|---|
| 正确性兜底（必做） | 客户端在 SSE 断开/超时后，退回 30~60s 轮询未读数 | 消息**已经落库**（memory 里的设计就是「REST 落库 + SSE 单向推送」），SSE 只是加速通道。让丢失成为「延迟 30s」而不是「消息消失」，这是最小代价的正确性保证 |
| 命中率提升（推荐） | 上游 `ip_hash`（见 R-10），把同一用户尽量钉在同一实例 | 扩容/缩容时 hash 环变化会让部分用户漂移，所以它只是优化，不能替代上一层 |
| 彻底方案 | Redis Pub/Sub 或 MySQL 轮询广播：任一实例收到消息后向所有实例广播 | 引入新中间件，若后续还要做别的事（缓存、分布式锁）才值得 |

**必须同时修的一处**：`onlineCount()` 与监控页在线数应统一以 `sys_user_session` 为准，不要在 UI 上暴露「本实例在线数」这种多实例下无意义的指标。

### R-05 上传文件落本地磁盘

**证据**：`application.properties:315` — `teacher.upload.path=${TEACHER_UPLOAD_PATH:${user.home}/teacher-uploads}`；写入在 `TeacherProfessionalService.java:470` 的 `file.transferTo(...)`。

**后果**：实例 1 上传成功、URL 写库（`/file/xxx.jpg`）；用户下次请求落到实例 2 → 本地无此文件 → **404，图片全挂**。且 N 个实例各存一份，无同步、无回收。

**应对**：
- **最小改动**：`TEACHER_UPLOAD_PATH` 指向共享挂载（NFS / EFS / CFS）。改一个环境变量，代码零改。适合内网自建、实例数 ≤ 5。
- **推荐**：接对象存储（OSS/COS/MinIO），上传直传或服务端中转，DB 存 URL 不变。注意 DB 里已存的相对 URL（`/file/xxx.jpg`）需要迁移或做兼容前缀映射。
- **不要做的**：让 nginx 只代理到一个「文件专用实例」。那样上传走 A、读走 B 的一致性靠运气，且挂了就全丢。

> 本项目「DB 只存短 URL、不存 base64」的设计（`application.properties:330-331`）在这里正好帮了忙——换存储只需改上传与伺服两端，DB 无需动。

### R-06 刷新令牌轮换缓存是进程内 Map

**证据**：`RefreshTokenRotationCache.java:28-29` 类注释明确写着「进程内缓存，多实例部署时各实例独立（**本项目为单实例 booking jar**）」。

**后果**：用户的浏览器三个标签页，access token 同时过期，三个刷新请求被 nginx 分到实例 1/2/3：
- 实例 1 轮换成功，删掉旧 refreshToken，写入进程内缓存；
- 实例 2、3 查不到缓存 → `checkValidToken` 返回 null → **401 → 前端清登录态**。

现象是「用户偶发被踢下线」，且**只在多标签页 + 恰好过期时复现**——极难定位。这个缓存当初就是为了修单实例下的同一问题（类注释第 1 段），多实例后它修不了自己。

**应对**：把 30 秒宽限期从进程内存搬到 DB，与 `user_refresh_token` 同源。

```sql
-- 方案：轮换时不立即物理删除旧凭证，而是打标记 + 记录接替者，30s 后由定时清理
ALTER TABLE user_refresh_token
  ADD COLUMN rotated_at   DATETIME NULL COMMENT '被轮换时间，非空表示已失效',
  ADD COLUMN replaced_by  VARCHAR(512) NULL COMMENT '接替本凭证的新 refreshToken（密文），30s 宽限期用',
  ADD KEY idx_rotate_cleanup (rotated_at);
```

`rotateToken` 逻辑改为：

```
1. SELECT ... FOR UPDATE 命中旧凭证行（行锁天然跨实例串行）
2. 若 rotated_at 非空 且 now() - rotated_at <= 30s 且 replaced_by 非空
      → 直接返回 replaced_by 对应的双 token（复用，不判失效）
3. 否则签发新 token，旧行 rotated_at = now()、replaced_by = 新 token
4. kickUser 时把 rotated_at 一并置为非空（踢下线语义不变）
5. 定时任务清理 rotated_at < now()-1d 的行
```

这样 `RefreshTokenRotationCache` 整个类可以删掉，多实例天然一致。

> 注意 `replaced_by` 存的是 refreshToken 本身，必须沿用现有的加密方式（项目对敏感字段有 AES-GCM 加密基础设施，`crypto.aes-key`），**不要明文入库**。

### R-09 无死锁重试 + 一处明确的先查后插竞态

**证据**：
- 全仓库 `grep -rn "Deadlock\|Retryable"` 只命中业务语境的 `tenant.code.max.retry`（租户码重试），**没有任何 `@Retryable` 或 `DeadlockLoserDataAccessException` 处理**；
- `MonitorService.java:203-211` 的 `selectOne → insert/updateById` 是显式竞态。

**后果**：
1. 席位守卫加锁顺序固定（先排期行锁、再 bookings 行，`BookingSeatService.java:34-35` 注释），**不会自造死锁**；但同一排期被大量并发占位时锁等待排队，`innodb_lock_wait_timeout` 默认 **50 秒** → Tomcat 线程干等 50s → 该实例池被打满 → 触发 R-02 的雪崩链。
2. 跨排期的批量操作（如管理员批量改排期）可能因加锁顺序不同产生真死锁 → `DeadlockLoserDataAccessException` → 直接 500，无重试。

**应对**：
```properties
# 把锁等待从 50s 压到 5s：宁可快速失败给用户「名额已满/请重试」，
# 也不要让 200 个 Tomcat 线程一起挂在锁等待上。
# 这是应用层参数，在 MySQL 侧设也可以，但按项目设可以让多实例各自调。
```
```java
# 连接串（application.properties:94）追加
&sessionVariables=innodb_lock_wait_timeout=5
```

```java
// 关键写路径加重试，只对「可安全重放」的异常，且次数极低
@Retryable(
    retryFor = { DeadlockLoserDataAccessException.class, CannotAcquireLockException.class },
    maxAttempts = 3,
    backoff = @Backoff(delay = 50, multiplier = 2, random = true)  // random 让多实例不同步重试
)
@Transactional(rollbackFor = Exception.class)
public String create(Booking booking) { ... }
```
> ⚠️ 重试必须包在**事务外层**（`@Retryable` 在 `@Transactional` 之外，由代理链保证），否则重试发生在同一事务里，死锁事务已被 MySQL 回滚，重试必然继续失败。

---

## 4. P2 风险（排期处理）

### R-07 `touchCache` 进程内节流

`UserSessionService.java:39` — `Map<String, Long> touchCache`，60 秒节流窗口。多实例后每个实例各持一份，**续期 UPDATE 次数 ×N**。不破坏正确性，但吃掉 R-02 的连接预算。

**改法（顺带简化）**：删掉内存 Map，改成 DB 条件更新，节流语义交给 SQL：

```sql
UPDATE sys_user_session
   SET last_active_time = NOW()
 WHERE session_id = #{id}
   AND last_active_time < DATE_SUB(NOW(), INTERVAL 60 SECOND)
```
影响行数 0 就说明还在窗口内，无需再判。天然多实例安全，且省掉一整块内存状态。

### R-08 雪花 `workerId` 未显式配置

`Booking.java:20`、`Course.java:22` 用 `IdType.ASSIGN_ID`。MyBatis-Plus 的 `DefaultIdentifierGenerator` 由 **IP + 进程 PID** 派生 `workerId/datacenterId`：
- 同机多进程：PID 不同 → 安全；
- 不同机器/容器：IP 不同 → 安全；
- **容器内取不到 `InetAddress.getLocalHost()`**（无 hostname 映射时）→ 退化成随机值 → 撞号概率虽低（1/1024 量级），但撞上就是 `Duplicate entry` 插入失败，且**只在加实例那天偶发**，排查成本极高。

**应对**：显式注入，或统一换成 DB 号段。最轻的做法是每个实例启动参数带 `-Dmybatis-plus.worker-id=1`，并在 `MyBatisPlusConfig` 里显式构造 `DefaultIdentifierGenerator(workerId, datacenterId)`。若不想维护，改用 `IdType.AUTO` 依赖 MySQL 自增（本项目多数表已是 `AUTO`，混用两种策略本身就是一处不一致）。

### R-11 `devtools` 在生产开启

`application.properties:135` — `spring.devtools.restart.enabled=true`，`application-cloud.properties` **未覆盖**。devtools 会监视 `src/main/java`（容器里不存在，所以实际不会重启），但它同时注册了额外的类加载器与文件监视，**生产包不应包含**。

**应对**：`pom.xml` 里 `<scope>provided</scope>`（若已如此可直接排除），并在 cloud profile 显式写 `spring.devtools.restart.enabled=false`。

### R-12 `SysConfigService` 无缓存

`SysConfigService.getByKey` 每次直接 `selectOne`（`SysConfigService.java:44-48`）。`MonitorTask`、`NotifyTask` 每一轮都反复读配置。

**好处**：多实例配置天然一致（这正是它现在「看起来没问题」的原因）。
**代价**：DB QPS 被放大。`NotifyTask` 每轮逐租户读配置，租户数 × 实例数 = 查询次数。

**应对**：加 Caffeine 本地缓存，TTL 30s。代价是配置修改后最长 30s 才全实例生效——对采样间隔、保留天数这类参数完全可接受。若要求「改完立刻生效」，就在 `updateConfig` 后清缓存 + 客户端轮询版本号（过度设计，不建议）。

### R-13 日志路径冲突

`tools/check-scheduler-guard.mjs:145-163` 已经检查了「两个服务的 `logging.file.path` 不能相同」。多实例部署在同一台机器时，还需要：
- 每个实例独立 `LOG_PATH`；
- logrotate 的 `postrotate` 用 `kill -USR1` 或按实例分文件。

同目录多进程写同一文件时，logback 的 rolling 会让 fd 指向已改名的 inode，**日志静默丢失**——排查时看到的「日志断了」不是服务挂了。

### R-14 DDL 无版本化，滚动发布撞 schema

`api/sql/patch/` 是手工执行的 `.sql`，仓库无 flyway/liquibase。

**后果**：多实例滚动发布时，老版本实例正在跑，新版本 DDL 已执行 → 老实例的 `SELECT *` 遇到新列（通常无害），但如果 DDL 是**重命名/删除列**，老实例立刻报 `Unknown column`，而新实例又依赖新列 → **没有任何窗口是全部实例都正常的**。

**应对（发布纪律，不用上工具）**：
1. 一律**先加列后改代码**，两步发布；删除列至少隔一个版本。
2. 新增列必须有 `DEFAULT` 且可空，避免老实例 insert 失败。
3. 大表 DDL 用 `ALGORITHM=INPLACE, LOCK=NONE`，避免锁表期间所有实例的写入被卡。

---

## 5. 实施路线

### Phase 1 — 扩实例前必须完成（否则别加第二个实例）

| # | 事项 | 估工 | 验收方式 |
|---|---|---|---|
| 1 | 连接池显式配置（api + message-service 各一份） | 0.5h | `SHOW PROCESSLIST` 观察连接数与池配置一致 |
| 2 | nginx `upstream` + `keepalive` + 排他 `proxy_next_upstream` | 1h | 停一台实例，请求不报 5xx 且 POST 未被重放 |
| 3 | ShedLock（或单实例跑任务）+ `aggregateHourly` 改 upsert | 2h | 起 2 实例，跑一个整点，`sys_metric_hourly` 每行只有一条、无异常日志 |
| 4 | `sys_metric_sample` 加 `instance_id`，监控页按实例展示 | 2h | 2 实例各一行，数字不再混算 |
| 5 | `innodb_lock_wait_timeout=5` | 0.2h | 压测下不再是 50s 干等 |
| 6 | 确认 `SELECT @@wait_timeout` 与 `max-lifetime` 的关系 | 0.2h | 长连接不出现 `Communications link failure` |

### Phase 2 — 与扩实例同批（功能会坏）

| # | 事项 | 估工 |
|---|---|---|
| 7 | SSE：客户端轮询兜底 + `ip_hash` | 1d（前端 + 联调） |
| 8 | 上传改共享挂载或对象存储 | 0.5~2d（取决于对象存储接入） |
| 9 | `RefreshTokenRotationCache` 迁到 `user_refresh_token` 宽限期字段 | 1d |
| 10 | `onlineCount` 与监控页统一以 `sys_user_session` 为准 | 0.5d |

### Phase 3 — 可排期

| # | 事项 |
|---|---|
| 11 | `touchCache` 改 DB 条件更新 |
| 12 | 雪花 `workerId` 显式注入 |
| 13 | `SysConfigService` 加 30s 本地缓存 |
| 14 | cloud profile 关 devtools |
| 15 | binlog + 备份演练（PITR 实际跑一次） |
| 16 | `innodb_buffer_pool_size` 按实例内存重算、`max_connections` 收敛到 200 |
| 17 | 给 4 处 `@Transactional` 加守卫（防止未来有人删掉导致超卖在多实例下复现） |

---

## 6. 验收清单（起 2 实例后逐项验）

- [ ] 同一排期 5 并发下单，`booking` 行数 ≤ `available_sites`，无超卖（**这条在单实例下也应成立，多实例是加倍验证**）
- [ ] 上课提醒：同一课次同一用户只收到 1 条（查 `notification_dispatch_log` 只有一行）
- [ ] 一个整点过后，`sys_metric_hourly` 对应小时只有 1 行；日志无 `DuplicateKeyException`
- [ ] `sys_metric_sample` 每实例各一行，`instance_id` 可区分
- [ ] 强制 kill 一台实例：nginx 10s 内摘除，`POST /booking` 不出现重复记录
- [ ] 三标签页同时让 access token 过期：三处都刷新成功，无 401 踢出
- [ ] 实例 A 上传图片，从实例 B 访问 `/file/xxx` 返回 200
- [ ] 用户连 SSE 在实例 A，从实例 B 发消息：30~60s 内客户端能收到（轮询兜底生效）
- [ ] 登录风控：5 次错误密码后第 6 次仍被拦（跨实例计数不丢）
- [ ] MySQL 重启：`liveness` 保持 UP、`readiness` 转 DOWN、DB 恢复后**不重启进程**自动恢复
- [ ] 压测峰值：`hikaricp.connections.active` 达上限时返回 503 而非全站挂死（`connection-timeout=3s` 生效）

---

## 7. 附录：核对命令

```bash
# 1. 确认连接池真实生效值
curl -s localhost:8081/actuator/health | jq .
# （env/beans 端点已关闭，池参数用日志确认：启动时 HikariPool 会打印 maxPoolSize）

# 2. MySQL 侧现状
mysql -uroot -p -e "
  SELECT @@max_connections, @@wait_timeout, @@innodb_lock_wait_timeout,
         @@innodb_buffer_pool_size/1024/1024 AS buffer_pool_mb,
         @@transaction_isolation;
  SHOW STATUS LIKE 'Threads_connected';
  SHOW STATUS LIKE 'Max_used_connections';"

# 3. 谁在占连接（多实例后重点看这个）
mysql -uroot -p -e "SELECT host, COUNT(*) FROM information_schema.processlist GROUP BY host ORDER BY 2 DESC;"

# 4. 锁等待现场（出现卡死时）
mysql -uroot -p -e "SELECT * FROM performance_schema.data_lock_waits\G"

# 5. 确认定时任务是否在多实例重复跑
grep -c "dispatchLessonReminders" logs/booking.log     # 每实例各一份，日志里应只看到一份在动

# 6. 备份是否可恢复（别只看文件存在）
gunzip -c backup.sql.gz | head -5
```

---

## 8. 一句话收尾

这个项目的多实例风险**不在 SQL，在进程内存**。数据库侧该做的（行锁、唯一键、原子累加、租户上下文跨线程）都已经做对了，而且注释里写了原因——这是很扎实的底子。

加实例真正要付的账是四处进程内状态（SSE 表、轮换缓存、会话节流、上传目录）+ 一批没人管的定时任务。这四处改完，剩下的就是容量核算和发布纪律，属于常规工作。
