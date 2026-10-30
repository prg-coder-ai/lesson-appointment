# HTML+JavaScript前端 + Spring Boot API 合并（完整目录+配置+开发启动步骤）

## 一、完整项目目录结构（最终合并后，非8080端口）

核心说明：前端HTML+JS放templates（动态页面）和static（JS/CSS/静态资源），后端API、数据库代码放java目录，所有配置集中在resources，统一打包为1个jar包，启动即可运行。

```plain text
spring-boot-merge-project/  # 合并后的总项目名（可自定义）
├── src/
│   └── main/
│       ├── java/            # 后端核心目录（API、业务、数据库）
│       │   └── com/
│       │       └── yourpackage/  # 你的包名（自定义，如com.alberta.drive）
│       │           ├── SpringBootMergeApplication.java  # 项目主类（启动类）
│       │           ├── controller/  # 控制器（页面渲染+API接口）
│       │           │   └── IndexController.java  # 核心控制器（关联前端+后端）
│       │           ├── service/     # 业务逻辑层（操作数据库）
│       │           │   ├── DataService.java       # 接口
│       │           │   └── DataServiceImpl.java   # 实现类
│       │           ├── mapper/      # 数据访问层（连接数据库）
│       │           │   └── DataMapper.java        # 数据库查询接口（MyBatis示例）
│       │           └── entity/      # 实体类（对应数据库表）
│       │               └── Data.java               # 数据实体（和数据库字段对应）
│       └── resources/        # 配置+前端资源目录
│           ├── templates/    # ✅ 动态HTML页面（需读取数据库，核心目录）
│           │   ├── index.html       # 主页面（HTML+JS，动态渲染数据）
│           │   ├── page1.html       # 其他动态页面（可选）
│           │   └── page2.html       # 其他动态页面（可选）
│           ├── static/       # ✅ 前端静态资源（JS/CSS/图片/字体）
│           │   ├── js/       # JavaScript文件（请求API、渲染数据）
│           │   │   ├── main.js       # 主JS（页面交互、数据请求）
│           │   │   └── api.js        # API请求封装（统一调用后端接口）
│           │   ├── css/      # 样式文件
│           │   │   └── style.css     # 页面样式
│           │   └── images/   # 图片资源（图标、背景等）
│           ├── application.properties  # 核心配置文件（端口、数据库、模板引擎）
│           └── mybatis/      # MyBatis配置（若用MyBatis，可选）
│               └── mapper/
│                   └── DataMapper.xml  # 数据库查询SQL（MyBatis示例）
├── pom.xml                   # 项目依赖（模板引擎、web、数据库等）
└── target/                   # 打包后目录（自动生成，包含可运行jar包）
```

## 二、核心配置数据（全部可直接复制，替换占位符即可）

### 1. pom.xml 依赖配置（核心必加，其他原有依赖保留）

核心依赖：Spring Web（API基础）、Thymeleaf（动态页面渲染）、数据库驱动（MySQL示例）、MyBatis（数据访问，可选，也可换JPA）

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>2.7.15</version> <!-- 稳定版本，可根据需求升级 -->
        <relativePath/> <!-- lookup parent from repository -->
    </parent>
    <groupId>com.yourpackage</groupId> <!-- 替换为你的包名 -->
    <artifactId>spring-boot-merge-project</artifactId> <!-- 替换为你的项目名 -->
    <version>0.0.1-SNAPSHOT</version>
    <name>spring-boot-merge-project</name>
    <description>HTML+JS前端 + Spring Boot API 合并项目</description>

    <properties>
        <java.version>1.8</java.version> <!-- 对应你的JDK版本，可改11/17 -->
    </properties>

    <dependencies>
        <!-- 1. 核心依赖：Web（API基础） -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>

        <!-- 2. 核心依赖：Thymeleaf（动态页面渲染，必须加，支持HTML+JS读取后端数据） -->
        <dependency>
            <groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-thymeleaf</artifactId>
        </dependency>

        <!-- 3. 数据库依赖：MySQL驱动（根据你的数据库替换，如Oracle/SQL Server） -->
        <dependency>
            <groupId>mysql</groupId>
            <artifactId>mysql-connector-java</artifactId>
            <scope>runtime</scope>
        </dependency>

        <!-- 4. 数据访问：MyBatis（可选，若用JPA可替换为spring-boot-starter-data-jpa） -->
        <dependency>
            <groupId>org.mybatis.spring.boot</groupId>
            <artifactId>mybatis-spring-boot-starter</artifactId>
            <version>2.3.1</version>
        </dependency>

        <!-- 5. 工具依赖：lombok（简化实体类，可选，推荐） -->
        <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <optional>true</optional>
        </dependency>

        <!-- 测试依赖（可选） -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <!-- Spring Boot 打包插件（必须加，打包为可运行jar） -->
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

