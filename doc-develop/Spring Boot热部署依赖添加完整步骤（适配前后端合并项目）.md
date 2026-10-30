# Spring Boot热部署依赖添加完整步骤（适配前后端合并项目）

核心说明：本步骤基于你现有「HTML+JS前端+Spring Boot API合并项目」，采用Spring官方推荐的spring-boot-devtools实现热部署，支持修改Java代码（Controller、Service等）后自动重启，无需手动启动服务，配合IDE配置可实现无缝调试，大幅提升开发效率。

## 一、核心前提

确保你的项目已正常配置Spring Boot基础依赖（如spring-boot-starter-web、thymeleaf等，即原有pom.xml中已包含相关依赖），且IDE（以IDEA为例）已正常加载项目，无Maven依赖报错。

## 二、分步添加热部署依赖（关键步骤）

### 步骤1：修改pom.xml，添加热部署核心依赖

打开项目根目录下的pom.xml文件，在<dependencies>标签内添加spring-boot-devtools依赖，该依赖仅用于开发环境，不会影响生产环境打包，配置如下（可直接复制粘贴）：

```xml
<!-- 热部署核心依赖：spring-boot-devtools -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-devtools</artifactId>
    <optional>true</optional> <!-- 避免依赖传递，仅当前项目生效，生产环境不引入 -->
    <scope>runtime</scope> <!-- 仅运行时有效，不影响编译过程 -->
</dependency>
```

补充配置：为确保热部署生效，需在pom.xml的<build>标签内，给spring-boot-maven-plugin添加<fork>true</fork>配置（若已有该插件，直接添加配置；若没有，需先添加插件），完整插件配置如下：

```xml
<build>
    <plugins>
        <!-- Spring Boot 打包插件（原有配置，无需删除） -->
       <plugin>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-maven-plugin</artifactId>
            <configuration>
                <excludes>
                    <exclude>
                        <groupId>org.projectlombok</groupId>
                        <artifactId>lombok</artifactId>
                    </exclude>
                </excludes>
                <!-- 关键配置：开启独立进程，确保热部署生效 -->
                <fork>true</fork>
            </configuration>
        </plugin>
    </plugins>
</build>
```

配置说明：<fork>true</fork>表示让Spring Boot应用在独立进程中运行，避免与IDE进程冲突，这是热部署生效的关键配置，缺少该配置会导致热部署失效。

### 步骤2：修改application.properties，配置热部署规则

打开src/main/resources目录下的application.properties文件，添加热部署相关配置，适配你的前后端合并项目（无需修改原有端口、数据库配置，直接追加即可）：

```properties
# ======================== 热部署配置（追加到文件末尾即可） ========================
# 启用热部署自动重启功能
spring.devtools.restart.enabled=true
# 配置需要监控的代码目录（修改该目录下的Java文件会触发热部署）
spring.devtools.restart.additional-paths=src/main/java
# 排除不需要热部署的目录（静态资源、模板页面无需热部署，修改后刷新浏览器即可生效）
spring.devtools.restart.exclude=static/**,templates/**,public/**
# 热部署检测文件变化的时间间隔（1000ms，可根据需求调整）
spring.devtools.restart.poll-interval=1000ms
# 触发重启前的静默期（400ms，避免频繁修改导致多次重启）
spring.devtools.restart.quiet-period=400ms
```

配置说明：该配置会让热部署仅监控后端Java代码（src/main/java目录），前端静态资源（static）和模板页面（templates）修改后无需触发重启，直接刷新浏览器即可生效，与你项目的前后端结构完美适配。

### 步骤3：配置IDE（IDEA），确保热部署生效

仅添加依赖和配置文件还不够，需开启IDEA的自动编译功能，否则修改代码后无法自动触发热部署，具体步骤如下：

1. 开启IDEA自动构建：打开IDEA，点击顶部菜单栏「File」→「Settings」（快捷键Ctrl+Alt+S），找到「Build, Execution, Deployment」→「Compiler」，勾选「Build project automatically」（自动构建项目），点击「Apply」保存设置。

2. 允许运行时自动编译：点击顶部菜单栏「File」→「Advanced Settings」，找到「Compiler」→「Allow auto-make to start even if developed application is currently running」，勾选该选项，点击「Apply」→「OK」保存设置（该步骤用于让IDEA在应用运行时也能自动编译修改后的代码）。

3. （可选）配置运行参数：点击IDEA顶部工具栏的「Edit Configurations」，找到你的Spring Boot启动配置（SpringBootMergeApplication），点击「Modify options」→「On 'Update' action」，选择「Update classes and resources」，保存配置后，可手动触发热部署（快捷键Ctrl+F9）。

## 三、热部署生效验证

1. 重启Spring Boot服务：按照之前的启动步骤，重新启动项目（仅需重启一次，后续修改代码无需手动重启）。

2. 修改后端代码：打开IndexController.java（或其他Java类），修改代码（例如修改API返回的内容、调整业务逻辑），保存文件（Ctrl+S）。

3. 查看控制台：观察IDEA底部的「Run」控制台，若出现「Restarting due to changes on classpath」相关日志，说明热部署已触发，等待1-2秒即可完成自动重启。

4. 验证效果：打开浏览器，访问API接口或前端页面，查看修改后的效果是否生效，无需手动重启服务即能看到最新修改。

## 四、补充说明

- 热部署适用范围：支持修改Java类（Controller、Service、Mapper、Entity等）、配置文件（application.properties）后自动重启；前端HTML、CSS、JS等静态资源修改后，无需热部署，直接刷新浏览器即可生效（因原有配置已关闭thymeleaf缓存）。

- 生产环境兼容：由于spring-boot-devtools依赖添加了<optional>true</optional>，打包生产环境jar包时，该依赖会自动排除，无需手动删除，避免影响生产环境性能。

- 常见问题解决：若热部署不生效，可尝试以下操作：① 刷新Maven依赖（右键pom.xml→「Reload Project」）；② 重启IDEA并清除缓存（File→Invalidate Caches）；③ 检查pom.xml中fork配置和application.properties中热部署配置是否正确；④ 确认IDEA自动编译功能已开启。

- 热部署局限性：修改类名、方法名、注解参数，或新增/删除类时，热部署可能无法生效，需手动重启服务；仅方法体内代码、变量值调整等常规修改可通过热部署生效。
> （注：文档部分内容可能由 AI 生成）