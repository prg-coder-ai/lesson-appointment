package com.ih.api.controller

import com.fasterxml.jackson.databind.ObjectMapper
import com.ih.api.ResponseData
import com.ih.api.model.company
import com.ih.api.service.CompanyService
import org.springframework.stereotype.Controller
import org.springframework.web.bind.annotation.*
import org.springframework.web.servlet.ModelAndView
import org.springframework.web.servlet.mvc.support.RedirectAttributes
import java.util.*
import javax.annotation.Resource
@CrossOrigin("*")
@RequestMapping("/api/company")

@Controller
class CompanyApi {
    @Resource
    var _service: CompanyService? = null

    @GetMapping("get")
    @ResponseBody
    fun get(@RequestParam id: Int): ResponseData {
        val re = ResponseData()
        var result: company? = _service?.get(id)
        re.putDataValue("result", result)
        return re;
    }
   // @RequestMapping(value = "create", method = RequestMethod.POST)
    @PostMapping("create")
    @ResponseBody
    fun create(@RequestBody model: company): ResponseData {
        val re = ResponseData()
        re.putDataValue("input", model)
        var result = _service?.insert(model)
        re.putDataValue("result", result)
        return re;
    }

    @PostMapping("update")
    @ResponseBody
    fun update(@RequestBody model: company): ResponseData {
        val re = ResponseData()
        re.putDataValue("input", model)
        var result = _service?.update(model)
        re.putDataValue("result", result)
        return re;
    }

    @PostMapping("getPaging")
    @ResponseBody
    fun getPaging( @RequestParam(name = "searchCompanyName", defaultValue = "", required = false) name: String,
                    @RequestParam(name = "searchCompanyID", defaultValue = "-1", required = false) searchCompanyID: Int,
                  @RequestParam(name = "searchParentID", defaultValue = "-1", required = false) parentID: Int,
                  @RequestParam(name = "page", defaultValue = "1", required = true) offset: Int,
                  @RequestParam(name = "pagesize", defaultValue = "20", required = true) pageSize: Int,
                  @RequestParam(name = "sortname", defaultValue = "id", required = false) sortname: String,
                  @RequestParam(name = "sortorder", defaultValue = "asc", required = false) sortorder: String): String {

        var orderBy = sortname + " " + sortorder;

        var items = _service?.getPaging(name, searchCompanyID,parentID, (offset - 1) * pageSize, pageSize, orderBy)
        var counts = _service?.getCount(name, searchCompanyID,parentID)
        val jsonMap = HashMap<String, Any>()
        jsonMap["Rows"] = items!!
        jsonMap["count"] = counts!!
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
        re.putDataValue("input1", id)
        var result = _service?.delete(id)
        re.putDataValue("result", result)
        return re;
    }

    @PostMapping("getByName")
    @ResponseBody
    fun getByName(@RequestParam(name = "name", required = true) name: String, @RequestParam(name = "id", defaultValue = "0", required = false) id: Int): ResponseData {
        val re = ResponseData()
        var company = _service?.getByName(name)
           // re.putDataValue("name", name);//test
        re.putDataValue("result", 1)
        if (company != null && company.id > 0) {

            if (id == 0) {
                re.putDataValue("message", "公司名称已存在")
            } else if (company.id != id) {
                re.putDataValue("message", "公司名称已存在");
            }

            re.putDataValue("result", 0)
        }

        return re;
    }
}

