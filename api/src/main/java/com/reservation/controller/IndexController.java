package com.reservation.controller;

//import com.reservation.entity;
import com.reservation.service.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.bind.annotation.RequestMapping;

import javax.servlet.http.HttpServletRequest;
import java.util.List;
// 由于程序启动后默认没有跳转到 index.html 而是跳到了 login，说明 Spring Security 可能拦截了首页（/）请求，要求认证。
// 解决办法之一是将首页（/ 或 /index.html）设置为 permitAll，不需要登录即可访问。
// 此处可添加一个欢迎页面的重定向控制器（如果不希望Spring Security拦截首页）： 


/*
@RequestMapping({"", "/", "/index"})
public String root() {
    // 直接重定向到视图页面 index.html（Springboot默认前缀为 templates/ 需配合 Thymeleaf 使用，或者返回静态资源路径）
 
【问题再补充】
地址栏输入 localhost:8081/index.html，仍提示404 分析：

1. Spring Boot 对 templates 下的页面（如 index.html）只能通过 Controller 返回逻辑视图名称（如 return "index"），
   不能直接访问 /index.html（因为 templates/ 下的文件不会被暴露为静态资源）。
   
2. 只有 static、public、resources/static 等目录下的资源（如 static/index.html），才支持直接通过 http://localhost:8081/index.html 访问。

3. 当前控制器设置（@RequestMapping --> return "index"）只对 /、/index 请求有效，不能绑定 /index.html 直链路由。

4. 综上：
   - 想直接访问 http://localhost:8081/index.html，须把 index.html 放在 static/ 或 public/ 目录下；
   - 若用 @Controller + return "index"，地址栏需输入 http://localhost:8081/ 或 /index （不能带 .html）。

【解决建议】
- 若要通过http://localhost:8081/index.html 直接访问，把 index.html 放到 src/main/resources/static/ 目录下。
- 若要用模板渲染（比如Thymeleaf），通过 Controller 返回视图名（return "index"），访问 http://localhost:8081/ 或 http://localhost:8081/index。

【参考：Spring Boot 静态资源与模板渲染区别】
- static/ 和 public/ 目录下的文件 —— 可以填写全路径直接访问（如 /index.html）。
- templates/ 目录下的模板 —— 只能通过 Controller 渲染返回。

总结：当前代码设置本身没错，但需区分静态页面和模板页面的访问方式。
*/
 
// 控制器注解（同时支持页面渲染和API接口）
/**
 /**
  * 目录检查与403/404问题分析：
  *
  * 1. IndexController 所在目录（com.reservation.controller）为 Spring Boot 推荐的 controller 包，
  *    只要主启动类（@SpringBootApplication 注解类）在 com.reservation 包下即可被自动扫描注册，无问题。
  *
  * 2. 主页访问出现403或404常见原因如下：
  *    - 若 /index.html 直接访问为 403（禁止访问），请检查 static 目录下 index.html 文件的权限是否正常，以及 Spring Security 配置是否允许此路径的匿名访问。
  *    - spring security 配置未放开 "/index.html"（静态资源/首页），会导致 403。请确保 SecurityConfig 的 antMatchers 中包含 "/index.html" 并 permitAll()。
  *    - 控制器方法如映射 "" 或 "/" 路径（已正确设置），且视图文件 index.html 放在 resources/templates/ 下，则 http://localhost:8081/ 可访问（渲染模板）。
  *    - 若希望支持 http://localhost:8081/index.html 直链访问，确保 index.html 位于 resources/static/ 或 public/ 目录。
  *
  * 3. 排查建议：
  *    - 若403: 检查 SecurityConfig 中 permitAll 路径设置，确保 "/index.html" 包含在内。
  *    - 检查 static/ 目录下 index.html 是否存在且无权限问题。
  *    - 若想使用模板（如Thymeleaf），通过 controller 返回 "index"，而不是直接访问 index.html。
  *
  * 结论：
  * - 403通常是安全配置问题，检查SecurityConfig；404多为文件路径/部署问题。
  * - 建议根据需求将 index.html 放在 static/ 目录以支持直链访问，并配置 permitAll("/index.html")。
  */

 
@Controller
@RequestMapping({"", "/", "/index"})
public class IndexController {

