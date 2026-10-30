# Spring Boot项目CORS跨域问题解决方案（终极完整版）

本文档针对Spring Boot项目中常见的CORS（跨域资源共享）问题，提供从基础认知、多种解决方案到避坑实战的完整指南，适配Spring Boot 2.x/3.x所有版本，兼顾开发环境快速调试与生产环境安全部署，彻底解决跨域请求失败、预检请求异常等问题。

# 一、CORS问题核心认知

## 1.1 什么是CORS跨域问题

CORS（Cross-Origin Resource Sharing，跨域资源共享）是浏览器的一种**同源策略限制**，当前端页面（如http://localhost:8081）请求后端接口（如http://localhost:8080）时，若协议、域名、端口三者有任一不同，即视为跨域请求。浏览器会默认拦截该请求，返回跨域错误（常见错误：Access to XMLHttpRequest at 'xxx' from origin 'xxx' has been blocked by CORS policy）。

## 1.2 跨域请求的两种类型

- 简单请求：请求方法为GET、POST、HEAD，且请求头仅包含Accept、Accept-Language、Content-Language、Content-Type（仅application/x-www-form-urlencoded、multipart/form-data、text/plain），浏览器直接发送请求，无需预检。

- 预检请求（OPTIONS请求）：请求方法为PUT、DELETE、PATCH，或请求头包含自定义头（如Token、Authorization），或Content-Type为application/json等，浏览器会先发送OPTIONS预检请求，验证后端是否允许跨域，验证通过后再发送真实请求。

注：多数Spring Boot项目（如前后端分离项目）的跨域问题，均源于预检请求未被正确处理。

## 1.3 Spring Boot中CORS问题的常见场景

- 前后端分离项目：前端（Vue/React/Angular）部署在不同端口/域名，请求后端接口。

- 多模块项目：不同模块部署在不同服务，模块间接口调用存在跨域。

- 第三方系统调用：外部系统请求本项目接口，存在跨域限制。

# 二、终极解决方案（优先级排序，推荐全局配置）

以下解决方案按“实用性、兼容性、安全性”排序，优先推荐全局配置，避免重复开发，同时兼顾不同场景需求。

## 方案1：全局跨域配置（推荐，适配所有场景）

通过创建CORS全局配置类，统一拦截所有接口，配置跨域规则，无需在每个Controller或接口上单独配置，适配Spring Boot 2.0+所有版本，支持自定义跨域规则，兼顾开发与生产环境。

### 2.1.1 完整配置代码（可直接复制使用）

```Java
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Spring Boot CORS全局跨域配置类
 * 适配Spring Boot 2.x/3.x，全局生效，覆盖所有接口
 */
@Configuration
public class GlobalCorsConfig implements WebMvcConfigurer {

    /**
     * 核心过滤器，配置跨域规则
     */
    @Bean
    public CorsFilter corsFilter() {
        // 1. 构建跨域配置对象
        CorsConfiguration config = new CorsConfiguration();
        
        // 2. 配置核心跨域规则（根据实际需求调整）
        // 允许的前端域名（开发环境可使用通配符，生产环境必须指定具体域名）
        // Spring Boot 2.4+ 推荐使用addAllowedOriginPattern（支持通配符+允许Cookie）
        // Spring Boot 2.4以下使用addAllowedOrigin（不支持通配符+允许Cookie，需单独配置）
        config.addAllowedOriginPattern("*");
        
        // 允许的请求方法（GET、POST、PUT、DELETE、OPTIONS等，建议配置为*，覆盖所有方法）
        config.addAllowedMethod("*");
        
        // 允许的请求头（如Token、Authorization、Content-Type等，建议配置为*，避免遗漏）
        config.addAllowedHeader("*");
        
        // 允许携带Cookie（跨域请求默认不携带Cookie，如需登录态共享，必须开启）
        config.setAllowCredentials(true);
        
        // 预检请求缓存时间（单位：秒），设置为3600，减少浏览器预检请求次数，提升性能
        config.setMaxAge(3600L);
        
        // 允许暴露的响应头（如自定义的Token、用户信息等，前端需获取时配置）
        config.addExposedHeader("Authorization");
        config.addExposedHeader("X-User-Id");
        
        // 3. 配置拦截路径（/** 表示所有接口都生效，可根据需求调整，如/api/**）
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        
        // 4. 返回CorsFilter，全局生效
        return new CorsFilter(source);
    }
}
```

