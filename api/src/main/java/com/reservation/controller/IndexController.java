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
    return "index";
}
*/
// 控制器注解（同时支持页面渲染和API接口）
/*
浏览器显示404的原因分析：

1. 请求路径错误
   - 若访问根路径 / 或 /index.html 返回404，可能是Spring Boot未能正确映射到对应视图。代码的 @RequestMapping({"", "/", "/index"}) 方法会映射到 /、/index 请求并返回“index”视图（即 templates/index.html），但如果直接访问 /index.html 静态资源，Spring Boot 默认将它作为静态文件查找，若 static/ 目录下没有 index.html 文件即返回404。

2. 视图解析器/模板引擎未正确配置
   - 若未集成 Thymeleaf 或者 templates/index.html 存在但模板引擎没配置，则 return "index" 无法被解析为页面，也会报404。
   - 需确保`spring-boot-starter-thymeleaf`依赖存在，并且模板文件放在 src/main/resources/templates 目录。

3. Spring Security 或拦截器配置
   - 如未在 SecurityConfig 中对 / 和 /index.html 设置 permitAll，Spring Security 可能会将未登录用户重定向到 login 页，而不是404。但如果安全配置有误，也可能导致异常404。

4. 控制器包扫描失败
   - 若 IndexController 或其包路径有误（如启动类未扫描到本Controller），则请求无法分发至该控制器，返回404。

5. 端口或上下文路径错误
   - 若启动端口（如8081/8088）与访问端口不符，或Web应用配置了 context-path，直接访问 / 也会404。

6. 模板名大小写/路径拼写错误
   - 文件名实际为 index.html，需要确保 return "index" 与文件名一致（大小写敏感）。

【排查建议】
- 检查 controller 是否被 Spring Boot 扫描（包名、注解、启动类 @SpringBootApplication 的扫描路径）
- 确认 security 配置已对首页放行
- 检查 templates 目录下 index.html 是否存在，且模板依赖已引入
- 访问 http://localhost:8081/ 或 http://localhost:8081/index 是否正常（端口、路径）
- 若为静态页面，确认 static/ 目录下文件；若为模板，确保 return "index" 映射没问题

*/
 
@Controller
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
   // @Autowired
   // private DataService dataService;
                   
    // 1. 渲染动态页面（HTML），访问路径：http://localhost:8081/（你的端口）
    @RequestMapping({"", "/"})
    public String index() {
        // 跳转到templates/index.html页面（无需传参，JS将通过API请求数据）
               
        return "index";
    }

    // 2. 提供API接口（给JS调用，返回JSON数据），访问路径：http://localhost:8088/api/data/list
   /* @GetMapping("/api/data/list")
    @ResponseBody // 标记返回JSON，而非页面
    public List<Data> getDataList() {
        // 调用业务层，从数据库获取数据，返回给JS
        return dataService.getDataList();
    }*/

}