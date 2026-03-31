/*
@RequestMapping("/admin/company/")
@Controller
class CompanyController {
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

    @PostMapping("create")
    @ResponseBody
    fun create(@RequestBody model: company): ResponseData {
        val re = ResponseData()
        var result = _service?.insert(model)
        re.putDataValue("input", model)
        re.putDataValue("result", result)
        return re;
    }

    @PostMapping("update")
    @ResponseBody
    fun update(@RequestBody model: company): ResponseData {
        val re = ResponseData()
        var result = _service?.update(model)
        re.putDataValue("result", result)
        return re;
    }

    @GetMapping("list")
    @ResponseBody
    fun list(@RequestParam(name = "searchCompanyID", defaultValue = "-1", required = false) companyID: Int,
             @RequestParam(name = "bindCompanyID", defaultValue = "-1", required = false) bindCompanyID: Int): ModelAndView {
        var m = ModelAndView()
        m.viewName = "/admin/company/list"
        m.addObject("showAll", "1");
        m.addObject("companyID", companyID);
        m.addObject("bindCompanyID", bindCompanyID);
        return m;
    }
    @GetMapping("listonly")
    @ResponseBody
    fun listonly(@RequestParam(name = "searchCompanyID", defaultValue = "-1", required = false) companyID: Int):
            ModelAndView {
                var m = ModelAndView()
                m.viewName = "/admin/company/list"
                m.addObject("showAll", "0");
                m.addObject("companyID", companyID);
                return m;
    }

    @PostMapping("getPaging")
    @ResponseBody
    fun getPaging(@RequestParam(name = "bindCompanyID", defaultValue = "-1", required = false) bindCompanyID: Int,
            @RequestParam(name = "searchCompanyName", defaultValue = "", required = false) name: String,
                  @RequestParam(name = "searchParentID", defaultValue = "-1", required = false) parentID: Int,
                  @RequestParam(name = "page", defaultValue = "1", required = true) offset: Int,
                  @RequestParam(name = "pagesize", defaultValue = "20", required = true) pageSize: Int,
                  @RequestParam(name = "sortname", defaultValue = "id", required = false) sortname: String,
                  @RequestParam(name = "sortorder", defaultValue = "asc", required = false) sortorder: String): String {

        var orderBy = sortname + " " + sortorder;
        var items = _service?.getPaging(name, bindCompanyID,parentID, (offset - 1) * pageSize, pageSize, orderBy)
        var counts = _service?.getCount(name, bindCompanyID,parentID)

        val jsonMap = HashMap<String, Any>()
        jsonMap["Rows"] = items!!
        jsonMap["Total"] = counts!!
        val mapper = ObjectMapper()
        var result = mapper.writeValueAsString(jsonMap)
        return result
    }


    @PostMapping("delete")
    @ResponseBody
    fun delete(@RequestParam id: Int): ResponseData {
        val re = ResponseData()
        var result = _service?.delete(id)
        re.putDataValue("input2", id)
        re.putDataValue("result", result)
        return re;
    }

    @PostMapping("getByName")
    @ResponseBody
    fun getByName(@RequestParam(name = "name", required = true) name: String, @RequestParam(name = "id", defaultValue = "0", required = false) id: Int): ResponseData {
        val re = ResponseData()
        var company = _service?.getByName(name)
        if (company != null && company.id > 0) {
            if (id == 0) {
                re.putDataValue("name", name);//test
                re.putDataValue("result", 0)
                re.putDataValue("message", "公司名称已存在")
            } else if (company.id != id) {
                re.putDataValue("result", 0);
                re.putDataValue("message", "公司名称已存在");
            }
        }

        return re;
    }
}
*/
