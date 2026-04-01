package com.ih.api.controller

import org.springframework.stereotype.Controller
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.servlet.ModelAndView

@Controller
class AdminController {
    @GetMapping("/admin/index")
    fun AdminIndex(): ModelAndView {
        var view = ModelAndView()
        view.viewName = "/pages/index"
        return view
    }

    @GetMapping("/admin/maptools")
    fun test1(): ModelAndView {
        var view = ModelAndView()
        view.viewName = "admin/tool/maptools"
        return view
    }
}