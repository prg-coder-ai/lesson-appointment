package com.ih.api.controller

import com.fasterxml.jackson.databind.ObjectMapper
import com.ih.api.ResponseData
//import com.ih.api.common.GCJ02_BD09
//
import com.ih.api.model.rtustation
import com.ih.api.service.RtuStationService
import org.springframework.stereotype.Controller
import org.springframework.web.bind.annotation.*
import org.springframework.web.servlet.ModelAndView
import java.util.*
import javax.annotation.Resource

/*换热站远传参数设置---获取注册码和机组个数

* */
@CrossOrigin("*")
@RequestMapping("/admin/rtustation/")
@Controller
class RtuStationController {
    @Resource
    var _service: RtuStationService? = null

    @GetMapping("get")
    @ResponseBody
    fun get(@RequestParam id: Int): ResponseData {
        val re = ResponseData()
        var result: rtustation? = _service?.get(id)
        re.putDataValue("result", result)
        return re;
    }
//model definition ---TBD2020 --创建RtuStation行。
    @PostMapping("create")
    @ResponseBody
    fun create(@RequestBody model: rtustation): ResponseData {
            val re = ResponseData()
                var result = _service?.insert(model)
                re.putDataValue("result", result)
             return re;
    }

    @PostMapping("update") //
    @ResponseBody
    fun update(@RequestBody model: rtustation): ResponseData {
        val re = ResponseData()
        var result = _service?.update(model)
        re.putDataValue("result", result)
        return re;
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


    @GetMapping("list")
    @ResponseBody
    fun list(
            @RequestParam(name = "searchCompanyID", defaultValue = "-1", required = false) companyID: Int,
            @RequestParam(name = "searchStationID", defaultValue = "-1", required = false) stationID: Int
    ): ModelAndView {
        var m = ModelAndView()
        m.viewName = "/admin/rtustation/list"
        m.getModel().put("companyID", companyID);
        m.addObject("stationID", stationID);
        m.addObject("showAll", "1");
        return m;
    }

    @GetMapping("listonly")
    @ResponseBody
    fun listonly(  @RequestParam(name = "searchCompanyID", defaultValue = "-1", required = false) companyID: Int,
                   @RequestParam(name = "searchStationID", defaultValue = "-1", required = false) stationID: Int
    ): ModelAndView {
        var m = ModelAndView()
        m.viewName = "/admin/rtustation/list"
        m.getModel().put("companyID", companyID);

        m.addObject("stationID", stationID);
        m.addObject("showAll", "0");
        return m;
    }

    //TBD--传入分公司ID // @RequestParam(name = "searchCompanyID", defaultValue = "-1", required = false) companyID: Int,
    @GetMapping("getlist")
    @ResponseBody
    fun   getlist(  @RequestParam(name = "searchCompanyID", defaultValue = "-1", required = false) companyID: Int,
                    @RequestParam(name = "searchStationID", defaultValue = "-1", required = false) stationID: Int,
                   @RequestParam(name = "page", defaultValue = "1", required = true) offset: Int,
                   @RequestParam(name = "pagesize", defaultValue = "20", required = true) pageSize: Int,
                   @RequestParam(name = "orderBy", defaultValue = "id", required = false) orderBy: String,
                   @RequestParam(name = "sortorder", defaultValue = "asc", required = false) sortOrder: String): String {
        var offset1=(offset-1)*pageSize ;
        var orderString = orderBy + " " + sortOrder;
        var items = _service?.getPaging(companyID,stationID,"",offset1,pageSize, orderString );
        var counts = _service?.getCount(companyID,stationID );

        val jsonMap = HashMap<String, Any>()
        jsonMap["Rows"] = items!!
        jsonMap["Total"] = counts!!
        val mapper = ObjectMapper()
        var result = mapper.writeValueAsString(jsonMap)

        return result
    }

    @PostMapping("getPaging")
    @ResponseBody
    fun getPaging( @RequestParam(name = "bindCompanyID", defaultValue = "-1", required = false) bindCompanyID: Int,
            @RequestParam(name = "searchCompanyID", defaultValue = "-1", required = false) companyID: Int,
                   @RequestParam(name = "searchStationID", defaultValue = "-1", required = false) stationID: Int,
                   @RequestParam(name = "searchName", defaultValue = "", required = false) stationName: String ,
                  @RequestParam(name = "page", defaultValue = "1", required = true) offset: Int,
                  @RequestParam(name = "pagesize", defaultValue = "20", required = true) pageSize: Int,
                  @RequestParam(name = "orderBy", defaultValue = "id", required = false) orderBy: String,
                  @RequestParam(name = "sortorder", defaultValue = "asc", required = false) sortOrder: String): String {
        // print("Get in A")
        var bid  =companyID
        if( bid ==  -1 )
            bid = bindCompanyID
       // print(bindCompanyID)

        var orderBy1 = orderBy + " " + sortOrder
        var offset1=(offset-1)*pageSize
        var items = _service?.getPaging(bid,  stationID, stationName,offset1 , pageSize, orderBy1);
        var counts = _service?.getCount(bid ,stationID);

        val jsonMap = HashMap<String, Any>()
        jsonMap["Rows"] = items!!
        jsonMap["Total"] = counts!!
        val mapper = ObjectMapper()
        var result = mapper.writeValueAsString(jsonMap)

        return result
    }

    @PostMapping("getbyname")
    @ResponseBody
    fun getByName(
            @RequestParam(name = "StatioName", defaultValue = "", required = true) StatioName: String ): String {

        var items = _service?.getByName(StatioName);
        var counts  = 1 ;
        val jsonMap = HashMap<String, Any>()
        jsonMap["Rows"] = items!!
        jsonMap["Total"] = counts
        val mapper = ObjectMapper()
        var result = mapper.writeValueAsString(jsonMap)
        return result
    }

}

