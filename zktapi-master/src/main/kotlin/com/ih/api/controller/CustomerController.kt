package com.ih.api.controller

import com.fasterxml.jackson.databind.ObjectMapper
import com.ih.api.model.CustomerView
import com.ih.api.ResponseData
import com.ih.api.model.Customer
import com.ih.api.service.CustomerService
import org.springframework.stereotype.Controller
import org.springframework.web.bind.annotation.*
import org.springframework.web.servlet.ModelAndView
import java.util.*
import javax.annotation.Resource
import kotlin.jvm.internal.Intrinsics

@CrossOrigin("*")
@RequestMapping("/admin/customer/")
@Controller
class CustomerController {
    @Resource
    var _service: CustomerService? = null

    @GetMapping("get")
    @ResponseBody
    fun get(@RequestParam id: Int): ResponseData {
        val re = ResponseData()
        var result: Customer? = _service?.get(id)
        re.putDataValue("result", result)
        return re;
    }

    @PostMapping("create")
    @ResponseBody
    fun create(@RequestBody model: Customer): ResponseData {
        val re = ResponseData()
        var customer = _service?.getByName(model.name, model.phoneNumber)
        if (customer != null && customer.id > 0) {
            re.putDataValue("result", 0)
            re.putDataValue("message", "姓名和电话已存在")
            return re
        }
        var result = _service?.insert(model)
        re.putDataValue("result", result)
        return re;
    }

    @PostMapping("update")
    @ResponseBody
    fun update(@RequestBody model: Customer): ResponseData {
        val re = ResponseData()
        var customer = _service?.getByName(model.name, model.phoneNumber)
        if (customer != null && customer.id > 0 && customer.id != model.id) {
            re.putDataValue("result", 0)
            re.putDataValue("message", "姓名和电话已存在")
            return re
        }
        var result = _service?.update(model)
        re.putDataValue("result", result)
        return re;
    }

    @GetMapping("list")
    @ResponseBody
    fun list(): ModelAndView {
        var m = ModelAndView()
        m.viewName = "/admin/customer/list"
        return m;
    }

    @PostMapping("getPaging")
    @ResponseBody
    fun getPaging(@RequestParam(name = "searchName", defaultValue = "", required = true) name: String,
                  @RequestParam(name = "searchPhoneNumber", defaultValue = "", required = true) phoneNumber: String,
                  @RequestParam(name = "searchCID", defaultValue = "", required = true) cID: String,
                  @RequestParam(name = "page", defaultValue = "1", required = true) offset: Int,
                  @RequestParam(name = "pagesize", defaultValue = "20", required = true) pageSize: Int,
                  @RequestParam(name = "sortname", defaultValue = "id", required = false) sortname: String,
                  @RequestParam(name = "sortorder", defaultValue = "asc", required = false) sortorder: String): String {

        val orderBy = sortname + " " + sortorder
        var items = _service?.getPaging(name, phoneNumber, cID, (offset - 1) * pageSize, pageSize, orderBy)
        var counts = _service?.getCount(name, phoneNumber, cID)

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

    @PostMapping("getAutoSearch")
    @ResponseBody
    fun getAutoSearch(@RequestParam(name = "name", defaultValue = "", required = true) name: String): String {
        var items = _service?.getPaging(name, "", "", 0, 99999, "Name asc")
        val list = ArrayList<CustomerView>()
        if (items != null) {
            val iterator = items.iterator()
            while (iterator.hasNext()) {
                val item = iterator.next()
                var cView = CustomerView()
                cView.id = item.id
                cView.value = (StringBuilder().append(item.name).append(" (").append(item.phoneNumber).append(")").toString())
                list.add(cView)
            }
        }
        val mapper = ObjectMapper()
        val result = mapper.writeValueAsString(list)
        Intrinsics.checkExpressionValueIsNotNull(result, "result")
        return result
    }

    @PostMapping("getByName")
    @ResponseBody
    fun getByName(@RequestParam(name = "name", required = true) name: String,
                  @RequestParam(name = "phoneNumber", defaultValue = "0", required = false) phoneNumber: String,
                  @RequestParam(name = "id", defaultValue = "0", required = false) id: Int): ResponseData {
        val re = ResponseData()
        var customer = _service?.getByName(name, phoneNumber)
        if (customer != null && customer.id > 0)
            if (id === 0) {
                re.putDataValue("result", 0)
                re.putDataValue("message", "姓名和电话已存在")
            } else if (customer.id != id) {
                re.putDataValue("result", 0)
                re.putDataValue("message", "姓名和电话已存在")
            }
        return re
    }

}

