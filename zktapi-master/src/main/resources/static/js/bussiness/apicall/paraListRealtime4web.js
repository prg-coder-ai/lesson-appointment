/*
@RequestMapping("/admin/paralist/")
@Controller
class ParalistController {
    @Resource
    var _Realtime_service: ParalistRealtimeService? = null

    @GetMapping("get")
    @ResponseBody
    fun get(@RequestParam id: Int): ResponseData {
        val re = ResponseData()
        var result: Paralist? = _Realtime_service?.get(id)
        re.putDataValue("result", result)
        return re;
    }
//model defination
    @PostMapping("create")
    @ResponseBody
    fun create(@RequestBody model: Paralist): ResponseData {
    val re = ResponseData()
        re.putDataValue("result", 0)
        re.putDataValue("message", "NOT AVAILABLE")
    return re;
    }

    @PostMapping("update")
    @ResponseBody
    fun update(@RequestBody model: Paralist): ResponseData {
        val re = ResponseData()
        var result = _Realtime_service?.update(model)
        re.putDataValue("result", result)
        return re;
    }

    @GetMapping("realTimeList")
    @ResponseBody
    fun realTimeList(@RequestParam(name = "searchCompanyID", defaultValue = "-1", required = false) companyID: Int): ModelAndView {
        var m = ModelAndView()
        m.viewName = "/admin/paralist/realTimeList"
    m.addObject("showAll", "0");
    m.addObject("companyID", companyID);
        return m;
    }
    @PostMapping("getPaging")
    @ResponseBody
    fun getPaging(@RequestParam(name = "searchStationID", defaultValue = "2", required = true) StationID: Int,
                  @RequestParam(name = "searchSubID", defaultValue = "1", required = true) subID: Int,

                  @RequestParam(name = "page", defaultValue = "1", required = false) offset: Int,
                  @RequestParam(name = "pagesize", defaultValue = "20", required = false) pageSize: Int,
                  @RequestParam(name = "sortname", defaultValue = "id", required = false) sortname: String,
                  @RequestParam(name = "sortorder", defaultValue = "desc", required = false) sortorder: String): String {

        var orderBy = sortname + " " + sortorder
        var offset1=(offset-1)*pageSize
        var items = _Realtime_service?.getPaging(   StationID, subID,
                 offset1 , pageSize, orderBy);
        var counts = _Realtime_service?.getCount( StationID, subID );

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
        var result = _Realtime_service?.delete(id)
        re.putDataValue("result", result)
        return re;
    }
}*/

