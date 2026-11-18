# Maven 基础体系结构及其在 Spring Boot 项目中的应用模式深度解析

## 核心摘要

Maven 作为 Java 生态的标准化构建与依赖管理工具，基于**项目对象模型（POM）** 核心概念，通过**坐标机制**、**约定优于配置（CoC）** 原则与**插件化架构**，解决了传统开发中 “依赖地狱” 与构建流程碎片化的行业痛点。在 Spring Boot 项目中，Maven 的价值被进一步放大：其依赖传递与版本仲裁能力支撑了 Starter 场景化依赖的核心机制，插件机制则实现了可执行 JAR 打包、自动配置等标志性特性，多模块构建功能更是为中大型项目提供了清晰的代码解耦与并行开发方案。

本报告将从理论层面对比 Maven 与传统构建工具的差异，系统解析其核心组件的运作逻辑，并结合 Spring Boot 3.x 版本的实战场景，深入探讨依赖管理、插件机制与多模块构建的最佳实践，为企业级项目的构建标准化提供可落地的参考方案。



***

## 1. Maven 基础体系结构理论解析

### 1.1 核心概念：项目对象模型（POM）

Maven 的核心设计思想是**用一个中央配置文件描述整个项目**，这个文件就是 `pom.xml`，即**项目对象模型（Project Object Model）** [(67)](https://maven.apache.org/pom.html?fbclid=IwAR3VEGKs5vb5KDDdm3SUS2C_KD7yqCHyqCNcrkMyNPP23firZ5ue7rc1kw8)。与传统 Ant 等工具的 “过程式构建脚本” 不同，POM 采用**声明式配置**：开发者无需手动编写编译、打包、测试的每一步执行逻辑，只需在 POM 中声明项目的目标状态（如依赖哪些库、用什么 JDK 版本编译），Maven 就会自动完成后续所有环节。这种设计将构建逻辑与业务代码完全解耦，大幅降低了团队协作中的流程沟通成本。

#### 1.1.1 POM 的核心构成

POM 采用 XML 格式编写，所有配置围绕项目的生命周期展开，其核心构成可分为五个基础部分，每个部分都承担着不可替代的作用：



* **项目坐标（GAV）** ：这是 Maven 最基础也最核心的创新之一 —— 通过 `groupId`、`artifactId`、`version` 三个参数的组合，Maven 为全球所有 Java 构件定义了一套唯一且无歧义的标识规则，就像互联网中的 IP 地址一样。具体来说：


  * `groupId`：对应项目的组织或公司域名反写（例如 `org.springframework.boot`、`com.alibaba`），用于区分不同组织开发的项目，避免重名冲突；

  * `artifactId`：对应项目或模块的名称（例如 `spring-boot-starter-web`），是组织内部对项目的唯一标识；

  * `version`：遵循语义化版本规范（主版本。次版本。修订版，如 `3.2.5`），还可通过 `-SNAPSHOT`（开发中版本）、`-RELEASE`（稳定版）等后缀标识版本状态 [(67)](https://maven.apache.org/pom.html?fbclid=IwAR3VEGKs5vb5KDDdm3SUS2C_KD7yqCHyqCNcrkMyNPP23firZ5ue7rc1kw8)。

* **依赖配置（**`<dependencies>`**）** ：用于声明项目直接依赖的外部库或内部模块。Maven 的依赖具有**传递性**—— 例如当项目引入 `spring-boot-starter-web` 时，无需手动声明其依赖的 `spring-core`、`tomcat-embed-core` 等组件，Maven 会自动解析并下载这些间接依赖，这是解决 “依赖地狱” 的关键基础 [(67)](https://maven.apache.org/pom.html?fbclid=IwAR3VEGKs5vb5KDDdm3SUS2C_KD7yqCHyqCNcrkMyNPP23firZ5ue7rc1kw8)。

* **构建配置（**`<build>`**）** ：用于定义项目的构建规则，例如指定编译用的 JDK 版本、资源文件的过滤规则、插件的执行参数等。`<build>` 是 Maven 插件机制的核心入口，所有需要参与构建流程的插件都需在此声明 [(67)](https://maven.apache.org/pom.html?fbclid=IwAR3VEGKs5vb5KDDdm3SUS2C_KD7yqCHyqCNcrkMyNPP23firZ5ue7rc1kw8)。

* **继承关系（**`<parent>`**）** ：用于实现配置复用。子模块可以通过 `<parent>` 标签继承父 POM 的所有配置，包括依赖版本、插件参数、编码格式等，从而避免在每个子模块中重复编写相同的配置代码。例如 Spring Boot 项目的父 POM 就定义了默认的 JDK 版本、编码格式和依赖版本，子模块只需继承即可直接使用 [(67)](https://maven.apache.org/pom.html?fbclid=IwAR3VEGKs5vb5KDDdm3SUS2C_KD7yqCHyqCNcrkMyNPP23firZ5ue7rc1kw8)。

* **模块列表（**`<modules>`**）** ：仅用于多模块项目的聚合构建。当一个 POM 的打包类型为 `pom` 时，它就是一个 “聚合器”，负责按顺序构建所有子模块 ——Maven 会自动识别模块间的依赖关系，优先构建被依赖的模块，确保构建过程的正确性 [(67)](https://maven.apache.org/pom.html?fbclid=IwAR3VEGKs5vb5KDDdm3SUS2C_KD7yqCHyqCNcrkMyNPP23firZ5ue7rc1kw8)。

#### 1.1.2 坐标机制的意义

在 Maven 出现之前，Java 项目的依赖管理完全依赖手动下载 JAR 包并复制到项目的 `lib` 目录，这种方式存在三大致命问题：一是**版本冲突**—— 不同依赖可能依赖同一库的不同版本，开发者需手动排查；二是**依赖缺失**—— 手动下载时容易遗漏间接依赖；三是**跨环境不一致**—— 不同开发者的本地 `lib` 目录可能存在差异，导致构建结果不一致。

Maven 的坐标机制从根本上解决了这些问题：它通过唯一的 GAV 标识，将所有依赖的存储和传递标准化。当项目需要某个依赖时，Maven 会自动从配置的仓库（本地或远程）中查找对应 GAV 的构件，无需开发者手动干预。这一机制不仅解决了 “依赖地狱”，更让 Java 项目的构建真正实现了跨环境一致 —— 无论在本地、CI 服务器还是生产环境，只要 POM 配置相同，构建结果就完全一致 [(67)](https://maven.apache.org/pom.html?fbclid=IwAR3VEGKs5vb5KDDdm3SUS2C_KD7yqCHyqCNcrkMyNPP23firZ5ue7rc1kw8)。

### 1.2 构建生命周期与阶段

Maven 定义了三套**相互独立且顺序固定**的生命周期，每套生命周期包含多个**阶段（Phase）** 。阶段是构建流程的最小执行单元，其核心价值是**对所有项目的构建流程进行标准化抽象**—— 无论项目是 Web 应用、Java 库还是移动应用，只要遵循 Maven 的生命周期规范，使用 `mvn package` 命令都会得到符合预期的构建结果。这种标准化让不同团队的项目构建流程完全一致，大幅降低了跨项目协作的学习成本。

三套核心生命周期的具体职责和关键阶段如下：



| 生命周期      | 核心职责              | 关键阶段（按执行顺序）                                                                                                                                              |
| --------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clean`   | 清理上一次构建的输出文件      | `pre-clean`（清理前准备）→ `clean`（删除整个 `target` 目录，这是最常用的清理阶段）→ `post-clean`（清理后处理）                                                                            |
| `default` | 核心构建流程（编译、测试、打包等） | `validate`（验证项目配置完整性）→ `compile`（编译主源码至 `target/classes`）→ `test`（执行单元测试）→ `package`（打包为 JAR/WAR）→ `install`（安装至本地仓库，供本地其他项目使用）→ `deploy`（部署至远程仓库，供团队共享） |
| `site`    | 生成项目文档站点          | `pre-site`（生成前准备）→ `site`（生成 HTML 文档站点）→ `post-site`（生成后处理）→ `site-deploy`（部署站点至服务器）                                                                     |

上述生命周期的阶段定义与执行顺序参考自 Maven 官方文档 [(265)](https://blog.csdn.net/alspd_zhangpan/article/details/155783224)。需要特别注意的是，Maven 的生命周期阶段执行遵循**前置依赖规则**：当执行某一阶段时，其所在生命周期中该阶段之前的所有阶段会按顺序自动执行。例如执行 `mvn install` 时，Maven 会先自动执行 `validate`→`compile`→`test`→`package`→`install` 的完整流程，无需手动触发每个阶段；而三套生命周期之间完全独立，例如执行 `mvn clean package` 时，`clean` 生命周期的所有阶段会先执行，清理完上一次的构建结果后，才会执行 `default` 生命周期的 `package` 阶段及前置阶段 [(265)](https://blog.csdn.net/alspd_zhangpan/article/details/155783224)。

### 1.3 仓库系统：依赖的存储与检索

Maven 的仓库是用于存储和检索构建所需构件（JAR、WAR、POM 等）的层级系统，其核心作用是**统一管理所有项目的依赖，避免重复下载和存储**。Maven 的仓库分为本地仓库和远程仓库两类，二者协同工作，构成了完整的依赖检索体系。

#### 1.3.1 仓库的分类



* **本地仓库**：默认位于用户主目录下的 `.m2/repository` 目录，是 Maven 在本地机器上的构件缓存。当 Maven 需要某个构件时，会优先检查本地仓库：如果本地已存在对应 GAV 的构件，则直接使用；如果不存在，才会从远程仓库下载。本地仓库的缓存机制大幅减少了重复下载的时间，提升了构建效率 [(20)](https://www.liuyushuai.com/translation/5XVoAwR6xPE3)。

* **远程仓库**：当本地仓库缺失所需构件时，Maven 会从远程仓库下载。远程仓库又分为三类：


  * **中央仓库（Maven Central）** ：这是 Maven 官方维护的公共仓库，包含了绝大多数开源 Java 构件，是所有 Maven 项目的默认远程仓库，无需额外配置即可使用 [(20)](https://www.liuyushuai.com/translation/5XVoAwR6xPE3)；

  * **私有仓库**：企业或团队内部搭建的仓库（如 Nexus、Artifactory），用于存储内部项目的构件或受版权保护的第三方库，避免敏感代码或依赖暴露到公网 [(20)](https://www.liuyushuai.com/translation/5XVoAwR6xPE3)；

  * **镜像仓库**：中央仓库的副本（如阿里云 Maven 镜像、华为云 Maven 镜像），用于加速构件下载 —— 由于中央仓库位于国外，国内开发者通常会配置镜像仓库，将下载源切换到国内，大幅提升依赖下载速度 [(20)](https://www.liuyushuai.com/translation/5XVoAwR6xPE3)。

#### 1.3.2 依赖解析的优先级规则

Maven 检索构件时，会严格按照以下顺序执行，确保能以最快速度获取所需构件，同时避免版本冲突：



1. **本地仓库**：优先级最高，优先使用已缓存的构件，无需网络请求；

2. **镜像仓库**：如果配置了镜像仓库（如阿里云镜像），则优先从镜像仓库下载，而非直接请求中央仓库；

3. **中央仓库**：当本地和镜像仓库都缺失构件时，最后请求官方中央仓库 [(75)](https://ask.csdn.net/questions/9167245)。

这一优先级规则既保证了构建效率，又能在本地缓存失效时，通过远程仓库获取最新的构件版本。

### 1.4 约定优于配置（CoC）

“约定优于配置”（Convention over Configuration，简称 CoC）是 Maven 最重要的设计原则之一，也是其能简化构建配置的核心原因。这一原则并非 Maven 首创 —— 它最初由 Ruby on Rails 框架提出，但 Maven 将其系统化并应用到了 Java 项目的构建中。

#### 1.4.1 CoC 的核心逻辑

CoC 的核心思想是：**Maven 定义一套合理的默认规则（约定），覆盖绝大多数项目的通用需求；开发者只需遵循这些约定，无需手动配置重复的、与业务无关的内容**。换句话说，“约定” 是 Maven 提供的 “默认配置”，只有当项目需要偏离默认规则时，才需要进行显式配置。

Maven 对项目结构的约定是其 CoC 原则最直观的体现 —— 它定义了一套标准的目录结构，将源码、资源、测试代码等不同类型的文件进行了明确划分：



```
项目根目录/

├── pom.xml                    # 唯一的Maven配置文件，核心入口

├── src/

│   ├── main/

│   │   ├── java/              # 主Java源代码（必须遵循包结构规范）

│   │   ├── resources/         # 主资源文件（如application.properties、XML配置文件）

│   │   └── webapp/            # Web应用专属目录（存放HTML、CSS、JS等静态资源，仅Web项目需要）

│   └── test/

│       ├── java/              # 测试Java源代码（如JUnit测试类）

│       └── resources/         # 测试资源文件（如测试用的配置文件）

└── target/                    # 构建输出目录（自动生成，包含编译后的class文件、打包后的JAR/WAR等）
```

上述目录结构约定参考自 Maven 官方文档 [(23)](https://blog.csdn.net/chxii/article/details/154292245)。例如，Maven 约定主源码位于 `src/main/java`，因此无需在 POM 中配置源码目录路径 —— 这看似是一个小细节，但在传统 Ant 项目中，开发者需要手动配置源码目录、输出目录、资源目录等十余个路径参数，而 Maven 的约定直接省略了这些重复配置。

#### 1.4.2 CoC 的价值

CoC 的价值在于**将开发者的注意力从 “配置构建流程” 转移到 “编写业务代码” 上**，具体体现在三个方面：



1. **减少配置工作量**：传统 Ant 项目需要编写数百行 XML 配置来定义构建流程，而 Maven 项目只需数十行 POM 配置 —— 甚至对于简单项目，一个仅包含 GAV 和依赖的 POM 即可完成构建。这一优势在多模块项目中尤为明显：开发者无需为每个模块重复配置相同的目录结构或编译参数。

2. **降低团队协作成本**：所有遵循 Maven 约定的项目，其目录结构和构建流程完全一致 —— 新成员加入团队时，无需学习项目特有的构建规则，只需了解 Maven 的标准约定，即可快速上手开发。

3. **避免配置不一致**：传统项目中，不同开发者可能会使用不同的目录结构或构建参数，导致 “本地构建正常，CI 构建失败” 的问题。而 Maven 的约定确保了所有环境的构建配置完全一致，从根源上解决了这类问题。

### 1.5 插件机制：生命周期的具体执行者

Maven 的生命周期阶段本身只是抽象的 “步骤定义”，并没有实际的执行逻辑 —— 例如 `compile` 阶段负责编译源码，但它本身不会执行任何编译操作。真正执行这些操作的是**插件（Plugin）** ：插件是 Maven 生命周期的具体执行者，每个插件包含一个或多个**目标（Goal）** ，每个目标对应一项具体的构建任务（如编译、测试、打包等）。

#### 1.5.1 插件的核心逻辑

Maven 的插件机制具有高度的灵活性，其核心逻辑可概括为三点：



* **目标绑定**：插件目标可以绑定到一个或多个生命周期阶段。当 Maven 执行该阶段时，对应的插件目标会自动执行。例如，`maven-compiler-plugin` 的 `compile` 目标默认绑定到 `compile` 阶段 —— 当执行 `mvn compile` 时，该目标会自动运行，将 `src/main/java` 下的源码编译为字节码文件，输出到 `target/classes` 目录 [(262)](https://blog.csdn.net/weixin_33849215/article/details/90567283)。

* **内置绑定**：为了让开发者 “零配置” 完成基础构建，Maven 为核心生命周期阶段预绑定了常用插件目标。例如：


  * `clean` 阶段默认绑定 `maven-clean-plugin:clean`（删除 `target` 目录）；

  * `test` 阶段默认绑定 `maven-surefire-plugin:test`（执行单元测试）；

  * `package` 阶段默认绑定 `maven-jar-plugin:jar`（打包为 JAR）或 `maven-war-plugin:war`（打包为 WAR） [(262)](https://blog.csdn.net/weixin_33849215/article/details/90567283)。

    这些内置绑定无需开发者手动配置，即可直接使用。

* **显式配置**：开发者可以通过 POM 的 `<plugins>` 标签显式配置插件，包括指定插件版本、覆盖默认参数、绑定自定义目标到生命周期阶段等。例如，当项目需要使用 JDK 17 编译时，可在 POM 中配置 `maven-compiler-plugin` 的 `source` 和 `target` 参数为 `17`，覆盖默认的 JDK 版本 [(262)](https://blog.csdn.net/weixin_33849215/article/details/90567283)。

#### 1.5.2 插件的作用域与执行顺序

插件的执行顺序是 Maven 构建流程的关键 —— 如果多个插件目标绑定到同一阶段，执行顺序错误可能会导致构建失败。Maven 定义了清晰的执行顺序规则，确保插件目标的执行符合预期：



* **继承优先**：从父 POM 继承的插件目标，会优先于子 POM 中声明的插件目标执行。例如，父 POM 中配置的 `maven-compiler-plugin` 会先执行，子 POM 中的同插件目标会后执行。

* **声明顺序优先**：同一 POM 中，绑定到同一阶段的插件目标，会按 POM 中声明的顺序执行。例如，若在 POM 中先声明 `maven-resources-plugin`，再声明 `maven-compiler-plugin`，则资源复制会先于编译执行 —— 这一规则确保了编译时能使用最新的资源文件。

* **ID 覆盖规则**：如果多个插件目标的 `execution` ID 相同，子 POM 中的目标会覆盖父 POM 中的目标。这一规则允许子模块根据自身需求，灵活调整父模块的插件配置 [(224)](https://maven.apache.org/guides/mini/guide-configuring-plugins)。



***

## 2. Spring Boot 中的 Maven 依赖管理机制

Spring Boot 是为简化 Spring 应用开发而设计的框架，其核心特性之一是**自动化配置**—— 而这一特性的实现，离不开 Maven 强大的依赖管理能力。Spring Boot 通过**Starter 机制**和**版本仲裁机制**，将 Maven 的依赖管理能力发挥到了极致，让开发者无需手动处理复杂的依赖关系，即可快速搭建生产级应用。

### 2.1 Starter 机制：场景化依赖的核心

Spring Boot Starter 是其 “约定优于配置” 原则在依赖管理上的具体体现 —— 它本质是一个 “依赖聚合器”：每个 Starter 本身通常不包含任何业务代码，只有一个 `pom.xml` 文件，里面聚合了实现某类功能所需的所有依赖（包括直接依赖和间接依赖），并通过 Maven 的依赖传递机制，将这些依赖一次性引入项目中 [(138)](https://www.iesdouyin.com/share/video/7598495757448006939)。

#### 2.1.1 Starter 的核心价值

Starter 的核心价值是**消除 “依赖版本不兼容” 和 “依赖缺失” 的痛点**，具体体现在三个方面：



* **依赖聚合**：开发者只需引入一个 Starter，即可获得实现某类功能所需的所有依赖。例如，引入 `spring-boot-starter-web` 即可自动获得 Spring MVC、Tomcat 嵌入式服务器、Jackson JSON 解析库等 Web 开发所需的所有组件，无需手动声明数十个依赖 [(138)](https://www.iesdouyin.com/share/video/7598495757448006939)。

* **版本仲裁**：Starter 的版本由 Spring Boot 父 POM 统一管理，所有依赖的版本都经过官方兼容性测试，确保不会出现版本冲突。例如，Spring Boot 3.2.5 版本的 `spring-boot-starter-web`，其依赖的 Spring MVC 版本固定为 `6.1.6`，Tomcat 版本固定为 `10.1.19`—— 这些版本都是经过官方验证的兼容版本，开发者无需手动调整 [(8)](https://blog.csdn.net/qq_74850540/article/details/157546219)。

* **自动配置触发**：Starter 不仅聚合了依赖，还会触发对应的自动配置类。例如，`spring-boot-starter-web` 会触发 `WebMvcAutoConfiguration` 类，自动配置 Spring MVC 的核心组件（如 DispatcherServlet、视图解析器等），无需开发者手动编写 XML 配置或 Java 配置类 [(138)](https://www.iesdouyin.com/share/video/7598495757448006939)。

#### 2.1.2 典型 Starter 示例

以 `spring-boot-starter-web` 为例，其 `pom.xml` 主要包含以下核心依赖：



```
\<dependencies>

&#x20; \<!-- Spring MVC 核心依赖 -->

&#x20; \<dependency>

&#x20;   \<groupId>org.springframework\</groupId>

&#x20;   \<artifactId>spring-webmvc\</artifactId>

&#x20; \</dependency>

&#x20; \<!-- 嵌入式 Tomcat 服务器依赖 -->

&#x20; \<dependency>

&#x20;   \<groupId>org.springframework.boot\</groupId>

&#x20;   \<artifactId>spring-boot-starter-tomcat\</artifactId>

&#x20; \</dependency>

&#x20; \<!-- Jackson JSON 解析库依赖 -->

&#x20; \<dependency>

&#x20;   \<groupId>com.fasterxml.jackson.core\</groupId>

&#x20;   \<artifactId>jackson-databind\</artifactId>

&#x20; \</dependency>

&#x20; \<!-- 验证框架依赖（用于参数校验） -->

&#x20; \<dependency>

&#x20;   \<groupId>org.springframework.boot\</groupId>

&#x20;   \<artifactId>spring-boot-starter-validation\</artifactId>

&#x20; \</dependency>

\</dependencies>
```

上述依赖配置参考自 Spring Boot 官方文档 [(138)](https://www.iesdouyin.com/share/video/7598495757448006939)。可以看到，这些依赖覆盖了 Web 开发的所有核心需求：Spring MVC 处理请求映射和视图解析，Tomcat 提供嵌入式服务器，Jackson 处理 JSON 序列化和反序列化，Validation 处理参数校验。开发者只需引入一个 `spring-boot-starter-web`，即可快速搭建一个可运行的 Web 应用。

### 2.2 版本仲裁与 `dependencyManagement`

Spring Boot 最强大的特性之一是**版本仲裁**—— 它通过 `dependencyManagement` 机制，为项目中的所有依赖提供了一套 “官方推荐的兼容版本列表”，确保所有依赖的版本相互兼容，无需开发者手动声明版本号。

#### 2.2.1 版本仲裁的实现逻辑

版本仲裁的实现依赖于 Spring Boot 的三层依赖结构，每层各司其职，共同实现版本的统一管理：



1. **父 POM 继承**：Spring Boot 项目的根 POM 通常会继承 `spring-boot-starter-parent`，而 `spring-boot-starter-parent` 又继承自 `spring-boot-dependencies`。`spring-boot-dependencies` 是整个版本仲裁的核心 —— 它在 `<dependencyManagement>` 中声明了数千个常用依赖的版本号（如 Spring Framework、Jackson、Tomcat 等），这些版本都是经过官方严格测试的兼容版本 [(100)](https://blog.csdn.net/Lsk_Smion/article/details/159216058)。

2. **版本锁定**：当项目继承 `spring-boot-starter-parent` 后，所有在 `spring-boot-dependencies` 中声明的依赖，都可以在子模块中直接使用，无需手动指定版本号。例如，引入 `spring-boot-starter-web` 时，无需写 `<version>` 标签 ——Maven 会自动从父 POM 的 `dependencyManagement` 中获取对应的版本号。

3. **版本覆盖**：如果开发者需要使用非官方推荐的版本（如升级到最新的 Jackson 版本），只需在自己的 POM 中重新声明该依赖的版本号即可。Maven 的依赖调解规则会确保子 POM 中声明的版本优先级高于父 POM 的版本 [(100)](https://blog.csdn.net/Lsk_Smion/article/details/159216058)。

#### 2.2.2 `dependencyManagement` 的作用

`dependencyManagement` 是 Maven 提供的版本管理机制，它的核心作用是**统一管理依赖版本，而非自动引入依赖**。与 `<dependencies>` 标签不同，`<dependencyManagement>` 中的依赖不会自动被项目引入 —— 它只是定义了 “当项目引入该依赖时，应该使用哪个版本”。这一机制的价值在于：



* **版本统一**：所有子模块可以共享同一套依赖版本，避免不同子模块使用不同版本的依赖导致冲突。例如，若父 POM 的 `dependencyManagement` 中声明了 Jackson 版本为 `2.15.2`，则所有子模块引入 Jackson 时，都会自动使用该版本。

* **按需引入**：开发者可以根据项目需求，灵活选择需要引入的依赖 ——`dependencyManagement` 只是提供版本参考，不会强制引入不必要的依赖。例如，若项目不需要 Web 功能，只需不引入 `spring-boot-starter-web` 即可，不会因为父 POM 的 `dependencyManagement` 中声明了该依赖而自动引入 [(35)](https://blog.csdn.net/weixin_33700350/article/details/92387444)。

### 2.3 依赖传递与依赖调解

Maven 的依赖具有传递性 —— 这是 Starter 机制的基础，但也可能导致 “依赖冲突”（同一依赖的多个版本同时存在于项目中）。为了解决这一问题，Maven 定义了一套**依赖调解规则**，确保在冲突发生时，能自动选择一个合理的版本。

#### 2.3.1 依赖传递的规则

Maven 的依赖传递并非无限制 —— 它会根据依赖的 `scope`（作用域）决定是否传递该依赖。常用 `scope` 的传递性如下：



| scope      | 编译期 | 测试期 | 运行期 | 传递性    | 典型应用场景                                                  |
| ---------- | --- | --- | --- | ------ | ------------------------------------------------------- |
| `compile`  | ✅   | ✅   | ✅   | 是（默认值） | 项目核心依赖，如 `spring-boot-starter-web`、`jackson-databind` 等 |
| `test`     | ❌   | ✅   | ❌   | 否      | 测试依赖，如 JUnit、Mockito 等                                  |
| `provided` | ✅   | ✅   | ❌   | 否      | 容器或 JDK 提供的依赖，如 Servlet API、JSP API 等 —— 避免打包时重复引入      |
| `runtime`  | ❌   | ✅   | ✅   | 是      | 运行期依赖，如 JDBC 驱动 —— 编译时不需要，但运行时需要连接数据库                   |

上述 `scope` 传递性规则参考自 Maven 官方文档 [(104)](https://blog.csdn.net/hanlepeng/article/details/147352911)。例如，`test` 作用域的依赖（如 JUnit）只会在测试阶段生效，不会传递给其他模块 —— 这意味着，若模块 A 引入了 JUnit，模块 B 依赖模块 A 时，不会自动引入 JUnit，避免了测试依赖污染生产环境。

#### 2.3.2 依赖调解的核心规则

当同一依赖的多个版本同时存在于项目中时，Maven 会按以下优先级顺序选择版本，优先级从高到低：



1. **直接声明优先**：如果项目直接声明了该依赖（即在 `<dependencies>` 中显式配置），则直接使用声明的版本 —— 无论该版本在依赖树中的路径长度如何。这是最直观的规则，也是开发者最容易控制的方式。

2. **路径最短优先**：当项目没有直接声明该依赖时，Maven 会选择依赖树中路径最短的版本。例如，若项目 A 依赖模块 B，模块 B 依赖 `guava:21.0`；同时项目 A 直接依赖 `guava:28.0`—— 由于直接依赖的路径长度更短（路径长度为 1，而间接依赖的路径长度为 2），Maven 会选择 `guava:28.0`。

3. **声明顺序优先**：当路径长度相同时，Maven 会选择在 POM 中声明顺序靠前的依赖版本。例如，若项目 A 同时依赖模块 B 和模块 C，模块 B 依赖 `guava:21.0`，模块 C 依赖 `guava:28.0`—— 由于模块 B 在 POM 中声明在前，Maven 会选择 `guava:21.0`。

4. **dependencyManagement 优先**：如果父 POM 或当前 POM 的 `dependencyManagement` 中声明了该依赖的版本，则该版本优先级最高 —— 即使依赖树中存在路径更短或声明更早的版本，Maven 也会优先使用 `dependencyManagement` 中声明的版本。这是 Spring Boot 版本仲裁的核心机制 [(73)](https://maven.apache.org/guides/introduction/introduction-to-dependency-mechanism.html#:~:text=Dependency)。

### 2.4 实战：依赖冲突的排查与解决

依赖冲突是 Maven 项目中最常见的问题之一，其典型表现包括：编译时提示 “找不到符号”、运行时抛出 `NoSuchMethodError` 或 `ClassNotFoundException`、JSON 序列化异常等。解决依赖冲突的核心是**定位冲突来源**，常用的工具和方法如下：

#### 2.4.1 命令行工具：`mvn dependency:tree`

`mvn dependency:tree` 是排查依赖冲突的最常用命令 —— 它会输出项目的完整依赖树，清晰展示每个依赖的引入路径和版本号。通过过滤特定依赖，开发者可以快速定位冲突的来源。例如：



```
\# 输出完整依赖树

mvn dependency:tree

\# 过滤特定依赖（如guava），仅查看该依赖的引入路径

mvn dependency:tree -Dincludes=com.google.guava

\# 将输出重定向到文件，方便查看大型项目的依赖树

mvn dependency:tree > dependency.txt
```

上述命令参考自 Maven 官方文档 [(149)](https://juejin.cn/post/7611349961310421011)。例如，当项目中出现 `guava` 版本冲突时，执行 `mvn dependency:tree -Dincludes=com.google.guava` 可以快速看到所有引入 `guava` 的路径，以及每个路径对应的版本号，从而定位到冲突的来源模块。

#### 2.4.2 IDE 插件：Maven Helper

对于 IntelliJ IDEA 用户，Maven Helper 插件是可视化排查依赖冲突的神器。该插件可以将依赖树以图形化方式展示，并直接标记冲突的版本，无需手动分析命令行输出。其核心功能包括：



* **冲突可视化**：在 `Dependency Analyzer` 标签页中，所有存在版本冲突的依赖会用红色高亮显示，鼠标悬浮即可查看冲突的版本号和引入路径。

* **一键排除依赖**：选中冲突的依赖，右键选择 `Exclude` 即可自动在 POM 中添加 `<exclusions>` 标签，排除冲突的版本。

* **依赖搜索**：支持按 GAV 搜索特定依赖，快速定位其在依赖树中的位置 [(143)](https://blog.csdn.net/jam_yin/article/details/158572370)。

#### 2.4.3 解决冲突的核心方法

一旦定位到冲突来源，开发者可以通过以下三种方式解决冲突，优先级从高到低：



1. **版本覆盖**：在当前 POM 的 `dependencyManagement` 中声明冲突依赖的目标版本。例如，若项目中 `guava` 的版本冲突，可在 `dependencyManagement` 中声明 `guava:28.0`，强制所有模块使用该版本。这是最推荐的方式，因为它可以确保整个项目的版本统一。

2. **直接声明**：在当前 POM 的 `<dependencies>` 中直接声明目标版本。由于直接声明的优先级高于间接依赖，Maven 会自动使用该版本覆盖冲突版本。

3. **排除依赖**：在引入冲突依赖的模块中，使用 `<exclusions>` 标签排除冲突的版本。例如，若模块 B 引入了 `guava:21.0`，可在模块 B 的依赖声明中添加 `<exclusions>` 标签，排除该版本，然后在当前 POM 中直接声明 `guava:28.0` [(136)](https://ask.csdn.net/questions/9250961)。

### 2.5 依赖作用域（Scope）的最佳实践

在 Spring Boot 项目中，合理使用 `scope` 可以减少冗余依赖、避免冲突，同时降低生产环境的包体积。以下是 `scope` 的最佳实践：



* `compile`**（默认）** ：仅用于项目核心依赖，如 `spring-boot-starter-web`、业务类库等。这些依赖会在编译、测试、运行三个阶段生效，并会被打包到最终的 JAR/WAR 中。

* `test` ：仅用于测试依赖，如 JUnit、Mockito、Spring Boot Test 等。这些依赖只会在测试阶段生效，不会被打包到生产包中，避免了测试代码污染生产环境。

* `provided` ：用于容器或 JDK 提供的依赖，如 Servlet API、JSP API 等。例如，在 Web 项目中，Tomcat 已经提供了 Servlet API，因此可以将 `javax.servlet-api` 的 `scope` 设置为 `provided`—— 这样，该依赖会在编译期生效（确保代码不报错），但不会被打包到 WAR 中，避免与容器提供的版本冲突。

* `runtime` ：用于运行期依赖，如 JDBC 驱动、数据库连接池等。这些依赖在编译期不需要（如 JDBC 驱动的 API 已经包含在 JDK 中），但在运行期需要实际的驱动实现。例如，MySQL 驱动 `mysql-connector-java` 通常会设置为 `runtime` 作用域 [(102)](https://blog.csdn.net/Facial_Mask/article/details/157069561)。



***

## 3. Spring Boot 中的 Maven 插件机制

Maven 的插件机制是其构建能力的核心 —— 所有实际的构建任务（如编译、测试、打包等）都由插件完成。在 Spring Boot 项目中，有几个插件尤为关键：它们不仅实现了核心的构建功能，还支撑了 Spring Boot 的标志性特性（如可执行 JAR 打包、自动配置等）。

### 3.1 `spring-boot-maven-plugin`：Spring Boot 的灵魂插件

`spring-boot-maven-plugin` 是 Spring Boot 项目的核心插件，没有它，Spring Boot 就无法实现 “一键打包为可执行 JAR” 的特性。该插件的核心功能是**将 Spring Boot 项目打包为可执行 JAR/WAR**，并提供了开发阶段的快速运行能力。

#### 3.1.1 核心功能

该插件的核心功能通过多个目标（Goal）实现，每个目标对应一项具体任务：



* `repackage`**（默认目标）** ：这是该插件最核心的目标，默认绑定到 `package` 阶段。它的作用是将 Maven 默认打包的普通 JAR/WAR，重新打包为**可执行 JAR/WAR**。可执行 JAR 包含了项目的所有依赖（包括 Spring Boot 核心库、第三方库等），以及一个内置的启动器 —— 开发者只需执行 `java -jar your-project.jar` 命令，即可启动应用，无需额外配置 Tomcat 或其他服务器 [(159)](https://docs.spring.io/spring-boot/docs/2.6.13/maven-plugin/reference/pdf/spring-boot-maven-plugin-reference.pdf)。

* `run` ：用于开发阶段快速运行 Spring Boot 应用。它会自动编译项目、加载配置、启动嵌入式服务器，并支持热部署 —— 当源码或资源文件发生变化时，插件会自动重新加载，无需手动重启应用。这一目标大幅提升了开发效率，避免了 “修改代码→手动编译→重启服务器” 的繁琐流程 [(159)](https://docs.spring.io/spring-boot/docs/2.6.13/maven-plugin/reference/pdf/spring-boot-maven-plugin-reference.pdf)。

* `start`**/**`stop` ：用于管理 Spring Boot 应用的生命周期，通常在集成测试或持续集成（CI）环境中使用。例如，在执行集成测试前，使用 `start` 目标启动应用；测试完成后，使用 `stop` 目标停止应用，确保测试环境的清洁 [(159)](https://docs.spring.io/spring-boot/docs/2.6.13/maven-plugin/reference/pdf/spring-boot-maven-plugin-reference.pdf)。

#### 3.1.2 关键配置示例

以下是 `spring-boot-maven-plugin` 的典型配置，包含了最常用的参数：



```
\<plugin>

&#x20; \<groupId>org.springframework.boot\</groupId>

&#x20; \<artifactId>spring-boot-maven-plugin\</artifactId>

&#x20; \<!-- 版本必须与Spring Boot父POM版本一致 -->

&#x20; \<version>\${spring-boot.version}\</version>

&#x20; \<configuration>

&#x20;   \<!-- 显式指定Spring Boot主类（包含@SpringBootApplication注解的类） -->

&#x20;   \<mainClass>com.example.Application\</mainClass>

&#x20;   \<!-- 排除可执行JAR中的指定文件（如测试配置文件） -->

&#x20;   \<excludes>

&#x20;     \<exclude>

&#x20;       \<groupId>com.example\</groupId>

&#x20;       \<artifactId>test-config\</artifactId>

&#x20;     \</exclude>

&#x20;   \</excludes>

&#x20;   \<!-- 打包类型：JAR（默认）或 WAR -->

&#x20;   \<layout>JAR\</layout>

&#x20; \</configuration>

&#x20; \<executions>

&#x20;   \<execution>

&#x20;     \<goals>

&#x20;       \<!-- 绑定repackage目标到package阶段，确保打包时自动执行 -->

&#x20;       \<goal>repackage\</goal>

&#x20;     \</goals>

&#x20;   \</execution>

&#x20; \</executions>

\</plugin>
```

上述配置参考自 Spring Boot 官方文档 [(221)](https://blog.csdn.net/wenxuankeji/article/details/149317201)。需要特别注意的是，该插件的版本必须与 Spring Boot 父 POM 的版本完全一致 —— 否则可能会出现兼容性问题，例如无法正确识别主类或打包失败。

### 3.2 `maven-compiler-plugin`：源码编译的核心插件

`maven-compiler-plugin` 是 Maven 的核心编译插件，负责将 Java 源码编译为字节码文件。在 Spring Boot 3.x 项目中，该插件的配置尤为重要 —— 因为 Spring Boot 3.x 要求 JDK 17 或更高版本，若编译配置不正确，会导致项目无法构建。

#### 3.2.1 最佳配置实践

以下是 `maven-compiler-plugin` 的最佳配置，适用于 Spring Boot 3.x 项目：



```
\<plugin>

&#x20; \<groupId>org.apache.maven.plugins\</groupId>

&#x20; \<artifactId>maven-compiler-plugin\</artifactId>

&#x20; \<!-- 推荐使用3.11.0及以上版本，支持JDK 17+ -->

&#x20; \<version>3.11.0\</version>

&#x20; \<configuration>

&#x20;   \<!-- JDK版本配置：使用release参数（JDK 9+推荐），等效于source+target+核心类库 -->

&#x20;   \<release>\${java.version}\</release>

&#x20;   \<!-- 编码格式：必须设置为UTF-8，避免中文乱码 -->

&#x20;   \<encoding>UTF-8\</encoding>

&#x20;   \<!-- 编译参数：保留方法参数名，方便Spring MVC的@RequestParam、MyBatis的参数映射等功能 -->

&#x20;   \<compilerArgs>

&#x20;     \<arg>-parameters\</arg>

&#x20;   \</compilerArgs>

&#x20;   \<!-- 注解处理器路径：用于Lombok、MapStruct等注解处理器 -->

&#x20;   \<annotationProcessorPaths>

&#x20;     \<path>

&#x20;       \<groupId>org.projectlombok\</groupId>

&#x20;       \<artifactId>lombok\</artifactId>

&#x20;       \<version>\${lombok.version}\</version>

&#x20;     \</path>

&#x20;     \<path>

&#x20;       \<groupId>org.mapstruct\</groupId>

&#x20;       \<artifactId>mapstruct-processor\</artifactId>

&#x20;       \<version>\${mapstruct.version}\</version>

&#x20;     \</path>

&#x20;   \</annotationProcessorPaths>

&#x20; \</configuration>

\</plugin>
```

上述配置参考自 Maven 官方文档 [(302)](https://blog.csdn.net/jwbabc/article/details/158804951)。需要注意的是，`<release>` 参数是 JDK 9+ 推荐的配置方式 —— 它会自动处理源码版本、目标版本和核心类库的兼容性，比单独设置 `<source>` 和 `<target>` 参数更可靠。例如，设置 `<release>17</release>` 等效于设置 `<source>17</source>`、`<target>17</target>`，并确保编译时使用 JDK 17 的核心类库。

### 3.3 `maven-resources-plugin`：资源文件处理

`maven-resources-plugin` 负责处理项目的资源文件（如 `application.properties`、XML 配置文件、静态资源等），其核心功能是将资源文件复制到构建输出目录（默认是 `target/classes`），并支持**资源过滤**（即替换资源文件中的占位符，如 `${spring.profiles.active}`）。

#### 3.3.1 最佳配置实践

以下是 `maven-resources-plugin` 的最佳配置，适用于 Spring Boot 项目：



```
\<plugin>

&#x20; \<groupId>org.apache.maven.plugins\</groupId>

&#x20; \<artifactId>maven-resources-plugin\</artifactId>

&#x20; \<!-- 推荐使用3.3.1及以上版本，支持UTF-8编码和资源过滤 -->

&#x20; \<version>3.3.1\</version>

&#x20; \<configuration>

&#x20;   \<!-- 编码格式：必须与compiler-plugin一致，避免中文乱码 -->

&#x20;   \<encoding>UTF-8\</encoding>

&#x20;   \<!-- 资源过滤：开启后，资源文件中的\${property}占位符会被POM中的属性值替换 -->

&#x20;   \<resources>

&#x20;     \<resource>

&#x20;       \<directory>src/main/resources\</directory>

&#x20;       \<filtering>true\</filtering>

&#x20;       \<!-- 包含需要过滤的文件类型（如properties、yml） -->

&#x20;       \<includes>

&#x20;         \<include>\*\*/\*.properties\</include>

&#x20;         \<include>\*\*/\*.yml\</include>

&#x20;       \</includes>

&#x20;     \</resource>

&#x20;     \<resource>

&#x20;       \<directory>src/main/resources\</directory>

&#x20;       \<filtering>false\</filtering>

&#x20;       \<!-- 排除不需要过滤的文件类型（如图片、JS、CSS等二进制文件） -->

&#x20;       \<excludes>

&#x20;         \<exclude>\*\*/\*.png\</exclude>

&#x20;         \<exclude>\*\*/\*.js\</exclude>

&#x20;         \<exclude>\*\*/\*.css\</exclude>

&#x20;       \</excludes>

&#x20;     \</resource>

&#x20;   \</resources>

&#x20; \</configuration>

\</plugin>
```

上述配置参考自 Maven 官方文档 [(302)](https://blog.csdn.net/jwbabc/article/details/158804951)。需要特别注意的是，资源过滤功能不应滥用 —— 对于图片、JS、CSS 等二进制文件或静态资源，应禁用过滤，否则可能会导致文件损坏。例如，若对 PNG 图片开启过滤，Maven 会尝试替换图片中的 `${}` 占位符，导致图片无法正常显示。

### 3.4 `maven-surefire-plugin`：单元测试执行

`maven-surefire-plugin` 是 Maven 的核心测试插件，负责执行项目的单元测试（如 JUnit 测试）。它会自动识别测试类（默认识别以 `Test` 结尾的类，如 `UserServiceTest`），并在 `test` 阶段执行这些测试。

#### 3.4.1 最佳配置实践

以下是 `maven-surefire-plugin` 的最佳配置，适用于 Spring Boot 项目：



```
\<plugin>

&#x20; \<groupId>org.apache.maven.plugins\</groupId>

&#x20; \<artifactId>maven-surefire-plugin\</artifactId>

&#x20; \<!-- 推荐使用3.2.5及以上版本，支持JUnit 5和Spring Boot Test -->

&#x20; \<version>3.2.5\</version>

&#x20; \<configuration>

&#x20;   \<!-- 跳过测试：可通过命令行参数-DskipTests=true覆盖 -->

&#x20;   \<skipTests>false\</skipTests>

&#x20;   \<!-- 排除集成测试：仅运行单元测试（以Test结尾的类） -->

&#x20;   \<excludes>

&#x20;     \<exclude>\*\*/\*IT.java\</exclude>

&#x20;   \</excludes>

&#x20;   \<!-- 测试失败时停止构建：确保单元测试不通过时，构建流程终止 -->

&#x20;   \<failIfNoTests>false\</failIfNoTests>

&#x20; \</configuration>

\</plugin>
```

上述配置参考自 Maven 官方文档 [(304)](http://m.toutiao.com/group/7614858513747132955/)。例如，配置中排除了以 `IT` 结尾的类 —— 这是为了区分单元测试和集成测试：单元测试通常运行速度快，不依赖外部资源；而集成测试（如数据库测试、API 测试）通常运行速度慢，依赖外部资源，因此会单独用 `maven-failsafe-plugin` 执行。

### 3.5 多插件协同工作的顺序规则

在 Spring Boot 项目中，多个插件通常会绑定到同一个生命周期阶段 —— 例如，`maven-resources-plugin` 和 `maven-compiler-plugin` 都绑定到 `compile` 阶段。为了确保构建流程的正确性，Maven 定义了清晰的插件执行顺序规则：



1. **继承优先**：从父 POM 继承的插件目标，会优先于子 POM 中声明的插件目标执行。例如，父 POM 中配置的 `maven-resources-plugin` 会先执行，子 POM 中的同插件目标会后执行。

2. **声明顺序优先**：同一 POM 中，绑定到同一阶段的插件目标，会按 POM 中声明的顺序执行。例如，若在 POM 中先声明 `maven-resources-plugin`，再声明 `maven-compiler-plugin`，则资源复制会先于编译执行 —— 这一规则确保了编译时能使用最新的资源文件。

3. **显式顺序优先**：对于 Maven 3.8+ 版本，开发者可以通过 `<execution>` 标签的 `<order>` 参数，显式指定插件目标的执行顺序。例如：



```
\<execution>

&#x20; \<id>compile-resources\</id>

&#x20; \<phase>compile\</phase>

&#x20; \<goals>

&#x20;   \<goal>resources\</goal>

&#x20; \</goals>

&#x20; \<!-- 显式指定执行顺序为1，确保先执行 -->

&#x20; \<order>1\</order>

\</execution>
```

这一规则允许开发者灵活调整插件的执行顺序，满足复杂的构建需求 [(224)](https://maven.apache.org/guides/mini/guide-configuring-plugins)。



***

## 4. Spring Boot 中的 Maven 多模块构建机制

对于中大型 Spring Boot 项目（如代码量超过 5000 行的单体应用，或微服务架构的多个服务），将所有代码放在一个模块中会导致代码耦合度高、维护困难、编译速度慢等问题。Maven 的多模块构建机制可以解决这些问题 —— 它允许将项目拆分为多个独立的模块，每个模块负责一个特定的功能或业务领域，从而实现代码解耦、并行开发和增量编译。

### 4.1 多模块构建的核心概念

多模块构建的核心是**聚合（Aggregation）** 和**继承（Inheritance）** —— 二者通常一起使用，但各自的职责不同，缺一不可。

#### 4.1.1 聚合（Aggregation）

聚合是指将多个子模块集中在一个父模块中构建。父模块的 POM 需满足两个条件：



* **打包类型为&#x20;**`pom`：父模块本身不包含任何业务代码，仅作为 “构建协调器” 存在，负责管理子模块的构建顺序和依赖关系。

* **通过&#x20;**`<modules>`**&#x20;标签声明子模块**：父模块会按顺序构建所有子模块 ——Maven 会自动识别模块间的依赖关系，优先构建被依赖的模块，确保构建过程的正确性。例如，若父模块包含 `module-a` 和 `module-b`，且 `module-b` 依赖 `module-a`，则 Maven 会先构建 `module-a`，再构建 `module-b` [(67)](https://maven.apache.org/pom.html?fbclid=IwAR3VEGKs5vb5KDDdm3SUS2C_KD7yqCHyqCNcrkMyNPP23firZ5ue7rc1kw8)。

聚合的核心价值是**统一构建流程**：开发者只需在父模块执行一次构建命令（如 `mvn clean install`），即可完成所有子模块的构建，无需逐个模块执行。

#### 4.1.2 继承（Inheritance）

继承是指子模块可以继承父模块的配置，包括依赖版本、插件参数、编码格式等。子模块通过 `<parent>` 标签声明继承关系，从而避免在每个子模块中重复编写相同的配置代码。例如，子模块的 POM 可以通过以下方式继承父模块：



```
\<parent>

&#x20; \<groupId>com.example\</groupId>

&#x20; \<artifactId>parent-project\</artifactId>

&#x20; \<version>1.0.0\</version>

&#x20; \<!-- 父POM的相对路径（相对于子模块的POM文件） -->

&#x20; \<relativePath>../pom.xml\</relativePath>

\</parent>
```

上述配置参考自 Maven 官方文档 [(253)](https://blog.csdn.net/lilinhai548/article/details/148688371)。继承的核心价值是**配置复用**：例如，父模块可以统一配置 JDK 版本、编码格式、依赖版本等，所有子模块只需继承即可直接使用，无需重复配置。

#### 4.1.3 聚合与继承的区别

聚合与继承是 Maven 多模块构建的两大核心机制，二者的职责和目的完全不同，但通常一起使用：



| 特性        | 聚合（Aggregation）         | 继承（Inheritance）            |
| --------- | ----------------------- | -------------------------- |
| **目的**    | 统一构建多个子模块               | 复用父模块的配置                   |
| **配置位置**  | 父模块的 `<modules>` 标签     | 子模块的 `<parent>` 标签         |
| **父模块要求** | 打包类型必须为 `pom`           | 无特殊要求（通常打包类型为 `pom`）       |
| **子模块要求** | 必须在父模块的 `<modules>` 中声明 | 必须在 `<parent>` 中声明父模块的 GAV |

上述对比参考自 Maven 官方文档 [(35)](https://blog.csdn.net/weixin_33700350/article/details/92387444)。例如，一个典型的多模块项目中，父模块既是聚合器（通过 `<modules>` 声明子模块），又是所有子模块的父 POM（通过 `<dependencyManagement>` 统一管理依赖版本）—— 子模块既继承父模块的配置，又被父模块统一构建。

### 4.2 多模块项目的典型结构

一个合理的多模块结构应该遵循**高内聚、低耦合**的原则 —— 每个模块的职责单一，模块间通过接口或公共模块通信，避免直接依赖。以下是 Spring Boot 多模块项目的典型结构，适用于中大型单体应用或微服务架构：



```
my-spring-boot-project/          # 父模块（打包类型为pom，仅负责构建协调和配置管理）

├── pom.xml                       # 父POM：统一管理依赖版本、插件参数、编码格式等

├── my-project-common/            # 公共模块：存放所有子模块共享的代码（如工具类、实体类、全局异常处理等）

│   ├── pom.xml                   # 子POM：继承父POM，仅包含公共代码

│   └── src/main/java/com/example/common/

├── my-project-domain/            # 领域模块：存放领域模型和业务规则（如实体类、Repository 接口、领域服务等）

│   ├── pom.xml                   # 子POM：继承父POM，依赖common模块

│   └── src/main/java/com/example/domain/

├── my-project-infrastructure/    # 基础设施模块：存放技术细节实现（如MyBatis Mapper、Redis配置、第三方SDK封装等）

│   ├── pom.xml                   # 子POM：继承父POM，依赖domain模块

│   └── src/main/java/com/example/infrastructure/

├── my-project-application/       # 应用模块：存放Spring Boot主启动类、Web层（Controller）、事务编排等

│   ├── pom.xml                   # 子POM：继承父POM，依赖infrastructure模块

│   └── src/main/java/com/example/application/

│       └── Application.java      # Spring Boot主启动类（仅在此模块中存在）

└── my-project-test/              # 测试模块：存放跨模块的集成测试或端到端测试

&#x20;   ├── pom.xml                   # 子POM：继承父POM，依赖其他所有模块

&#x20;   └── src/test/java/com/example/test/
```

上述结构参考自 Spring Boot 官方文档 [(240)](http://m.toutiao.com/group/7619187583708496425/)。每个模块的职责明确：



* **common 模块**：存放所有子模块共享的代码，如工具类、实体类、全局异常处理、常量定义等。该模块是所有其他模块的基础，其他模块可以依赖它，但它不能依赖任何其他模块。

* **domain 模块**：存放领域模型和业务规则，是项目的核心业务层。该模块仅依赖 common 模块，不依赖任何技术实现细节（如数据库、Redis 等），确保业务规则的独立性。

* **infrastructure 模块**：存放技术细节实现，如 MyBatis Mapper、Redis 配置、第三方 SDK 封装等。该模块依赖 domain 模块，将领域层的业务规则与具体技术实现解耦。

* **application 模块**：是项目的启动入口，包含 Spring Boot 主启动类、Web 层（Controller）、事务编排等。该模块依赖 infrastructure 模块，是唯一包含启动类的模块，负责将所有模块的功能整合起来。

* **test 模块**：存放跨模块的集成测试或端到端测试，确保模块间的协作符合预期。

### 4.3 多模块构建的生命周期与命令

多模块项目的构建生命周期与单模块项目完全一致，但 Maven 会自动处理模块间的依赖关系，确保构建顺序的正确性。以下是多模块构建的核心规则和常用命令：

#### 4.3.1 构建顺序规则

Maven 的**反应堆（Reactor）** 机制会自动计算模块的构建顺序，确保被依赖的模块先构建。具体规则如下（优先级从高到低）：



1. **依赖优先**：若模块 A 依赖模块 B，则模块 B 会先于模块 A 构建。例如，若 `application` 模块依赖 `infrastructure` 模块，`infrastructure` 模块依赖 `domain` 模块，则构建顺序为 `domain`→`infrastructure`→`application`。

2. **插件 / 扩展依赖优先**：若模块 A 使用了模块 B 作为插件或构建扩展，则模块 B 会先于模块 A 构建。

3. **声明顺序优先**：若模块间无依赖关系，则按父模块 `<modules>` 标签中声明的顺序构建。例如，若父模块的 `<modules>` 中先声明 `common`，再声明 `domain`，则 `common` 会先于 `domain` 构建 [(277)](https://maven.apache.org/guides/mini/guide-multiple-modules.html?ref=rob-ferguson)。

这一规则确保了构建过程的正确性 —— 例如，若模块 B 依赖模块 A，而模块 A 未先构建，则模块 B 的编译会因为缺少模块 A 的类而失败。

#### 4.3.2 常用构建命令

多模块项目的构建命令与单模块项目基本一致，但增加了一些用于指定模块范围的参数：



* **构建所有模块**：在父模块根目录执行 `mvn clean install`，Maven 会自动按依赖顺序构建所有子模块。

* **构建指定模块及其依赖**：使用 `-pl`（--projects）参数指定模块，`-am`（--also-make）参数同时构建该模块的依赖模块。例如：



```
\# 构建application模块及其所有依赖模块（如infrastructure、domain、common）

mvn clean install -pl my-project-application -am
```



* **构建指定模块及其下游模块**：使用 `-pl` 参数指定模块，`-amd`（--also-make-dependents）参数同时构建依赖该模块的下游模块。例如：



```
\# 构建domain模块及其所有下游模块（如infrastructure、application）

mvn clean install -pl my-project-domain -amd
```



* **排除指定模块**：使用 `-pl !<module-name>` 参数排除特定模块。例如：



```
\# 构建所有模块，排除test模块

mvn clean install -pl !my-project-test
```



* **恢复中断的构建**：使用 `-rf`（--resume-from）参数从指定模块开始构建，适用于大型项目的增量构建。例如：



```
\# 从infrastructure模块开始构建，跳过已构建的domain和common模块

mvn clean install -rf my-project-infrastructure
```

上述命令参数参考自 Maven 官方文档 [(269)](https://blog.csdn.net/xu990128638/article/details/157213304)。这些参数可以大幅提升多模块项目的构建效率，尤其是对于大型项目 —— 例如，当仅修改了 `domain` 模块的代码时，只需构建 `domain` 及其下游模块，无需重新构建所有模块。

### 4.4 多模块项目的依赖管理最佳实践

多模块项目的依赖管理是项目可维护性的关键 —— 若依赖管理不当，会导致版本冲突、模块间循环依赖等问题。以下是多模块项目依赖管理的最佳实践：

#### 4.4.1 统一版本管理



* **父 POM 声明版本**：所有第三方依赖的版本都应在父 POM 的 `<dependencyManagement>` 中统一声明。例如，Spring Boot 版本、Jackson 版本、MyBatis 版本等，都应在父 POM 中定义为属性，然后在 `<dependencyManagement>` 中引用。

* **子模块省略版本**：子模块在引入依赖时，无需手动指定版本号 ——Maven 会自动从父 POM 的 `<dependencyManagement>` 中获取对应的版本号。例如，子模块引入 `spring-boot-starter-web` 时，只需写 GAV 的前两个参数，无需写 `<version>` 标签。

* **避免重复声明**：禁止在多个子模块中重复声明同一依赖的版本号 —— 否则会导致版本不一致，增加维护成本 [(300)](https://blog.csdn.net/Anmory/article/details/158580802)。

#### 4.4.2 依赖关系控制



* **单向依赖**：严格遵循 “上层模块依赖下层模块，下层模块绝不反向依赖上层模块” 的原则。例如，`application` 模块可以依赖 `infrastructure` 模块，`infrastructure` 模块可以依赖 `domain` 模块，但 `domain` 模块不能依赖 `infrastructure` 或 `application` 模块。

* **禁止循环依赖**：循环依赖是多模块项目的大忌 —— 例如，模块 A 依赖模块 B，模块 B 又依赖模块 A，会导致 Maven 无法计算构建顺序，从而抛出构建异常。若出现循环依赖，需通过重构代码（如抽取公共模块）来打破循环。

* **公共模块复用**：将所有子模块共享的代码（如工具类、实体类）放入 `common` 模块，避免在多个子模块中重复编写相同的代码。`common` 模块是所有其他模块的基础，不能依赖任何其他模块 [(240)](http://m.toutiao.com/group/7619187583708496425/)。

#### 4.4.3 插件配置统一



* **父 POM 声明插件版本**：所有插件的版本都应在父 POM 的 `<pluginManagement>` 中统一声明。例如，`spring-boot-maven-plugin`、`maven-compiler-plugin` 等插件的版本，都应在父 POM 中定义。

* **子模块按需启用**：子模块在使用插件时，无需手动指定版本号 —— 只需在 `<plugins>` 标签中声明插件，Maven 会自动从父 POM 的 `<pluginManagement>` 中获取对应的版本号。

* **避免重复配置**：禁止在多个子模块中重复配置相同的插件参数 —— 例如，编码格式、JDK 版本等插件参数，应在父 POM 中统一配置，子模块只需继承即可 [(241)](https://juejin.cn/post/7593943464053915658)。

### 4.5 实战：多模块项目的常见问题与解决方案

多模块项目的构建过程中，可能会遇到各种问题 —— 以下是最常见的三个问题，以及对应的解决方案：

#### 4.5.1 循环依赖

**现象**：Maven 抛出 `Circular dependency detected` 异常，无法完成构建。

**原因**：模块间形成了闭环依赖（如 A→B→A）。

**解决方案**：



1. **排查循环依赖**：使用 `mvn dependency:tree -Dverbose` 命令输出依赖树，查找循环依赖的路径。例如，执行该命令后，若输出中出现 `A -> B -> A` 的路径，则说明存在循环依赖。

2. **重构代码**：通过抽取公共模块或代码迁移打破循环。例如，若模块 A 和模块 B 相互依赖，可将二者的公共代码抽取到新的 `common` 模块，然后模块 A 和模块 B 都依赖 `common` 模块，从而打破循环。

3. **临时解决方案**：若无法立即重构代码，可使用 `build-helper-maven-plugin` 插件临时合并模块，但这只是权宜之计 —— 长期来看，必须通过重构解决循环依赖 [(292)](https://wenku.csdn.net/answer/3t0ai9h0jw)。

#### 4.5.2 资源文件冲突

**现象**：多个模块的资源文件（如 `application.properties`）重名，导致构建时资源文件被覆盖。

**原因**：Maven 的资源复制机制会将所有模块的资源文件复制到同一目录（`target/classes`），重名文件会被后复制的模块覆盖。

**解决方案**：



1. **统一资源目录**：在父 POM 中配置 `maven-resources-plugin`，为每个模块的资源文件指定独立的输出目录。例如，将 `common` 模块的资源文件输出到 `target/classes/common`，`domain` 模块的资源文件输出到 `target/classes/domain`。

2. **资源过滤**：使用 Maven 的资源过滤功能，为不同模块的资源文件添加唯一标识（如 `${module.name}`），避免重名。例如，将 `application.properties` 重命名为 `application-${module.name}.properties`，然后在主配置文件中通过 `spring.profiles.include` 引入。

3. **显式排除**：在插件配置中显式排除冲突的资源文件，确保只有目标资源文件被复制到输出目录 [(211)](https://blog.csdn.net/qq_41187124/article/details/155645095)。

#### 4.5.3 模块构建顺序错误

**现象**：Maven 构建顺序不符合预期，导致被依赖的模块后构建，从而抛出 “找不到类” 的编译异常。

**原因**：模块间的依赖关系未被正确声明，或 Maven 的反应堆机制未正确识别依赖关系。

**解决方案**：



1. **检查依赖声明**：确保所有模块间的依赖都已正确声明。例如，若模块 B 依赖模块 A，需在模块 B 的 `<dependencies>` 中显式声明对模块 A 的依赖。

2. **显式指定构建顺序**：在父 POM 的 `<modules>` 标签中，按依赖顺序声明子模块。例如，若模块 A 被模块 B 依赖，则在 `<modules>` 中先声明模块 A，再声明模块 B。

3. **使用反应堆参数**：若上述方法无效，可使用 `-pl` 和 `-am` 参数手动指定构建顺序。例如，执行 `mvn clean install -pl A,B -am`，强制先构建模块 A，再构建模块 B [(277)](https://maven.apache.org/guides/mini/guide-multiple-modules.html?ref=rob-ferguson)。



***

## 5. 总结与最佳实践

Maven 是 Spring Boot 项目的核心构建工具 —— 它不仅提供了标准化的构建流程，更支撑了 Spring Boot 的自动化配置、Starter 机制等核心特性。掌握 Maven 的核心机制，是开发高效、可维护的 Spring Boot 项目的必备技能。

### 5.1 核心总结

本报告从理论和实战两个层面，系统解析了 Maven 在 Spring Boot 项目中的应用：



1. **理论层**：Maven 基于项目对象模型（POM），通过坐标机制、约定优于配置（CoC）原则、构建生命周期与插件机制，实现了项目构建的标准化与自动化。其中，POM 是核心配置入口，坐标机制解决了依赖唯一标识的问题，CoC 原则简化了配置，插件机制则是生命周期的具体执行者。

2. **依赖管理层**：Spring Boot 通过 Starter 机制和 `dependencyManagement` 机制，实现了依赖的场景化聚合与版本仲裁。Maven 的依赖传递与调解规则，解决了 “依赖地狱” 的问题 —— 开发者只需引入一个 Starter，即可获得实现某类功能所需的所有兼容依赖。

3. **插件机制层**：`spring-boot-maven-plugin`、`maven-compiler-plugin` 等核心插件，实现了可执行 JAR 打包、源码编译、资源处理等关键功能。插件的执行顺序规则，确保了多插件协同工作时的正确性。

4. **多模块构建层**：通过聚合与继承机制，Maven 实现了项目的模块化拆分，提升了代码的可维护性与开发效率。反应堆机制自动计算模块的构建顺序，确保了多模块项目的构建正确性。

### 5.2 最佳实践清单

以下是 Spring Boot 项目中 Maven 使用的最佳实践清单，建议严格遵循：

#### 5.2.1 依赖管理



* **优先使用 Starter**：尽量使用 Spring Boot 官方提供的 Starter（如 `spring-boot-starter-web`、`spring-boot-starter-data-jpa`），而非手动引入零散依赖。Starter 经过官方兼容性测试，能确保依赖版本的一致性。

* **统一版本管理**：所有第三方依赖的版本都应在父 POM 的 `<dependencyManagement>` 中统一声明，子模块无需手动指定版本号。

* **最小依赖原则**：仅引入项目必需的依赖，避免冗余依赖 —— 冗余依赖会增加包体积，还可能导致版本冲突。例如，若项目不需要 Web 功能，不要引入 `spring-boot-starter-web`。

* **定期清理依赖**：使用 `mvn dependency:analyze` 命令分析依赖，移除未使用的依赖。该命令会输出项目中未被使用的直接依赖和间接依赖，帮助开发者减少冗余依赖。

#### 5.2.2 插件配置



* **统一插件版本**：所有插件的版本都应在父 POM 的 `<pluginManagement>` 中统一声明，子模块无需手动指定版本号。

* **显式配置编码**：在 `maven-compiler-plugin` 和 `maven-resources-plugin` 中显式配置编码为 `UTF-8`，避免中文乱码。

* **合理使用&#x20;**`scope` ：根据依赖的用途，合理选择 `scope`（如 `test` 用于测试依赖，`provided` 用于容器提供的依赖），减少冗余依赖。

* **测试插件分离**：使用 `maven-surefire-plugin` 执行单元测试，`maven-failsafe-plugin` 执行集成测试，避免单元测试和集成测试相互干扰。

#### 5.2.3 多模块构建



* **按业务领域拆分模块**：避免按技术分层拆分模块（如 controller、service、dao 各为一个模块），应按业务领域拆分（如 order、user 各为一个模块）—— 每个模块包含自身的业务逻辑、接口和实现，提升代码的内聚性。

* **禁止循环依赖**：严格遵循单向依赖原则，若出现循环依赖，需通过重构代码打破循环。

* **公共模块最小化**：`common` 模块仅存放所有子模块共享的代码（如工具类、实体类），避免在 `common` 模块中放入业务逻辑 —— 否则会导致 `common` 模块变得臃肿，增加模块间的耦合度。

* **增量构建**：使用 `-pl`、`-am`、`-rf` 等参数，仅构建修改的模块，提升构建效率 —— 对于大型项目，增量构建可以将构建时间从数十分钟缩短到数分钟。

#### 5.2.4 构建流程



* **标准化构建命令**：统一使用 `mvn clean install` 作为标准构建命令，避免使用自定义命令 —— 标准化命令确保所有环境的构建流程一致。

* **CI/CD 集成**：在 CI/CD 流程中，添加依赖分析和版本检查步骤（如 `mvn versions:display-dependency-updates`），提前发现依赖冲突或版本过时的问题。

* **缓存本地仓库**：在 CI/CD 环境中，缓存 Maven 本地仓库（`.m2/repository`），减少依赖下载时间 —— 这是提升 CI 构建效率的关键措施之一。

通过遵循上述最佳实践，开发者可以大幅提升 Spring Boot 项目的构建效率、可维护性和稳定性，减少因构建配置或依赖管理导致的问题，将更多精力投入到业务代码的开发中。

**参考资料&#x20;**

\[1] Spring Boot 的“约定优于配置”:原理剖析与Java实践-CSDN博客[ https://blog.csdn.net/lssffy/article/details/147149781](https://blog.csdn.net/lssffy/article/details/147149781)

\[2] Spring Boot 系列:核心机制深度解析(二)-CSDN博客[ https://blog.csdn.net/Lsk\_Smion/article/details/159216058](https://blog.csdn.net/Lsk_Smion/article/details/159216058)

\[3] Java 面试 必 问 之 Spring Boot 的 约定 优于 配置 ， 你 的 理解 是 什么 ？ # 计算机 # 编程 # java # 求职 # 面试[ https://www.iesdouyin.com/share/video/7545797230339378495](https://www.iesdouyin.com/share/video/7545797230339378495)

\[4] Java程序员必备:Maven项目专业开发指南(模块架构+依赖管理+包设计全解析)-CSDN博客[ https://blog.csdn.net/m0\_73978383/article/details/158386638](https://blog.csdn.net/m0_73978383/article/details/158386638)

\[5] SpringBoot设计基石:约定优于配置与模块化架构\_云原生技术 约定优于配置-CSDN博客[ https://blog.csdn.net/qq\_41244651/article/details/148702078](https://blog.csdn.net/qq_41244651/article/details/148702078)

\[6] Spring Boot 中 “约定优于配置” 原则的理解-CSDN博客[ https://blog.csdn.net/2301\_79438104/article/details/145641197](https://blog.csdn.net/2301_79438104/article/details/145641197)

\[7] spring[ https://juejin.cn/post/7560905838074396735](https://juejin.cn/post/7560905838074396735)

\[8] 2026版企业级技术栈版本兼容性大全\_2026年springboot最新稳定版本-CSDN博客[ https://blog.csdn.net/qq\_74850540/article/details/157546219](https://blog.csdn.net/qq_74850540/article/details/157546219)

\[9] API 版本控制到底是“多此一举”，还是你未来凌晨三点的救命稻草?\_公号\[猿圈奇妙屋]的技术博客\_51CTO博客[ https://blog.51cto.com/u\_15700751/14520532](https://blog.51cto.com/u_15700751/14520532)

\[10] 2026 Spring Boot热点实战:从原生镜像到AI集成全解析\_从程序员到架构师[ http://m.toutiao.com/group/7618035487034442283/](http://m.toutiao.com/group/7618035487034442283/)

\[11] 2026 年 了 还 在用 JDK8 ？ Java 版本 大盘点 ！ # Java # java 程序员 # JDK # java 面试[ https://www.iesdouyin.com/share/video/7619319055438122291](https://www.iesdouyin.com/share/video/7619319055438122291)

\[12] SpringBoot 2.x到3.x升级实战:从Java 8到21的完整避坑指南-CSDN博客[ https://blog.csdn.net/weixin\_29231027/article/details/159152435](https://blog.csdn.net/weixin_29231027/article/details/159152435)

\[13] Spring Boot各版本与Java版本的对应兼容关系，与构建工具(Maven、Gradle)版本的对应兼容关系，对servlet 容器的支持\_springboot java版本-CSDN博客[ https://blog.csdn.net/weixin\_41712594/article/details/132160118](https://blog.csdn.net/weixin_41712594/article/details/132160118)

\[14] Java语言 Spring Boot 开发:Spring Boot 程序\_圣逸的技术博客\_51CTO博客[ https://blog.51cto.com/u\_17035323/14496806](https://blog.51cto.com/u_17035323/14496806)

\[15] Maven使用说明-CSDN博客[ https://blog.csdn.net/alspd\_zhangpan/article/details/155783224](https://blog.csdn.net/alspd_zhangpan/article/details/155783224)

\[16] POM Reference[ https://maven.apache.org/pom.html?fbclid=IwAR3VEGKs5vb5KDDdm3SUS2C\_KD7yqCHyqCNcrkMyNPP23firZ5ue7rc1kw8](https://maven.apache.org/pom.html?fbclid=IwAR3VEGKs5vb5KDDdm3SUS2C_KD7yqCHyqCNcrkMyNPP23firZ5ue7rc1kw8)

\[17] Maven项目管理与构建自动化完全指南\_bladex maven-CSDN博客[ https://blog.csdn.net/2301\_79139273/article/details/152566408](https://blog.csdn.net/2301_79139273/article/details/152566408)

\[18] Maven 之父 一个 设计 出 Maven 的 核心 原型 ， 用 一套 工具 ( Maven ) 定义 全球 Java 项目 的 构建 标准 ， Java 构建 与 持续 集成 时代 的 开创 之人 —— Jason van Zyl # 程序员 # 编程 # java # 计算机 # 互联网[ https://www.iesdouyin.com/share/video/7614801853348086970](https://www.iesdouyin.com/share/video/7614801853348086970)

\[19] 【Maven】pom.xml 超全面详解(核心结构+所有常用依赖)-阿里云开发者社区[ https://developer.aliyun.com:443/article/1716698](https://developer.aliyun.com:443/article/1716698)

\[20] 【从零入门Maven】 - 刘宇帅个人博客[ https://www.liuyushuai.com/translation/5XVoAwR6xPE3](https://www.liuyushuai.com/translation/5XVoAwR6xPE3)

\[21] 史上最全maven教程\_wx5c4afeea27343的技术博客\_mob64ca140761a4的技术博客\_51CTO博客[ https://blog.51cto.com/u\_16213646/14500489](https://blog.51cto.com/u_16213646/14500489)

\[22] Spring Boot 避坑指南:彻底搞懂 Classpath 到底在哪里?前言 在学习 Spring Boot 的过程 - 掘金[ https://juejin.cn/post/7598587406693974059](https://juejin.cn/post/7598587406693974059)

\[23] Maven 详解(上)-CSDN博客[ https://blog.csdn.net/chxii/article/details/154292245](https://blog.csdn.net/chxii/article/details/154292245)

\[24] Spring Boot 目录结构解析:src/main/java 与 resources 规范\_springboot项目目录结构-CSDN博客[ https://peakchen.blog.csdn.net/article/details/156188384](https://peakchen.blog.csdn.net/article/details/156188384)

\[25] Maven项目标准目录结构解析与实战[ https://www.iesdouyin.com/share/video/7330166600986922252](https://www.iesdouyin.com/share/video/7330166600986922252)

\[26] Maven学习(一)——Maven入门 - Coding Notes -\_mob64ca14010a69的技术博客\_51CTO博客[ https://blog.51cto.com/u\_16213619/14483010](https://blog.51cto.com/u_16213619/14483010)

\[27] Maven项目的架构(Spring Boot 实战版)-CSDN博客[ https://blog.csdn.net/weixin\_41576682/article/details/158917605](https://blog.csdn.net/weixin_41576682/article/details/158917605)

\[28] 【项目】管理平台--细化\_wx653710db8d12a的技术博客\_51CTO博客[ https://blog.51cto.com/u\_16319570/14506623](https://blog.51cto.com/u_16319570/14506623)

\[29] SpringBoot项目标准目录结构详解:从src/main/java到配置文件与模块划分 - CSDN文库[ https://wenku.csdn.net/doc/b2tqn0kao8hm](https://wenku.csdn.net/doc/b2tqn0kao8hm)

\[30] Guide to Working with Multiple Subprojects in Maven 4[ https://maven.apache.org/guides/mini/guide-multiple-subprojects-4.html](https://maven.apache.org/guides/mini/guide-multiple-subprojects-4.html)

\[31] POM Reference[ https://maven.apache.org/pom.html?fbclid=IwAR3VEGKs5vb5KDDdm3SUS2C\_KD7yqCHyqCNcrkMyNPP23firZ5ue7rc1kw8](https://maven.apache.org/pom.html?fbclid=IwAR3VEGKs5vb5KDDdm3SUS2C_KD7yqCHyqCNcrkMyNPP23firZ5ue7rc1kw8)

\[32] 【Maven】pom.xml 超全面详解(核心结构+所有常用依赖)-阿里云开发者社区[ https://developer.aliyun.com:443/article/1716698](https://developer.aliyun.com:443/article/1716698)

\[33] 解析Maven POM模型的核心概念与项目配置[ https://www.iesdouyin.com/share/video/7532063093120044331](https://www.iesdouyin.com/share/video/7532063093120044331)

\[34] Maven多模块项目架构设计:聚合、继承与依赖治理\_多模块聚合架构-CSDN博客[ https://blog.csdn.net/lilinhai548/article/details/148688371](https://blog.csdn.net/lilinhai548/article/details/148688371)

\[35] 【Maven实战】学习之聚合与继承-CSDN博客[ https://blog.csdn.net/weixin\_33700350/article/details/92387444](https://blog.csdn.net/weixin_33700350/article/details/92387444)

\[36] Maven高级\_胖war包是什么意思-CSDN博客[ https://blog.csdn.net/2401\_82484471/article/details/154544519](https://blog.csdn.net/2401_82484471/article/details/154544519)

\[37] Maven Mixins[ https://maven.apache.org/guides/mini/guide-mixins.html](https://maven.apache.org/guides/mini/guide-mixins.html)

\[38] Downloading Apache Maven and Maven Daemon[ https://maven.apache.org/download.cgi?hl=zh-cn](https://maven.apache.org/download.cgi?hl=zh-cn)

\[39] 最新Maven 官方链接与下载地址\_10809805的技术博客\_51CTO博客[ https://blog.51cto.com/u\_10819805/14499192](https://blog.51cto.com/u_10819805/14499192)

\[40] Maven 4.0 没来，3.9.13 抢先修了一波关键 Bug\_搜狐网[ https://m.sohu.com/a/997900344\_121118947/](https://m.sohu.com/a/997900344_121118947/)

\[41] 不到 一杯 奶茶 钱 让 你 的 Maven 开发 起飞 。 👨 ‍ 💻 Java 开发 小伙伴 们 ， 在 使用 IDEA 进行 Maven 项目 开发 时 ， 是 不是 常 被 繁琐 操作 困扰 ？ 别 担心 ， MPVP 插件 来 拯救 我们 啦 ！ IDEA 插件 Maven With Me ( MPVP ) 是 什么 ？ Maven 项目 版本 插件 ， 可 用于 版本 快速 傻瓜 式 [ https://www.iesdouyin.com/share/video/7517611065175805199](https://www.iesdouyin.com/share/video/7517611065175805199)

\[42] Maven Releases History[ https://maven.apache.org/docs/history](https://maven.apache.org/docs/history)

\[43] Maven 4 终于来了!5 个最实用的新特性，看这一篇就够了(附超简单示例)\_51CTO博客\_maven的用法[ https://blog.51cto.com/u\_14602932/14495396](https://blog.51cto.com/u_14602932/14495396)

\[44] Release Notes – Maven 3.8.5[ https://maven.apache.org/docs/3.8.5/release-notes.html](https://maven.apache.org/docs/3.8.5/release-notes.html)

\[45] 《Mavan官方文档》构建生命周期介绍-CSDN博客[ https://blog.csdn.net/weixin\_33849215/article/details/90567283](https://blog.csdn.net/weixin_33849215/article/details/90567283)

\[46] Maven生成生命周期解析-CSDN博客[ https://blog.csdn.net/yy660921/article/details/54848402](https://blog.csdn.net/yy660921/article/details/54848402)

\[47] Guide to Developing Java Plugins[ https://maven.apache.org/guides/plugin/guide-java-plugin-development](https://maven.apache.org/guides/plugin/guide-java-plugin-development)

\[48] Maven在Java项目中的核心优势与依赖管理解析[ https://www.iesdouyin.com/share/video/7577605477735959843](https://www.iesdouyin.com/share/video/7577605477735959843)

\[49] Maven pom.xml execution phase 插件绑定的生命周期阶段-XML/RSS教程-PHP中文网[ https://m.php.cn/faq/2143343.html](https://m.php.cn/faq/2143343.html)

\[50] 【Maven】-生命周期与插件\_maven site jar-CSDN博客[ https://blog.csdn.net/worn\_xiao/article/details/80875489](https://blog.csdn.net/worn_xiao/article/details/80875489)

\[51] Maven生命周期与插件机制-CSDN博客[ https://blog.csdn.net/dilv4062/article/details/101597269](https://blog.csdn.net/dilv4062/article/details/101597269)

\[52] Managing Dependencies[ https://docs.spring.io/spring-boot/3.5-SNAPSHOT/gradle-plugin/managing-dependencies.html](https://docs.spring.io/spring-boot/3.5-SNAPSHOT/gradle-plugin/managing-dependencies.html)

\[53] 13. Build Systems[ https://docs.spring.io/spring-boot/docs/2.0.x/reference/html/using-boot-build-systems.html](https://docs.spring.io/spring-boot/docs/2.0.x/reference/html/using-boot-build-systems.html)

\[54] Spring Boot依赖管理避坑手册(这7种常见错误千万别犯)-CSDN博客[ https://blog.csdn.net/CodeNexus/article/details/155887513](https://blog.csdn.net/CodeNexus/article/details/155887513)

\[55] 解析Spring Boot Starter模块的依赖管理与自动配置机制[ https://www.iesdouyin.com/share/video/7598495757448006939](https://www.iesdouyin.com/share/video/7598495757448006939)

\[56] Spring Boot 参考指南(构建系统)-CSDN博客[ https://blog.csdn.net/weixin\_33670713/article/details/88835390](https://blog.csdn.net/weixin_33670713/article/details/88835390)

\[57] Spring Boot Starter是什么?揭秘自动装配背后的依赖聚合机制\_51CTO学堂\_专业的IT技能学习平台[ https://edu.51cto.com/article/note/44379.html](https://edu.51cto.com/article/note/44379.html)

\[58] ビルドシステム[ https://spring.pleiades.io/spring-boot/reference/using/build-systems.html](https://spring.pleiades.io/spring-boot/reference/using/build-systems.html)

\[59] Introduction to the Dependency Mechanism[ https://maven.apache.org/guides/introduction/introduction-to-dependency-mechanism.html#:\~:text=Dependency](https://maven.apache.org/guides/introduction/introduction-to-dependency-mechanism.html#:~:text=Dependency)

\[60] Maven 依赖冲突解决-CSDN博客[ https://blog.csdn.net/jam\_yin/article/details/158572370](https://blog.csdn.net/jam_yin/article/details/158572370)

\[61] 【Maven】依赖调解(最近优先/第一声明优先)、版本锁定(＜dependencyManagement＞)、Profile激活、私服搭建(Nexus)-CSDN博客[ https://blog.csdn.net/Txx318026/article/details/157551537](https://blog.csdn.net/Txx318026/article/details/157551537)

\[62] Maven依赖管理机制深度解析:从配置到下载的完整链路-CSDN博客[ https://guosy.blog.csdn.net/article/details/159211914](https://guosy.blog.csdn.net/article/details/159211914)

\[63] Maven依赖冲突解决方案:调解规则与工具实践\_maven 依赖调解规则-CSDN博客[ https://blog.csdn.net/qq\_39123695/article/details/147078857](https://blog.csdn.net/qq_39123695/article/details/147078857)

\[64] 深入拆解Maven多模块架构:从核心机制到实战落地-CSDN博客[ https://jigang.blog.csdn.net/article/details/151368204](https://jigang.blog.csdn.net/article/details/151368204)

\[65] 从混乱到清晰:Maven 依赖版本管理最佳实践\_maven 3可以直接升级maven 4吗-CSDN博客[ https://blog.csdn.net/weixin\_42039228/article/details/157132213](https://blog.csdn.net/weixin_42039228/article/details/157132213)

\[66] Maven Mixins[ https://maven.apache.org/guides/mini/guide-mixins.html](https://maven.apache.org/guides/mini/guide-mixins.html)

\[67] POM Reference[ https://maven.apache.org/pom.html?fbclid=IwAR3VEGKs5vb5KDDdm3SUS2C\_KD7yqCHyqCNcrkMyNPP23firZ5ue7rc1kw8](https://maven.apache.org/pom.html?fbclid=IwAR3VEGKs5vb5KDDdm3SUS2C_KD7yqCHyqCNcrkMyNPP23firZ5ue7rc1kw8)

\[68] Maven使用说明-CSDN博客[ https://blog.csdn.net/alspd\_zhangpan/article/details/155783224](https://blog.csdn.net/alspd_zhangpan/article/details/155783224)

\[69] Maven依赖管理的三大核心原则解析[ https://www.iesdouyin.com/share/video/6920276718657801487](https://www.iesdouyin.com/share/video/6920276718657801487)

\[70] Maven 多模块项目(如微服务架构)中，父 POM(最外层) 和 子模块 POM(具体业务模块)的区别和联系\_maven子模块-CSDN博客[ https://blog.csdn.net/qq\_41694906/article/details/146504629](https://blog.csdn.net/qq_41694906/article/details/146504629)

\[71] Guide to Configuring Plug-ins[ https://maven.apache.org/guides/mini/guide-configuring-plugins](https://maven.apache.org/guides/mini/guide-configuring-plugins)

\[72] What's new in Maven 4?[ https://maven.apache.org/whatsnewinmaven4.html](https://maven.apache.org/whatsnewinmaven4.html)

\[73] Introduction to the Dependency Mechanism[ https://maven.apache.org/guides/introduction/introduction-to-dependency-mechanism.html#:\~:text=Dependency](https://maven.apache.org/guides/introduction/introduction-to-dependency-mechanism.html#:~:text=Dependency)

\[74] Maven 依赖冲突解决-阿里云开发者社区[ https://developer.aliyun.com:443/article/1713989](https://developer.aliyun.com:443/article/1713989)

\[75] Maven三种仓库如何配置优先级?\_编程语言-CSDN问答[ https://ask.csdn.net/questions/9167245](https://ask.csdn.net/questions/9167245)

\[76] Maven依赖管理的三大核心原则解析[ https://www.iesdouyin.com/share/video/6920276718657801487](https://www.iesdouyin.com/share/video/6920276718657801487)

\[77] 深入 Maven:从仓库配置到私服架构的进阶实践-CSDN博客[ https://blog.csdn.net/asad6/article/details/154084593](https://blog.csdn.net/asad6/article/details/154084593)

\[78] Maven之依赖管理\_最新maven依赖-CSDN博客[ https://blog.csdn.net/aa\_hdkf\_vg/article/details/149674266](https://blog.csdn.net/aa_hdkf_vg/article/details/149674266)

\[79] Maven 核心原理深度解析与 JAR 包冲突终结指南-CSDN博客[ https://blog.csdn.net/hbx98/article/details/157768195](https://blog.csdn.net/hbx98/article/details/157768195)

\[80] Spring Boot 4 升级实战:从3.x到4.0的分步升级保姆级指南\_springboot4-CSDN博客[ https://blog.csdn.net/weixin\_44058951/article/details/157843228](https://blog.csdn.net/weixin_44058951/article/details/157843228)

\[81] 系统要求 (System Requirements) | Spring Boot3.3.1中文文档|Spring官方文档|SpringBoot 教程|Spring中文网[ https://www.spring-doc.cn/spring-boot/3.3.1/system-requirements.html](https://www.spring-doc.cn/spring-boot/3.3.1/system-requirements.html)

\[82] Migrate to Maven 4[ https://maven.apache.org/guides/mini/guide-migration-to-mvn4](https://maven.apache.org/guides/mini/guide-migration-to-mvn4)

\[83] Spring Boot3升级的致命坑与安全实施策略解析[ https://www.iesdouyin.com/share/video/7580314702278839587](https://www.iesdouyin.com/share/video/7580314702278839587)

\[84] 安装 Spring Boot (Installing Spring Boot) | Spring Boot3.4.0-M3中文文档|Spring官方文档|SpringBoot 教程|Spring中文网[ https://www.spring-doc.cn/spring-boot/3.4.0-M3/installing.html](https://www.spring-doc.cn/spring-boot/3.4.0-M3/installing.html)

\[85] 2026 Spring Boot热点实战:从原生镜像到AI集成全解析\_从程序员到架构师[ http://m.toutiao.com/group/7618035487034442283/](http://m.toutiao.com/group/7618035487034442283/)

\[86] SpringBoot升级到3.0\_mob64ca13f6035c的技术博客\_51CTO博客[ https://blog.51cto.com/u\_16213574/14432594](https://blog.51cto.com/u_16213574/14432594)

\[87] Spring Boot 3 配合哪个Java版本 JDK环境要求【说明】-java教程-PHP中文网[ https://m.php.cn/faq/2021283.html](https://m.php.cn/faq/2021283.html)

\[88] Spring Boot Gradle Plugin Reference Guide[ https://docs.spring.io/spring-boot/docs/3.2.12/gradle-plugin/reference/pdf/spring-boot-gradle-plugin-reference.pdf](https://docs.spring.io/spring-boot/docs/3.2.12/gradle-plugin/reference/pdf/spring-boot-gradle-plugin-reference.pdf)

\[89] Maven - Spring Boot项目集成 打包 部署 依赖管理实战-CSDN博客[ https://blog.csdn.net/qq\_41187124/article/details/155644386](https://blog.csdn.net/qq_41187124/article/details/155644386)

\[90] Spring Boot Dependency Management: Practical Guide for Stable Builds[ https://thelinuxcode.com/spring-boot-dependency-management-practical-guide-for-stable-builds/](https://thelinuxcode.com/spring-boot-dependency-management-practical-guide-for-stable-builds/)

\[91] Spring Boot Dependency Management: A Practical Guide to Starters, BOMs, Overrides, and Debugging[ https://thelinuxcode.com/spring-boot-dependency-management-a-practical-guide-to-starters-boms-overrides-and-debugging/](https://thelinuxcode.com/spring-boot-dependency-management-a-practical-guide-to-starters-boms-overrides-and-debugging/)

\[92] Managing Dependencies[ https://docs.spring.io/spring-boot/3.5-SNAPSHOT/gradle-plugin/managing-dependencies.html](https://docs.spring.io/spring-boot/3.5-SNAPSHOT/gradle-plugin/managing-dependencies.html)

\[93] Managing Dependencies (Managing Dependencies) | Spring Boot3.3.4中文文档|Spring官方文档|SpringBoot 教程|Spring中文网[ https://www.spring-doc.cn/spring-boot/3.3.4/gradle-plugin\_managing-dependencies.en.html](https://www.spring-doc.cn/spring-boot/3.3.4/gradle-plugin_managing-dependencies.en.html)

\[94] Spring Boot Gradle Plugin Reference Guide[ https://docs.spring.io/spring-boot/docs/2.5.5/gradle-plugin/reference/pdf/spring-boot-gradle-plugin-reference.pdf](https://docs.spring.io/spring-boot/docs/2.5.5/gradle-plugin/reference/pdf/spring-boot-gradle-plugin-reference.pdf)

\[95] Spring Boot Gradle Plugin Reference Guide[ https://docs.spring.io/spring-boot/docs/3.0.6/gradle-plugin/reference/pdf/spring-boot-gradle-plugin-reference.pdf](https://docs.spring.io/spring-boot/docs/3.0.6/gradle-plugin/reference/pdf/spring-boot-gradle-plugin-reference.pdf)

\[96] SpringBoot特点之依赖管理和自动配置\_mob6454cc6a8ab0的技术博客\_51CTO博客[ https://blog.51cto.com/u\_16099229/14433721](https://blog.51cto.com/u_16099229/14433721)

\[97] 13. Build Systems[ https://docs.spring.io/spring-boot/docs/2.1.9.RELEASE/reference/html/using-boot-build-systems.html](https://docs.spring.io/spring-boot/docs/2.1.9.RELEASE/reference/html/using-boot-build-systems.html)

\[98] Spring Boot依赖管理避坑手册(这7种常见错误千万别犯)-CSDN博客[ https://blog.csdn.net/CodeNexus/article/details/155887513](https://blog.csdn.net/CodeNexus/article/details/155887513)

\[99] 解析Spring Boot Starter模块的依赖管理与自动配置机制[ https://www.iesdouyin.com/share/video/7598754063869545774](https://www.iesdouyin.com/share/video/7598754063869545774)

\[100] Spring Boot 系列:核心机制深度解析(二)-CSDN博客[ https://blog.csdn.net/Lsk\_Smion/article/details/159216058](https://blog.csdn.net/Lsk_Smion/article/details/159216058)

\[101] 【SpringBoot】04 基础入门 - 自动配置原理入门:依赖管理 + 自动配置-CSDN博客[ https://blog.csdn.net/qq\_38628970/article/details/150260327](https://blog.csdn.net/qq_38628970/article/details/150260327)

\[102] Maven 依赖作用域实战避坑指南-CSDN博客[ https://blog.csdn.net/Facial\_Mask/article/details/157069561](https://blog.csdn.net/Facial_Mask/article/details/157069561)

\[103] 🍃Spring Boot 多模块项目中 Parent / BOM / Starter 的正确分工 🍃Spring B - 掘金[ https://juejin.cn/post/7593943464053915658](https://juejin.cn/post/7593943464053915658)

\[104] 一文解析 Maven 的 ＜optional＞ 与 ＜scope＞在开发 Starter 时的用法与区别\_maven optional-CSDN博客[ https://blog.csdn.net/hanlepeng/article/details/147352911](https://blog.csdn.net/hanlepeng/article/details/147352911)

\[105] Maven依赖范围scope参数配置解析与实例验证[ https://www.iesdouyin.com/share/video/7513939126048099647](https://www.iesdouyin.com/share/video/7513939126048099647)

\[106] Spring Boot开发者必看!Maven不是“玄学”，吃透这几点告别踩坑\_知识大胖[ http://m.toutiao.com/group/7614858513747132955/](http://m.toutiao.com/group/7614858513747132955/)

\[107] Maven без ошибок: Разбор типичных проблем в Spring Boot проектах[ https://runebook.dev/ru/docs/spring\_boot/documentation/build-tool-pluginsbuild-tool-plugins.maven](https://runebook.dev/ru/docs/spring_boot/documentation/build-tool-pluginsbuild-tool-plugins.maven)

\[108] Maven 进阶:依赖管理的 “坑” 与解决方案\_dependencymanagment强制限制依赖版本-CSDN博客[ https://blog.csdn.net/asad6/article/details/151898321](https://blog.csdn.net/asad6/article/details/151898321)

\[109] SpringBoot Maven依赖冲突排查全攻略:从ClassNotFound到彻底解决本文深入剖析SpringBoo - 掘金[ https://juejin.cn/post/7611349961310421011](https://juejin.cn/post/7611349961310421011)

\[110] Maven 依赖冲突疯了?3 招根治，附阿里 P8 都在用的排查工具\_java maven引入的依赖与项目本身的依赖冲突-CSDN博客[ https://blog.csdn.net/qq\_41803278/article/details/154232973](https://blog.csdn.net/qq_41803278/article/details/154232973)

\[111] Maven Dependency List命令快速展示项目依赖包[ https://www.iesdouyin.com/share/video/7521726596521168179](https://www.iesdouyin.com/share/video/7521726596521168179)

\[112] 启动失败全因 Maven 依赖冲突?这招教你跳出版本地狱!\_dependency conflict in core: org.ow2.asm:asm:9.2 c-CSDN博客[ https://blog.csdn.net/m0\_65592409/article/details/151691375](https://blog.csdn.net/m0_65592409/article/details/151691375)

\[113] Spring Boot项目Maven依赖冲突如何解决?\_编程语言-CSDN问答[ https://ask.csdn.net/questions/9156921](https://ask.csdn.net/questions/9156921)

\[114] 【已解决】springboot启动时报错:could not resolve dependencies for project-CSDN博客[ https://blog.csdn.net/weibo1230123/article/details/150069791](https://blog.csdn.net/weibo1230123/article/details/150069791)

\[115] idea创建一个spring boot工程覆合工程\_Spring Boot多模块间依赖配置\_ - CSDN文库[ https://wenku.csdn.net/answer/4prm4n4g5v](https://wenku.csdn.net/answer/4prm4n4g5v)

\[116] Maven BOM(Bill of Materials)使用指南与常见错误\_maven bom配置与使用-CSDN博客[ https://blog.csdn.net/Numb\_ZL/article/details/155542578](https://blog.csdn.net/Numb_ZL/article/details/155542578)

\[117] Spring Boot 多模块项目最佳实践:打造清晰、可维护的微服务骨架\_码农老王[ http://m.toutiao.com/group/7619187583708496425/](http://m.toutiao.com/group/7619187583708496425/)

\[118] 微服务项目父工程公共Maven依赖配置步骤解析[ https://www.iesdouyin.com/share/video/7588842585528093961](https://www.iesdouyin.com/share/video/7588842585528093961)

\[119] Spring Boot开发者必看!Maven不是“玄学”，吃透这几点告别踩坑\_知识大胖[ http://m.toutiao.com/group/7614858513747132955/](http://m.toutiao.com/group/7614858513747132955/)

\[120] Maven - Spring Boot项目集成 打包 部署 依赖管理实战-CSDN博客[ https://blog.csdn.net/qq\_41187124/article/details/155644386](https://blog.csdn.net/qq_41187124/article/details/155644386)

\[121] 如何部署多模块 Spring Boot Maven 项目?-java教程-PHP中文网[ https://m.php.cn/faq/2083264.html](https://m.php.cn/faq/2083264.html)

\[122] Using the Plugin[ https://docs.spring.io/spring-boot/3.5-SNAPSHOT/maven-plugin/using.html](https://docs.spring.io/spring-boot/3.5-SNAPSHOT/maven-plugin/using.html)

\[123] Spring Boot项目实战:如何用BOM优雅管理Netty和Jetty家族依赖-CSDN博客[ https://blog.csdn.net/kk1234/article/details/152407826](https://blog.csdn.net/kk1234/article/details/152407826)

\[124] Maven大型项目分治与版本控制深度解析-CSDN博客[ https://blog.csdn.net/ZuanShi1111/article/details/151367485](https://blog.csdn.net/ZuanShi1111/article/details/151367485)

\[125] 解析Spring Boot Starter模块的依赖管理与自动配置机制[ https://www.iesdouyin.com/share/video/7598495757448006939](https://www.iesdouyin.com/share/video/7598495757448006939)

\[126] Spring Boot Dependency Management: A Practical Guide to Starters, BOMs, Overrides, and Debugging[ https://thelinuxcode.com/spring-boot-dependency-management-a-practical-guide-to-starters-boms-overrides-and-debugging/](https://thelinuxcode.com/spring-boot-dependency-management-a-practical-guide-to-starters-boms-overrides-and-debugging/)

\[127] Spring Boot依赖管理避坑手册(这7种常见错误千万别犯)-CSDN博客[ https://blog.csdn.net/CodeNexus/article/details/155887513](https://blog.csdn.net/CodeNexus/article/details/155887513)

\[128] Maven常见使用问题及解决方法-\_mob6454cc623087的技术博客\_51CTO博客[ https://blog.51cto.com/u\_16099170/14442221](https://blog.51cto.com/u_16099170/14442221)

\[129] 74. Embedded Web Servers[ https://docs.spring.io/spring-boot/docs/2.0.0.RC1/reference/html/howto-embedded-web-servers.html](https://docs.spring.io/spring-boot/docs/2.0.0.RC1/reference/html/howto-embedded-web-servers.html)

\[130] Spring Boot中如何排除内置Tomcat?\_编程语言-CSDN问答[ https://ask.csdn.net/questions/9162623](https://ask.csdn.net/questions/9162623)

\[131] Spring Boot 4.0移除了Undertow，Tomcat才是赢家\_samdeepthink[ http://m.toutiao.com/group/7618771034884178473/](http://m.toutiao.com/group/7618771034884178473/)

\[132] 【 Java 高频 面试 题 】 每天 10 道 面试 题 。 1万 道 面试 题 之 第 501 到 510 道 - 并发 编程 连环 10 问 第 10 集&#x20;

&#x20;\# 计算机 # 程序员 # java # java 面试 # 编程[ https://www.iesdouyin.com/share/video/7429933202304765236](https://www.iesdouyin.com/share/video/7429933202304765236)

\[133] 嵌入式Web服务器:: Spring Boot - Spring 框架[ https://docs.springframework.org.cn/spring-boot/how-to/webserver.html](https://docs.springframework.org.cn/spring-boot/how-to/webserver.html)

\[134] vscode springboot配置tomcat网址 - CSDN文库[ https://wenku.csdn.net/answer/419fei8jb8](https://wenku.csdn.net/answer/419fei8jb8)

\[135] Embedded Web Servers[ https://docs.spring.io/spring-boot/3.3/how-to/webserver.html](https://docs.spring.io/spring-boot/3.3/how-to/webserver.html)

\[136] Spring Boot依赖版本冲突如何通过spring-boot-dependencies统一管理?\_编程语言-CSDN问答[ https://ask.csdn.net/questions/9250961](https://ask.csdn.net/questions/9250961)

\[137] Maven常见使用问题及解决方法-\_mob6454cc623087的技术博客\_51CTO博客[ https://blog.51cto.com/u\_16099170/14442221](https://blog.51cto.com/u_16099170/14442221)

\[138] 解析Spring Boot Starter模块的依赖管理与自动配置机制[ https://www.iesdouyin.com/share/video/7598495757448006939](https://www.iesdouyin.com/share/video/7598495757448006939)

\[139] Spring Boot依赖管理避坑手册(这7种常见错误千万别犯)-CSDN博客[ https://blog.csdn.net/CodeNexus/article/details/155887513](https://blog.csdn.net/CodeNexus/article/details/155887513)

\[140] 5. Overriding Spring IO Platform’s dependency management[ https://docs.spring.io/platform/docs/1.1.3.RELEASE/reference/html/getting-started-overriding-versions.html](https://docs.spring.io/platform/docs/1.1.3.RELEASE/reference/html/getting-started-overriding-versions.html)

\[141] Spring Boot Dependency Management: A Practical Guide to Starters, BOMs, Overrides, and Debugging[ https://thelinuxcode.com/spring-boot-dependency-management-a-practical-guide-to-starters-boms-overrides-and-debugging/](https://thelinuxcode.com/spring-boot-dependency-management-a-practical-guide-to-starters-boms-overrides-and-debugging/)

\[142] Using the Plugin[ https://docs.spring.io/spring-boot/3.5-SNAPSHOT/maven-plugin/using.html](https://docs.spring.io/spring-boot/3.5-SNAPSHOT/maven-plugin/using.html)

\[143] Maven 依赖冲突解决-CSDN博客[ https://blog.csdn.net/jam\_yin/article/details/158572370](https://blog.csdn.net/jam_yin/article/details/158572370)

\[144] Quick Start - MavenHelperPro | JetBrains Marketplace[ https://plugins.jetbrains.com/plugin/22463-mavenhelperpro/quick-start](https://plugins.jetbrains.com/plugin/22463-mavenhelperpro/quick-start)

\[145] IDEA 实战:查看 Maven 依赖树与解决 Jar 包冲突\_idea maven tree 页面-CSDN博客[ https://blog.csdn.net/weixin\_45334346/article/details/155231035](https://blog.csdn.net/weixin_45334346/article/details/155231035)

\[146] IDEA插件MavenHelper解析依赖冲突与排除方法[ https://www.iesdouyin.com/share/video/7535467198534454528](https://www.iesdouyin.com/share/video/7535467198534454528)

\[147] Maven 依赖冲突疯了?3 招根治，附阿里 P8 都在用的排查工具\_java maven引入的依赖与项目本身的依赖冲突-CSDN博客[ https://blog.csdn.net/qq\_41803278/article/details/154232973](https://blog.csdn.net/qq_41803278/article/details/154232973)

\[148] 依赖冲突快速解决-CSDN博客[ https://blog.csdn.net/qq\_45873770/article/details/159208593](https://blog.csdn.net/qq_45873770/article/details/159208593)

\[149] SpringBoot Maven依赖冲突排查全攻略:从ClassNotFound到彻底解决本文深入剖析SpringBoo - 掘金[ https://juejin.cn/post/7611349961310421011](https://juejin.cn/post/7611349961310421011)

\[150] 解决maven依赖冲突问题\_gulaotou的技术博客\_51CTO博客[ https://blog.51cto.com/u\_15444/14336533](https://blog.51cto.com/u_15444/14336533)

\[151] Lombok 不生效 —— 从排查到可运行 Demo(含实战解析)-CSDN博客[ https://blog.csdn.net/qq\_36478920/article/details/154155439](https://blog.csdn.net/qq_36478920/article/details/154155439)

\[152] Maven[ https://projectlombok.org/setup/maven](https://projectlombok.org/setup/maven)

\[153] Lombok compiler plugin[ https://kotlinlang.org/docs/lombok.html?mode=reply](https://kotlinlang.org/docs/lombok.html?mode=reply)

\[154] How to use multiple annotation processors with maven-compiler-plugin[ https://www.exchangetuts.com/how-to-use-multiple-annotation-processors-with-maven-compiler-plugin-1764358203187009](https://www.exchangetuts.com/how-to-use-multiple-annotation-processors-with-maven-compiler-plugin-1764358203187009)

\[155] doc(java-generator): document annotation processor configuration for extraAnnotations #7453[ https://github.com/fabric8io/kubernetes-client/pull/7453/files/7c7fd119dc871f48bd6c92189098dcfd7c3a0aa6](https://github.com/fabric8io/kubernetes-client/pull/7453/files/7c7fd119dc871f48bd6c92189098dcfd7c3a0aa6)

\[156] Untitled[ http://raw.githubusercontent.com/benchflow-ai/skillsbench/main/tasks/fix-build-google-auto/environment/skills/maven-plugin-configuration/SKILL.md](http://raw.githubusercontent.com/benchflow-ai/skillsbench/main/tasks/fix-build-google-auto/environment/skills/maven-plugin-configuration/SKILL.md)

\[157] Download 'Edgy Guinea Pig' - the Lombok Cutting Edge build[ https://projectlombok.org/download-edge](https://projectlombok.org/download-edge)

\[158] Spring Boot 4.x Not Support Lombok On GraalVM 25 #48873[ https://github.com/spring-projects/spring-boot/issues/48873](https://github.com/spring-projects/spring-boot/issues/48873)

\[159] Spring Boot Maven Plugin Documentation[ https://docs.spring.io/spring-boot/docs/2.6.13/maven-plugin/reference/pdf/spring-boot-maven-plugin-reference.pdf](https://docs.spring.io/spring-boot/docs/2.6.13/maven-plugin/reference/pdf/spring-boot-maven-plugin-reference.pdf)

\[160] Spring Boot 项目构建的三大插件说明-CSDN博客[ https://blog.csdn.net/jwbabc/article/details/158804951](https://blog.csdn.net/jwbabc/article/details/158804951)

\[161] Spring Boot Maven插件核心配置详解:从打包到部署全流程\_maven 打包插件pom配置-CSDN博客[ https://blog.csdn.net/Facial\_Mask/article/details/156943503](https://blog.csdn.net/Facial_Mask/article/details/156943503)

\[162] 震惊 ！ 超 好用 Maven 开发 利器 \~ 震惊 ！ 超 好用 Maven 开发 利器 ， 轻松 解决 搜索 依赖 和 升级 项目 版本 困扰 ！ 💡 如何 安装 在 idea 插件 中心 搜索 关键 字 MPVP 进行 安装 即可 还 在 等 什么 ？ 快来 体验 Maven With Me 插件 ， 让 IDEA + Maven 项目 开发 如虎添翼 ！ 💪 # IDEA 插件 # MPV[ https://www.iesdouyin.com/share/video/7522677289969110312](https://www.iesdouyin.com/share/video/7522677289969110312)

\[163] SpringBoot Maven 项目 pom 中的 plugin 插件用法整理-CSDN博客[ https://blog.csdn.net/aisifang00/article/details/159166797](https://blog.csdn.net/aisifang00/article/details/159166797)

\[164] 构建 :: Spring Boot - Spring 框架[ https://docs.springframework.org.cn/spring-boot/how-to/build.html](https://docs.springframework.org.cn/spring-boot/how-to/build.html)

\[165] Spring Boot Maven 插件:构建可执行 JAR 的核心配置\_spring-boot-maven-plugin 可执行jar-CSDN博客[ https://blog.csdn.net/wenxuankeji/article/details/149317201](https://blog.csdn.net/wenxuankeji/article/details/149317201)

\[166] Spring Boot 项目构建的三大插件说明-CSDN博客[ https://blog.csdn.net/jwbabc/article/details/158804951](https://blog.csdn.net/jwbabc/article/details/158804951)

\[167] Spring Boot项目中Maven编译参数source、target与release的区别及配置实践-CSDN博客[ https://blog.csdn.net/m0\_67391270/article/details/158348540](https://blog.csdn.net/m0_67391270/article/details/158348540)

\[168] maven 插件-CSDN博客[ https://blog.csdn.net/Aoutlaw/article/details/159210931](https://blog.csdn.net/Aoutlaw/article/details/159210931)

\[169] Spring IoC案例解析：配置类与依赖注入实现[ https://www.iesdouyin.com/share/video/7525744650448047387](https://www.iesdouyin.com/share/video/7525744650448047387)

\[170] Maven pom.xml plugins plugin配置 构建插件详解-XML/RSS教程-PHP中文网[ https://m.php.cn/faq/2119060.html](https://m.php.cn/faq/2119060.html)

\[171] Maven 项目里怎么让编译和运行都用指定的 JDK 版本? - CSDN文库[ https://wenku.csdn.net/answer/5fhn3yciifp0](https://wenku.csdn.net/answer/5fhn3yciifp0)

\[172] 为什么新建 Spring Boot 项目默认要求 Java 17 或更高版本? - CSDN文库[ https://wenku.csdn.net/answer/4wrret17kv](https://wenku.csdn.net/answer/4wrret17kv)

\[173] MapStruct与Lombok冲突?教你一招解决编译顺序问题(附完整POM配置)-CSDN博客[ https://blog.csdn.net/efc12345678/article/details/153712504](https://blog.csdn.net/efc12345678/article/details/153712504)

\[174] Java开发中如何配置MapStruct环境\_依赖注入与编译插件设置-java教程-PHP中文网[ https://m.php.cn/faq/2153657.html](https://m.php.cn/faq/2153657.html)

\[175] mapstruct lombok 集成简单配置\_51CTO博客\_mapstruct lombok冲突[ https://blog.51cto.com/rongfengliang/14448498](https://blog.51cto.com/rongfengliang/14448498)

\[176] Lombok与MapStruct配置顺序导致数据Null问题解析[ https://www.iesdouyin.com/share/video/7591908189505078629](https://www.iesdouyin.com/share/video/7591908189505078629)

\[177] lombok与mapstruct版本不兼容 - CSDN文库[ https://wenku.csdn.net/answer/2mrhbwrzmk](https://wenku.csdn.net/answer/2mrhbwrzmk)

\[178] How to use multiple annotation processors with maven-compiler-plugin[ https://www.exchangetuts.com/how-to-use-multiple-annotation-processors-with-maven-compiler-plugin-1764358203187009](https://www.exchangetuts.com/how-to-use-multiple-annotation-processors-with-maven-compiler-plugin-1764358203187009)

\[179] MapStruct用法示例\_mapstruct 多参数-CSDN博客[ https://blog.csdn.net/zero\_\_007/article/details/127323174](https://blog.csdn.net/zero__007/article/details/127323174)

\[180] Spring Boot 项目构建的三大插件说明-CSDN博客[ https://blog.csdn.net/jwbabc/article/details/158804951](https://blog.csdn.net/jwbabc/article/details/158804951)

\[181] 别再死守SpringBootParent了!这个MavenParent方案更灵活更强大\_从程序员到架构师[ http://m.toutiao.com/group/7597350725055791622/](http://m.toutiao.com/group/7597350725055791622/)

\[182] 如何统一引入 Spring Boot 版本?\_springboot统一maven版本-CSDN博客[ https://blog.csdn.net/u012919352/article/details/103394858](https://blog.csdn.net/u012919352/article/details/103394858)

\[183] Spring Boot插件管理依赖版本统一维护[ https://www.iesdouyin.com/share/video/7410409179204144411](https://www.iesdouyin.com/share/video/7410409179204144411)

\[184] gradle系列【7】使用springbootgradle插件实现依赖管理和打包[ https://blog.csdn.net/qq\_43437874/article/details/125381846](https://blog.csdn.net/qq_43437874/article/details/125381846)

\[185] Spring Boot Gradle Plugin Reference Guide[ https://docs.spring.io/spring-boot/docs/2.6.10/gradle-plugin/reference/pdf/spring-boot-gradle-plugin-reference.pdf](https://docs.spring.io/spring-boot/docs/2.6.10/gradle-plugin/reference/pdf/spring-boot-gradle-plugin-reference.pdf)

\[186] Spring Boot 3 升级指南:自动化识别并更新依赖版本-java教程-PHP中文网[ https://m.php.cn/faq/2150124.html](https://m.php.cn/faq/2150124.html)

\[187] 🍃Spring Boot 多模块项目中 Parent / BOM / Starter 的正确分工 🍃Spring B - 掘金[ https://juejin.cn/post/7593943464053915658](https://juejin.cn/post/7593943464053915658)

\[188] Spring Boot 项目构建的三大插件说明-CSDN博客[ https://blog.csdn.net/jwbabc/article/details/158804951](https://blog.csdn.net/jwbabc/article/details/158804951)

\[189] Spring Boot3升级的致命坑与安全实施策略解析[ https://www.iesdouyin.com/share/video/7580314702278839587](https://www.iesdouyin.com/share/video/7580314702278839587)

\[190] 别再死守SpringBootParent了!这个MavenParent方案更灵活更强大\_从程序员到架构师[ http://m.toutiao.com/group/7597350725055791622/](http://m.toutiao.com/group/7597350725055791622/)

\[191] Spring Boot Maven Plugin Documentation[ https://docs.spring.io/spring-boot/docs/2.7.0/maven-plugin/reference/pdf/spring-boot-maven-plugin-reference.pdf](https://docs.spring.io/spring-boot/docs/2.7.0/maven-plugin/reference/pdf/spring-boot-maven-plugin-reference.pdf)

\[192] 如何部署多模块 Spring Boot Maven 项目?-java教程-PHP中文网[ https://m.php.cn/faq/2083264.html](https://m.php.cn/faq/2083264.html)

\[193] 《Mavan官方文档》构建生命周期介绍-CSDN博客[ https://blog.csdn.net/weixin\_33849215/article/details/90567283](https://blog.csdn.net/weixin_33849215/article/details/90567283)

\[194] Maven生命周期阶段如何正确绑定插件目标?\_编程语言-CSDN问答[ https://ask.csdn.net/questions/9140253](https://ask.csdn.net/questions/9140253)

\[195] Guide to Configuring Plug-ins[ https://maven.apache.org/guides/mini/guide-configuring-plugins](https://maven.apache.org/guides/mini/guide-configuring-plugins)

\[196] Maven构建工具核心功能解析与Java项目自动化管理[ https://www.iesdouyin.com/share/video/7599907746528830810](https://www.iesdouyin.com/share/video/7599907746528830810)

\[197] Maven 生命周期与插件\_default生命周期war与插件的绑定关系-CSDN博客[ https://blog.csdn.net/a1282379904/article/details/77894152](https://blog.csdn.net/a1282379904/article/details/77894152)

\[198] Maven pom.xml plugin execution 插件执行阶段phase与goal配置-XML/RSS教程-PHP中文网[ https://m.php.cn/faq/2205600.html](https://m.php.cn/faq/2205600.html)

\[199] Maven生命周期与插件绑定:深入理解构建过程\_maven-antrun-plugin process-resources-CSDN博客[ https://blog.csdn.net/2501\_91473495/article/details/148745434](https://blog.csdn.net/2501_91473495/article/details/148745434)

\[200] Maven生命周期与插件-CSDN博客[ https://blog.csdn.net/conanswp/article/details/75205463](https://blog.csdn.net/conanswp/article/details/75205463)

\[201] 如何在目标执行期间调试第三方mvn插件? - 腾讯云开发者社区 - 腾讯云[ https://cloud.tencent.com/developer/information/%E5%A6%82%E4%BD%95%E5%9C%A8%E7%9B%AE%E6%A0%87%E6%89%A7%E8%A1%8C%E6%9C%9F%E9%97%B4%E8%B0%83%E8%AF%95%E7%AC%AC%E4%B8%89%E6%96%B9mvn%E6%8F%92%E4%BB%B6%EF%BC%9F-article](https://cloud.tencent.com/developer/information/%E5%A6%82%E4%BD%95%E5%9C%A8%E7%9B%AE%E6%A0%87%E6%89%A7%E8%A1%8C%E6%9C%9F%E9%97%B4%E8%B0%83%E8%AF%95%E7%AC%AC%E4%B8%89%E6%96%B9mvn%E6%8F%92%E4%BB%B6%EF%BC%9F-article)

\[202] Maven 命令完整速查Maven 命令完整速查文档 一、基础生命周期命令(最常用) mvn clean 清理项目，删除 - 掘金[ https://juejin.cn/post/7592903126178070578](https://juejin.cn/post/7592903126178070578)

\[203] Maven运行时不显示详细结果，和调试模式到底有啥不同? - CSDN文库[ https://wenku.csdn.net/answer/5rf21r2n0v](https://wenku.csdn.net/answer/5rf21r2n0v)

\[204] 后端日志查看方法及工具应用解析[ https://www.iesdouyin.com/share/video/7497797867818568994](https://www.iesdouyin.com/share/video/7497797867818568994)

\[205] 在maven命令中增加参数，将插件执行的生命周期阶段打印出来 - CSDN文库[ https://wenku.csdn.net/answer/4qc4jnh5kn](https://wenku.csdn.net/answer/4qc4jnh5kn)

\[206] \*\*深入解析 org.apache.maven.plugins\*\*-CSDN博客[ https://blog.csdn.net/layneyao/article/details/146769444](https://blog.csdn.net/layneyao/article/details/146769444)

\[207] 使用IntelliJ调试TomEE Maven插件 - 腾讯云开发者社区 - 腾讯云[ https://cloud.tencent.com.cn/developer/information/%E4%BD%BF%E7%94%A8IntelliJ%E8%B0%83%E8%AF%95TomEE%20Maven%E6%8F%92%E4%BB%B6](https://cloud.tencent.com.cn/developer/information/%E4%BD%BF%E7%94%A8IntelliJ%E8%B0%83%E8%AF%95TomEE%20Maven%E6%8F%92%E4%BB%B6)

\[208] versions:display-plugin-updates[ https://www.mojohaus.org/versions/versions-maven-plugin/display-plugin-updates-mojo.html](https://www.mojohaus.org/versions/versions-maven-plugin/display-plugin-updates-mojo.html)

\[209] Spring Boot 项目构建的三大插件说明-CSDN博客[ https://blog.csdn.net/jwbabc/article/details/158804951](https://blog.csdn.net/jwbabc/article/details/158804951)

\[210] 属性和配置 :: Spring Boot - Spring 框架[ https://docs.springframework.org.cn/spring-boot/how-to/properties-and-configuration.html](https://docs.springframework.org.cn/spring-boot/how-to/properties-and-configuration.html)

\[211] Maven - 资源过滤 动态替换配置文件中的环境变量-CSDN博客[ https://blog.csdn.net/qq\_41187124/article/details/155645095](https://blog.csdn.net/qq_41187124/article/details/155645095)

\[212] 使用ClassFinal插件加密Spring Boot Jar包防止反编译[ https://www.iesdouyin.com/share/video/7502402438398364955](https://www.iesdouyin.com/share/video/7502402438398364955)

\[213] Maven pom.xml资源过滤 resource filtering配置详解-XML/RSS教程-PHP中文网[ https://m.php.cn/faq/2219319.html](https://m.php.cn/faq/2219319.html)

\[214] Maven核心插件之maven-resources-plugin\_51CTO博客\_maven-resources-plugin的作用[ https://blog.51cto.com/u\_9176029/14119862](https://blog.51cto.com/u_9176029/14119862)

\[215] Using the Plugin[ https://docs.spring.io/spring-boot/3.5/maven-plugin/using.html](https://docs.spring.io/spring-boot/3.5/maven-plugin/using.html)

\[216] Spring Boot Maven Plugin Documentation[ https://docs.spring.io/spring-boot/docs/2.7.0/maven-plugin/reference/pdf/spring-boot-maven-plugin-reference.pdf](https://docs.spring.io/spring-boot/docs/2.7.0/maven-plugin/reference/pdf/spring-boot-maven-plugin-reference.pdf)

\[217] Spring Boot 项目构建的三大插件说明-CSDN博客[ https://blog.csdn.net/jwbabc/article/details/158804951](https://blog.csdn.net/jwbabc/article/details/158804951)

\[218] maven 插件-CSDN博客[ https://blog.csdn.net/Aoutlaw/article/details/159210931](https://blog.csdn.net/Aoutlaw/article/details/159210931)

\[219] Spring Boot特性开启的核心方式与自动配置机制解析[ https://www.iesdouyin.com/share/video/7490540391935003964](https://www.iesdouyin.com/share/video/7490540391935003964)

\[220] Spring Boot 中如何正确排除 Lombok 等编译期依赖?-java教程-PHP中文网[ https://m.php.cn/faq/2161752.html](https://m.php.cn/faq/2161752.html)

\[221] Spring Boot Maven 插件:构建可执行 JAR 的核心配置\_spring-boot-maven-plugin 可执行jar-CSDN博客[ https://blog.csdn.net/wenxuankeji/article/details/149317201](https://blog.csdn.net/wenxuankeji/article/details/149317201)

\[222] 构建 :: Spring Boot - Spring 框架[ https://docs.springframework.org.cn/spring-boot/how-to/build.html](https://docs.springframework.org.cn/spring-boot/how-to/build.html)

\[223] SpringBoot - 用maven-dependency-plugin插件将项目代码与依赖分开打包-CSDN博客[ https://blog.csdn.net/qq\_43842093/article/details/126684263](https://blog.csdn.net/qq_43842093/article/details/126684263)

\[224] Guide to Configuring Plug-ins[ https://maven.apache.org/guides/mini/guide-configuring-plugins](https://maven.apache.org/guides/mini/guide-configuring-plugins)

\[225] 《Mavan官方文档》构建生命周期介绍-CSDN博客[ https://blog.csdn.net/weixin\_33849215/article/details/90567283](https://blog.csdn.net/weixin_33849215/article/details/90567283)

\[226] Maven pom.xml plugin execution 插件执行阶段phase与goal配置-XML/RSS教程-PHP中文网[ https://m.php.cn/faq/2205600.html](https://m.php.cn/faq/2205600.html)

\[227] Maven安装配置与命令行使用全解析[ https://www.iesdouyin.com/share/video/7455629477675011347](https://www.iesdouyin.com/share/video/7455629477675011347)

\[228] Maven插件执行顺序混乱如何解决?\_编程语言-CSDN问答[ https://ask.csdn.net/questions/8938700](https://ask.csdn.net/questions/8938700)

\[229] Maven生成生命周期解析-CSDN博客[ https://blog.csdn.net/yy660921/article/details/54848402](https://blog.csdn.net/yy660921/article/details/54848402)

\[230] Maven生命周期深度解析-CSDN博客[ https://blog.csdn.net/ZuanShi1111/article/details/151367205](https://blog.csdn.net/ZuanShi1111/article/details/151367205)

\[231] 【Maven】-生命周期与插件\_maven site jar-CSDN博客[ https://blog.csdn.net/worn\_xiao/article/details/80875489](https://blog.csdn.net/worn_xiao/article/details/80875489)

\[232] Spring Boot开发者必看!Maven不是“玄学”，吃透这几点告别踩坑\_知识大胖[ http://m.toutiao.com/group/7614858513747132955/](http://m.toutiao.com/group/7614858513747132955/)

\[233] 为什么IDE里pom.xml中这两个Maven插件总标红?是不是版本没写对? - CSDN文库[ https://wenku.csdn.net/answer/1vb5dxhn8d](https://wenku.csdn.net/answer/1vb5dxhn8d)

\[234] Spring Boot 在 CI/CD 流水线中的最佳实践:Maven、Docker 与 GitHub Actions\_maven:3.9-eclipse-temurin-21-CSDN博客[ https://blog.csdn.net/m0\_65592409/article/details/151796765](https://blog.csdn.net/m0_65592409/article/details/151796765)

\[235] 使用ClassFinal插件加密Spring Boot Jar包防止反编译[ https://www.iesdouyin.com/share/video/7502402438398364955](https://www.iesdouyin.com/share/video/7502402438398364955)

\[236] maven-surefire-plugin总结-CSDN博客[ https://blog.csdn.net/dayo9317/article/details/102102208](https://blog.csdn.net/dayo9317/article/details/102102208)

\[237] Usage[ https://maven.apache.org/surefire/maven-surefire-plugin/usage.html](https://maven.apache.org/surefire/maven-surefire-plugin/usage.html)

\[238] Maven项目集成生成式单元测试:Surefire插件配置指南-图灵课堂[ https://m.tulingxueyuan.cn/tlzx/jsp/20644.html](https://m.tulingxueyuan.cn/tlzx/jsp/20644.html)

\[239] Spring Boot 多模块项目依赖管理:父工程与子工程的区别与最佳实践-CSDN博客[ https://blog.csdn.net/Anmory/article/details/158580802](https://blog.csdn.net/Anmory/article/details/158580802)

\[240] Spring Boot 多模块项目最佳实践:打造清晰、可维护的微服务骨架\_码农老王[ http://m.toutiao.com/group/7619187583708496425/](http://m.toutiao.com/group/7619187583708496425/)

\[241] 🍃Spring Boot 多模块项目中 Parent / BOM / Starter 的正确分工 🍃Spring B - 掘金[ https://juejin.cn/post/7593943464053915658](https://juejin.cn/post/7593943464053915658)

\[242] 解析Spring Boot Starter模块的依赖管理与自动配置机制[ https://www.iesdouyin.com/share/video/7598754063869545774](https://www.iesdouyin.com/share/video/7598754063869545774)

\[243] idea创建一个spring boot工程覆合工程\_Spring Boot多模块间依赖配置\_ - CSDN文库[ https://wenku.csdn.net/answer/4prm4n4g5v](https://wenku.csdn.net/answer/4prm4n4g5v)

\[244] POM构造Spring boot多模块项目\_springboot中拆分pom-CSDN博客[ https://blog.csdn.net/weixin\_39766667/article/details/157352760](https://blog.csdn.net/weixin_39766667/article/details/157352760)

\[245] Maven ＜dependencyManagement＞:如何在多模块项目中集中管理依赖版本-CSDN博客[ https://blog.csdn.net/qq\_46548855/article/details/156274974](https://blog.csdn.net/qq_46548855/article/details/156274974)

\[246] Java 工程化实践 Maven 多模块构建与依赖冲突解决方案-CSDN博客[ https://blog.csdn.net/yA00TJ6EL/article/details/153459583](https://blog.csdn.net/yA00TJ6EL/article/details/153459583)

\[247] POM构造Spring boot多模块项目\_springboot中拆分pom-CSDN博客[ https://blog.csdn.net/weixin\_39766667/article/details/157352760](https://blog.csdn.net/weixin_39766667/article/details/157352760)

\[248] 微服务聚合工程搭建方法及SpringCloud应用解析[ https://www.iesdouyin.com/share/video/7340117333890878771](https://www.iesdouyin.com/share/video/7340117333890878771)

\[249] 使用Spring Boot实现模块化\_51CTO博客\_mob64ca13f6bbea的技术博客\_51CTO博客[ https://blog.51cto.com/u\_16213577/14435124](https://blog.51cto.com/u_16213577/14435124)

\[250] 【AI总结】Spring Boot单体、多模块、微服务项目核心区分-CSDN博客[ https://blog.csdn.net/AlienProgrammer/article/details/158974097](https://blog.csdn.net/AlienProgrammer/article/details/158974097)

\[251] 入门 | 创建多模块项目 - Spring 框架[ https://springframework.org.cn/guides/gs/multi-module/](https://springframework.org.cn/guides/gs/multi-module/)

\[252] Spring Boot 4.0 模块化单体架构设计:比微服务更务实的选择\_从程序员到架构师[ http://m.toutiao.com/group/7607633333828305449/](http://m.toutiao.com/group/7607633333828305449/)

\[253] Maven多模块项目架构设计:聚合、继承与依赖治理\_多模块聚合架构-CSDN博客[ https://blog.csdn.net/lilinhai548/article/details/148688371](https://blog.csdn.net/lilinhai548/article/details/148688371)

\[254] 深入拆解Maven多模块架构:从核心机制到实战落地-CSDN博客[ https://jigang.blog.csdn.net/article/details/151368204](https://jigang.blog.csdn.net/article/details/151368204)

\[255] Maven 多模块项目支持嵌套子模块结构的完整实践指南-java教程-PHP中文网[ https://m.php.cn/faq/2214728.html](https://m.php.cn/faq/2214728.html)

\[256] Java依赖传递机制解析与版本冲突处理策略[ https://www.iesdouyin.com/share/video/7501555268779380027](https://www.iesdouyin.com/share/video/7501555268779380027)

\[257] 基于 Maven 的多模块项目架构-CSDN博客[ https://blog.csdn.net/czlczl20020925/article/details/157729853](https://blog.csdn.net/czlczl20020925/article/details/157729853)

\[258] Maven多模块项目实战:企业级架构设计中的7个最佳实践-CSDN博客[ https://blog.csdn.net/VarPerch/article/details/153259304](https://blog.csdn.net/VarPerch/article/details/153259304)

\[259] Guide to Working with Multiple Subprojects in Maven 4[ https://maven.apache.org/guides/mini/guide-multiple-subprojects-4.html](https://maven.apache.org/guides/mini/guide-multiple-subprojects-4.html)

\[260] Maven使用说明-CSDN博客[ https://blog.csdn.net/alspd\_zhangpan/article/details/155783224](https://blog.csdn.net/alspd_zhangpan/article/details/155783224)

\[261] Introduction to the Build Lifecycle[ https://maven.apache.org/guides/introduction/introduction-to-the-lifecycle.html](https://maven.apache.org/guides/introduction/introduction-to-the-lifecycle.html)

\[262] 《Mavan官方文档》构建生命周期介绍-CSDN博客[ https://blog.csdn.net/weixin\_33849215/article/details/90567283](https://blog.csdn.net/weixin_33849215/article/details/90567283)

\[263] 【Maven 构建工具】Maven 生命周期完全解读:clean / default / site 三套生命周期与常用命令\_maven site命令详解-CSDN博客[ https://blog.csdn.net/2301\_80035882/article/details/157654660](https://blog.csdn.net/2301_80035882/article/details/157654660)

\[264] Maven依赖管理与Spring Boot应用构建指南[ https://www.iesdouyin.com/share/video/7495402248412335419](https://www.iesdouyin.com/share/video/7495402248412335419)

\[265] Maven使用说明-CSDN博客[ https://blog.csdn.net/alspd\_zhangpan/article/details/155783224](https://blog.csdn.net/alspd_zhangpan/article/details/155783224)

\[266] 【Maven生命周期和插件】-CSDN博客[ https://lixiutao.blog.csdn.net/article/details/156070017](https://lixiutao.blog.csdn.net/article/details/156070017)

\[267] Guide to Working with Multiple Modules[ https://maven.apache.org/guides/mini/guide-multiple-modules](https://maven.apache.org/guides/mini/guide-multiple-modules)

\[268] Maven多模块开发:高效构建复杂项目-CSDN博客[ https://blog.csdn.net/chen\_si\_shang\_/article/details/158099485](https://blog.csdn.net/chen_si_shang_/article/details/158099485)

\[269] 在 Maven 中跳过单元测试进行本地打包或排除某个项目进行打包\_mvn clean package -pl service-a -am什么意思-CSDN博客[ https://blog.csdn.net/xu990128638/article/details/157213304](https://blog.csdn.net/xu990128638/article/details/157213304)

\[270] 如何用Maven跳过指定模块打包?\_编程语言-CSDN问答[ https://ask.csdn.net/questions/9111324](https://ask.csdn.net/questions/9111324)

\[271] Spring Boot多模块项目打包时，怎样跳过指定模块不参与构建? - CSDN文库[ https://wenku.csdn.net/answer/6ou0jkw2f1](https://wenku.csdn.net/answer/6ou0jkw2f1)

\[272] Maven安装配置与命令行使用全解析[ https://www.iesdouyin.com/share/video/7455629477675011347](https://www.iesdouyin.com/share/video/7455629477675011347)

\[273] 如何配置Maven跳过特定模块编译错误?\_编程语言-CSDN问答[ https://ask.csdn.net/questions/8823825](https://ask.csdn.net/questions/8823825)

\[274] 如何用mvn package只打包指定服务模块?\_编程语言-CSDN问答[ https://ask.csdn.net/questions/9150236](https://ask.csdn.net/questions/9150236)

\[275] Skipping Tests[ https://maven.apache.org/surefire/maven-failsafe-plugin/examples/skipping-tests.html](https://maven.apache.org/surefire/maven-failsafe-plugin/examples/skipping-tests.html)

\[276] JAVA开发工具——Maven项目编译工具\_maven snapshot-CSDN博客[ https://blog.csdn.net/weixin\_41605937/article/details/145735141](https://blog.csdn.net/weixin_41605937/article/details/145735141)

\[277] Guide to Working with Multiple Modules[ https://maven.apache.org/guides/mini/guide-multiple-modules.html?ref=rob-ferguson](https://maven.apache.org/guides/mini/guide-multiple-modules.html?ref=rob-ferguson)

\[278] 《Maven 实战》读书笔记(八) 反应堆-CSDN博客[ https://blog.csdn.net/cafebabyx/article/details/88347136](https://blog.csdn.net/cafebabyx/article/details/88347136)

\[279] Настроить порядок сборки для мультипроекта в Maven[ https://ask-dev.ru/info/174925/impose-build-order-for-a-multi-project-in-maven](https://ask-dev.ru/info/174925/impose-build-order-for-a-multi-project-in-maven)

\[280] Maven 之父 一个 设计 出 Maven 的 核心 原型 ， 用 一套 工具 ( Maven ) 定义 全球 Java 项目 的 构建 标准 ， Java 构建 与 持续 集成 时代 的 开创 之人 —— Jason van Zyl # 程序员 # 编程 # java # 计算机 # 互联网[ https://www.iesdouyin.com/share/video/7614801853348086970](https://www.iesdouyin.com/share/video/7614801853348086970)

\[281] Maven build order (Multiple modules) \[duplicate][ https://exchangetuts.com/maven-build-order-multiple-modules-duplicate-1640143863782014](https://exchangetuts.com/maven-build-order-multiple-modules-duplicate-1640143863782014)

\[282] 必备技能:Maven多模块智能构建指南-CSDN博客[ https://blog.csdn.net/weixin\_44421461/article/details/150941583](https://blog.csdn.net/weixin_44421461/article/details/150941583)

\[283] 按需构建多模块，玩转Maven反应堆-CSDN博客[ https://blog.csdn.net/iteye\_11035/article/details/81815621](https://blog.csdn.net/iteye_11035/article/details/81815621)

\[284] Maven——使用多个模块的指南[ https://maven.org.cn/guides/mini/guide-multiple-modules.html](https://maven.org.cn/guides/mini/guide-multiple-modules.html)

\[285] POM构造Spring boot多模块项目\_springboot中拆分pom-CSDN博客[ https://blog.csdn.net/weixin\_39766667/article/details/157352760](https://blog.csdn.net/weixin_39766667/article/details/157352760)

\[286] spring boot gradle kotlin script 多模块 配置公共resource资源\_gradle kotlin resources-CSDN博客[ https://blog.csdn.net/soslinken/article/details/92840281](https://blog.csdn.net/soslinken/article/details/92840281)

\[287] 微服务项目中sa-token依赖隔离与整合注意事项[ https://www.iesdouyin.com/share/video/7594063973113171254](https://www.iesdouyin.com/share/video/7594063973113171254)

\[288] Spring Boot 模块化架构实战:根治配置膨胀，提速30%\_从程序员到架构师[ http://m.toutiao.com/group/7616624905673359913/](http://m.toutiao.com/group/7616624905673359913/)

\[289] Spring Boot 多模块项目中优雅实现自动配置(基于 AutoConfiguration.imports)-CSDN博客[ https://blog.csdn.net/qq\_46548855/article/details/156280095](https://blog.csdn.net/qq_46548855/article/details/156280095)

\[290] 使用Spring Boot实现模块化\_51CTO博客\_mob64ca13f6bbea的技术博客\_51CTO博客[ https://blog.51cto.com/u\_16213577/14435124](https://blog.51cto.com/u_16213577/14435124)

\[291] 入门 | 创建多模块项目 - Spring 框架[ https://springframework.org.cn/guides/gs/multi-module/](https://springframework.org.cn/guides/gs/multi-module/)

\[292] java maven 打包。解决循环依赖， - CSDN文库[ https://wenku.csdn.net/answer/3t0ai9h0jw](https://wenku.csdn.net/answer/3t0ai9h0jw)

\[293] java maven 解决循环依赖 本地测试 - CSDN文库[ https://wenku.csdn.net/answer/270jfej4m7](https://wenku.csdn.net/answer/270jfej4m7)

\[294] Maven 避坑指南:高频配置错误总结 & 解决方案-CSDN博客[ https://blog.csdn.net/firefish001/article/details/158840680](https://blog.csdn.net/firefish001/article/details/158840680)

\[295] 使用mvn dependency:tree命令解决jar包冲突[ https://www.iesdouyin.com/share/video/7421356370890460456](https://www.iesdouyin.com/share/video/7421356370890460456)

\[296] Java 工程化实践 Maven 多模块构建与依赖冲突解决方案-CSDN博客[ https://blog.csdn.net/2501\_93740756/article/details/153309065](https://blog.csdn.net/2501_93740756/article/details/153309065)

\[297] 无法构建 artifact 'devicemanage:war exploded'，因为它处在一个循环依赖关系中(artifact 'devicemanage:war exploded', artifact 'devicemanage-master:war exploded') - CSDN文库[ https://wenku.csdn.net/answer/5wpfuizrpf](https://wenku.csdn.net/answer/5wpfuizrpf)

\[298] 如何解决模块间依赖导致的JAR打包失败?\_编程语言-CSDN问答[ https://ask.csdn.net/questions/8974953](https://ask.csdn.net/questions/8974953)

\[299] 解决maven依赖冲突问题\_gulaotou的技术博客\_51CTO博客[ https://blog.51cto.com/u\_15444/14336533](https://blog.51cto.com/u_15444/14336533)

\[300] Spring Boot 多模块项目依赖管理:父工程与子工程的区别与最佳实践-CSDN博客[ https://blog.csdn.net/Anmory/article/details/158580802](https://blog.csdn.net/Anmory/article/details/158580802)

\[301] 别再死守SpringBootParent了!这个MavenParent方案更灵活更强大\_从程序员到架构师[ http://m.toutiao.com/group/7597350725055791622/](http://m.toutiao.com/group/7597350725055791622/)

\[302] Spring Boot 项目构建的三大插件说明-CSDN博客[ https://blog.csdn.net/jwbabc/article/details/158804951](https://blog.csdn.net/jwbabc/article/details/158804951)

\[303] 深入拆解Maven多模块架构:从核心机制到实战落地-CSDN博客[ https://blog.csdn.net/ZuanShi1111/article/details/151368204](https://blog.csdn.net/ZuanShi1111/article/details/151368204)

\[304] Spring Boot开发者必看!Maven不是“玄学”，吃透这几点告别踩坑\_知识大胖[ http://m.toutiao.com/group/7614858513747132955/](http://m.toutiao.com/group/7614858513747132955/)

\[305] Spring Boot 多模块项目里，子模块怎么复用父 POM 的依赖和插件配置? - CSDN文库[ https://wenku.csdn.net/answer/81gxbvvpxe](https://wenku.csdn.net/answer/81gxbvvpxe)

\[306] POM构造Spring boot多模块项目\_springboot中拆分pom-CSDN博客[ https://blog.csdn.net/weixin\_39766667/article/details/157352760](https://blog.csdn.net/weixin_39766667/article/details/157352760)

> （注：文档部分内容可能由 AI 生成）