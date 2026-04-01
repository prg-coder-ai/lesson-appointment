以下是对这两个核心配置文件的详细介绍，涵盖文件作用、核心配置项、使用场景及关键注意事项：

### 一、`application.properties`（Spring Boot 核心配置文件）
该文件是 Spring Boot 应用的核心配置入口，用于定义应用运行的各类参数，替代传统 Spring 项目的 XML 配置，采用 `key=value` 键值对格式，核心模块如下：

#### 1. 基础服务配置
| 配置项                | 作用                                                                 |
|-----------------------|----------------------------------------------------------------------|
| `server.port=8081`    | 定义应用启动端口（避免8080端口冲突，示例为8081）                     |
| 热部署相关配置        | 开启代码热部署，修改Java文件自动重启，提升开发效率（仅开发环境生效） |

#### 2. 模板引擎（Thymeleaf）配置
专为 HTML 动态页面渲染设计，核心配置：
- 关闭缓存（`spring.thymeleaf.cache=false`）：开发时修改页面无需重启项目；
- 页面路径/后缀：固定指向 `templates/` 目录，页面后缀为 `.html`；
- 编码/语法：指定 UTF-8 编码（避免中文乱码），适配 HTML5 语法。

**使用说明**：Controller 需用 `@Controller` 注解，方法返回页面名称（无需后缀），通过 `Model` 向页面传递数据（页面用 `th:text="${变量名}"` 取值）。

#### 3. 数据库配置（MySQL）
核心是 JDBC 连接参数，需根据实际环境替换：
- `spring.datasource.url`：MySQL 连接地址（修复了原错误的 `??` 为标准 `?`，兼容 8.0+ 驱动）；
- `username/password`：数据库账号密码（示例为 root/123456）；
- 驱动类：MySQL8.0+ 用 `com.mysql.cj.jdbc.Driver`（5.x 需改为 `com.mysql.jdbc.Driver`）。

#### 4. MyBatis 配置（持久层）
- 实体类包路径：指定 `com.reservation.entity`，简化 Mapper 中实体类引用；
- Mapper.xml 路径：固定扫描 `resources/mybatis/mapper/` 下的 XML 文件；
- SQL 日志：开启 Mapper 层日志（`debug` 级别），便于开发时调试 SQL。

#### 5. 安全配置（JWT）
- `jwt.secret`：JWT 令牌加密密钥（自定义字符串）；
- `jwt.expiration`：令牌有效期（1小时，单位毫秒），用于接口鉴权。

#### 6. 静态资源配置
- 静态资源（JS/CSS/图片）访问路径：映射到 `templates/` 目录，页面可直接引用；
- 热部署排除静态资源目录：修改静态文件无需重启，刷新浏览器即可生效。

### 二、`pom.xml`（Maven 项目依赖配置文件）
该文件是 Maven 项目的核心，用于定义项目坐标、依赖、构建规则，核心模块如下：

#### 1. 基础信息
- 项目坐标：`groupId=com.reservation`（组织/项目标识）、`artifactId=api`（模块名）、`version=1.0.0-SNAPSHOT`（快照版本，开发中）；
- 基础属性：指定 JDK 1.8、编码 UTF-8，统一依赖版本（如 MyBatis、MySQL 驱动、JWT），便于维护。

#### 2. 核心依赖
| 依赖分类                | 关键依赖                                                                 | 作用                                                                 |
|-------------------------|--------------------------------------------------------------------------|----------------------------------------------------------------------|
| Spring Boot 核心        | `spring-boot-starter-web`                                                | 提供 Web 开发能力（MVC、内嵌 Tomcat 等）                             |
| 热部署                  | `spring-boot-devtools`                                                   | 开发时代码热部署，无需手动重启应用                                   |
| 数据校验                | `spring-boot-starter-validation` + hibernate-validator                   | 接口参数校验（如非空、格式验证）                                     |
| 安全框架                | `spring-boot-starter-security`                                           | 权限控制（RBAC 模型），配合 JWT 实现接口鉴权                         |
| JWT 令牌                | `jjwt-api/jjwt-impl/jjwt-jackson`                                        | 生成/解析 JWT 令牌，实现无状态鉴权                                   |
| 持久层                  | `mybatis-spring-boot-starter` + `mybatis-plus-boot-starter`              | MyBatis + MyBatis-Plus 整合 Spring Boot，简化数据库操作             |
| 数据库驱动              | `mysql-connector-java`（8.0.33）                                         | 适配 MySQL 5.7+/8.0+，支持 utf8mb4 编码                             |
| 工具类                  | `lombok`                                                                 | 简化实体类代码（自动生成 getter/setter/构造方法）                   |
| 测试                    | `spring-boot-starter-test`                                               | 单元测试支持（Junit、Mockito 等）                                    |

#### 3. 构建配置
- Spring Boot 打包插件：`spring-boot-maven-plugin`，将项目打包为可执行 JAR（包含内嵌 Tomcat）；
- 启动类指定：`mainClass=com.reservation.SpringBootMergeApplication`，指定应用入口类；
- 资源扫描：加载 `src/main/java` 下的 XML 文件 + `src/main/resources` 下的所有配置文件；
- 热部署适配：`fork=true`，确保热部署生效（独立进程运行）。

### 三、关键注意事项
1. **数据库配置**：需替换 `application.properties` 中的数据库 IP、端口、账号密码，否则无法连接数据库；
2. **依赖版本兼容**：`pom.xml` 中 Spring Boot 2.7.15 与 MyBatis-Plus 3.5.3.1、JJWT 0.11.5 适配，不建议随意升级版本；
3. **环境区分**：热部署、SQL 日志仅建议在开发环境开启，生产环境需关闭（提升性能、减少日志量）；
4. **JWT 安全**：`jwt.secret` 需替换为复杂密钥，生产环境建议通过环境变量注入，避免硬编码。

### 四、整体应用场景
这两个文件适配**课时预约系统**（lesson booking system）的后端开发：
- 基于 Spring Boot 构建 Web 服务，通过 Thymeleaf 渲染前端页面；
- 采用 MySQL 存储数据，MyBatis/MyBatis-Plus 简化数据库操作；
- 结合 Spring Security + JWT 实现接口鉴权；
- 热部署、SQL 日志等配置提升开发效率，适配快速迭代需求。