package com.ih.api.controller4api

import com.fasterxml.jackson.databind.ObjectMapper
import com.ih.api.ResponseData
import com.ih.api.model.Enumlist
import com.ih.api.service.EnumlistService
import org.springframework.stereotype.Controller
import org.springframework.web.bind.annotation.*
import org.springframework.web.servlet.ModelAndView
import java.util.*
import javax.annotation.Resource
@CrossOrigin("*")
@RequestMapping("/api/enumlist/")
@Controller
class EnumlistControllerAPI {
    @Resource
    var _service: EnumlistService? = null

    @GetMapping("get")
    @ResponseBody
    fun get(@RequestParam id: Int): ResponseData {
        val re = ResponseData()
        val result: Enumlist? = _service?.get(id)
        re.putDataValue("result", result)
        return re;
    }

    @PostMapping("create")
    @ResponseBody
    fun create(@RequestBody model: Enumlist): ResponseData {
        val re = ResponseData()
        val result = _service?.insert(model)
        re.putDataValue("result", result)
        return re;
    }

    @PostMapping("update")
    @ResponseBody
    fun update(@RequestBody model: Enumlist): ResponseData {
        val re = ResponseData()
        val result = _service?.update(model)
        re.putDataValue("result", result)
        return re;
    }

    @PostMapping("getPaging")
    @ResponseBody
    fun getPaging(@RequestParam(name = "groupNo", defaultValue = "", required = true) groupNo: String,
                  @RequestParam(name = "page", defaultValue = "1", required = true) offset: Int,
                  @RequestParam(name = "pagesize", defaultValue = "20", required = true) pageSize: Int,
                  @RequestParam(name = "sortname", defaultValue = "id", required = false) sortname: String,
                  @RequestParam(name = "sortorder", defaultValue = "desc", required = false) sortorder: String): String {

        val orderBy = "$sortname $sortorder"
        var items = _service?.getPaging(groupNo, (offset - 1) * pageSize, pageSize, orderBy)
        var counts = _service?.getCount(groupNo)

        val jsonMap = HashMap<String, Any>()
        jsonMap["Rows"] = items!!
        jsonMap["Total"] = counts!!
        val mapper = ObjectMapper()
        var result = mapper.writeValueAsString(jsonMap)
        return result
    }

    /*
    * 只修改状态
    * */
    @PostMapping("delete")
    @ResponseBody
    fun delete(@RequestParam id: Int): ResponseData {
        val re = ResponseData()
        var result = _service?.delete(id)
        re.putDataValue("result", result)
        return re;
    }


}