### 2. application.properties 核心配置（非8080端口，必改）

替换端口、数据库地址、用户名、密码即可，其他配置默认无需修改，适配HTML+JS动态页面。

```properties
# ======================== 端口配置（核心，替换为你的非8080端口，示例8088） ========================
server.port=8088  # 重点：替换为你实际使用的端口，如8090、9000等，避免8080冲突

# ======================== 模板引擎配置（适配HTML+JS动态页面，无需修改） ========================
# Thymeleaf缓存关闭（开发时方便调试，修改页面无需重启项目）
spring.thymeleaf.cache=false
# 动态页面所在目录（对应templates文件夹，固定路径）
spring.thymeleaf.prefix=classpath:/templates/
# 页面后缀（固定为.html，适配你的HTML前端）
spring.thymeleaf.suffix=.html
# 编码格式（避免中文乱码）
spring.thymeleaf.encoding=UTF-8
spring.thymeleaf.mode=HTML5

# ======================== 数据库配置（替换为你的数据库信息） ========================
# 数据库URL（MySQL示例，替换IP、端口、数据库名）
spring.datasource.url=jdbc:mysql://localhost:3306/your_database?useUnicode=true&characterEncoding=utf8&useSSL=false&serverTimezone=UTC
# 数据库用户名（替换为你的MySQL用户名，如root）
spring.datasource.username=your_username
# 数据库密码（替换为你的MySQL密码）
spring.datasource.password=your_password
# 数据库驱动（MySQL8.0+无需修改，MySQL5.x改为com.mysql.jdbc.Driver）
spring.datasource.driver-class-name=com.mysql.cj.jdbc.Driver

# ======================== MyBatis配置（若用MyBatis，可选） ========================
# 实体类包路径（替换为你的entity包路径）
mybatis.type-aliases-package=com.yourpackage.entity
# Mapper.xml文件路径（固定，对应resources/mybatis/mapper文件夹）
mybatis.mapper-locations=classpath:mybatis/mapper/*.xml
# 开启SQL日志（开发时方便调试，可选）
logging.level.com.yourpackage.mapper=debug

# ======================== 静态资源配置（适配JS/CSS/图片，无需修改） ========================
# 静态资源访问路径（对应static文件夹，页面可直接引用）
spring.mvc.static-path-pattern=/**
spring.web.resources.static-locations=classpath:/static/
```

### 3. 前端相关配置（HTML+JavaScript，核心联动后端）

#### （1）templates/index.html（动态页面，HTML+JS，读取数据库数据）

```html
<!DOCTYPE html>
动态页面（HTML+JS）从数据库读取的数据（HTML+JS动态渲染）<!-- 动态渲染区域（JS请求API获取数据，渲染到这里） -->
    <!-- 引用static文件夹下的JS（先引api.js，再引main.js，顺序不能乱） -->
    
```

#### （2）static/js/api.js（API请求封装，统一调用后端接口，适配非8080端口）

核心：请求地址用相对路径，无需写端口，端口由Spring Boot配置决定，避免端口冲突。

