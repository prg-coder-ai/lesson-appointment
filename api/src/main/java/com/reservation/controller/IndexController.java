package com.reservation.controller;

//import com.reservation.entity;
import com.reservation.service.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.bind.annotation.RequestMapping;
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
控制器设置分析：

1. 控制器类使用了 @Controller 注解，表示它可用于页面渲染；
2. index() 方法匹配根路径和 /index，并返回 "index"，会渲染 templates/index.html（若已配置 Thymeleaf）；
3. getDataList() 方法用 @GetMapping 和 @ResponseBody，返回 List<Data>，用于前端 AJAX 异步获取数据，接口路径为 /api/data/list；
4. 成员变量 dataService 注入无误，负责业务逻辑数据获取；
5. 配合前端（如 index.html），页面可静态渲染，数据动态拉取。

建议和说明：
- 文件顶部的导包语句 "import com.reservation.entity;" "import com.reservation.service;" 实际应该具体到实体类（如 import com.reservation.entity.Data）和服务类（如 import com.reservation.service.DataService），否则编译会报错；
- 未见具体 Data 类定义及 DataService#getDataList 方法实现，需有效实现才能正常提供列表数据；
- Spring Security 配置中已允许 / 和 /index 匿名访问，可正常访问首页（见 SecurityConfig）；
- 如需兼容更多 API，建议接口路径统一加 /api/ 前缀。

结论：  
控制器整体结构、注解和职责分离是正确的，能同时支持页面渲染与 RESTful 数据接口。细节处注意导包及相关类定义，配合已有安全配置，首页可正常展示与数据调取。
*/

@Controller
public class IndexController {

    // 注入业务层（自动装配，无需手动创建）
   // @Autowired
   // private DataService dataService;

    // 1. 渲染动态页面（HTML），访问路径：http://localhost:8081/（你的端口）
    @RequestMapping({"", "/"})
    public String index() {
        // 跳转到templates/index.html页面（无需传参，JS将通过API请求数据）
               
        return "index.html";
    }

    // 2. 提供API接口（给JS调用，返回JSON数据），访问路径：http://localhost:8088/api/data/list
   /* @GetMapping("/api/data/list")
    @ResponseBody // 标记返回JSON，而非页面
    public List<Data> getDataList() {
        // 调用业务层，从数据库获取数据，返回给JS
        return dataService.getDataList();
    }*/

}