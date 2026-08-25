package com.reservation.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * 静态页面入口控制器
 * 将 /booking 这类短路径转发到对应的静态 HTML，保留查询参数
 */
@Controller
public class PageController {

    /**
     * 预约深链入口：/booking?scdid=12355&tid=xxx&sid=xxx
     * 转发到 booking.html，由前端根据角色分流到 student.html 或 admin.html
     */
    @GetMapping("/booking")
    public String bookingPage() {
        return "forward:/booking.html";
    }
}