### 2.1.2 配置说明（避坑关键）

- 版本兼容：Spring Boot 2.4+ 必须使用 `addAllowedOriginPattern("*")`，若使用 `addAllowedOrigin("*")` 会导致“允许Cookie”配置失效；Spring Boot 2.4以下只能使用 `addAllowedOrigin("*")`，且不支持“通配符+允许Cookie”（生产环境需指定具体域名）。

- 生产环境优化：开发环境可使用 `addAllowedOriginPattern("*")` 快速调试，生产环境必须替换为具体前端域名（如 `config.addAllowedOriginPattern("https://www.your-frontend.com")`），避免通配符带来的安全风险。

- 允许暴露响应头：若前端需要获取后端返回的自定义响应头（如Token、用户ID），必须通过 `addExposedHeader()` 配置，否则前端无法获取。

- 无需额外依赖：Spring Boot 自带 `spring-web` 模块，无需在pom.xml中新增任何依赖（只要项目引入 `spring-boot-starter-web` 即可）。

## 方案2：局部跨域配置（应急使用，不推荐生产）

若仅个别接口或Controller需要跨域，可使用 `@CrossOrigin` 注解，快速实现局部跨域，适合临时调试、少量接口跨域场景，不推荐生产环境大规模使用（维护成本高）。

### 2.2.1 两种使用方式

#### 方式1：Controller级别（当前Controller所有接口生效）

```Java
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 局部跨域示例（Controller级别）
 */
@RestController
// origins：允许的前端域名，allowCredentials：允许携带Cookie，maxAge：预检缓存时间
@CrossOrigin(origins = "*", allowCredentials = "true", maxAge = 3600)
public class TestController {

    @GetMapping("/test/cors")
    public String testCors() {
        return "局部跨域请求成功";
    }
}
```

#### 方式2：接口级别（仅当前接口生效）

```Java
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class TestController {

    /**
     * 局部跨域示例（接口级别）
     * 仅当前/test/cors接口生效，优先级高于Controller级别注解
     */
    @GetMapping("/test/cors")
    @CrossOrigin(origins = "https://www.your-frontend.com", allowCredentials = "true")
    public String testCors() {
        return "接口级别跨域请求成功";
    }
}
```

### 2.2.2 注意事项

- 注解优先级：接口级别 `@CrossOrigin` 优先级高于Controller级别，若两者同时配置，以接口级别为准。

- 版本兼容：Spring Boot 2.4+ 注解中 `origins` 支持通配符 `*`，2.4以下不支持，需指定具体域名。

- 生产环境限制：不推荐大规模使用，若接口数量较多，会增加维护成本，且容易遗漏跨域配置。

## 方案3：基于WebMvcConfigurer配置（备选方案）

通过实现 `WebMvcConfigurer` 接口的 `addCorsMappings` 方法，配置跨域规则，效果与方案1类似，适合Spring Boot 2.0+版本，可作为全局配置的备选方案。

### 3.1 配置代码

```Java
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * 基于WebMvcConfigurer的跨域配置（备选方案）
 */
@Configuration
public class CorsWebMvcConfig implements WebMvcConfigurer {

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        // 配置跨域规则，/** 表示所有接口
        registry.addMapping("/**")
                .allowedOriginPatterns("*") // 允许的域名（Spring Boot 2.4+）
                .allowedMethods("*") // 允许的请求方法
                .allowedHeaders("*") // 允许的请求头
                .allowCredentials(true) // 允许携带Cookie
                .maxAge(3600) // 预检缓存时间
                .exposedHeaders("Authorization", "X-User-Id"); // 允许暴露的响应头
    }
}
```

### 3.2 与方案1的区别

两种方案效果一致，核心区别在于：方案1通过 `CorsFilter` 过滤器实现，优先级高于拦截器；方案2通过 `WebMvcConfigurer` 配置，优先级低于拦截器。若项目存在自定义拦截器（如登录拦截器），推荐使用方案1，避免拦截器拦截预检请求导致跨域失败。

# 三、前端BPM相关命令及解释

