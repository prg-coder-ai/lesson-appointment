package com.ih.api.controller4api

import com.fasterxml.jackson.databind.ObjectMapper
import com.ih.api.ResponseData
import com.ih.api.model.rtuOnline
import com.ih.api.service.rtuOnlineService
import org.springframework.stereotype.Controller
import org.springframework.web.bind.annotation.*
import org.springframework.web.servlet.ModelAndView
import java.util.*
import javax.annotation.Resource

@CrossOrigin("*")
@RequestMapping("/api/online")
@Controller
class rtuOnlineControllerApi {
    @Resource
    var _Realtime_service:rtuOnlineService? = null

    @GetMapping("get")
    @ResponseBody
    fun get(@RequestParam id: Int): ResponseData {
        val re = ResponseData()
        var result: rtuOnline? = _Realtime_service?.get(id)
        re.putDataValue("result", result)
        return re;
    }


    @GetMapping("list")
    @ResponseBody
    fun list(@RequestParam(name = "searchCompanyID", defaultValue = "-1", required = false) companyID: Int,
             @RequestParam(name = "searchStationID", defaultValue = "-1", required = false) stationID: Int):
            ModelAndView {
        var m = ModelAndView()
        m.viewName = "/admin/alarm/rtuOnline"
      //  m.serchCompanyID =
        m.addObject("showAll", "0");
        m.addObject("companyID", companyID);
        m.addObject("bid", companyID);
        return m;
    }

    @PostMapping("getPaging")
    @ResponseBody
    fun getPaging(
        @RequestParam(name = "searchCompanyID", defaultValue = "2", required = true) companyID: Int,
        @RequestParam(name = "searchStationID", defaultValue = "-1", required = false) stationID: Int,
        @RequestParam(name = "page", defaultValue = "1", required = false) offset: Int,
        @RequestParam(name = "pagesize", defaultValue = "1", required = false) pageSize: Int,
        @RequestParam(name = "sortname", defaultValue = "id", required = false) sortname: String,
        @RequestParam(name = "sortorder", defaultValue = "desc", required = false) sortorder: String
    ): String {

        var orderBy = sortname + " " + sortorder
        var offset1 = (offset - 1) * pageSize
        var items = _Realtime_service?.getPaging(companyID, stationID, orderBy,offset1, pageSize);
        var counts = _Realtime_service?.getCount(companyID, stationID);

        val jsonMap = HashMap<String, Any>()
        jsonMap["Rows"] = items!!
        jsonMap["Total"] = counts!!
        val mapper = ObjectMapper()
        return mapper.writeValueAsString(jsonMap)
    }

    @PostMapping("gethist")
    @ResponseBody
    fun gethist(
        @RequestParam(name = "searchCompanyID", defaultValue = "2", required = true) companyID: Int,
        @RequestParam(name = "searchStationID", defaultValue = "-1", required = false) stationID: Int,
        @RequestParam(name = "page", defaultValue = "1", required = false) offset: Int,
        @RequestParam(name = "pagesize", defaultValue = "20", required = false) pageSize: Int,
        @RequestParam(name = "sortname", defaultValue = "id", required = false) sortname: String,
        @RequestParam(name = "sortorder", defaultValue = "desc", required = false) sortorder: String
    ): String {
        var orderBy = sortname + " " + sortorder
        var offset1 = (offset - 1) * pageSize
        var items = _Realtime_service?.getHistList(companyID,stationID, orderBy , offset1, pageSize);
        var counts = items!!.count();

        val jsonMap = HashMap<String, Any>()
        jsonMap["Rows"] = items
        jsonMap["Total"] = counts
        val mapper = ObjectMapper()

        return mapper.writeValueAsString(jsonMap)
    }
}

