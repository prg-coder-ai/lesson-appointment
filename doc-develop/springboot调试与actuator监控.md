# SpringBoot调试与Actuator监控对话记录
## 对话时间：2026-06-20
## 一、用户问题1：springboot的后端代码如何方便调试跟踪运行？
# SpringBoot 后端高效调试、跟踪运行全套方案
下面分**本地开发调试、线上日志跟踪、生产远程调试、代码埋点追踪**四大场景，覆盖日常开发到线上排错，简单易落地。

## 一、IDE 本地断点调试（最常用，开发必用）
### 1. IDEA 基础断点调试
1. **打断点**：代码行左侧点击红点；
   - 普通断点：行级暂停
   - 条件断点：右键红点 → `Condition`，输入表达式，满足才停（如 `userId == 1001`）
   - 日志断点：勾选 `Evaluate and log`，不暂停、直接打印变量，不阻塞流程
2. **启动方式**
   - 直接右键 `main()` → `Debug` 启动（不要 Run）
   - 或者配置 SpringBoot 启动配置，选择 Debug 按钮
3. 调试快捷键（IDEA）
   | 快捷键 | 作用 |
   |---|---|
   | F8 | 单步跳过（不进方法） |
   | F7 | 单步进入（进入自定义方法，不进JDK源码） |
   | Shift+F7 | 强制进入所有方法（含JDK、第三方包） |
   | Shift+F8 | 跳出当前方法 |
   | Alt+F9 | 运行到光标处 |
   | Alt+F8 | 临时执行表达式查看变量 |
4. 实用技巧
   - **查看所有请求链路**：在 `@RestController` 接口方法打条件断点，按请求参数过滤；
   - **跳过框架源码**：设置 `Settings -> Build,Execution,Debugger -> Stepping`，过滤 `org.springframework` 等包，调试不跳进Spring底层；
   - **多线程调试**：断点右键勾选 `Suspend: Thread`，只阻塞当前请求线程，不影响其他接口。

### 2. Eclipse 调试（简要）
- 右键启动类 → `Debug As -> Spring Boot App`
- 断点：双击行号；F5进入、F6跳过、F7返回、F8运行到下一断点

## 二、日志体系：无断点跟踪全链路（线上/本地通用）
断点只能本地，线上只能靠日志追踪，SpringBoot 默认集成 `logback`。
### 1. 规范日志打印（分层级）
```java
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@RestController
public class UserController {
    private static final Logger log = LoggerFactory.getLogger(UserController.class);

    @GetMapping("/user/{id}")
    public User getUser(Long id) {
        // 入参打印
        log.info("查询用户接口，入参userId:{}", id);
        try {
            User user = userService.getById(id);
            log.debug("数据库查询结果:{}", user); // debug本地开，线上关闭
            return user;
        } catch (Exception e) {
            log.error("查询用户失败，userId:{}", id, e); // 异常必须打印堆栈
            throw e;
        }
    }
}
```
日志级别：`TRACE < DEBUG < INFO < WARN < ERROR`
- 本地配置 `logging.level.root=DEBUG` 打印详细过程
- 线上配置 `logging.level.root=INFO`，减少磁盘IO

### 2. 全链路追踪（核心：MDC 打印请求ID）
**痛点**：并发接口日志混杂，分不清哪条日志属于同一个请求。
#### 实现全局过滤器，自动生成 traceId
```java
import org.slf4j.MDC;
import org.springframework.stereotype.Component;
import javax.servlet.*;
import java.io.IOException;
import java.util.UUID;

@Component
public class TraceFilter implements Filter {
    public static final String TRACE_ID = "traceId";

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain) throws IOException, ServletException {
        try {
            // 生成全局唯一请求ID
            String traceId = UUID.randomUUID().toString().replace("-", "");
            MDC.put(TRACE_ID, traceId);
            chain.doFilter(request, response);
        } finally {
            MDC.clear(); // 必须清理，防止线程池复用污染
        }
    }
}
```
修改 `logback-spring.xml` 日志格式，输出 traceId：
```xml
<pattern>%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] %-5level %logger{50} - traceId:%X{traceId} - %msg%n</pattern>
```
使用：线上根据 `traceId` grep 即可过滤单次请求完整日志，完美跟踪执行链路。

### 3. 持久化日志+滚动分割
配置 logback 按大小/日期分割日志，避免单文件过大，方便检索：
- 按天生成日志文件
- 超过100MB自动拆分
- 保留30天日志

