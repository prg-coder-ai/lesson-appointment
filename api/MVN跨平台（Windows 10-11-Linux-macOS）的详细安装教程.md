安装 Maven（mvn）是开发 Java/Spring Boot 项目的基础步骤，以下是**跨平台（Windows 10/11、Linux、macOS）的详细安装教程**，包含环境配置、验证、镜像优化（解决依赖下载慢），适配新手友好性。

### 一、前置条件
安装 Maven 前必须先安装 **JDK**（Maven 3.9+ 要求 JDK 8+，Spring Boot 3.x 建议 JDK 17+）：
```bash
# 验证JDK是否安装（全平台通用）
java -version
# 正常输出：java version "17.0.8" 或 "1.8.0_391"
```
若未安装 JDK，先安装并配置 `JAVA_HOME` 环境变量（关键！）。

### 二、Windows 10/11 安装 Maven
#### 步骤1：下载 Maven 安装包
1. 访问 [Maven 官方下载页](https://maven.apache.org/download.cgi)；
2. 选择「Binary zip archive」（二进制压缩包，无需安装），如 `apache-maven-3.9.6-bin.zip`；
3. 下载后解压到**非中文、无空格**的目录，如 `D:\apache-maven-3.9.6`。

#### 步骤2：配置系统环境变量
1. 右键「此电脑」→「属性」→「高级系统设置」→「环境变量」；
2. **新建系统变量**：
   - 变量名：`MAVEN_HOME`
   - 变量值：`D:\apache-maven-3.9.6`（Maven 解压根目录）；
3. **编辑 Path 变量**：
   - 在「系统变量 → Path」中新增：`%MAVEN_HOME%\bin`；
4. 点击「确定」保存所有配置（需重启命令行生效）。

#### 步骤3：验证安装
打开「命令提示符/Windows 终端/PowerShell」，执行：
```bash
mvn -v
```
✅ 正常输出如下表示安装成功：
```
Apache Maven 3.9.6 (bc0240f3c744dd6b6ec2920b3cd08dcc295161ae)
Maven home: D:\apache-maven-3.9.6
Java version: 17.0.8, vendor: Oracle Corporation, runtime: D:\jdk-17.0.8
```

### 三、Linux 安装 Maven（以 CentOS/Ubuntu 为例）
#### 方式1：手动安装（推荐，版本可控）
1. 下载并解压 Maven：
   ```bash
   # 下载（替换为最新版本）
   wget https://dlcdn.apache.org/maven/maven-3/3.9.6/binaries/apache-maven-3.9.6-bin.tar.gz
   # 解压到/usr/local目录
   tar -zxvf apache-maven-3.9.6-bin.tar.gz -C /usr/local/
   # 重命名（可选，简化路径）
   mv /usr/local/apache-maven-3.9.6 /usr/local/maven
   ```

2. 配置环境变量：
   ```bash
   # 编辑profile文件
   vi /etc/profile
   # 在文件末尾添加以下内容
   export MAVEN_HOME=/usr/local/maven
   export PATH=$MAVEN_HOME/bin:$PATH
   # 生效配置
   source /etc/profile
   ```

3. 验证安装：
   ```bash
   mvn -v
   ```

#### 方式2：yum/apt 安装（快速，版本可能较旧）
```bash
# CentOS/RHEL
yum install -y maven

# Ubuntu/Debian
apt update && apt install -y maven
```

### 四、macOS 安装 Maven
#### 方式1：手动安装（同 Linux）
1. 下载解压到 `/usr/local/`：
   ```bash
   curl -O https://dlcdn.apache.org/maven/maven-3/3.9.6/binaries/apache-maven-3.9.6-bin.tar.gz
   tar -zxvf apache-maven-3.9.6-bin.tar.gz -C /usr/local/
   mv /usr/local/apache-maven-3.9.6 /usr/local/maven
   ```

2. 配置环境变量（编辑 `~/.zshrc` 或 `~/.bash_profile`）：
   ```bash
   vi ~/.zshrc
   # 添加以下内容
   export MAVEN_HOME=/usr/local/maven
   export PATH=$MAVEN_HOME/bin:$PATH
   # 生效配置
   source ~/.zshrc
   ```

#### 方式2：Homebrew 安装（推荐，一键搞定）
```bash
# 安装Homebrew（未安装的话）
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
# 安装Maven
brew install maven
```

### 五、关键优化：配置阿里云 Maven 镜像（解决依赖下载慢）
Maven 默认从中央仓库下载依赖，国内速度慢，需配置阿里云镜像：
1. 找到 Maven 的配置文件 `settings.xml`：
   - 路径：`MAVEN_HOME/conf/settings.xml`（全局配置），或 `~/.m2/settings.xml`（用户级配置，推荐）；
   - 若 `~/.m2` 目录无 `settings.xml`，复制 `MAVEN_HOME/conf/settings.xml` 到 `~/.m2/` 再修改。

2. 编辑 `settings.xml`，在 `<mirrors>` 标签内添加阿里云镜像：
   ```xml
   <mirrors>
     <!-- 阿里云中央仓库镜像 -->
     <mirror>
       <id>aliyunmaven</id>
       <name>阿里云公共仓库</name>
       <url>https://maven.aliyun.com/repository/public</url>
       <mirrorOf>central</mirrorOf> <!-- 替代默认中央仓库 -->
     </mirror>
   </mirrors>
   ```

3. 可选：配置本地仓库路径（默认 `~/.m2/repository`），在 `<settings>` 标签内添加：
   ```xml
   <localRepository>D:\maven-repo</localRepository> <!-- Windows -->
   <!-- <localRepository>/usr/local/maven-repo</localRepository> <!-- Linux/macOS -->
   ```

### 六、常见问题与避坑指南
#### 1. `mvn -v` 提示「不是内部或外部命令」（Windows）
- 原因：环境变量配置错误/未重启命令行；
- 解决：
  1. 检查 `MAVEN_HOME` 是否指向 Maven 根目录（含 `bin` 文件夹）；
  2. 检查 `Path` 中是否添加 `%MAVEN_HOME%\bin`；
  3. 重启命令行工具（CMD/PowerShell）。

#### 2. 依赖下载失败/速度慢
- 原因：未配置国内镜像，或网络问题；
- 解决：确认阿里云镜像配置正确，或切换手机热点测试。

#### 3. `mvn -v` 提示「JAVA_HOME is not defined correctly」
- 原因：`JAVA_HOME` 配置错误（指向 JRE 而非 JDK）；
- 解决：`JAVA_HOME` 需指向 JDK 根目录（如 `D:\jdk-17.0.8`），而非 `jre` 子目录。

### 总结
1. Maven 安装核心步骤：下载解压 → 配置 `MAVEN_HOME` 和 `Path` → 验证；
2. 跨平台差异：Windows 需手动配置环境变量，Linux/macOS 可通过命令行/包管理器安装；
3. 关键优化：配置阿里云镜像，大幅提升依赖下载速度；
4. 验证标准：`mvn -v` 能输出 Maven 版本、JDK 路径即为安装成功。

安装完成后，即可在命令行中执行 `mvn clean package`、`mvn spring-boot:run` 等命令编译运行 Spring Boot 项目。