     @ExceptionHandler(Exception.class)
    public String handleError(HttpServletRequest req, Exception ex, Model model) {
        model.addAttribute("status", 500);
        model.addAttribute("error", "服务器内部错误");
        model.addAttribute("message", ex.getMessage());
        model.addAttribute("timestamp", new java.util.Date());
        model.addAttribute("path", req.getRequestURI());
        return "errorpage";
    }
    // 注入业务层（自动装配，无需手动创建）
    // 1. 渲染动态页面（HTML），访问路径：http://localhost:8081
    @RequestMapping({"", "/"})
    public String index() {
        // 跳转到templates/index.html页面（无需传参，JS将通过API请求数据） 
        return "index";
    }
   
     // 列出本项目对外暴露的所有接口，并返回
     // 利用 Spring 的 ApplicationContext 获取所有带有 @RequestMapping/@GetMapping/@PostMapping 等注解的方法及其路径

     @Autowired
     private org.springframework.context.ApplicationContext applicationContext;

     @Autowired
     private org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping requestMappingHandlerMapping;

     @ResponseBody
     @GetMapping("interfaces")
     public List<String> listAllApiEndpoints() {
         // 结果集合
         List<String> endpoints = new java.util.ArrayList<>();

         // 获取 Spring MVC 注册的所有映射
         java.util.Map<org.springframework.web.servlet.mvc.method.RequestMappingInfo, org.springframework.web.method.HandlerMethod> handlerMethods =
                 requestMappingHandlerMapping.getHandlerMethods();

         for (java.util.Map.Entry<org.springframework.web.servlet.mvc.method.RequestMappingInfo, org.springframework.web.method.HandlerMethod> entry : handlerMethods.entrySet()) {
             org.springframework.web.servlet.mvc.method.RequestMappingInfo info = entry.getKey();

             // 处理每个路径
             java.util.Set<String> patterns = info.getPatternsCondition().getPatterns();
             java.util.Set<org.springframework.http.HttpMethod> httpMethods = info.getMethodsCondition().getMethods();

             String methodStr = httpMethods.isEmpty() ? "[ALL]" : httpMethods.toString();
             for (String pattern : patterns) {
                 endpoints.add(methodStr + " " + pattern);
             }
         }

         java.util.Collections.sort(endpoints);
         return endpoints;
     }

    
    // 2. 提供API接口（给JS调用，返回JSON数据），访问路径：http://localhost:8088/api/data/list
   /* @GetMapping("/api/data/list")
    @ResponseBody // 标记返回JSON，而非页面
    public List<Data> getDataList() {
        // 调用业务层，从数据库获取数据，返回给JS
        return dataService.getDataList();
    }*/

}
/**
 * RequestMapping和GetMapping的区别说明：
 *
 * 1. @RequestMapping 可以用于类和方法之上，支持配置多种HTTP方法（如GET、POST、PUT等），
 *    需要通过 method 属性指定具体请求方式，例如 method = RequestMethod.GET。
 *    例子：
 *      @RequestMapping(value = "/demo", method = RequestMethod.GET)
 *      public String demo() { ... }
 *
 * 2. @GetMapping 是 @RequestMapping(method = RequestMethod.GET) 的语法糖，
 *    专门用于处理GET请求，简化了写法，适用于只需要响应GET的方法。
 *    例子：
 *      @GetMapping("/demo")
 *      public String demo() { ... }
 *
 * 3. 推荐用法：
 *    - 通常接口只需对应一种请求方式时，优先用 @GetMapping/@PostMapping 等更直观的注解。
 *    - @RequestMapping 适合需要同时支持多种请求方式，或需要灵活配置时。
 *
 * 4. 其它说明：
 *    - @RequestMapping 可以配合 params、headers 进行更细粒度的控制。
 *    - @GetMapping 仅限于 GET 请求，代码更简洁、易读。
 */
 /*
 分析：
 
 在IndexController中已经有如下方法：
 
 @RequestMapping({"", "/"})
 public String index() {
     // 跳转到templates/index.html页面（无需传参，JS将通过API请求数据）
     return "index";
 }

 该方法映射了根路径 "" 和 "/"，即当用户访问 http://localhost:8081 或 http://localhost:8081/ 时，
 Spring MVC会将请求路由到本方法，并返回逻辑视图名 "index"。
 根据 application.properties 配置，Thymeleaf 会解析为 templates/index.html。

 结论：
 该Controller已经可以正确处理 http://localhost:8081 的访问请求，会返回首页。
 若需更多路径映射可按需扩展，但当前实现已满足首页渲染需要。
 */