## 三、AOP 统一拦截：自动打印接口入参、出参、耗时
不用每个接口手动写日志，AOP全局拦截所有Controller，自动记录请求信息，快速定位慢接口、参数错误。
```java
@Aspect
@Component
public class WebLogAspect {
    private static final Logger log = LoggerFactory.getLogger(WebLogAspect.class);

    // 拦截所有controller包下接口
    @Pointcut("execution(* com.xxx.demo.controller.*.*(..))")
    public void pointcut() {}

    @Around("pointcut()")
    public Object around(ProceedingJoinPoint joinPoint) throws Throwable {
        long start = System.currentTimeMillis();
        // 获取请求url、请求方式、参数
        ServletRequestAttributes attr = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        HttpServletRequest req = attr.getRequest();
        String url = req.getRequestURI();
        String method = req.getMethod();
        Object[] args = joinPoint.getArgs();

        log.info("接口请求 | url:{} | method:{} | params:{}", url, method, JSON.toJSONString(args));
        Object result = joinPoint.proceed();
        long cost = System.currentTimeMillis() - start;
        log.info("接口返回 | url:{} | cost:{}ms | result:{}", url, cost, JSON.toJSONString(result));
        return result;
    }
}
```
效果：每个接口自动打印入参、返回值、耗时，快速定位参数错误、慢查询。

## 四、MyBatis SQL 跟踪：打印完整执行SQL
开发时想看最终执行的SQL、参数、耗时，两种方式：
### 方式1：application.yml 配置日志
```yaml
logging:
  level:
    # 打印mapper完整sql
    com.xxx.demo.mapper: DEBUG
```
### 方式2：MyBatis-Plus 输出SQL（推荐）
```yaml
mybatis-plus:
  configuration:
    log-impl: org.apache.ibatis.logging.stdout.StdOutImpl
```
会完整输出：执行SQL、填充后的参数、影响行数，排查数据库慢查询、SQL写错非常方便。

## 五、远程调试（测试/预发环境，不能生产随便开）
本地代码和服务器jar包代码完全一致时，远程附加断点调试。
### 1. 启动jar时添加调试参数
```bash
java -agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=5005 -jar demo.jar
```
参数说明：
- `address=5005`：远程调试端口，防火墙放行
- `suspend=n`：不阻塞服务启动；`suspend=y` 启动后等待调试器连接再运行

### 2. IDEA 配置远程调试
1. `Run/Debug Configurations` → 新增 `Remote JVM Debug`
2. Host：服务器IP，Port：5005
3. 点击Debug连接，即可像本地一样打断点跟踪线上请求。

> 注意：生产环境禁止长期开启远程调试，有安全风险，仅临时排错使用。

## 六、工具辅助追踪
### 1. SpringBoot Actuator + Spring Boot Admin
监控服务运行状态、接口调用、线程栈、内存、慢请求，不用日志也能看运行情况：
1. 引入依赖
```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-actuator</artifactId>
</dependency>
```
2. 开放端点：
```yaml
management:
  endpoints:
    web:
      exposure:
        include: health,info,threaddump,mappings
```
- `/actuator/threaddump`：导出当前所有线程栈，死锁、接口卡死直接定位
- `/actuator/mappings`：查看所有接口映射地址

### 2. SkyWalking / Pinpoint 分布式链路追踪（微服务必备）
如果是多模块微服务，单次请求跨多个服务：
- 自动生成完整调用链：接口 → Service → Mapper → 第三方调用
- 显示每个环节耗时、异常、SQL、请求参数
- 可视化页面一键定位慢接口、报错节点，是微服务线上排错神器。

### 3. Arthas（阿里Java诊断工具，生产神器）
无需重启服务，线上实时跟踪代码执行：
1. 上传arthas.jar到服务器，启动
2. 常用命令：
   - `trace 包名.类名 方法名`：打印方法内部完整执行链路、每一步耗时
   - `watch`：实时监控方法入参、返回值、异常
   - `stack`：打印方法调用栈
适合无法重启、不能远程调试的生产环境，轻量无侵入。

