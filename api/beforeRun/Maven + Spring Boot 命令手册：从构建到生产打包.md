# Maven + Spring Boot 命令手册：从构建到生产打包

这里给你整理**一套完整、精简、实战可用**的 Maven + Spring Boot 操作命令合集，直接复制就能用。

# Maven + Spring Boot 完整命令手册

## 1. 项目构建

```Bash

# 编译
mvn compile

# 清理 + 编译
mvn clean compile

# 打包成 jar
mvn clean package

# 打包并跳过测试（开发最快）
mvn clean package -DskipTests

# 打包并安装到本地仓库
mvn clean install -DskipTests
```

## 2. 开发环境运行（最常用）

```Bash

# 直接启动
mvn spring-boot:run

# 启动并使用 dev 环境
mvn spring-boot:run -Dspring.profiles.active=dev

# dev 环境 + 跳过测试
mvn spring-boot:run -DskipTests -Dspring.profiles.active=dev

# dev 环境 + 指定端口
mvn spring-boot:run -Dspring.profiles.active=dev -Dserver.port=8080
```

## 3. 调试模式启动

```Bash

# 开启远程调试（端口 5005）
mvn spring-boot:run -Dspring.profiles.active=dev \
  -Dspring-boot.run.jvmArguments="-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=5005"
```

## 4. 依赖管理与排查

```Bash

# 查看依赖树
mvn dependency:tree

# 强制更新依赖
mvn clean package -U -DskipTests

# 下载源码
mvn dependency:sources
```

## 5. 一键开发启动（推荐）

```Bash

mvn clean spring-boot:run -DskipTests -Dspring.profiles.active=dev -Dserver.port=8080
```

## 6. 一键生产打包（推荐）

```Bash

mvn clean package -DskipTests -Pprod
```

## 7. 配套必备插件（pom.xml）

```XML

<build>
    <plugins>
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
            </configuration>
        </plugin>
    </plugins>
</build>
```

你要的话我还能帮你做成**可直接保存的 .sh / .bat 启动脚本**。
> （注：文档部分内容可能由 AI 生成）