BPM（Business Process Management，业务流程管理）前端常用命令，主要用于BPM流程设计、部署、运行调试，适配主流前端BPM框架（如Flowable Modeler、Activiti Modeler、Camunda Modeler），结合Spring Boot后端接口使用，解决BPM流程跨域请求问题（需配合上文CORS配置）。以下是前端BPM核心运行命令，含详细解释、使用场景及注意事项。

## 3.1 核心BPM前端命令（通用版）

适用于大多数前端BPM项目（Vue/React技术栈），与Spring Boot后端联调时，需确保后端已配置CORS跨域，避免流程请求失败。

### 3.1.1 启动BPM前端项目（开发环境）

```Bash
# 通用启动命令（npm）
npm run dev

# 备用启动命令（yarn）
yarn dev

# 指定端口启动（避免与后端Spring Boot端口冲突，如后端8080，前端8081）
npm run dev -- --port=8081
```

解释：

- `npm run dev`：最基础的BPM前端启动命令，基于项目package.json配置，启动开发环境服务器，支持热更新（修改代码后实时刷新页面），适合开发调试。

- `yarn dev`：与npm run dev功能一致，仅包管理工具不同（yarn替代npm），需提前安装yarn。

- `-- --port=8081`：指定前端启动端口，解决前后端端口冲突问题（Spring Boot后端默认8080，前端建议使用8081/8082等），确保跨域请求正常发起。

使用场景：开发阶段，启动前端BPM项目，联调Spring Boot后端BPM接口（如流程查询、流程部署、任务办理）。

### 3.1.2 构建BPM前端生产包

```Bash
# 通用构建命令（生成生产环境静态资源）
npm run build

# 构建并查看构建报告（分析包体积，优化性能）
npm run build --report

# 构建测试环境包（区分环境，避免影响生产）
npm run build:test
```

解释：

- `npm run build`：核心构建命令，将前端BPM项目打包为静态资源（HTML/CSS/JS），压缩代码、优化资源，用于生产环境部署（如部署到Nginx、Tomcat）。

- `--report`：生成构建报告，展示各模块包体积大小，便于排查大体积文件（如BPM流程图组件），优化项目加载速度。

- `npm run build:test`：构建测试环境包，配置测试环境后端接口地址（需在前端配置文件中修改），用于测试环境联调，避免直接操作生产环境。

使用场景：开发完成后，构建生产包部署到服务器，或构建测试包用于测试环境验证BPM流程功能。

### 3.1.3 运行BPM流程设计器（单独启动）

```Bash
# 启动BPM流程设计器（独立模块）
npm run modeler

# 启动流程设计器并指定后端接口地址（临时联调）
npm run modeler -- --api=http://localhost:8080/bpm
```

解释：

- `npm run modeler`：部分BPM项目将流程设计器（如Flowable Modeler）作为独立模块，该命令用于单独启动设计器，便于流程绘制、编辑、导出。

- `-- --api=http://localhost:8080/bpm`：临时指定后端BPM接口地址，无需修改前端配置文件，适合联调不同环境的后端接口（如开发、测试环境）。

使用场景：流程设计人员绘制、修改BPM流程，实时联调后端接口，确保流程定义能正常部署到Spring Boot后端。

### 3.1.4 检查BPM前端代码规范（避坑）

```Bash
# 检查代码规范（ESLint）
npm run lint

# 自动修复代码规范问题
npm run lint:fix
```

解释：

- `npm run lint`：通过ESLint检查BPM前端代码规范（如语法错误、代码格式、命名规范），避免因代码不规范导致的流程渲染异常、接口请求失败。

- `npm run lint:fix`：自动修复部分代码规范问题（如缩进、空格、引号），减少手动修改成本。

使用场景：开发过程中定期检查代码，或提交代码前执行，确保代码规范，避免联调时出现异常。

## 3.2 主流BPM框架专属命令（补充）

### 3.2.1 Flowable前端命令

```Bash
# 启动Flowable Modeler前端
npm run flowable:modeler

# 部署Flowable流程定义（前端直接调用后端接口部署）
npm run flowable:deploy -- --processId=testProcess
```

解释：`npm run flowable:deploy` 用于前端直接触发流程部署，`--processId=testProcess` 指定部署的流程ID，需后端已配置跨域（允许前端请求部署接口），适合快速调试流程部署功能。

### 3.2.2 Camunda前端命令

