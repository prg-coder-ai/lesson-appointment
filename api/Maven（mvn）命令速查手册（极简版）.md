# Maven（mvn）命令速查手册（极简版）

专为日常开发整理，**常用命令+高频场景**，直接复制用，覆盖 99% 开发需求，适配Java项目常规开发、打包、部署流程

## 一、基础必备（环境/初始化）

```Bash

# 查看 mvn 版本（验证环境是否配置成功）
mvn -v
mvn --version  # 完整写法

# 初始化 Maven 项目（生成标准项目结构）
mvn archetype:generate -DgroupId=com.example -DartifactId=demo -Dversion=1.0.0 -DinteractiveMode=false
# 说明：groupId（项目组ID）、artifactId（项目名）可自行修改，-DinteractiveMode=false 跳过交互直接生成
```

## 二、项目构建（核心）

### 1. 基础构建命令

```Bash

# 编译项目（将.java文件编译为.class文件，输出到target目录）
mvn compile

# 清理构建产物（删除target目录，清除编译、打包生成的文件）
mvn clean

# 测试（执行src/test下的测试用例，依赖compile命令）
mvn test

# 打包（生成jar/war包，默认输出到target目录）
mvn package
# 打包前先清理、编译、测试（常用组合）
mvn clean package
```

### 2. 打包跳过测试（高频）

```Bash

# 跳过测试编译和测试执行，快速打包（开发调试常用）
mvn clean package -DskipTests

# 完全跳过测试相关（不编译测试类，更快）
mvn clean package -Dmaven.test.skip=true
```

### 3. 安装依赖到本地仓库

```Bash

# 将当前项目打包后，安装到本地Maven仓库（供其他本地项目依赖）
mvn install

# 安装指定jar包到本地仓库（本地jar包无法从远程仓库下载时用）
mvn install:install-file -Dfile=xxx.jar -DgroupId=com.example -DartifactId=xxx -Dversion=1.0.0 -Dpackaging=jar
```

## 三、依赖管理（查看/更新）

```Bash

# 查看项目所有依赖（树形结构，清晰展示依赖层级、冲突）
mvn dependency:tree

# 分析依赖冲突（找出冲突的依赖包及版本）
mvn dependency:analyze-conflicts

# 更新项目依赖（将pom.xml中指定版本范围的依赖更新到最新可用版本）
mvn versions:use-latest-releases

# 查看可更新的依赖（不实际更新，仅列出可更新项）
mvn versions:display-dependency-updates
```

## 四、项目部署（发布）

```Bash

# 将打包后的产物发布到远程Maven仓库（需在pom.xml配置仓库地址）
mvn deploy

# 清理后部署（常用组合）
mvn clean deploy -DskipTests
```

## 五、常用插件命令（高频场景）

```Bash

# 运行Spring Boot项目（Spring Boot项目专用）
mvn spring-boot:run

# 生成项目文档（根据pom.xml和代码注释生成文档）
mvn site

# 检查代码格式（需配置checkstyle插件）
mvn checkstyle:check

# 打包可执行jar包（Spring Boot项目，生成可直接运行的jar）
mvn clean package spring-boot:repackage
```

## 六、仓库配置（镜像/源）

```Bash

# 查看当前Maven配置（查看settings.xml配置信息）
mvn help:effective-settings

# 切换国内镜像（推荐阿里云，解决下载慢问题）
# 方式：修改Maven安装目录/conf/settings.xml，在mirrors标签中添加
# <mirror>
#   <id>aliyunmaven</id>
#   <mirrorOf>central</mirrorOf>
#   <url>https://maven.aliyun.com/repository/public</url>
# </mirror>
```

## 七、其他常用命令

```Bash

# 查看Maven帮助（查看所有可用命令及说明）
mvn help:help

# 查看指定命令的详细说明（例：查看package命令详情）
mvn help:describe -Dcmd=package

# 强制更新依赖（忽略本地缓存，重新从远程仓库下载依赖）
mvn clean package -U
```

## 八、常用场景速查

1. **初始化项目**：`mvn archetype:generate -DgroupId=com.example -DartifactId=demo -Dversion=1.0.0 -DinteractiveMode=false`

2. **编译项目**：`mvn compile`

3. **清理+打包（跳过测试）**：`mvn clean package -DskipTests`

4. **运行Spring Boot项目**：`mvn spring-boot:run`

5. **查看依赖树**：`mvn dependency:tree`

6. **安装项目到本地仓库**：`mvn install`

7. **强制更新依赖并打包**：`mvn clean package -U`

---

### 总结

1. 核心组合命令：clean（清理）、compile（编译）、package（打包）、install（安装）、deploy（部署），可按需组合

2. 跳过测试用 `-DskipTests`（常用）或 `-Dmaven.test.skip=true`（快速），避免测试失败影响打包

3. 国内必配置阿里云镜像，解决依赖下载慢、失败问题；依赖冲突用 `mvn dependency:tree` 排查
> （注：文档部分内容可能由 AI 生成）