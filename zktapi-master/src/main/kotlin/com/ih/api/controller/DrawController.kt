package com.ih.api.controller

import org.springframework.stereotype.Controller
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.servlet.ModelAndView

@Controller
class DrawController {
    @GetMapping("/draw")
    fun draw(): ModelAndView {
        var m = ModelAndView()
        m.viewName = "/draw"
        return m;
    }
}