## 七、开发调试小技巧汇总
1. **热部署**：引入 `spring-boot-devtools`，修改代码自动重启，不用反复重启服务调试；
```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-devtools</artifactId>
    <scope>runtime</scope>
    <optional>true</optional>
</dependency>
```
2. **单元测试调试**：直接在 `@Test` 方法Debug，单独测试Service层逻辑，不用启动完整Web服务；
3. **全局异常处理器**：统一捕获所有异常并打印完整堆栈，不会丢失报错信息；
4. **关闭框架自动吞异常**：开发环境开启完整异常页面，`server.error.include-stacktrace=always`；
5. 测试环境统一使用 `@Slf4j` 注解简化日志对象创建，减少模板代码。

## 总结分层使用场景
1. **本地开发**：IDEA断点 + devtools热部署 + MyBatis打印SQL + AOP接口日志
2. **测试环境**：MDC链路日志 + Arthas临时跟踪 + 远程调试
3. **微服务线上**：SkyWalking分布式追踪 + 日志traceId检索 + actuator线程栈
4. **生产紧急排错**：Arthas，不重启服务实时跟踪方法执行

---

## 二、用户问题2：如何使用Spring Boot Actuator监控应用程序的运行状态？
# Spring Boot Actuator 完整监控使用指南
Actuator 是 SpringBoot 内置监控组件，提供健康检查、运行指标、线程、内存、接口映射、日志等端点，用来查看应用运行状态、排查卡死/慢请求/内存泄漏问题。

## 一、引入依赖（Maven/Gradle）
### Maven pom.xml
```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-actuator</artifactId>
</dependency>
```
### Gradle
```groovy
implementation 'org.springframework.boot:spring-boot-starter-actuator'
```

## 二、基础配置 application.yml
### 1. 最简通用配置（推荐开发/测试环境）
```yaml
spring:
  application:
    name: demo-actuator

# actuator 监控配置
management:
  # 监控访问端口，不和业务8080冲突，可单独运维端口
  server:
    port: 9090
  endpoints:
    web:
      exposure:
        # 对外开放的监控端点，* 代表全部开放（生产慎用）
        include: health,info,metrics,threaddump,mappings,loggers,heapdump
        # 关闭不需要的端点
        exclude: shutdown
  endpoint:
    # 健康详情展示
    health:
      show-details: always
      # 开启磁盘、数据库、redis等组件健康检查
      show-components: always
    # 关闭远程关闭服务端点（生产必须禁用，高危）
    shutdown:
      enabled: false
  # 暴露prometheus指标（对接监控面板如Grafana）
  metrics:
    export:
      prometheus:
        enabled: true
```

### 配置说明关键点
1. `management.server.port=9090`：监控独立端口，运维单独放行，业务端口不暴露监控；
2. `include: *` 全部端点仅**测试环境**使用，生产按需开放少量端点；
3. `shutdown.enabled=false`：`/actuator/shutdown` 可以远程关闭服务，线上务必关闭；
4. `health.show-details=always`：健康接口展示数据库、Redis、磁盘等详细状态。

## 三、核心常用端点及作用
访问地址格式：`http://ip:9090/actuator/{端点名}`

| 端点 | 作用 |
|------|------|
| `/actuator/health` | 应用健康状态（UP/DOWN），数据库、Redis、磁盘、MQ连通性 |
| `/actuator/info` | 自定义应用版本、作者、项目描述信息 |
| `/actuator/metrics` | JVM内存、CPU、请求QPS、接口耗时、GC次数等性能指标 |
| `/actuator/mappings` | 打印所有Controller接口URL、请求方式、对应方法 |
| `/actuator/threaddump` | 导出全量线程栈，排查接口卡死、死锁、阻塞 |
| `/actuator/loggers` | 动态修改日志级别，不用重启服务 |
| `/actuator/heapdump` | 下载堆内存快照，分析内存泄漏（大文件） |
| `/actuator/prometheus` | 标准化指标，对接Prometheus+Grafana可视化监控 |

### 1. health 健康检查（最常用）
访问：`http://127.0.0.1:9090/actuator/health`
返回示例：
```json
{
    "status": "UP",
    "components": {
        "db": {
            "status": "UP",
            "details": { "database": "MySQL", "validationQuery": "SELECT 1" }
        },
        "diskSpace": {
            "status": "UP",
            "details": { "free": 32412412412, "threshold": 10485760 }
        },
        "redis": { "status": "UP" }
    }
}
```
- `UP`：正常；`DOWN`：数据库/Redis断开、磁盘不足。