```javascript
// API请求封装（简化JS请求，避免重复代码）
const api = {
    // 后端API接口地址（相对路径，对应后端IndexController的API接口）
    getDataList: "/api/data/list"
};

// 封装GET请求（获取数据库数据，供main.js调用）
function getRequest(url, callback) {
    fetch(url, {
        method: "GET",
        headers: {
            "Content-Type": "application/json;charset=UTF-8"
        }
    })
    .then(response => response.json()) // 解析后端返回的JSON数据
    .then(data => {
        callback(data); // 回调函数，将数据传递给页面渲染
    })
    .catch(error => {
        console.error("API请求失败：", error);
    });
}
```

#### （3）static/js/main.js（页面交互+数据渲染，联动HTML和API）

```javascript
// 页面加载完成后，自动请求API，渲染数据库数据
window.onload = function() {
    // 调用api.js中的请求方法，获取数据库数据
    getRequest(api.getDataList, function(dataList) {
        // 获取渲染容器
        const container = document.getElementById("dataContainer");
        // 清空容器（避免重复渲染）
        container.innerHTML = "";
        
        // 循环渲染数据（根据后端返回的实体类字段调整，如item.id、item.name）
        dataList.forEach(item => {
            const itemDiv = document.createElement("div");
            itemDiv.className = "data-item";
            // 渲染数据（替换为你的实体类字段）
            itemDiv.innerHTML = `
                ID：${item.id}名称：${item.name}内容：${item.content}
            `;
            container.appendChild(itemDiv);
        });
    });
}
```

### 4. 后端核心代码（关联前端，提供页面+API，可直接复制）

#### （1）项目主类（SpringBootMergeApplication.java）

```java
package com.yourpackage;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

// 主类注解（固定）
@SpringBootApplication
// 扫描mapper目录（若用MyBatis，必须加，替换为你的mapper包路径）
@MapperScan("com.yourpackage.mapper")
public class SpringBootMergeApplication {

    public static void main(String[] args) {
        // 启动项目（固定）
        SpringApplication.run(SpringBootMergeApplication.class, args);
    }

}
```

#### （2）控制器（IndexController.java，核心：渲染页面+提供API）

```java
package com.yourpackage.controller;

import com.yourpackage.entity.Data;
import com.yourpackage.service.DataService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ResponseBody;

import java.util.List;

// 控制器注解（同时支持页面渲染和API接口）
@Controller
public class IndexController {

    // 注入业务层（自动装配，无需手动创建）
    @Autowired
    private DataService dataService;

    // 1. 渲染动态页面（HTML），访问路径：http://localhost:你的端口/
    @GetMapping("/")
    public String index() {
        // 跳转到templates/index.html页面（无需传参，JS将通过API请求数据）
        return "index";
    }

    // 2. 提供API接口（给JS调用，返回JSON数据），访问路径：http://localhost:你的端口/api/data/list
    @GetMapping("/api/data/list")
    @ResponseBody // 标记返回JSON，而非页面
    public List<Data> getDataList() {
        // 调用业务层，从数据库获取数据，返回给JS
        return dataService.getDataList();
    }

}
```

## 三、关键注意事项（必看，避免踩坑）

- 端口一致性：前端JS请求API时，无需写端口（用相对路径），只要Spring Boot配置的server.port正确，即可正常请求，避免端口冲突。

- 静态资源路径：CSS/JS/图片必须放在static目录下，页面引用时用“/css/xxx.css”“/js/xxx.js”，无需添加额外路径。

- Thymeleaf命名空间：HTML页面必须添加 xmlns:th="http://www.thymeleaf.org"，否则无法支持动态渲染（即使JS请求数据，也需保留，避免页面报错）。

- 数据库配置：必须替换application.properties中的数据库URL、用户名、密码，否则无法连接数据库，JS请求API会失败。

- JS请求顺序：必须先引入api.js（封装请求方法），再引入main.js（调用请求），否则会报“getRequest未定义”错误。

