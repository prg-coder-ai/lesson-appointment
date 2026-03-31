/*
@RequestMapping("/admin/heatexchangerunit/")
@Controller
class HeatexchangerunitController {
    @Resource
    var _service: HeatexchangerunitService? = null

    @GetMapping("get")
    @ResponseBody
    fun get(@RequestParam id: Int): ResponseData {
        val re = ResponseData()
        var result: Heatexchangerunit? = _service?.get(id)
        re.putDataValue("result", result)
        return re;
    }

    @PostMapping("create")
    @ResponseBody
    fun create(@RequestBody model: Heatexchangerunit): ResponseData {
        val re = ResponseData()
        var heu = _service?.getByName(model.unitNumber, model.stationID)
        if (heu != null && heu.id > 0) {
            re.putDataValue("result", 0)
            re.putDataValue("message", "换热机组已存在")
            return re
        }
        var result = _service?.insert(model)
        re.putDataValue("result", result)
        return re;
    }

    @PostMapping("update")
    @ResponseBody
    fun update(@RequestBody model: Heatexchangerunit): ResponseData {
        val re = ResponseData()
        var heu = _service?.get(model.id)
        if (heu != null && heu.id > 0 && heu.id != model.id) {
            re.putDataValue("result", Integer.valueOf(0))
            re.putDataValue("message", "换热机组已存在")
            return re
        }
        var result = _service?.update(model)
        re.putDataValue("result", result)
        return re;
    }

    @GetMapping("list")
    @ResponseBody
    fun list(@RequestParam(name = "searchCompanyID", defaultValue = "-1", required = false) companyID: Int): ModelAndView {
        var m = ModelAndView()
        m.viewName = "/admin/heatexchangerunit/list"
        m.addObject("showAll", "1");
        m.addObject("companyID", companyID);
        return m;
    }
    @GetMapping("listonly")
    @ResponseBody
    fun listonly(@RequestParam(name = "searchCompanyID", defaultValue = "-1", required = false) companyID: Int): ModelAndView {
        var m = ModelAndView()
        m.viewName = "/admin/heatexchangerunit/list"
        m.addObject("showAll", "0");
        m.addObject("companyID", companyID);
        return m;
    }
    @PostMapping("getPaging")
    @ResponseBody
    fun getPaging(@RequestParam(name = "bindCompanyID", defaultValue = "-1", required = false) bindCompanyID: Int,
            @RequestParam(name = "searchUnitNumber", defaultValue = "", required = false) unitNumber: String,
                  @RequestParam(name = "searchCrewID", defaultValue = "", required = false) searchCrewID: String,
                  @RequestParam(name = "searchCompanyID", defaultValue = "-1", required = false) companyID: Int,
                  @RequestParam(name = "searchStationID", defaultValue = "-1", required = false) stationID: Int,
                  @RequestParam(name = "page", defaultValue = "1", required = true) offset: Int,
                  @RequestParam(name = "pagesize", defaultValue = "20", required = true) pageSize: Int,
                  @RequestParam(name = "sortname", defaultValue = "id", required = false) sortname: String,
                  @RequestParam(name = "sortorder", defaultValue = "asc", required = false) sortorder: String): String {

        val orderBy = sortname + " " + sortorder
        var bid  = bindCompanyID
        if( bid ==  -1 )
            bid = companyID
        var items = _service?.getPaging(unitNumber,searchCrewID, bid, stationID, (offset - 1) * pageSize, pageSize, orderBy)
        var counts = _service?.getCount(unitNumber,searchCrewID, bid, stationID)

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
        re.putDataValue("result", result)
        return re;
    }

    @PostMapping("getByName")
    @ResponseBody
    fun getByName(@RequestParam unitNumber: String, @RequestParam stationID: Int, @RequestParam id: Int): ResponseData {
        val re = ResponseData()
        var heu = _service?.getByName(unitNumber, stationID)
        if (heu != null && heu.id > 0)
            if (id == 0) {
                re.putDataValue("result", 0)
                re.putDataValue("message", "换热机组已存在")
            } else if (heu.id != id) {
                re.putDataValue("result", 0)
                re.putDataValue("message", "换热机组已存在")
            }
        return re
    }
}
*/
