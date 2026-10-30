# Maven 命令速查表（极简可保存版）

## 一、日常开发（必背）

1. **清理编译产物**

`mvn clean`

1. **编译代码**

`mvn compile`

1. **运行项目（SpringBoot）**

`mvn spring-boot:run`

1. **打包成 jar/war**

`mvn package`

1. **打包并安装到本地仓库**

`mvn install`

1. **清理 + 重新编译安装（最常用）**

`mvn clean install`

## 二、依赖与冲突（排错神器）

1. **查看依赖树（找冲突）**

`mvn dependency:tree`

1. **强制更新所有依赖**

`mvn clean install -U`

1. **重新下载并修复依赖**

`mvn dependency:purge-local-repository`

## 三、常用组合（直接复制）

1. **强制更新 + 跳过测试（报错急救）**

`mvn clean install -U -DskipTests`

1. **只编译不打包**

`mvn clean compile`

1. **打包但不跑测试**

`mvn package -DskipTests`

## 四、通用参数

- `-U`：强制更新依赖

- `-DskipTests`：跳过单元测试

- `-X`：输出详细调试日志

---

我可以把这张速查表做成**简洁长图**，你直接保存到手机/桌面随时看，需要吗？
> （注：文档部分内容可能由 AI 生成）