```Bash
# 启动Camunda Modeler前端
npm run camunda:modeler

# 导出BPM流程定义（JSON/XML格式）
npm run camunda:export -- --processKey=testKey --format=xml
```

解释：`npm run camunda:export` 用于导出BPM流程定义文件（支持JSON/XML格式），可直接导入后端Camunda引擎，`--processKey` 指定流程标识，`--format` 指定导出格式。

## 3.3 注意事项（与CORS配置联动）

- 启动前端BPM项目前，需确保Spring Boot后端已配置CORS跨域（参考上文方案1），否则前端请求后端BPM接口（如流程查询、部署）会报跨域错误。

- 指定前端端口时，需与后端端口区分（如后端8080，前端8081），避免端口冲突导致项目启动失败。

- 构建生产包后，部署到Nginx时，需确保Nginx配置了跨域规则（参考本文第五章），或后端已配置全局跨域，避免生产环境跨域问题。

- 联调BPM接口时，若出现“OPTIONS预检请求失败”，需检查后端拦截器是否放行OPTIONS请求（参考本文第四章4.1）。

# 四、生产环境优化与安全配置

开发环境可使用通配符快速调试，但生产环境需重点关注安全性，避免跨域配置带来的安全风险，以下是生产环境必备优化项。

## 4.1 限制允许的域名（核心安全优化）

禁止使用 `*` 通配符，必须指定具体的前端域名，多个域名可通过逗号分隔，示例：

```Java
// 生产环境配置：仅允许指定的2个前端域名跨域
config.addAllowedOriginPattern("https://www.your-frontend.com", "https://m.your-frontend.com");
```

## 4.2 限制允许的请求方法和请求头

根据项目实际需求，限制允许的请求方法和请求头，避免不必要的方法暴露，示例：

```Java
// 仅允许GET、POST、PUT、DELETE方法
config.addAllowedMethod("GET");
config.addAllowedMethod("POST");
config.addAllowedMethod("PUT");
config.addAllowedMethod("DELETE");

// 仅允许指定的请求头
config.addAllowedHeader("Content-Type");
config.addAllowedHeader("Authorization");
config.addAllowedHeader("Token");
```

## 4.3 关闭不必要的Cookie携带

若项目无需跨域共享登录态（Cookie），建议关闭 `allowCredentials`，减少安全风险：

```Java
// 关闭Cookie携带（默认false）
config.setAllowCredentials(false);
```

# 五、常见问题与避坑指南（重点）

## 5.1 配置后仍报跨域错误：预检请求（OPTIONS）被拦截

原因：项目存在自定义拦截器（如登录拦截器、权限拦截器），拦截了OPTIONS预检请求，导致浏览器无法完成预检，进而拦截真实请求。

解决方案：在拦截器中放行OPTIONS请求，示例：

```Java
import org.springframework.web.servlet.HandlerInterceptor;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

/**
 * 自定义拦截器（示例：登录拦截器）
 */
public class LoginInterceptor implements HandlerInterceptor {

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        // 放行OPTIONS预检请求，避免跨域配置失效
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }
        // 其他拦截逻辑（如登录验证）
        // ...
        return true;
    }
}
```

## 5.2 允许Cookie后，跨域仍失败

原因1：Spring Boot 2.4+ 使用了 `addAllowedOrigin("*")`，该方法与 `allowCredentials=true` 冲突，导致Cookie携带失效。

解决方案：替换为 `addAllowedOriginPattern("*")`（开发环境）或具体域名（生产环境）。

原因2：前端请求未开启“允许携带Cookie”，如Axios需配置 `withCredentials: true`。

前端示例（Axios）：

```JavaScript
// Axios配置：允许携带Cookie
axios.defaults.withCredentials = true;
```

## 5.3 多环境（dev/test/prod）跨域配置区分

解决方案：通过Spring Boot配置文件区分环境，动态配置跨域域名，示例：

#### 1. 配置文件（application-dev.yml）- 开发环境

```YAML
cors:
  allowed-origins: "*" # 开发环境通配符
  allowed-methods: "*"
  allowed-headers: "*"
  allow-credentials: true
  max-age: 3600
```

#### 2. 配置文件（application-prod.yml）- 生产环境

```YAML
cors:
  allowed-origins: "https://www.your-frontend.com,https://m.your-frontend.com" # 具体域名
  allowed-methods: "GET,POST,PUT,DELETE"
  allowed-headers: "Content-Type,Authorization,Token"
  allow-credentials: true
  max-age: 3600
```

