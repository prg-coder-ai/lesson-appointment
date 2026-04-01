package com.reservation.controller;

//import com.reservation.entity;
import com.reservation.service.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Set;
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
/**
 * @ResponseBody 注解的作用：
 *
 * 标注在 Controller 的方法上时，表示该方法的返回值不会被解析为视图（View），
 * 而是直接写入HTTP响应体（Response Body），常用于返回JSON、XML、字符串等数据。
 *
 * 典型场景：开发RESTful接口、API返回数据时使用。
 * Spring MVC 会自动将返回对象序列化为 JSON（需引入 jackson 依赖）。
 *
 * 示例：
 *  @ResponseBody
 *  @GetMapping("/hello")
 *  public String hello() {
 *      return "Hello, World!"; // 浏览器显示原文，而不是跳转页面
 *  }
 *
 * - 若只想渲染页面，不加 @ResponseBody。
 * - 若想返回数据而不是页面，加 @ResponseBody。
 *
 * 补充：@RestController = @Controller + @ResponseBody，默认所有方法返回响应体数据。
 */

    
@Controller
@RequestMapping({"", "/"})
//此时。interfaces可达，但是返回的数据为空
public class IndexController {

    // 注入业务层（自动装配，无需手动创建）

    // 1. 渲染动态页面（HTML），访问路径：http://localhost:8081
    /**
     * 404（Not Found）错误分析：访问 "http://localhost:8081" 报 404 的常见原因如下：
     *
     * 1. 控制器未正确映射根路径（"/" 或 ""）：
     *    - 应有一个Controller方法（如本类）用 @GetMapping({"", "/"}) 或 @RequestMapping({"", "/"}) 注解，并返回视图名"index"。
     *    - 若Controller未生效、路径配置不对，则Spring找不到对应页面，返回404。
     *
     * 2. 模板页面 index.html 未放置于正确目录：
     *    - 如果采用Thymeleaf/JSP等模板引擎，应将index.html存放在 resources/templates/ 目录下。
     *    - 且Controller应返回"index"（不带.html后缀），由Spring MVC转发解析。
     *    - 若仅将index.html放在 static/ 下但未配置静态资源访问，直接访问根路径不会命中，需访问 /index.html 直链。
     *
     * 3. 静态资源配置异常或未启用相关目录：
     *    - application.properties 需配置 spring.web.resources.static-locations（如 classpath:/static/）。
     *    - 未配置或配置有误，导致静态资源不被扫描。
     *
     * 4. 首页未被Spring Security放开，实际通常会403，但有些情况下安全配置影响也可能导致404。
     *
     * 5. 项目启动未报错但未加载Controller，因包扫描范围覆盖不到当前Controller。
     *    - 确保@SpringBootApplication注解类（主启动类）在父包下（如 com.reservation），能扫描到此Controller。
     *
     * 6. 热部署或编译未生效，实际代码、模板未被编译进target目录。
     *
     * 【排查建议】
     * - 确认本类IndexController被正确扫描/注册，并包含根路径的 @GetMapping 或 @RequestMapping。
     * - 确认 templates 目录下有 index.html 文件，且无拼写/大小写错误。
     * - 若希望支持 /index.html 直链，须将index.html放入static/目录，并在SecurityConfig里permitAll("/index.html")。
     * - 检查 application.properties的模板与静态资源相关设置。
     *
     * 参考：Spring官方文档关于静态资源与模板视图解析配置。
     */
    /**
     * 补充分析：
     * 目前 @GetMapping({"", "/"}) 方法被调用时报404，而 @GetMapping("interfaces") 方法可以正常返回数据，
     * 这通常说明控制器已被扫描注册，但根路径映射未生效。其主要可能原因如下：
     * 
     * 1. 方法上加了 @ResponseBody，却返回"index"字符串（造成直接返回文本"index"，而不是跳转至视图页面）。
     *    - @ResponseBody 表示方法返回值就是响应体内容，不做视图跳转。
     *    - 若仅需渲染/index.html，应去掉 @ResponseBody，仅返回视图名，由视图解析器寻找模板页面。
     * 
     * 2. Security 配置问题已排除（参见 SecurityConfig，已 permitAll("/")）。
     * 
     * 3. templates/index.html 确实存在，且application.properties未特殊配置模板路径。
     * 
     * 4. @Controller + @RequestMapping({"", "/"}) 已正确配置，因此只需改正方法注解。
     * 
     * 【解决建议】
     * - 去除 @ResponseBody，仅保留 @GetMapping({"", "/"})，返回 "index" 触发视图解析。
     * - 若要返回字符串（如API），需要 @ResponseBody；若要跳转页面，不需要。
     */
    
    /**
     * @GetMapping 注解用于处理HTTP GET请求，常用于访问页面或查询数据接口。
     *
     * 基本用法：
     *
     * // 1. 映射单一URL
     * @GetMapping("/hello")
     * public String hello() {
     *     return "hello"; // 返回视图名（模板页面），或加@ResponseBody返回内容
     * }
     *
     * // 2. 映射多个URL（数组形式）
     * @GetMapping(value = {"/", "/index"})
     * public String index() {
     *     return "index";
     * }
     *
     * // 3. 带参数
     * @GetMapping("/user/{id}")
     * public String getUser(@PathVariable Long id) {
     *     //...
     * }
     *
     * 说明：
     * - 作用于方法上，等价于 @RequestMapping(value="/path", method=RequestMethod.GET)
     * - 返回字符串时若无 @ResponseBody，默认跳转到同名模板页面（如：index -> templates/index.html）
     * - 若返回JSON数据，加 @ResponseBody 或使用@RestController
     * - 可结合 @RequestParam、@PathVariable 获取请求参数
     *
     * 示例：
     * @GetMapping("/welcome")
     * @ResponseBody
     * public String welcome() {
     *     return "Welcome!"; // 直接返回文本
     * }
     *
     * 文档参考：https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/web/bind/annotation/GetMapping.html
     */
    @GetMapping({"","/"})
    // @ResponseBody
    public String Index() {
        // 跳转到templates/index.html页面（无需传参，JS将通过API请求数据） 
        return "index.html";
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
             //判断info为空、nfo.getPatternsCondition()为null的情况
             if (info == null || info.getPatternsCondition() == null) {
                 continue;
             }

             java.util.Set<String> patterns = info.getPatternsCondition().getPatterns();

             if (info.getMethodsCondition() == null) {
                 continue;
             }
             Set<RequestMethod> httpMethods = info.getMethodsCondition().getMethods();
             String methodStr = httpMethods.isEmpty() ? "[ALL]" : httpMethods.toString();
             
             for (String pattern : patterns) {
                 endpoints.add(methodStr + " " + pattern);
             }
         }

         java.util.Collections.sort(endpoints);
         //endpoints.add( "test");//可达
         return endpoints;
     }

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

 /**
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