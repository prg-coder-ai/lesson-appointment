# Spring Boot + Thymeleaf + MyBatis 全链路参数传递命名规则与细节

## 摘要与核心结论

本指南针对**前后端不分离架构（Thymeleaf 服务器渲染）** ，深入解析`前端（Thymeleaf + fetch/axios）→Controller（@RequestBody）→Service→Mapper（MyBatis）`全链路的参数传递逻辑、命名约束与避坑细节。核心结论如下：



1. **全链路命名一致性是核心**：JSON 请求体键名、DTO / 实体类属性名、MyBatis 映射字段需严格匹配（区分大小写），仅在数据库层可通过驼峰 - 下划线自动转换兼容差异[(17)](https://blog.csdn.net/qq_42453117/article/details/159519368)。

2. **@RequestBody 仅支持 POST/PUT 请求体**：必须与`Content-Type: application/json`配合，JSON 键名与 Java 类属性名的映射优先级为：局部`@JsonProperty`注解 > 全局 Jackson 命名策略 > 默认大小写匹配[(17)](https://blog.csdn.net/qq_42453117/article/details/159519368)。

3. **中间层数据对象各司其职**：DTO（数据传输对象）用于隔离外部请求与内部实体，仅保留必要传输字段；Service 层参数需通过 DTO 封装以保障接口稳定性；Entity 严格映射数据库表结构，禁止直接暴露给前端[(63)](https://blog.csdn.net/smlcx/article/details/157843752)。

4. **安全规范不可忽视**：Thymeleaf 内联变量必须通过转义语法防范 XSS；MyBatis 必须使用`#{}`预编译占位符避免 SQL 注入；生产环境需通过全局配置统一命名策略，减少硬编码依赖[(2)](https://blog.csdn.net/weixin_39691748/article/details/113322366)。



***

## 1. 架构模式与技术栈概述

本方案采用**经典三层架构**，适配 Spring Boot 官方推荐的分层职责规范，各层边界清晰且单一，核心技术栈的选型完全围绕 “前后端不分离” 的架构特性设计：



* **表现层**：Thymeleaf 3.x（服务器端模板引擎，替代传统 JSP）负责渲染动态 HTML，并通过内联语法将后端数据注入前端 JS 逻辑；同时使用原生`fetch`或`axios`发送异步 JSON 请求，无需额外构建前端工程，完全复用 Spring Boot 的 Web 容器能力[(23)](https://velog.io/@danny5193/Spring-Boot-%ED%83%80%EC%9E%84%EB%A6%AC%ED%94%84Thymeleaf-%EC%99%84%EB%B2%BD-%EA%B0%80%EC%9D%B4%EB%93%9C-%EC%84%A4%EC%A0%95%EB%B6%80%ED%84%B0-%EB%A0%88%EC%9D%B4%EC%95%84%EC%9B%83%EA%B9%8C%EC%A7%80)。

* **控制层**：Spring MVC 控制器通过`@RequestBody`注解，将 HTTP 请求体的 JSON 字符串自动反序列化为 DTO 对象 —— 这是当前前后端数据交互的标准方式，尤其适合复杂对象的传输[(17)](https://blog.csdn.net/qq_42453117/article/details/159519368)。

* **业务层**：Service 层接收 DTO 并转换为 Entity（数据库实体对象），封装核心业务逻辑，同时作为数据传输的中间屏障，避免外部请求直接耦合数据库结构[(63)](https://blog.csdn.net/smlcx/article/details/157843752)。

* **持久层**：MyBatis 作为 ORM 框架，通过 Mapper 接口与 XML 映射文件，将 Entity 对象与数据库表进行灵活映射，支持自定义 SQL 与结果集转换，兼顾性能与灵活性[(9)](https://blog.csdn.net/m0_57176999/article/details/130607345)。

> 为什么选择该技术栈？



1. **前后端不分离的天然适配**：Thymeleaf 是 Spring Boot 官方钦定的模板引擎，与 Spring 生态的整合度远高于传统 JSP—— 它支持 HTML5 原生语法，无需额外标签库，且能直接复用 Spring 的`Model`、`@Valid`等机制，服务器渲染的特性也让首屏加载速度更快[(23)](https://velog.io/@danny5193/Spring-Boot-%ED%83%80%EC%9E%84%EB%A6%AC%ED%94%84Thymeleaf-%EC%99%84%EB%B2%BD-%EA%B0%80%EC%9D%B4%EB%93%9C-%EC%84%A4%EC%A0%95%EB%B6%80%ED%84%B0-%EB%A0%88%EC%9D%B4%EC%95%84%EC%9B%83%EA%B9%8C%EC%A7%80)。

2. **参数传递的简洁性与安全性**：`@RequestBody`配合 JSON 格式，不仅能高效传输复杂嵌套对象，还能通过 Jackson 框架自动处理类型转换；相比传统的表单提交（`application/x-www-form-urlencoded`），JSON 格式更适合 RESTful 接口风格，也能避免多参数传递时的命名冲突[(17)](https://blog.csdn.net/qq_42453117/article/details/159519368)。

3. **MyBatis 的灵活性**：作为半自动化 ORM 框架，MyBatis 既保留了 SQL 编写的灵活性（适合复杂报表、联表查询场景），又通过结果映射机制简化了数据库与实体类的绑定，性能优于全自动化 ORM 框架（如 JPA）[(9)](https://blog.csdn.net/m0_57176999/article/details/130607345)。





***

## 2. 前端参数构造与传递（Thymeleaf + JS）

在前后端不分离架构中，Thymeleaf 并非单纯的模板渲染工具，而是**后端数据与前端交互的桥梁**：它既负责将后端`Model`中的数据渲染到 HTML 静态结构中，也需要安全地将数据注入前端 JS 逻辑，最终通过异步请求将用户输入提交回后端。这一过程的核心风险是 XSS 攻击与请求格式不兼容，需通过严格的语法规范规避。

### 2.1 Thymeleaf 变量与 JavaScript 内联

Thymeleaf 提供了两套内联语法用于将后端变量注入 JS，核心差异在于转义规则 —— 这直接决定了是否会引入 XSS 漏洞，必须严格区分使用场景：



| 语法           | 转义规则                                                  | 对应 Thymeleaf 原生属性 | 适用场景                   |
| ------------ | ----------------------------------------------------- | ----------------- | ---------------------- |
| `[[${...}]]` | HTML 转义（将`<`、`>`、`"`等特殊字符转换为 HTML 实体），同时自动进行 JS 字符串转义 | `th:text`         | 注入普通字符串（如用户名、静态配置）     |
| `[(...)]`    | 不转义原始 HTML/JS 内容，但仍会进行 JS 语法转义（如换行符、单引号）              | `th:utext`        | 注入富文本内容（如已过滤的 HTML 片段） |

上述转义逻辑是 Thymeleaf 内置的安全机制：对于`[[${...}]]`，即使后端传入的数据包含恶意脚本（如`<script>alert('xss')</script>`），也会被转义为`&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;`，无法在浏览器中执行；而`[(...)]`仅适用于**已通过后端过滤的可信富文本**，例如经过 HTML 清理工具处理后的文章内容，禁止直接用于用户输入的原始数据[(2)](https://blog.csdn.net/weixin_39691748/article/details/113322366)。

#### 注意事项



* **必须声明内联模式**：所有包含内联变量的`<script>`标签，必须添加`th:inline="javascript"`属性 —— 这是 Thymeleaf 识别内联语法的开关。如果省略该属性，内联表达式会被当作普通字符串输出，导致 JS 语法错误[(8)](https://spring-boot.jp/thymeleaf/javascript-args/316)。

* **复杂对象的自动序列化**：如果注入的是 Java 对象（如`User`、`List<User>`），Thymeleaf 会自动将其序列化为标准 JSON 格式，无需手动调用`JSON.stringify()`。但需确保对象无循环引用，否则会触发序列化异常（如用户对象包含订单列表，订单又引用用户）[(1)](https://wenku.csdn.net/answer/gea6kd5yvi)。

* **URL 地址的动态生成**：使用`@{/api/xxx}`语法生成请求 URL，可自动适配项目的上下文路径（Context Path）—— 例如项目部署在`/reservation`路径下，`@{/api/login}`会自动转换为`/reservation/api/login`，避免硬编码路径导致的部署问题[(23)](https://velog.io/@danny5193/Spring-Boot-%ED%83%80%EC%9E%84%EB%A6%AC%ED%94%84Thymeleaf-%EC%99%84%EB%B2%BD-%EA%B0%80%EC%9D%B4%EB%93%9C-%EC%84%A4%EC%A0%95%EB%B6%80%ED%84%B0-%EB%A0%88%EC%9D%B4%EC%95%84%EC%9B%83%EA%B9%8C%EC%A7%80)。

### 2.2 Fetch/Axios 请求发送规范

为了让后端`@RequestBody`正确解析参数，前端异步请求必须严格遵循以下格式约束，任何一项不符合都会导致参数绑定失败：



1. **请求方法**：必须使用`POST`或`PUT`—— 这是 HTTP 协议的规范要求：GET 请求没有请求体（Request Body），无法携带 JSON 数据；而`@RequestBody`的核心逻辑就是解析请求体内容，因此 GET 请求无法触发其功能，即使强行使用也会返回 400 错误[(18)](https://developer.aliyun.com/article/1008064)。

2. **请求头**：必须设置`Content-Type: application/json`—— 这是 Spring MVC 识别 JSON 请求体的唯一标识。如果遗漏该头，Spring 会默认将请求体解析为普通文本，导致`@RequestBody`无法将其反序列化为 Java 对象，最终抛出`HttpMessageNotReadableException`异常[(17)](https://blog.csdn.net/qq_42453117/article/details/159519368)。

3. **请求体**：必须是**JSON 字符串**，而非`FormData`或查询字符串 —— 即使是单参数，也需封装为 JSON 对象（如`{"username": "admin"}`），不能直接传递原始字符串。这是因为`@RequestBody`仅支持`application/json`、`application/xml`等结构化格式，不支持表单编码格式[(17)](https://blog.csdn.net/qq_42453117/article/details/159519368)。

#### 示例代码（fetch + Axios）



```
\<!-- 1. Thymeleaf 页面（必须声明 th:inline="javascript"） -->

\<script th:inline="javascript">

&#x20;   // 1.1 从后端 Model 注入初始化数据（自动序列化为 JSON 对象）

&#x20;   const userInitData = \[\[\${userInit}]]; /\*\[\[\${userInit}]]\*/ // 注：Thymeleaf 注释语法用于 IDE 语法提示，运行时会被移除

&#x20;   // 1.2 手动构造请求参数（与后端 DTO 字段严格一致）

&#x20;   const requestData = {

&#x20;       username: userInitData.username, // 直接复用注入的后端数据

&#x20;       password: "123456",

&#x20;       role: "ROLE\_USER"

&#x20;   };

&#x20;   // 2. Fetch 发送 JSON 请求（原生 API，无需额外依赖）

&#x20;   fetch(\[\[\${@environment.getProperty('server.servlet.context-path')}]] + '/api/user/login', {

&#x20;       method: 'POST',

&#x20;       headers: {

&#x20;           'Content-Type': 'application/json', // 必须设置，否则后端无法识别 JSON 格式

&#x20;           'X-CSRF-TOKEN': \[\[\${\_csrf.token}]] // 若开启 CSRF 防护，必须携带该 Token（Spring Security 自动生成）

&#x20;       },

&#x20;       body: JSON.stringify(requestData) // 手动序列化为 JSON 字符串（Thymeleaf 注入的对象无需再次序列化）

&#x20;   })

&#x20;   .then(response => response.json())

&#x20;   .then(data => console.log('Fetch 响应结果:', data))

&#x20;   .catch(error => console.error('Fetch 请求异常:', error));

&#x20;   // 3. Axios 发送 JSON 请求（需先在页面引入 Axios CDN）

&#x20;   axios.post(

&#x20;       '/api/user/login', // 简化写法：Thymeleaf @{/api/user/login} 会自动处理上下文路径

&#x20;       requestData, // Axios 会自动将对象序列化为 JSON 字符串，无需手动调用 JSON.stringify()

&#x20;       {

&#x20;           headers: {

&#x20;               'Content-Type': 'application/json', // 即使省略，Axios 也会默认设置，但显式声明更安全

&#x20;               'X-CSRF-TOKEN': \[\[\${\_csrf.token}]]

&#x20;           }

&#x20;       }

&#x20;   )

&#x20;   .then(response => console.log('Axios 响应结果:', response.data))

&#x20;   .catch(error => console.error('Axios 请求异常:', error));

\</script>
```

> 代码说明：



* `th:inline="javascript"`是启用 JS 内联的强制前提，无此属性的脚本标签无法解析`[[${}]]`表达式[(8)](https://spring-boot.jp/thymeleaf/javascript-args/316)。

* `[[${@environment.getProperty('server.servlet.context-path')}]]`通过 Spring 环境变量动态获取上下文路径，比硬编码更适配不同部署环境（如测试环境与生产环境的上下文路径可能不同）[(23)](https://velog.io/@danny5193/Spring-Boot-%ED%83%80%EC%9E%84%EB%A6%AC%ED%94%84Thymeleaf-%EC%99%84%EB%B2%BD-%EA%B0%80%EC%9D%B4%EB%93%9C-%EC%84%A4%EC%A0%95%EB%B6%80%ED%84%B0-%EB%A0%88%EC%9D%B4%EC%95%84%EC%9B%83%EA%B9%8C%EC%A7%80)。

* 开启 CSRF 防护后（Spring Security 默认开启），必须在请求头中携带`X-CSRF-TOKEN`，否则会被拦截并返回 403 错误。该 Token 可通过`[[${_csrf.token}]]`从 Thymeleaf 上下文获取[(55)](https://wenku.csdn.net/answer/7wdqfeen0o)。

* Axios 会自动处理 JSON 序列化与反序列化，而 Fetch 需手动调用`JSON.stringify()`和`response.json()`，这是两者的核心差异之一，但最终发送的请求格式完全一致[(57)](https://blog.csdn.net/zaincs/article/details/84991153)。





***

## 3. Controller 层参数接收（@RequestBody）

Controller 是全链路参数传递的**第一关**，负责接收前端请求并解析为 Java 对象。`@RequestBody`的核心作用是通过`HttpMessageConverter`（默认是 Jackson）将 JSON 请求体反序列化为目标对象，其解析逻辑完全遵循 Jackson 的配置规则。

### 3.1 @RequestBody 工作原理

`@RequestBody`的底层工作流程由 Spring MVC 的`RequestResponseBodyMethodProcessor`处理器完成，具体步骤如下：



1. **请求头校验**：检查`Content-Type`是否为`application/json`（或其他 Jackson 支持的媒体类型，如`application/*+json`），如果不是则直接抛出异常[(17)](https://blog.csdn.net/qq_42453117/article/details/159519368)。

2. **请求体读取**：通过`HttpServletRequest`的输入流读取 JSON 字符串，此时会根据请求头的`Content-Encoding`（如 gzip）自动解压数据。

3. **反序列化**：调用 Jackson 的`ObjectMapper`将 JSON 字符串转换为目标 Java 对象 —— 这一步会严格匹配 JSON 键名与 Java 类的属性名（区分大小写），若匹配失败则对应字段为`null`（不会抛出异常，除非字段有`@NotNull`等校验注解）[(17)](https://blog.csdn.net/qq_42453117/article/details/159519368)。

4. **参数绑定**：将反序列化后的对象绑定到 Controller 方法的参数上，进入业务逻辑处理环节。

> 核心限制：



* **仅支持有请求体的方法**：GET 请求没有请求体，无法使用`@RequestBody`接收参数 —— 即使前端强行在 GET 请求中携带 body，也会被 Spring MVC 忽略，最终导致参数绑定失败[(18)](https://developer.aliyun.com/article/1008064)。

* **一个方法只能有一个 @RequestBody**：`@RequestBody`注解的参数会独占整个请求体，因此一个 Controller 方法中不能同时存在多个`@RequestBody`参数，否则会抛出`HttpMessageNotReadableException`异常[(18)](https://developer.aliyun.com/article/1008064)。



### 3.2 命名规则与映射策略

JSON 键名与 Java 类属性名的映射优先级从高到低依次为：

#### 优先级 1：@JsonProperty 局部注解（推荐用于个别字段差异）

当仅少数字段存在命名差异（如前端使用蛇形命名`user_name`，后端使用驼峰命名`userName`）时，最推荐的方式是在 DTO / 实体类的属性上添加`@JsonProperty`注解，显式指定 JSON 键名。该方式精准可控，且不会影响其他字段的映射逻辑[(25)](https://ask.csdn.net/questions/8766036)。

**示例**：



```
public class UserLoginDTO {

&#x20;   // JSON 键名必须为 "user\_name"，与后端属性名 userName 映射

&#x20;   @JsonProperty("user\_name")&#x20;

&#x20;   private String userName;

&#x20;   // 未添加 @JsonProperty，JSON 键名必须与属性名完全一致（即 "password"）

&#x20;   private String password;

&#x20;   // Getter、Setter 方法（Lombok @Data 注解可自动生成）

}
```

> 注意：
>
> `@JsonProperty`
>
> 注解同时控制
>
> **序列化和反序列化**
>
> 逻辑 —— 即该字段在接收请求（反序列化）和返回响应（序列化）时，都会使用注解中指定的键名。如果需要对请求和响应使用不同的键名，可以使用 Jackson 的
>
> `@JsonAlias`
>
> 注解（仅用于反序列化）配合
>
> `@JsonProperty`
>
> （仅用于序列化）
>
> [(25)](https://ask.csdn.net/questions/8766036)
>
> 。

#### 优先级 2：全局 Jackson 命名策略（推荐用于统一风格）

当所有字段都需要统一转换命名风格（如全量蛇形转驼峰、驼峰转蛇形）时，可通过全局配置 Jackson 的命名策略，避免在每个字段上重复添加`@JsonProperty`注解，减少硬编码工作量[(24)](https://ask.csdn.net/questions/9239823)。

**YAML 配置示例**：



```
spring:

&#x20; jackson:

&#x20;   # 全局设置 JSON 命名策略为 SNAKE\_CASE（蛇形命名，如 userName → user\_name）

&#x20;   property-naming-strategy: SNAKE\_CASE

&#x20;   # 格式化日期类型，避免前端收到长整型时间戳

&#x20;   date-format: yyyy-MM-dd HH:mm:ss

&#x20;   # 时区设置为东八区，避免日期转换时的时区偏移问题

&#x20;   time-zone: GMT+8
```

**Java 配置类示例（更灵活）** ：



```
import com.fasterxml.jackson.databind.PropertyNamingStrategies;

import com.fasterxml.jackson.databind.ObjectMapper;

import org.springframework.context.annotation.Bean;

import org.springframework.context.annotation.Configuration;

@Configuration

public class JacksonConfig {

&#x20;   @Bean

&#x20;   public ObjectMapper objectMapper() {

&#x20;       ObjectMapper objectMapper = new ObjectMapper();

&#x20;       // 设置 JSON 命名策略为 SNAKE\_CASE（蛇形命名）

&#x20;       objectMapper.setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE\_CASE);

&#x20;       // 其他配置：如日期格式化、空值处理等

&#x20;       return objectMapper;

&#x20;   }

}
```

> 注意：全局命名策略会对所有
>
> `@RequestBody`
>
> 和
>
> `@ResponseBody`
>
> 的 JSON 转换生效，包括第三方接口的请求和响应。如果需要对特定接口或类使用不同的命名策略，可以在类上添加
>
> `@JsonNaming`
>
> 注解覆盖全局配置（优先级高于全局配置）
>
> [(24)](https://ask.csdn.net/questions/9239823)
>
> 。

#### 优先级 3：默认大小写匹配（不推荐用于生产环境）

如果没有任何额外配置，Jackson 会默认按照**精确大小写匹配**的规则映射 JSON 键名与 Java 类属性名 —— 即 JSON 中的`userName`必须对应 Java 类中的`userName`属性，`UserName`或`username`都会导致匹配失败，对应字段为`null`[(17)](https://blog.csdn.net/qq_42453117/article/details/159519368)。

> 风险提示：

这种方式对大小写过于敏感，容易因前端的微小拼写错误（如将`userName`写成`username`）导致参数接收失败，且问题排查难度大 —— 错误信息通常只会提示 “字段为 null”，无法直接定位到大小写不匹配的问题。因此，生产环境强烈建议使用前两种优先级更高的映射策略，彻底规避大小写风险[(17)](https://blog.csdn.net/qq_42453117/article/details/159519368)。

### 3.3 DTO 与 VO 的使用规范

为了隔离外部请求与内部业务实体，Controller 层必须使用**数据传输对象（DTO）** 接收参数，而非直接使用数据库实体类（Entity）。这是后端架构的重要设计原则，核心目的是保障系统的安全性与可维护性[(63)](https://blog.csdn.net/smlcx/article/details/157843752)。

#### DTO 设计原则



* **最小字段原则**：仅保留前端需要传递的字段，不包含数据库实体的冗余字段（如`createTime`、`updateTime`等审计字段）。例如，用户登录请求只需要`username`和`password`，无需传递`id`或`email`，这样可以减少数据传输量，同时避免敏感字段的暴露[(63)](https://blog.csdn.net/smlcx/article/details/157843752)。

* **无业务逻辑原则**：DTO 是纯数据载体，仅包含 Getter、Setter 方法（可通过 Lombok `@Data`注解自动生成），不包含任何业务逻辑（如密码加密、数据校验等）。业务逻辑应统一放在 Service 层处理[(63)](https://blog.csdn.net/smlcx/article/details/157843752)。

* **校验注解支持**：DTO 是参数校验的最佳载体，可通过 JSR-380 注解（如`@NotBlank`、`@Size`）定义校验规则，配合 Controller 方法上的`@Valid`或`@Validated`注解触发校验。校验失败的信息会被封装到`BindingResult`对象中，方便统一处理错误响应[(63)](https://blog.csdn.net/smlcx/article/details/157843752)。

**反例（错误写法）** ：



```
// 错误：直接使用数据库实体类接收前端请求，暴露了敏感字段（如 password、salt）

@PostMapping("/login")

public Result login(@RequestBody UserEntity user) { ... }
```

该写法会将数据库实体的所有字段暴露给前端，若实体包含`password`、`salt`等敏感字段，可能导致信息泄露；同时，若实体类后续因业务需求添加新字段，会直接影响前端接口，破坏接口的稳定性[(70)](https://segmentfault.com/a/1190000047433302)。

**正例（推荐写法）** ：



```
// 正确：使用 DTO 接收请求，仅保留必要字段，且通过 @Valid 触发参数校验

@PostMapping("/login")

public Result login(

&#x20;   @Valid @RequestBody UserLoginDTO loginDTO,&#x20;

&#x20;   BindingResult bindingResult

) {

&#x20;   // 处理参数校验失败的情况

&#x20;   if (bindingResult.hasErrors()) {

&#x20;       String errorMsg = bindingResult.getFieldError().getDefaultMessage();

&#x20;       return Result.error(HttpStatus.BAD\_REQUEST.value(), errorMsg);

&#x20;   }

&#x20;   // 执行业务逻辑

&#x20;   return userService.login(loginDTO);

}
```



***

## 4. Service 层参数传递与业务逻辑

Service 层是**业务逻辑的核心载体**，负责接收 Controller 层的 DTO，进行业务处理后转换为 Entity 传递给 Mapper 层。其参数传递的核心原则是 “封装复杂参数、隔离实体依赖、保障接口稳定性”。

### 4.1 命名规则与参数封装

Service 层的参数传递需遵循以下规范，这些规范是阿里 Java 开发手册与业界最佳实践的总结，能有效提升代码的可读性与可维护性[(32)](https://blog.csdn.net/qq_24923619/article/details/156765189)：



1. **参数名需体现业务语义**：禁止使用模糊的参数名（如`param`、`obj`），应使用具体的业务名称（如`loginDTO`、`userId`）。例如，用户登录的参数应命名为`UserLoginDTO loginDTO`，而非`Object param`，这样其他开发者能一眼看出参数的用途[(32)](https://blog.csdn.net/qq_24923619/article/details/156765189)。

2. **基础类型参数需加语义前缀**：对于`Long`、`String`等基础类型或包装类参数，应添加明确的语义前缀（如`userId`而非`id`、`orderNo`而非`no`），避免多个参数时的语义混淆。例如，“根据用户 ID 和订单编号查询” 的方法，参数应命名为`Long userId, String orderNo`，而非`Long id, String no`[(32)](https://blog.csdn.net/qq_24923619/article/details/156765189)。

3. **复杂参数必须封装为 DTO**：当参数个数超过 3 个，或包含多个关联字段（如用户注册的`username`、`password`、`email`、`phone`）时，必须封装为 DTO 对象。这不仅能简化方法签名，还能提升接口的扩展性 —— 后续新增参数时无需修改方法签名，只需在 DTO 中添加字段即可[(32)](https://blog.csdn.net/qq_24923619/article/details/156765189)。

4. **接口与实现类参数严格一致**：Service 接口定义的参数类型、个数、顺序，必须与实现类（`ServiceImpl`）完全一致，禁止在实现类中随意修改参数类型或顺序，否则会导致 Spring 无法正确注入 Bean，或调用时抛出参数不匹配的异常[(64)](https://wenku.csdn.net/answer/20v61eunee)。

### 4.2 DTO 与 Entity 的转换

Service 层的核心职责之一，是完成 DTO（外部传输对象）与 Entity（内部实体对象）之间的转换 —— 这是隔离外部请求与内部数据结构的关键环节，转换逻辑需遵循以下规则：

#### 转换时机



* **接收请求时**：Controller → Service → 将 DTO 转换为 Entity。例如，用户注册时，Controller 接收`UserRegisterDTO`，Service 层需要将其转换为`UserEntity`，并补充业务所需的默认字段（如`createTime`、`salt`、`status`等），再传递给 Mapper 层插入数据库[(65)](https://blog.csdn.net/2401_82978699/article/details/154213506)。

* **返回响应时**：Service → Controller → 将 Entity 转换为 VO（视图对象）。例如，查询用户信息时，Mapper 层返回`UserEntity`，Service 层需要将其转换为`UserVO`，隐藏敏感字段（如`password`、`salt`）后，再返回给 Controller 层渲染到 Thymeleaf 页面[(63)](https://blog.csdn.net/smlcx/article/details/157843752)。

#### 转换方式



1. **手动转换（推荐用于简单场景）** ：通过 Getter/Setter 方法手动赋值，适合字段较少的场景。这种方式直观可控，无需引入额外依赖，且能明确控制转换逻辑（如密码加密、日期格式化等）。例如：



```
UserEntity userEntity = new UserEntity();

userEntity.setUsername(loginDTO.getUsername());

userEntity.setPassword(passwordEncoder.encode(loginDTO.getPassword())); // 密码加密

userEntity.setCreateTime(LocalDateTime.now()); // 补充默认字段
```

这种方式的缺点是字段较多时代码繁琐，但胜在清晰可控，适合小型项目或简单业务场景[(65)](https://blog.csdn.net/2401_82978699/article/details/154213506)。



1. **工具类转换（推荐用于复杂场景）** ：使用`ModelMapper`、`MapStruct`等第三方工具，自动生成转换代码。其中，`MapStruct`是编译期生成代码，性能与手动转换一致，且支持自定义转换逻辑（如日期格式、枚举映射），是业界最推荐的方案。例如：



```
// 定义 MapStruct 转换接口

@Mapper(componentModel = "spring")

public interface UserConverter {

&#x20;   UserConverter INSTANCE = Mappers.getMapper(UserConverter.class);

&#x20;   UserEntity dtoToEntity(UserRegisterDTO dto);

&#x20;   UserVO entityToVo(UserEntity entity);

}

// Service 层调用转换

UserEntity userEntity = UserConverter.INSTANCE.dtoToEntity(registerDTO);
```

这种方式能大幅减少重复代码，提升开发效率，适合中大型项目或字段较多的场景[(65)](https://blog.csdn.net/2401_82978699/article/details/154213506)。

> 注意事项：



* **禁止直接暴露 Entity**：Entity 类通常包含数据库的敏感字段（如`password`、`salt`）或审计字段（如`createTime`、`updateTime`），如果直接返回给前端，可能导致信息泄露。因此，必须通过 VO 或 DTO 进行转换，隐藏不必要的字段[(70)](https://segmentfault.com/a/1190000047433302)。

* **转换逻辑内聚**：所有转换逻辑必须放在 Service 层，禁止在 Controller 或 Mapper 层处理。这能保证业务逻辑的内聚性，避免转换逻辑分散在多个层中，导致维护困难[(63)](https://blog.csdn.net/smlcx/article/details/157843752)。



### 4.3 示例代码

**Service 接口**：



```
public interface UserService {

&#x20;   // 方法名体现业务动作（login），参数为 DTO 类型，返回值为 Result 统一响应对象

&#x20;   Result login(UserLoginDTO loginDTO);

&#x20;   // 复杂参数封装为 DTO，返回值为 Boolean 类型表示操作结果

&#x20;   Boolean register(UserRegisterDTO registerDTO);

}
```

**Service 实现类**：



```
@Service

public class UserServiceImpl implements UserService {

&#x20;   @Autowired

&#x20;   private UserMapper userMapper;

&#x20;   @Autowired

&#x20;   private PasswordEncoder passwordEncoder;

&#x20;   @Override

&#x20;   public Result login(UserLoginDTO loginDTO) {

&#x20;       // 1. 业务校验：校验用户名和密码是否为空

&#x20;       if (loginDTO.getUsername() == null || loginDTO.getPassword() == null) {

&#x20;           return Result.error(HttpStatus.BAD\_REQUEST.value(), "用户名或密码不能为空");

&#x20;       }

&#x20;       // 2. DTO 转换为 Entity（仅转换必要字段）

&#x20;       UserEntity userEntity = new UserEntity();

&#x20;       userEntity.setUsername(loginDTO.getUsername());

&#x20;       // 3. 调用 Mapper 层查询用户

&#x20;       UserEntity dbUser = userMapper.selectByUsername(userEntity);

&#x20;       // 4. 密码校验：使用 BCrypt 加密算法验证密码

&#x20;       if (dbUser == null || !passwordEncoder.matches(loginDTO.getPassword(), dbUser.getPassword())) {

&#x20;           return Result.error(HttpStatus.UNAUTHORIZED.value(), "用户名或密码错误");

&#x20;       }

&#x20;       // 5. 业务处理完成，返回成功结果（通常包含 Token 或用户信息）

&#x20;       return Result.success("登录成功");

&#x20;   }

&#x20;   @Override

&#x20;   public Boolean register(UserRegisterDTO registerDTO) {

&#x20;       // 1. 业务校验：校验用户名是否已存在

&#x20;       if (userMapper.selectByUsername(registerDTO.getUsername()) != null) {

&#x20;           return false;

&#x20;       }

&#x20;       // 2. DTO 转换为 Entity，并补充业务字段

&#x20;       UserEntity userEntity = new UserEntity();

&#x20;       userEntity.setUsername(registerDTO.getUsername());

&#x20;       userEntity.setPassword(passwordEncoder.encode(registerDTO.getPassword())); // 密码加密

&#x20;       userEntity.setEmail(registerDTO.getEmail());

&#x20;       userEntity.setCreateTime(LocalDateTime.now()); // 补充创建时间

&#x20;       userEntity.setStatus(1); // 补充默认状态（1：正常）

&#x20;       // 3. 调用 Mapper 层插入数据

&#x20;       return userMapper.insert(userEntity) > 0;

&#x20;   }

}
```



***

## 5. Mapper 层（MyBatis）参数传递

Mapper 层是**数据持久化的入口**，负责将 Service 层传递的参数转换为 SQL 语句，并与数据库交互。MyBatis 的参数传递是全链路的最后一环，其命名规则与映射逻辑直接决定了数据库操作的正确性。

### 5.1 命名规则与映射策略

MyBatis 的参数映射分为**输入映射**（Java 参数 → SQL 占位符）和**输出映射**（数据库列 → Java 实体属性），核心规则如下：

#### 输入映射（Java 参数 → SQL）

输入映射的核心是将 Service 层传递的参数（DTO 或 Entity），映射到 SQL 语句的占位符中。MyBatis 提供了多种参数传递方式，优先级从高到低依次为：



1. **@Param 显式命名（多参数必用）** ：当 Mapper 接口方法有多个参数时，必须在每个参数前添加`@Param`注解，显式指定参数名称。MyBatis 会将这些参数封装到一个`Map<String, Object>`中，XML 映射文件通过`#{参数名}`引用。这种方式清晰可控，是多参数传递的推荐方案[(48)](https://wenku.csdn.net/answer/751s6v2yyh)。

   **示例**：



```
// Mapper 接口

UserEntity selectByUsernameAndRole(@Param("username") String username, @Param("role") String role);

// XML 映射文件

\<select id="selectByUsernameAndRole" resultType="com.example.entity.UserEntity">

&#x20;   SELECT \* FROM user WHERE username = #{username} AND role = #{role}

\</select>
```

> 注意：
>
> `@Param`
>
> 注解的参数名必须与 XML 中的
>
> `#{参数名}`
>
> 完全一致，否则 MyBatis 会抛出
>
> `Parameter 'xxx' not found`
>
> 异常
>
> [(48)](https://wenku.csdn.net/answer/751s6v2yyh)
>
> 。



1. **实体类属性名映射（单参数推荐）** ：当参数是单个实体类（DTO 或 Entity）时，MyBatis 会自动解析其 Getter 方法，XML 中直接通过`#{属性名}`引用。这种方式无需额外注解，代码简洁，是单参数传递的最佳实践[(9)](https://blog.csdn.net/m0_57176999/article/details/130607345)。

   **示例**：



```
// Mapper 接口

int insert(UserEntity userEntity);

// XML 映射文件

\<insert id="insert" parameterType="com.example.entity.UserEntity">

&#x20;   INSERT INTO user (username, password, email, create\_time)

&#x20;   VALUES (#{username}, #{password}, #{email}, #{createTime})

\</insert>
```

> 注意：此处的
>
> `parameterType`
>
> 属性是可选的 ——MyBatis 3.4.0 及以上版本会自动根据接口方法的参数类型推断，无需手动指定。但显式声明
>
> `parameterType`
>
> 能提升 XML 的可读性，方便其他开发者快速识别参数类型
>
> [(52)](https://mybatis.org/mybatis-3/zh_CN/sqlmap-xml.html)
>
> 。



1. **默认参数名（不推荐）** ：当未使用`@Param`注解且只有一个参数时，MyBatis 会自动分配默认参数名（如`param1`、`arg0`）。但这种方式可读性差，且在多参数场景下会失效，因此不推荐在生产环境中使用[(47)](https://blog.csdn.net/qq_53844452/article/details/150208718)。

#### 输出映射（数据库列 → Java 实体）

输出映射的核心是将数据库查询结果的列名，映射到 Java 实体类的属性名。MyBatis 提供了两种映射方式，优先级从高到低依次为：



1. **显式结果映射（**`resultMap`**）** ：当数据库列名与实体属性名差异较大（且无法通过驼峰 - 下划线转换兼容）时，需在 XML 中定义`resultMap`，显式指定列名与属性名的映射关系。这种方式灵活可控，适合复杂映射场景（如联表查询、嵌套结果）[(15)](https://blog.csdn.net/2503_93626619/article/details/159850183)。

   **示例**：



```
\<resultMap id="UserResultMap" type="com.example.entity.UserEntity">

&#x20;   \<id column="user\_id" property="userId" /> \<!-- 显式映射主键列 user\_id 到属性 userId -->

&#x20;   \<result column="user\_name" property="userName" /> \<!-- 显式映射普通列 -->

&#x20;   \<result column="create\_time" property="createTime" />

\</resultMap>

\<select id="selectById" resultMap="UserResultMap">

&#x20;   SELECT user\_id, user\_name, create\_time FROM user WHERE user\_id = #{id}

\</select>
```



1. **驼峰 - 下划线自动转换**：这是 MyBatis 最常用的自动映射规则，通过全局配置`mapUnderscoreToCamelCase`开启。当该配置为`true`时，MyBatis 会自动将数据库的下划线命名列（如`user_name`）转换为 Java 实体的驼峰命名属性（如`userName`）。该配置的优先级低于显式`resultMap`，即如果定义了`resultMap`，自动转换规则会被忽略[(14)](https://mybatis.org/mybatis-3/zh_CN/configuration.html)。

   **YAML 配置示例**：



```
mybatis:

&#x20; configuration:

&#x20;   # 开启驼峰-下划线自动转换（默认值为 false，需显式开启）

&#x20;   map-underscore-to-camel-case: true

&#x20;   # 开启日志，方便调试 SQL（生产环境需关闭）

&#x20;   log-impl: org.apache.ibatis.logging.stdout.StdOutImpl
```

> 优先级规则：

显式`resultMap` > `@TableField`/`@Column`注解 > 驼峰 - 下划线自动转换。这意味着，如果同时配置了`resultMap`和驼峰自动转换，MyBatis 会优先使用`resultMap`的显式映射规则[(78)](https://ask.csdn.net/questions/8959472)。

### 5.2 关键细节与避坑指南

Mapper 层的参数传递是全链路最容易出错的环节之一，以下是必须注意的关键细节：

#### 细节 1：#{} 与 \${} 的核心差异

MyBatis 提供了两种占位符语法：`#{}`和`${}`，二者的核心差异直接关系到系统的安全性与稳定性，必须严格区分使用场景[(54)](https://blog.csdn.net/BrickPicker/article/details/148927305)：



| 特性           | `#{}`（预编译占位符）                                                   | `${}`（字符串替换）                                                      |
| ------------ | --------------------------------------------------------------- | ----------------------------------------------------------------- |
| **SQL 注入风险** | 无（预编译处理，参数会被当作字符串常量）                                            | 有（直接替换 SQL 片段，参数会被解析为 SQL 语句的一部分）                                 |
| **类型转换**     | 自动处理（如字符串添加单引号、日期格式转换）                                          | 无（直接拼接原始字符串）                                                      |
| **适用场景**     | 大部分参数传递（如`WHERE id = #{id}`、`INSERT INTO ... VALUES (#{name})`） | 动态表名、动态列名（如`SELECT * FROM ${tableName}`、`ORDER BY ${columnName}`） |

> 强制要求：



* 所有用户输入的参数必须使用`#{}`，禁止使用`${}`—— 即使是看似安全的参数（如`id`），也可能被攻击者利用进行 SQL 注入。例如，若使用`${id}`，攻击者可传入`1 OR 1=1`，导致 SQL 语句变为`SELECT * FROM user WHERE id = 1 OR 1=1`，从而查询所有用户数据[(54)](https://blog.csdn.net/BrickPicker/article/details/148927305)。

* 仅在动态表名、动态列名等必须动态拼接 SQL 关键字的场景下使用`${}`，且必须对参数进行严格的白名单校验（如限制表名只能是`user`、`order`等预设值），避免注入风险[(15)](https://blog.csdn.net/2503_93626619/article/details/159850183)。



#### 细节 2：驼峰 - 下划线自动转换的生效条件

要让驼峰 - 下划线自动转换规则生效，必须同时满足以下两个条件，缺一不可[(14)](https://mybatis.org/mybatis-3/zh_CN/configuration.html)：



1. **全局配置开启**：在`application.yml`或`mybatis-config.xml`中设置`map-underscore-to-camel-case: true`—— 该配置默认值为`false`，需显式开启。

2. **无显式结果映射覆盖**：未通过`resultMap`或`@TableField`/`@Column`注解显式指定映射关系 —— 如果有显式映射，自动转换规则会被忽略。

> 常见误区：

很多开发者会误以为开启`map-underscore-to-camel-case`后，所有列名都会自动转换，但实际上，如果实体类中某属性添加了`@TableField("user_name")`注解，MyBatis 会优先使用该注解的映射关系，而忽略自动转换规则。因此，在使用显式注解时，需确保注解中的列名与数据库实际列名完全一致[(78)](https://ask.csdn.net/questions/8959472)。

#### 细节 3：枚举类型的参数处理

当参数是枚举类型时，MyBatis 默认会使用枚举的`name()`方法（即枚举常量的名称）作为参数值，而非枚举的`value`属性（通常是开发者定义的业务值）。这会导致 SQL 语句中传入的是枚举名称（如`ADMIN`），而非预期的业务值（如`1`），最终导致查询或更新失败[(67)](https://blog.51cto.com/u_16265376/10813075)。

**解决方案**：



* **方式一：实现**`BaseEnum`**接口**：自定义通用枚举接口，重写`getValue()`方法，指定枚举的业务值。例如：



```
public interface BaseEnum {

&#x20;   Integer getValue();

}

public enum RoleEnum implements BaseEnum {

&#x20;   ADMIN(1, "管理员"),

&#x20;   USER(2, "普通用户");

&#x20;   private final Integer value;

&#x20;   private final String desc;

&#x20;   RoleEnum(Integer value, String desc) {

&#x20;       this.value = value;

&#x20;       this.desc = desc;

&#x20;   }

&#x20;   @Override

&#x20;   public Integer getValue() {

&#x20;       return value;

&#x20;   }

}
```

然后在 XML 中通过`#{role.value}`引用枚举的业务值，MyBatis 会自动调用`getValue()`方法获取实际参数值[(67)](https://blog.51cto.com/u_16265376/10813075)。



* **方式二：使用**`@EnumValue`**注解（MyBatis-Plus 扩展）** ：如果项目中使用了 MyBatis-Plus，可以在枚举的业务值属性上添加`@EnumValue`注解，MyBatis-Plus 会自动将该属性作为参数值。例如：



```
public enum RoleEnum {

&#x20;   ADMIN(1, "管理员"),

&#x20;   USER(2, "普通用户");

&#x20;   @EnumValue // 指定该属性为枚举的业务值

&#x20;   private final Integer value;

&#x20;   private final String desc;

&#x20;   // 构造方法、Getter 方法

}
```

这种方式无需手动调用`getValue()`方法，MyBatis-Plus 会自动识别`@EnumValue`注解的属性，简化枚举参数的处理[(79)](https://blog.csdn.net/wsj__WSJ/article/details/154700634)。



***

## 6. 完整请求流程示例

以下是一个**用户登录请求**的全链路参数传递示例，覆盖从前端 Thymeleaf 页面到后端 Mapper 层的所有环节，清晰展示各层的参数格式与命名映射关系。

### 6.1 前端请求（Thymeleaf + fetch）



* **页面初始化**：后端通过`Model`向前端 Thymeleaf 页面注入初始化数据`userInit`（包含`username: "testUser"`）。

* **请求构造**：前端 JS 从`userInit`中取出`username`，手动构造请求参数`requestData`，并通过`fetch`发送`POST`请求。

* **请求格式**：



```
const requestData = {

&#x20;   "user\_name": "testUser", // 与后端 DTO 的 @JsonProperty("user\_name") 对应

&#x20;   "password": "123456"     // 与后端 DTO 的 password 属性名完全一致

};
```



* **请求发送**：`fetch`将`requestData`序列化为 JSON 字符串，设置`Content-Type: application/json`请求头，发送到`/api/user/login`接口。

### 6.2 Controller 层接收



* **DTO 定义**：后端定义`UserLoginDTO`，通过`@JsonProperty`显式映射`user_name`字段。



```
public class UserLoginDTO {

&#x20;   @JsonProperty("user\_name")

&#x20;   private String userName;

&#x20;   private String password;

&#x20;   // Getter、Setter 方法

}
```



* **参数绑定**：`@RequestBody`注解将 JSON 请求体反序列化为`UserLoginDTO`对象，传递给`login`方法。



```
@PostMapping("/api/user/login")

@ResponseBody

public Result login(@Valid @RequestBody UserLoginDTO loginDTO) {

&#x20;   return userService.login(loginDTO);

}
```

### 6.3 Service 层处理



* **参数传递**：`UserLoginDTO`对象被传递到`UserService.login()`方法。

* **DTO 转 Entity**：Service 层将`loginDTO`的`userName`和`password`属性，手动赋值给`UserEntity`对象（仅转换必要字段）。

* **业务校验**：调用`passwordEncoder.matches()`方法校验密码（前端传递的明文密码与数据库中存储的加密密码对比）。

* **Mapper 调用**：将转换后的`UserEntity`对象传递给`UserMapper.selectByUsername()`方法，执行数据库查询。

### 6.4 Mapper 层数据库交互



* **Mapper 接口**：定义`selectByUsername`方法，参数为`UserEntity`对象。



```
UserEntity selectByUsername(UserEntity userEntity);
```



* **XML 映射**：MyBatis XML 映射文件通过`#{username}`引用`UserEntity`的`username`属性，执行查询 SQL。



```
\<select id="selectByUsername" resultType="com.example.entity.UserEntity">

&#x20;   SELECT user\_id, user\_name, password, create\_time&#x20;

&#x20;   FROM user&#x20;

&#x20;   WHERE user\_name = #{username}

\</select>
```



* **结果映射**：MyBatis 开启了`mapUnderscoreToCamelCase`，自动将数据库列`user_id`→`userId`、`user_name`→`userName`、`create_time`→`createTime`，映射到`UserEntity`的对应属性。

### 6.5 响应返回



* **Service 层处理结果**：如果用户名和密码正确，Service 层返回`Result.success("登录成功")`；否则返回错误信息。

* **Controller 层响应**：`@ResponseBody`注解将`Result`对象序列化为 JSON 字符串，返回给前端。

* **前端处理**：前端`fetch`的`then`方法接收响应 JSON，打印结果或更新页面。



***

## 7. 常见错误与解决方案

以下是全链路参数传递中最常见的错误场景、根因分析与可落地的解决方案，所有方案均来自生产环境的实际踩坑经验总结。

### 7.1 400 Bad Request（JSON 解析失败）



* **错误信息**：`JSON parse error: Unrecognized field "user_name" (class com.example.dto.UserLoginDTO), not marked as ignorable`。

* **根因分析**：JSON 请求体中的键名`user_name`，在`UserLoginDTO`中没有对应的映射字段 —— 既没有同名属性，也没有通过`@JsonProperty`注解显式映射，导致 Jackson 无法完成反序列化。

* **解决方案**：

1. 检查 DTO 类是否定义了`userName`属性，且添加了`@JsonProperty("user_name")`注解。

2. 若未添加注解，需将 JSON 键名修改为与 DTO 属性名完全一致（如`userName`）。

3. 若需要忽略未知字段（如前端传递了 DTO 中未定义的字段），可在 DTO 类上添加`@JsonIgnoreProperties(ignoreUnknown = true)`注解，避免解析失败。

### 7.2 参数为 null（命名不匹配）



* **错误信息**：DTO 中的`userName`属性为`null`，但前端明明传递了该字段。

* **根因分析**：JSON 键名与 DTO 属性名的大小写或拼写不匹配（如前端传递`UserName`，后端属性名是`userName`；或前端传递`user_name`，后端未配置驼峰自动转换）。

* **解决方案**：

1. 严格检查 JSON 键名与 DTO 属性名的大小写和拼写，确保完全一致（区分大小写）。

2. 若使用蛇形命名，需在 DTO 字段上添加`@JsonProperty`注解，或配置全局 Jackson 命名策略。

3. 开启 Jackson 的调试日志（`logging.level.com``.fasterxml.jackson: DEBUG`），查看反序列化的详细过程，定位具体的字段匹配失败原因。

### 7.3 MyBatis 找不到参数（Parameter 'xxx' not found）



* **错误信息**：`org.apache.ibatis.binding.BindingException: Parameter 'username' not found. Available parameters are [arg0, param1]`。

* **根因分析**：Mapper 接口方法有多个参数，但未添加`@Param`注解，导致 MyBatis 无法识别参数名称，只能使用默认的`arg0`、`param1`等名称。

* **解决方案**：

1. 在 Mapper 接口方法的每个参数前添加`@Param`注解，显式指定参数名称（如`@Param("username") String username`）。

2. 确保 XML 映射文件中的`#{参数名}`与`@Param`注解的参数名称完全一致。

3. 若使用的是 MyBatis 3.4.0 及以上版本，也可以通过开启`useActualParamName`配置（`mybatis.configuration.use-actual-param-name: true`），直接使用方法参数名作为占位符名称，但仍推荐使用`@Param`注解，提升代码可读性。

### 7.4 SQL 注入风险（使用 \${}）



* **错误信息**：无直接错误信息，但存在潜在的 SQL 注入风险（如用户输入`' OR 1=1 --`，导致查询所有数据）。

* **根因分析**：Mapper 的 XML 映射文件中使用了`${}`占位符接收用户输入的参数，MyBatis 会直接将参数拼接到 SQL 语句中，未经过预编译处理。

* **解决方案**：

1. 立即将所有接收用户输入的`${}`替换为`#{}`，MyBatis 会自动对参数进行预编译和转义，彻底避免 SQL 注入。

2. 若必须使用`${}`（如动态表名），需对参数进行严格的白名单校验（如限制表名只能是预设的字符串列表），过滤非法输入。

### 7.5 Thymeleaf 内联变量未解析



* **错误信息**：前端 JS 中的`[[${userInit}]]`被原样输出，未解析为后端注入的 JSON 对象。

* **根因分析**：

1. 包含内联表达式的`<script>`标签未添加`th:inline="javascript"`属性，Thymeleaf 无法识别内联表达式。

2. 后端未通过`Model`向前端注入`userInit`数据，或注入的数据为`null`。

* **解决方案**：

1. 检查`<script>`标签是否添加了`th:inline="javascript"`属性，且属性值拼写正确。

2. 检查后端 Controller 方法是否通过`model.addAttribute("userInit", userInitData)`注入了数据，且数据不为`null`。

3. 若仍未解析，可在浏览器开发者工具中查看页面源代码，确认内联表达式是否被 Thymeleaf 正确替换 —— 如果源代码中仍显示`[[${userInit}]]`，说明 Thymeleaf 未处理该表达式，需检查模板引擎的配置是否正确。



***

## 8. 总结与最佳实践

### 8.1 命名规则总表

为了方便记忆和落地，我们将全链路的命名规则整理为下表，所有规则均来自业界最佳实践与官方文档的要求：



| 层级             | 组件      | 命名规则                                                   | 示例                              |
| -------------- | ------- | ------------------------------------------------------ | ------------------------------- |
| **前端**         | JSON 键名 | 与后端 DTO/Entity 属性名严格匹配；推荐使用驼峰命名，或通过`@JsonProperty`统一约定 | `userName`、`createTime`         |
| **Controller** | DTO 类名  | 以`DTO`结尾，采用大驼峰命名                                       | `UserLoginDTO`                  |
| **Controller** | DTO 属性名 | 小驼峰命名；与 JSON 键名的映射通过`@JsonProperty`或全局策略配置             | `userName`、`password`           |
| **Service**    | 方法名     | 采用动词开头的动宾结构，体现业务动作                                     | `login()`、`register()`          |
| **Service**    | 参数名     | 小驼峰命名，体现业务语义；复杂参数封装为 DTO                               | `loginDTO`、`userId`             |
| **Mapper**     | 接口方法名   | 采用动词开头的动宾结构，与 SQL 操作对应                                 | `selectByUsername()`、`insert()` |
| **Mapper**     | XML 占位符 | 与`@Param`注解或实体类属性名完全一致；必须使用`#{}`                       | `#{username}`、`#{createTime}`   |
| **数据库**        | 表名      | 小写蛇形命名，禁止使用大写字母                                        | `user`、`user_role`              |
| **数据库**        | 列名      | 小写蛇形命名，禁止使用大写字母                                        | `user_id`、`create_time`         |

### 8.2 最佳实践清单

根据全链路参数传递的经验，我们总结了以下必须严格执行的最佳实践，能有效减少 90% 以上的参数传递错误：



1. **统一命名风格**：全链路优先使用**驼峰命名**（DTO/Entity 属性、JSON 键名），数据库层通过`mapUnderscoreToCamelCase`自动转换为下划线命名。避免混合使用驼峰、蛇形或帕斯卡命名，减少不必要的映射错误[(14)](https://mybatis.org/mybatis-3/zh_CN/configuration.html)。

2. **使用 DTO 隔离内外**：Controller 层必须使用 DTO 接收请求，禁止直接使用 Entity—— 这是隔离外部请求与内部数据结构的关键，能有效避免敏感字段暴露，同时提升接口的稳定性（即使 Entity 变化，DTO 可保持不变）[(63)](https://blog.csdn.net/smlcx/article/details/157843752)。

3. **参数校验分层处理**：

* **前端校验**：在 Thymeleaf 页面中通过 JS 或 HTML5 原生校验（如`required`属性），提前过滤非法输入（如空值、格式错误），减少无效请求。

* **Controller 校验**：在 DTO 上添加 JSR-380 校验注解（如`@NotBlank`、`@Size`），配合`@Valid`注解触发校验，统一处理校验失败的响应。

* **Service 校验**：处理复杂业务逻辑校验（如用户名是否已存在、密码强度是否符合要求），这是业务逻辑的一部分，必须放在 Service 层。

1. **Mapper 层强制使用 @Param**：Mapper 接口方法有多个参数时，必须添加`@Param`注解，显式指定参数名称 —— 即使 MyBatis 支持默认参数名，也需显式声明，提升代码可读性与可维护性[(48)](https://wenku.csdn.net/answer/751s6v2yyh)。

2. **开启全局配置简化映射**：

* **Jackson 配置**：配置全局命名策略、日期格式化、时区等，减少每个 DTO 的重复注解，统一 JSON 处理逻辑。

* **MyBatis 配置**：开启`mapUnderscoreToCamelCase`、`log-impl`等配置，简化数据库列与实体属性的映射，同时方便调试 SQL。

1. **使用工具类简化转换**：DTO 与 Entity 的转换优先使用`MapStruct`或`ModelMapper`，减少手动 Getter/Setter 的重复代码，提升开发效率。其中，`MapStruct`是编译期生成代码，性能与手动转换一致，是最推荐的方案[(65)](https://blog.csdn.net/2401_82978699/article/details/154213506)。

2. **严格规避 SQL 注入**：Mapper 的 XML 映射文件中，所有接收用户输入的参数必须使用`#{}`占位符，禁止使用`${}`。若必须使用`${}`，需对参数进行严格的白名单校验，过滤非法输入[(54)](https://blog.csdn.net/BrickPicker/article/details/148927305)。

3. **Thymeleaf 内联必须转义**：前端 JS 变量注入必须使用`[[${}]]`或`[(...)]`语法，并确保`<script>`标签添加了`th:inline="javascript"`属性。禁止直接拼接后端变量到 JS 代码中，避免 XSS 攻击 —— 即使是可信数据，也需通过转义语法处理[(2)](https://blog.csdn.net/weixin_39691748/article/details/113322366)。

通过遵循上述规则和最佳实践，您可以确保参数在全链路的传递过程中清晰、安全且易于维护，大幅提升系统的稳定性与可维护性。

**参考资料&#x20;**

\[1] themleaf表达式给js变量赋值 - CSDN文库[ https://wenku.csdn.net/answer/gea6kd5yvi](https://wenku.csdn.net/answer/gea6kd5yvi)

\[2] thymeleaf 使用inline获取js中的值\_Thymeleaf参考手册(十二):内联-CSDN博客[ https://blog.csdn.net/weixin\_39691748/article/details/113322366](https://blog.csdn.net/weixin_39691748/article/details/113322366)

\[3] springboot 的模板引擎 thymeleaf语法 javascript转义\_mob649e815ecee0的技术博客\_51CTO博客[ https://blog.51cto.com/u\_16175477/13080544](https://blog.51cto.com/u_16175477/13080544)

\[4] Spring Boot整合Thymeleaf模板与CSS实现数据展示[ https://www.iesdouyin.com/share/video/7207237530448579895](https://www.iesdouyin.com/share/video/7207237530448579895)

\[5] 内联 JavaScript - Thymeleaf 教程 - 核心编程[ https://www.hxstrive.com/subject/thymeleaf/1955.htm](https://www.hxstrive.com/subject/thymeleaf/1955.htm)

\[6] SpringBoot如何安全调用前端JS函数?\_编程语言-CSDN问答[ https://ask.csdn.net/questions/8899407](https://ask.csdn.net/questions/8899407)

\[7] Thymeleaf高阶用法详解:内联语法(文本与JavaScript)及Model数据访问优化 - CSDN文库[ https://wenku.csdn.net/doc/3cjwzozha0](https://wenku.csdn.net/doc/3cjwzozha0)

\[8] Thymeleaf javascript 連携のサンプルコード解説[ https://spring-boot.jp/thymeleaf/javascript-args/316](https://spring-boot.jp/thymeleaf/javascript-args/316)

\[9] Mybatis中自动映射规则(包含mp)，setget方法作用，以及占位符理解\_mybatis自动映射-CSDN博客[ https://blog.csdn.net/m0\_57176999/article/details/130607345](https://blog.csdn.net/m0_57176999/article/details/130607345)

\[10] MyBatis-Plus 字段 ## 字段映射全攻略:从基础配置到高级避坑指南\_自由的疯的技术博客\_51CTO博客[ https://blog.51cto.com/u\_16747707/14146263](https://blog.51cto.com/u_16747707/14146263)

\[11] 【MyBatis核心机制】查询结果映射到 Java 对象的原理和机制\_mybatis映射对象原理-CSDN博客[ https://blog.csdn.net/fang\_20/article/details/144776848](https://blog.csdn.net/fang_20/article/details/144776848)

\[12] MyBatis结果映射的三种方式解析[ https://www.iesdouyin.com/share/video/7523434938834652431](https://www.iesdouyin.com/share/video/7523434938834652431)

\[13] 那么mybatis一般用于定义实体类的名称叫什么呢? - CSDN文库[ https://wenku.csdn.net/answer/7k00qvw4fy](https://wenku.csdn.net/answer/7k00qvw4fy)

\[14] MyBatis 3 | 配置 – mybatis[ https://mybatis.org/mybatis-3/zh\_CN/configuration.html](https://mybatis.org/mybatis-3/zh_CN/configuration.html)

\[15] MVN--04-CSDN博客[ https://blog.csdn.net/2503\_93626619/article/details/159850183](https://blog.csdn.net/2503_93626619/article/details/159850183)

\[16] 매퍼 설정[ https://mybatis.org/mybatis-3//ko/configuration.html](https://mybatis.org/mybatis-3//ko/configuration.html)

\[17] SpringBoot 请求参数绑定:@RequestParam / @PathVariable / @RequestBody 详解-CSDN博客[ https://blog.csdn.net/qq\_42453117/article/details/159519368](https://blog.csdn.net/qq_42453117/article/details/159519368)

\[18] Spring Boot使用@RequestBody接收数组List和POJO参数-开发者社区-阿里云[ https://developer.aliyun.com/article/1008064](https://developer.aliyun.com/article/1008064)

\[19] Spring Boot实战：RESTful API开发与参数校验详解[ https://www.iesdouyin.com/share/video/7431539789431639331](https://www.iesdouyin.com/share/video/7431539789431639331)

\[20] SpringBoot后端接收前端请求全解析\_spring boot 前端请求对象,后端string 接收-CSDN博客[ https://blog.csdn.net/FUHBI/article/details/154406608](https://blog.csdn.net/FUHBI/article/details/154406608)

\[21] Spring Boot--@PathVariable、@RequestParam、@RequestBody-CSDN博客[ https://blog.csdn.net/2611\_94933052/article/details/159746433](https://blog.csdn.net/2611_94933052/article/details/159746433)

\[22] @RequestMapping运用举例(有源码) 前后端如何传递参数?后端如何接收前端传过来的参数，传递单个参数，多个参数，对象，数组/集合(有源码)-阿里云开发者社区[ https://developer.aliyun.com/article/1617817](https://developer.aliyun.com/article/1617817)

\[23] \[Spring Boot] 타임리프(Thymeleaf) 완벽 가이드: 설정부터 레이아웃까지[ https://velog.io/@danny5193/Spring-Boot-%ED%83%80%EC%9E%84%EB%A6%AC%ED%94%84Thymeleaf-%EC%99%84%EB%B2%BD-%EA%B0%80%EC%9D%B4%EB%93%9C-%EC%84%A4%EC%A0%95%EB%B6%80%ED%84%B0-%EB%A0%88%EC%9D%B4%EC%95%84%EC%9B%83%EA%B9%8C%EC%A7%80](https://velog.io/@danny5193/Spring-Boot-%ED%83%80%EC%9E%84%EB%A6%AC%ED%94%84Thymeleaf-%EC%99%84%EB%B2%BD-%EA%B0%80%EC%9D%B4%EB%93%9C-%EC%84%A4%EC%A0%95%EB%B6%80%ED%84%B0-%EB%A0%88%EC%9D%B4%EC%95%84%EC%9B%83%EA%B9%8C%EC%A7%80)

\[24] Java前后端字段名不一致导致参数绑定失败\_编程语言-CSDN问答[ https://ask.csdn.net/questions/9239823](https://ask.csdn.net/questions/9239823)

\[25] Spring Boot中POST请求参数无法正确绑定\_编程语言-CSDN问答[ https://ask.csdn.net/questions/8766036](https://ask.csdn.net/questions/8766036)

\[26] json requestbody null - CSDN文库[ https://wenku.csdn.net/answer/10vfagjute](https://wenku.csdn.net/answer/10vfagjute)

\[27] Spring Boot Validation注解应用与全局异常处理指南[ https://www.iesdouyin.com/share/video/7398916221313305866](https://www.iesdouyin.com/share/video/7398916221313305866)

\[28] @Requestbody实体映射字段为空 - CSDN文库[ https://wenku.csdn.net/answer/61kmvjrcb1](https://wenku.csdn.net/answer/61kmvjrcb1)

\[29] SpringBoot POST接口参数绑定失败\_编程语言-CSDN问答[ https://ask.csdn.net/questions/9109919](https://ask.csdn.net/questions/9109919)

\[30] Spring Boot Controller如何正确接收JSON数据?\_编程语言-CSDN问答[ https://ask.csdn.net/questions/8867550](https://ask.csdn.net/questions/8867550)

\[31] 开发 Java 项目时的命名规范以下是基于业界最佳实践的 SpringBoot 项目命名规范总结，涵盖项目、包、代码及配 - 掘金[ https://juejin.cn/post/7526749390897299510](https://juejin.cn/post/7526749390897299510)

\[32] 【架构】-----Service 层代码太长太乱?试试这套 “见名知意” 的命名规范!\_service 代码规范-CSDN博客[ https://blog.csdn.net/qq\_24923619/article/details/156765189](https://blog.csdn.net/qq_24923619/article/details/156765189)

\[33] serviceimpl参数 - CSDN文库[ https://wenku.csdn.net/answer/20v61eunee](https://wenku.csdn.net/answer/20v61eunee)

\[34] Spring Boot 2 基础 篇 - 36 - 业务 层 标准 开发 基础 CRUD # 财富 小剧场 第一 季[ https://www.iesdouyin.com/share/video/7024027872679562535](https://www.iesdouyin.com/share/video/7024027872679562535)

\[35] 基于阿里开发手册Java命名规范深度解析-开发者社区-阿里云[ https://developer.aliyun.com/article/1608400](https://developer.aliyun.com/article/1608400)

\[36] springboot 请求参数 设计规范 - CSDN文库[ https://wenku.csdn.net/answer/51x5czo0px](https://wenku.csdn.net/answer/51x5czo0px)

\[37] 软件开发命名规范与SpringBoot分层设计指南\_springboot 防腐层命名-CSDN博客[ https://blog.csdn.net/DHY857792565/article/details/147041734](https://blog.csdn.net/DHY857792565/article/details/147041734)

\[38] 【干货分享】代码编写规范——Java SpringBoot篇\_springboot包名命名规范-CSDN博客[ https://blog.csdn.net/qq\_35573326/article/details/150604180](https://blog.csdn.net/qq_35573326/article/details/150604180)

\[39] 如果使用了thymeleaf+springboot 页面怎么向后端传递数据 - CSDN文库[ https://wenku.csdn.net/answer/7wdqfeen0o](https://wenku.csdn.net/answer/7wdqfeen0o)

\[40] 深入剖析@RequestBody、@PathVariable和@RequestParam注解当我们在开发服务端方法时，遇 - 掘金[ https://juejin.cn/post/7244174211971072055](https://juejin.cn/post/7244174211971072055)

\[41] SpringMVC与RESTful实践:视图解析、异常处理与Ajax交互-CSDN博客[ https://blog.csdn.net/weixin\_50281545/article/details/121573896](https://blog.csdn.net/weixin_50281545/article/details/121573896)

\[42] Spring Boot整合Spring Security与Thymeleaf实现权限控制[ https://www.iesdouyin.com/share/video/7429140041894481215](https://www.iesdouyin.com/share/video/7429140041894481215)

\[43] Spring Boot + ThymeleafでList\<Object>をPOSTする方法[ https://medium-company.com/springboot-thymeleaf-list/](https://medium-company.com/springboot-thymeleaf-list/)

\[44] 【SpringBoot(三)】从请求到响应再到视图解析与模板引擎，本文带你领悟SpringBoot请求接收全流程!-阿里云开发者社区[ https://developer.aliyun.com/article/1684482](https://developer.aliyun.com/article/1684482)

\[45] SpringBoot和前端数据交互(js,jQuery,thymeleaf)\_springboot jquery 提交文本值-CSDN博客[ https://blog.csdn.net/zaincs/article/details/84991153](https://blog.csdn.net/zaincs/article/details/84991153)

\[46] Html post request using spring mvc and thymeleaf[ https://www.codepudding.com/Softwaredesign/503913.html](https://www.codepudding.com/Softwaredesign/503913.html)

\[47] Mybatis @Param参数传递说明\_java mybatis指定参数名-CSDN博客[ https://blog.csdn.net/qq\_53844452/article/details/150208718](https://blog.csdn.net/qq_53844452/article/details/150208718)

\[48] 在mapper接口中接收的参数如何重命名在xml文件里面使用 - CSDN文库[ https://wenku.csdn.net/answer/751s6v2yyh](https://wenku.csdn.net/answer/751s6v2yyh)

\[49] MyBatis @Param 注解详解:多参数传递与正确使用方式-腾讯云开发者社区-腾讯云[ https://cloud.tencent.com.cn/developer/article/2621076](https://cloud.tencent.com.cn/developer/article/2621076)

\[50] MyBatis 面试 题 \_ 映射 文件 中 如何 获取 方法 参数 Java 高频 面试 题 详解 \~ ！ 直通 大厂&#x20;

&#x20;\# java # java 面试 # java 程序员 # java 编程 # java 培训[ https://www.iesdouyin.com/share/video/7522677771919740196](https://www.iesdouyin.com/share/video/7522677771919740196)

\[51] dao层@Param使用时注意点 - CSDN文库[ https://wenku.csdn.net/answer/86ch3cc5gp](https://wenku.csdn.net/answer/86ch3cc5gp)

\[52] MyBatis 3 | XML 映射器 – mybatis[ https://mybatis.org/mybatis-3/zh\_CN/sqlmap-xml.html](https://mybatis.org/mybatis-3/zh_CN/sqlmap-xml.html)

\[53] Mapper接口参数未正确标注@Param注解\_编程语言-CSDN问答[ https://ask.csdn.net/questions/8876288](https://ask.csdn.net/questions/8876288)

\[54] Mybatis参数传递方法小结\_mybatis传对象参数-CSDN博客[ https://blog.csdn.net/BrickPicker/article/details/148927305](https://blog.csdn.net/BrickPicker/article/details/148927305)

\[55] 如果使用了thymeleaf+springboot 页面怎么向后端传递数据 - CSDN文库[ https://wenku.csdn.net/answer/7wdqfeen0o](https://wenku.csdn.net/answer/7wdqfeen0o)

\[56] \[Spring] SpringMVC 简介(三)\_拦截器三个方法-CSDN博客[ https://blog.csdn.net/joyride\_run/article/details/133820827](https://blog.csdn.net/joyride_run/article/details/133820827)

\[57] SpringBoot和前端数据交互(js,jQuery,thymeleaf)\_springboot jquery 提交文本值-CSDN博客[ https://blog.csdn.net/zaincs/article/details/84991153](https://blog.csdn.net/zaincs/article/details/84991153)

\[58] Spring Boot整合Spring Security与Thymeleaf实现权限控制[ https://www.iesdouyin.com/share/video/7429140041894481215](https://www.iesdouyin.com/share/video/7429140041894481215)

\[59] Html post request using spring mvc and thymeleaf[ https://www.codepudding.com/Softwaredesign/503913.html](https://www.codepudding.com/Softwaredesign/503913.html)

\[60] 【SpringBoot(三)】从请求到响应再到视图解析与模板引擎，本文带你领悟SpringBoot请求接收全流程!-阿里云开发者社区[ https://developer.aliyun.com/article/1684482](https://developer.aliyun.com/article/1684482)

\[61] springMVC+thymeleaf form表单提交前后台数据传递\_thmyleaf 后端给前端传实体-CSDN博客[ https://blog.csdn.net/huihuilovei/article/details/64466548](https://blog.csdn.net/huihuilovei/article/details/64466548)

\[62] Servlet+Thymeleaf + Fetch 实现无刷新异步请求-CSDN博客[ https://blog.csdn.net/hlx20080808/article/details/160020821](https://blog.csdn.net/hlx20080808/article/details/160020821)

\[63] SpringBoot开发必懂:VO、DTO、BO、DO、PO到底怎么用?一篇吃透不踩坑\_spring 有的用request代替vo-CSDN博客[ https://blog.csdn.net/smlcx/article/details/157843752](https://blog.csdn.net/smlcx/article/details/157843752)

\[64] serviceimpl参数 - CSDN文库[ https://wenku.csdn.net/answer/20v61eunee](https://wenku.csdn.net/answer/20v61eunee)

\[65] 后端开发 DTO-Entity-VO 转换模式详解\_springboot vo dto entity之间的转换-CSDN博客[ https://blog.csdn.net/2401\_82978699/article/details/154213506](https://blog.csdn.net/2401_82978699/article/details/154213506)

\[66] Spring Boot实战：RESTful API开发与参数校验详解[ https://www.iesdouyin.com/share/video/7431539789431639331](https://www.iesdouyin.com/share/video/7431539789431639331)

\[67] SpringBoot之实体参数的详细解析\_wx65046356aaed6的技术博客\_51CTO博客[ https://blog.51cto.com/u\_16265376/10813075](https://blog.51cto.com/u_16265376/10813075)

\[68] Spring Boot:DTO、VO、BO、Entity 的正确工程化分层\_dto和vo-CSDN博客[ https://blog.csdn.net/weixin\_46619605/article/details/155191757](https://blog.csdn.net/weixin_46619605/article/details/155191757)

\[69] Entity vs DTO 및 사용/변환 계층[ https://velog.io/@gogidosirak/Entity-vs-DTO](https://velog.io/@gogidosirak/Entity-vs-DTO)

\[70] 后端 - Spring Boot 三层架构解密:从 Controller 到 Repository 的数据之旅 - 个人文章 - SegmentFault 思否[ https://segmentfault.com/a/1190000047433302](https://segmentfault.com/a/1190000047433302)

\[71] SpringBoot后端接收前端请求全解析\_spring boot 前端请求对象,后端string 接收-CSDN博客[ https://blog.csdn.net/FUHBI/article/details/154406608](https://blog.csdn.net/FUHBI/article/details/154406608)

\[72] 参数为project\_name，如何在@RequestBody上将其映射为驼峰字段 - CSDN文库[ https://wenku.csdn.net/answer/3pj7jw80s2](https://wenku.csdn.net/answer/3pj7jw80s2)

\[73] Spring用@RequestBody接收JSON时，前后端字段怎么才能自动对上? - CSDN文库[ https://wenku.csdn.net/answer/48xdyna47m](https://wenku.csdn.net/answer/48xdyna47m)

\[74] 阿里 二面 ： BO 、 VO 、 PO 、 DO 、 DTO 分别 代表 什么 ， 怎么 用 ？&#x20;

&#x20;\# Java # 程序员 # 科技 # 计算机 技术 # Java 场景 题[ https://www.iesdouyin.com/share/video/7555403723078454579](https://www.iesdouyin.com/share/video/7555403723078454579)

\[75] Spring Boot JSON数组到List的反序列化失败原因与解决方案-java教程-PHP中文网[ https://m.php.cn/faq/2282834.html](https://m.php.cn/faq/2282834.html)

\[76] 如果前端发过来的请求是下划线的模式，但是你后端的实体是小驼峰的形式，而且你在接口中的入参使用的RequstBody这个注释，请问改怎么样把数据对接起来 - CSDN文库[ https://wenku.csdn.net/answer/5ssjo7sj6q](https://wenku.csdn.net/answer/5ssjo7sj6q)

\[77] Spring Boot JSON 数组到 DTO List 的正确映射方法-java教程-PHP中文网[ https://m.php.cn/faq/2282699.html](https://m.php.cn/faq/2282699.html)

\[78] tkmapper何时将数据库字段转为驼峰命名?\_编程语言-CSDN问答[ https://ask.csdn.net/questions/8959472](https://ask.csdn.net/questions/8959472)

\[79] 深入解析 MybatisPlus @TableField 注解:四大场景实战与底层逻辑\_mybatis plus tablefield-CSDN博客[ https://blog.csdn.net/wsj\_\_WSJ/article/details/154700634](https://blog.csdn.net/wsj__WSJ/article/details/154700634)

\[80] mybatis中mapUnderscoreToCamelCase自动驼峰命名转换\_mybatis-plus.configuration.map-underscore-to-camel-CSDN博客[ https://blog.csdn.net/qq\_39019865/article/details/84616582](https://blog.csdn.net/qq_39019865/article/details/84616582)

\[81] MyBatis - Plus ： 让 CRUD 效率 直接 起飞 ！ # Java # java 程序员 # Java 面试 # 程序员 # mybatis - plus[ https://www.iesdouyin.com/share/video/7601843067083197736](https://www.iesdouyin.com/share/video/7601843067083197736)

\[82] 如何解决MyBatis中的数据库字段下划线转驼峰\_mapUnderscoreToCamelCase全局配置-java教程-PHP中文网[ https://m.php.cn/faq/2216143.html](https://m.php.cn/faq/2216143.html)

\[83] mybatis: configuration: map-underscore-to-camel-case: true - CSDN文库[ https://wenku.csdn.net/answer/7mkr0xoh5y](https://wenku.csdn.net/answer/7mkr0xoh5y)

\[84] mapUnderscoreToCamelCase: true 不生效 - CSDN文库[ https://wenku.csdn.net/answer/1sbzjegfmr](https://wenku.csdn.net/answer/1sbzjegfmr)

\[85] MyBatis-Plus 字段 ## 字段映射全攻略:从基础配置到高级避坑指南\_自由的疯的技术博客\_51CTO博客[ https://blog.51cto.com/u\_16747707/14146263](https://blog.51cto.com/u_16747707/14146263)

> （注：文档部分内容可能由 AI 生成）