### 2. info 自定义应用信息
yml 添加自定义信息：
```yaml
info:
  app-name: demo-service
  version: 1.0.0
  author: admin
  desc: SpringBoot Actuator Demo
```
访问 `/actuator/info` 即可读取自定义内容。

### 3. metrics 性能指标查看
1. 查看所有指标列表：`/actuator/metrics`
2. 查看单个指标详情，如JVM堆内存：
`/actuator/metrics/jvm.memory.used`
常用指标：
- `http.server.requests`：接口请求次数、平均耗时、错误率
- `jvm.memory.used`：堆内存使用
- `jvm.gc.pause`：GC停顿时间
- `system.cpu.usage`：服务器CPU使用率

### 4. threaddump 线程栈排查卡死
访问地址直接返回完整线程堆栈，复制到工具分析：
- 阻塞的数据库连接、死锁线程、无限循环任务、Tomcat工作线程耗尽。

### 5. loggers 动态调整日志级别
1. 查看所有包日志级别：`/actuator/loggers`
2. 查看指定包：`/actuator/loggers/com.example.demo`
3. POST请求动态修改日志级别（无需重启）
```http
POST http://127.0.0.1:9090/actuator/loggers/com.example.demo
Content-Type: application/json

{
  "configuredLevel": "DEBUG"
}
```
临时打开DEBUG日志排查线上问题，排查完切回INFO。

## 四、自定义健康检查（扩展health端点）
业务自定义健康规则（例如第三方接口连通性、定时任务状态）
```java
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.stereotype.Component;

@Component
public class CustomHealthCheck implements HealthIndicator {

    @Override
    public Health health() {
        boolean isThirdApiOk = checkThirdApi();
        if (isThirdApiOk) {
            return Health.up().withDetail("thirdApi", "正常连通").build();
        } else {
            return Health.down().withDetail("thirdApi", "第三方接口失联").build();
        }
    }

    private boolean checkThirdApi() {
        // 自定义业务检测逻辑
        return true;
    }
}
```
访问health接口会新增自定义检测项。

## 五、安全加固（生产环境必做）
### 方式1：限制IP访问监控端口
运维层面防火墙仅允许内网监控服务器访问 `9090`，外部网络拦截。

### 方式2：Spring Security 给actuator加账号密码
引入security依赖：
```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-security</artifactId>
</dependency>
```
配置账号密码：
```yaml
spring:
  security:
    user:
      name: monitor
      password: 123456
      roles: ADMIN
```
访问监控端点时需要输入账号密码登录。

### 方式3：最小化开放端点
生产不要用 `include: *`，只开放刚需端点：
```yaml
management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics,prometheus
```

## 六、可视化监控搭配方案
### 1. Spring Boot Admin（轻量可视化面板）
单独搭建Admin服务，自动聚合所有微服务Actuator数据，页面展示：健康状态、内存、线程、日志、GC、在线实例。
- 一键查看线程栈、堆转储、动态调整日志级别。

### 2. Prometheus + Grafana（企业级监控告警）
1. Actuator暴露prometheus指标；
2. Prometheus定时拉取指标；
3. Grafana搭建大盘：CPU、内存、QPS、错误率、接口耗时；
4. 配置邮件/钉钉告警：服务DOWN、CPU过高、内存溢出自动通知。

## 七、常见运维排错场景使用Actuator
1. **服务不通，判断是否宕机**：调用 `/actuator/health`，状态DOWN直接告警；
2. **接口响应很慢/卡死**：拉取 `/actuator/threaddump` 看线程阻塞点；
3. **内存占用持续上涨**：`/actuator/heapdump` 下载快照分析内存泄漏；
4. **线上想看详细SQL日志**：`loggers` POST动态切换DEBUG；
5. **数据库连接池耗尽**：metrics查看连接池指标 `hikaricp.connections`；
6. **上线后接口新增/删除**：`/actuator/mappings` 核对所有接口地址。

## 八、补充注意事项
1. `/heapdump` 会生成超大文件，线上不要频繁调用；
2. `shutdown` 端点生产永久关闭，防止恶意远程停机；
3. 独立 `management.server.port` 隔离监控与业务端口，安全分离；
4. 线上不直接暴露threaddump/heapdump公网，仅内网监控系统访问；
5. 配合MDC链路日志、Arthas、SkyWalking形成完整监控排查体系。

---

# 使用说明
将以上全部内容复制，保存为 `springboot调试与actuator监控.md` 文件即可。