#### 3. 全局配置类读取配置

```Java
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

@Configuration
public class GlobalCorsConfig {

    // 读取配置文件中的跨域配置
    @Value("${cors.allowed-origins}")
    private String allowedOrigins;
    @Value("${cors.allowed-methods}")
    private String allowedMethods;
    @Value("${cors.allowed-headers}")
    private String allowedHeaders;
    @Value("${cors.allow-credentials}")
    private boolean allowCredentials;
    @Value("${cors.max-age}")
    private long maxAge;

    @Bean
    public CorsFilter corsFilter() {
        CorsConfiguration config = new CorsConfiguration();
        
        // 分割域名（多个域名用逗号分隔）
        String[] origins = allowedOrigins.split(",");
        for (String origin : origins) {
            config.addAllowedOriginPattern(origin);
        }
        
        // 分割请求方法
        String[] methods = allowedMethods.split(",");
        for (String method : methods) {
            config.addAllowedMethod(method);
        }
        
        // 分割请求头
        String[] headers = allowedHeaders.split(",");
        for (String header : headers) {
            config.addAllowedHeader(header);
        }
        
        config.setAllowCredentials(allowCredentials);
        config.setMaxAge(maxAge);
        
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        
        return new CorsFilter(source);
    }
}
```

## 5.4 Spring Boot 3.x 跨域配置兼容

Spring Boot 3.x 与 2.x 跨域配置基本一致，仅需注意：Spring Boot 3.x 依赖的 Spring Web 版本升级，`CorsConfiguration` 类无重大变更，方案1、方案3均可直接使用，无需修改代码。

## 5.5 静态资源跨域问题

若项目存在静态资源（如图片、JS、CSS）跨域访问需求，上述全局配置已覆盖（`/**` 包含静态资源路径），无需额外配置。若静态资源部署在独立服务器，需在静态资源服务器配置跨域规则（如Nginx配置）。

# 六、Nginx反向代理解决跨域（补充方案）

若前端部署在Nginx服务器，可通过Nginx反向代理转发后端接口，彻底规避跨域问题（前端请求Nginx，Nginx转发到后端，不存在跨域），适合生产环境大规模部署。

## 6.1 Nginx配置示例

```Nginx
server {
    listen 80;
    server_name www.your-frontend.com; # 前端域名

    # 前端静态资源配置
    location / {
        root /usr/share/nginx/html; # 前端静态资源路径
        index index.html;
        try_files $uri $uri/ /index.html; # 解决SPA路由刷新404问题
    }

    # 反向代理后端接口，规避跨域
    location /api/ {
        proxy_pass http://localhost:8080/api/; # 后端接口地址
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # 配置跨域响应头（若后端未配置跨域，可在此配置）
        add_header Access-Control-Allow-Origin https://www.your-frontend.com;
        add_header Access-Control-Allow-Methods GET,POST,PUT,DELETE,OPTIONS;
        add_header Access-Control-Allow-Headers Content-Type,Authorization,Token;
        add_header Access-Control-Allow-Credentials true;
        add_header Access-Control-Max-Age 3600;
        
        # 放行OPTIONS预检请求
        if ($request_method = 'OPTIONS') {
            return 204;
        }
    }
}
```

# 七、总结

1. 开发环境：优先使用「全局跨域配置（方案1）」，配合 `addAllowedOriginPattern("*")` 快速调试，提升开发效率；前端BPM项目使用 `npm run dev -- --port=8081` 启动，避免端口冲突。

2. 生产环境：使用「全局跨域配置（方案1）」，指定具体允许的域名、请求方法和请求头，关闭不必要的Cookie携带，确保安全；前端BPM项目构建生产包后，部署到Nginx并配置反向代理，彻底规避跨域。

3. 避坑重点：确保放行OPTIONS预检请求、版本兼容（2.4+ 使用addAllowedOriginPattern）、前端开启Cookie携带（如需）；BPM前端联调时，需确保后端CORS配置生效。

4. 补充方案：Nginx反向代理适合大规模生产部署，减少后端配置压力；前端BPM命令需根据框架（Flowable/Camunda）选择对应命令，提升开发调试效率。
> （注：文档部分内容可能由 AI 生成）