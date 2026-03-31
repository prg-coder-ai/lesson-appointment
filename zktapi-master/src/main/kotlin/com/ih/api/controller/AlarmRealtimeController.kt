package com.ih.api.controller

import com.fasterxml.jackson.databind.ObjectMapper
import com.ih.api.ResponseData
import com.ih.api.model.AlarmList
import com.ih.api.service.AlarmListService
import org.springframework.stereotype.Controller
import org.springframework.web.bind.annotation.*
import org.springframework.web.servlet.ModelAndView
import java.util.*
import javax.annotation.Resource

/* Alarmlist--获取当前系统状态：
alarmlist?companyID=xx
* */
@CrossOrigin("*")
@RequestMapping("/admin/alarm/")
@Controller
class AlarmRealtimeController {
    @Resource
    var _Realtime_service: AlarmListService? = null

    @GetMapping("get")
    @ResponseBody
    fun get(@RequestParam id: Int): ResponseData {
        val re = ResponseData()
        var result: AlarmList? = _Realtime_service?.get(id)
        re.putDataValue("result", result)
        return re;
    }


    @GetMapping("list")
    @ResponseBody
    fun list(@RequestParam(name = "searchCompanyID", defaultValue = "-1", required = false) companyID: Int): ModelAndView {
        var m = ModelAndView()
        m.viewName = "/admin/alarm/realTimeList"
        var items = _Realtime_service?.getPaging(companyID, 0, 1);

        m.addObject("companyID", companyID);
        m.addObject("bid", companyID);
        val jsonMap = HashMap<String, Any>();
        jsonMap["alrmStr"] = items!![0];
        val mapper = ObjectMapper() ;
        m.addObject("state", mapper.writeValueAsString(jsonMap));
        return m;
    }

    @PostMapping("getPaging")
    @ResponseBody
    fun getPaging(
        @RequestParam(name = "searchCompanyID", defaultValue = "2", required = true) companyID: Int,
        @RequestParam(name = "page", defaultValue = "1", required = false) offset: Int,
        @RequestParam(name = "pagesize", defaultValue = "1", required = false) pageSize: Int,
        @RequestParam(name = "sortname", defaultValue = "id", required = false) sortname: String,
        @RequestParam(name = "sortorder", defaultValue = "desc", required = false) sortorder: String
    ): String {
        var orderBy = sortname + " " + sortorder;
        var offset1 = (offset - 1) * pageSize;
        var items = _Realtime_service?.getPaging(companyID, offset1, pageSize);
        var counts = _Realtime_service?.getCount(companyID);

        val jsonMap = HashMap <String, Any> ();
        jsonMap["Rows"] = items!!
        jsonMap["Total"] = counts!!
        val mapper = ObjectMapper();
        return mapper.writeValueAsString(jsonMap);
    }

    @PostMapping("gethist")
    @ResponseBody
    fun gethist(
        @RequestParam(name = "searchCompanyID", defaultValue = "2", required = true) companyID: Int,

        @RequestParam(name = "page", defaultValue = "1", required = false) offset: Int,
        @RequestParam(name = "pagesize", defaultValue = "20", required = false) pageSize: Int,
        @RequestParam(name = "sortname", defaultValue = "id", required = false) sortname: String,
        @RequestParam(name = "sortorder", defaultValue = "desc", required = false) sortorder: String
    ): String {
       // var orderBy = sortname + " " + sortorder
        var offset1 = (offset - 1) * pageSize
        var items = _Realtime_service?.getHistList(companyID, offset1, pageSize);
        var counts = items!!.count();

        val jsonMap = HashMap<String, Any>()
        jsonMap["Rows"] = items
        jsonMap["Total"] = counts
        val mapper = ObjectMapper()

        return mapper.writeValueAsString(jsonMap)
    }
}