- 打包部署：合并后只需打包Spring Boot项目（mvn package），生成的jar包可直接运行（java -jar 包名.jar），无需单独部署前端。

## 四、开发阶段启动web服务和API服务（核心步骤）

核心说明：本项目为「前后端合并项目」，只需启动Spring Boot服务，即可同时启动Web服务（前端页面）和API服务，无需单独启动前端服务器（如nginx、live-server），简化开发流程。

### 前提准备（启动前必做）

1. 确认数据库已启动：打开本地MySQL（或其他数据库），确保数据库服务正常运行，且application.properties中配置的数据库名称、用户名、密码正确（需提前创建对应数据库）。

2. 确认依赖已加载：打开IDE（如IDEA、Eclipse），导入项目后，等待Maven自动下载pom.xml中的所有依赖，无红色报错（若有依赖报错，刷新Maven或手动下载对应依赖）。

3. 确认端口未被占用：打开cmd（Windows）或终端（Mac/Linux），输入命令 `netstat -ano | findstr 你的端口`（如8088），若无结果则端口未被占用；若有结果，关闭占用端口的进程，避免启动失败。

### 启动步骤（以IDEA为例，通用适配所有IDE）

1. 打开项目：在IDEA中打开合并后的spring-boot-merge-project项目，等待项目加载完成（底部状态栏无加载进度）。

2. 找到启动类：在左侧项目目录中，定位到 `com.yourpackage.SpringBootMergeApplication.java`（项目主类，带有@SpringBootApplication注解）。

3. 启动Spring Boot服务：
            

    - 方式1（右键启动）：右键点击SpringBootMergeApplication.java文件，选择「Run 'SpringBootMergeApplication'」（或「运行'SpringBootMergeApplication'」）。

    - 方式2（顶部启动）：找到IDEA顶部工具栏，选择SpringBootMergeApplication对应的启动按钮（绿色三角图标），点击启动。

4. 验证服务启动成功：启动后，查看底部「Run」控制台，出现以下信息即表示Web服务和API服务同时启动成功：
            `Tomcat started on port(s): 8088 (http) with context path ''
Started SpringBootMergeApplication in x.xxx seconds (JVM running for x.xxx)`
            （说明：8088为你配置的端口，若配置为其他端口，此处显示对应端口）
        

### 启动后验证（确保Web和API服务正常可用）

1. 验证Web服务（前端页面）：打开浏览器，输入 `http://localhost:你的端口/`（如http://localhost:8088/），能正常显示index.html页面，且无404、500错误，即Web服务启动成功。

2. 验证API服务：打开浏览器或Postman，输入 `http://localhost:你的端口/api/data/list`（如http://localhost:8088/api/data/list），能返回JSON格式的数据（即使为空数组，无报错），即API服务启动成功。

3. 验证动态渲染：若数据库中有数据，刷新Web页面（http://localhost:你的端口/），页面能正常渲染出数据库中的数据，即前后端联动成功。

### 开发阶段便捷调试技巧（提升效率）

- 前端调试：修改templates下的HTML、static下的CSS/JS后，无需重启Spring Boot服务，直接刷新浏览器即可生效（因application.properties中已配置spring.thymeleaf.cache=false，关闭了模板缓存）。

- 后端调试：修改Java代码（如Controller、Service、Mapper）后，需重启Spring Boot服务才能生效；可开启IDEA的「热部署」（需添加热部署依赖），实现代码修改后自动重启，无需手动点击启动。

- 端口修改：若需修改端口，直接修改application.properties中的server.port，重启服务即可，前端JS无需修改（因请求用的是相对路径）。

## 五、最终访问效果（替换为你的端口）

- 动态页面（HTML+JS，读取数据库）：http://localhost:8088/（你的端口，如8090则改为localhost:8090）

- API接口（JSON数据，供JS调用）：http://localhost:8088/api/data/list

- 静态资源访问：http://localhost:8088/css/style.css（测试CSS是否能正常访问）
> （注：文档部分内容可能由 AI 生成）