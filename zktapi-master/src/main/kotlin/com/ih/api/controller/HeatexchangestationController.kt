package com.ih.api.controller

import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.stereotype.Controller
import org.springframework.web.servlet.ModelAndView
import java.util.*
import javax.annotation.Resource
import com.ih.api.ResponseData
import com.ih.api.model.Heatexchangestation
import com.ih.api.service.HeatexchangestationService
import org.springframework.web.bind.annotation.*
import java.util.HashMap
@CrossOrigin("*")
@RequestMapping("/admin/heatexchangestation/")
@Controller
class HeatexchangestationController {
    @Resource
    var _service: HeatexchangestationService? = null

    @GetMapping("get")
    @ResponseBody
    fun get(@RequestParam id: Int): ResponseData {
        val re = ResponseData()
        var result: Heatexchangestation? = _service?.get(id)
        re.putDataValue("result", result)
        return re;
    }

    @PostMapping("create")
    @ResponseBody
    fun create(@RequestBody model: Heatexchangestation): ResponseData {
        val re = ResponseData()
        var result = _service?.insert(model)
        re.putDataValue("result", result)
        return re;
    }

    @PostMapping("update")
    @ResponseBody
    fun update(@RequestBody model: Heatexchangestation): ResponseData {
        val re = ResponseData()
        var result = _service?.update(model)
        re.putDataValue("result", result)
        return re;
    }

    @GetMapping("list")
    @ResponseBody
    fun list(@RequestParam(name = "searchCompanyID", defaultValue = "-1", required = false) companyID: Int):
            ModelAndView {
        var m = ModelAndView()
        m.viewName = "/admin/heatexchangestation/list"
        m.addObject("showAll", "1");
        m.addObject("companyID", companyID);
        return m;
    }

    @GetMapping("listonly")
    @ResponseBody
    fun listonly(@RequestParam(name = "searchCompanyID", defaultValue = "-1", required = false) companyID: Int): ModelAndView {
        var m = ModelAndView()
        m.viewName = "/admin/heatexchangestation/list"
        m.addObject("showAll", "0");
        m.getModel().put("companyID", companyID);
        return m;
    }
    @GetMapping("getlist")
    @ResponseBody
    fun getlist(@RequestParam(name = "searchName", defaultValue = "", required = false) name: String,
                @RequestParam(name = "searchCompanyID", defaultValue = "-1", required = false) companyID: Int,
                @RequestParam(name = "parentID", defaultValue = "-1", required = false) parentID: Int,
                @RequestParam(name = "page", defaultValue = "1", required = true) offset: Int,
                @RequestParam(name = "pagesize", defaultValue = "20", required = true) pageSize: Int,
                @RequestParam(name = "sortname", defaultValue = "id", required = false) sortname: String,
                @RequestParam(name = "sortorder", defaultValue = "asc", required = false) sortorder: String) :String {
        var orderBy = sortname + " " + sortorder;
        var items = _service?.getPaging(name, companyID, parentID, (offset - 1) * pageSize, pageSize, orderBy )
        var counts = _service?.getCount( name, companyID, parentID)

        val jsonMap = HashMap<String, Any>()
        jsonMap["Rows"] = items!!
        jsonMap["Total"] = counts!!
        val mapper = ObjectMapper()
        var result = mapper.writeValueAsString(jsonMap)
        return result
    }
    @PostMapping("getPaging")
    @ResponseBody
    fun getPaging(@RequestParam(name = "bindCompanyID", defaultValue = "-1", required = false) bindCompanyID: Int,
            @RequestParam(name = "searchName", defaultValue = "", required = false) name: String,
                  @RequestParam(name = "searchCompanyID", defaultValue = "-1", required = false) companyID: Int,
                  @RequestParam(name = "parentID", defaultValue = "-1", required = false) parentID: Int,
                  @RequestParam(name = "page", defaultValue = "1", required = true) offset: Int,
                  @RequestParam(name = "pagesize", defaultValue = "20", required = true) pageSize: Int,
                  @RequestParam(name = "sortname", defaultValue = "id", required = false) sortname: String,
                  @RequestParam(name = "sortorder", defaultValue = "asc", required = false) sortorder: String): String {
        var orderBy = sortname + " " + sortorder;
        var bid  = bindCompanyID
        if( bid ==  -1 )
            bid = companyID
        var items = _service?.getPaging(name, bid, parentID, (offset - 1) * pageSize, pageSize, orderBy)
        var counts = _service?.getCount(name, bid, parentID)

        val jsonMap = HashMap<String, Any>()
        jsonMap["Rows"] = items!!
        jsonMap["Total"] = counts!!
        val mapper = ObjectMapper()
        var result = mapper.writeValueAsString(jsonMap)
        return result
    }
    @PostMapping("getStations")
    @ResponseBody
    fun getStations(    @RequestParam(name = "CompanyID", defaultValue = "-1", required = false) companyID: Int,
                  @RequestParam(name = "page", defaultValue = "1", required = true) offset: Int,
                  @RequestParam(name = "pagesize", defaultValue = "20", required = true) pageSize: Int,
                  @RequestParam(name = "sortname", defaultValue = "id", required = false) sortname: String,
                  @RequestParam(name = "sortorder", defaultValue = "asc", required = false) sortorder: String): String {
        var orderBy = sortname + " " + sortorder;

        var items = _service?.getStations( companyID,  (offset - 1) * pageSize, pageSize, orderBy)
        var counts = _service?.getCount("", companyID, -1)

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

    @PostMapping("getByName")
    @ResponseBody
    fun getByName(@RequestParam(name = "name", required = true) name: String,
                  @RequestParam(name = "companyID", defaultValue = "0", required = false) companyID: Int,
                  @RequestParam(name = "id", defaultValue = "0", required = false) id: Int): ResponseData {

        val re = ResponseData()
        var heatexchangestation = _service?.getByName(name, companyID)
        if (heatexchangestation != null && heatexchangestation.id > 0)
            if (id == 0) {
                re.putDataValue("result", 0);
                re.putDataValue("message", "站名已存在");
            } else
                if (heatexchangestation.id != id) {
                    re.putDataValue("result", 0);
                    re.putDataValue("message", "站名已存在");
                }
        return re;
    }
}

