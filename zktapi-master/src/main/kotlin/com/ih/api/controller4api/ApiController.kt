package com.ih.api.controller4api

import com.fasterxml.jackson.databind.ObjectMapper
import com.ih.api.ApiResponseData
import com.ih.api.ResponseData
import com.ih.api.auth.Audience
import com.ih.api.auth.JwtHelper
import com.ih.api.common.Encode
import com.ih.api.common.MD5Encrpyt
import com.ih.api.service.*

import org.springframework.stereotype.Controller
import org.springframework.web.bind.annotation.*

import java.util.*
import javax.annotation.Resource


/* paralist--机组参数api
/api/paralist?rid=xx&sid=xx/
*  "http://localhost:8100";*/


//@CrossOrigin("/**")
@RequestMapping("/api/")
 //ok @CrossOrigin("http://localhost:8100")
@CrossOrigin("*")
//@CrossOrigin("http://192.168.0.102")
@Controller
class ApiController {
    //test
    @GetMapping("test")
    @ResponseBody
    fun Test(): ApiResponseData
    {
        val responseData = ApiResponseData()
        responseData.putDataValue("name","test")
        responseData.putDataValue("count", 1)
       // responseData.putDataValue("result","ok")
        return responseData
    }
    @Resource
   var _service_station: HeatexchangestationService? = null
    @GetMapping("stationlist")
    @ResponseBody
    fun stationlist(
            @RequestParam(name = "searchCompanyID", defaultValue = "-1", required = false) companyID: Int,
            @RequestParam(name = "parentID", defaultValue = "-1", required = false) parentID: Int,
            @RequestParam(name = "page", defaultValue = "1", required = true) offset: Int,
            @RequestParam(name = "pagesize", defaultValue = "20", required = true) pageSize: Int,
            @RequestParam(name = "sortname", defaultValue = "id", required = false) sortname: String,
            @RequestParam(name = "sortorder", defaultValue = "asc", required = false) sortorder: String)
        : ApiResponseData    {
        var orderBy = sortname + " " + sortorder;
        var items = _service_station?.getPaging("", companyID, parentID, (offset - 1) * pageSize, pageSize, orderBy )
        var counts = _service_station?.getCount( "", companyID, parentID)

        val responseData = ApiResponseData();
        responseData.putDataValue("count",counts);
        responseData.putDataValue("Rows",items);
        return responseData;

    }

    @Resource
    var _online_service: rtuOnlineService? = null
    @GetMapping("getonline")
    @ResponseBody
    fun getonline(
        @RequestParam(name = "searchCompanyID", defaultValue = "0", required = true) companyID: Int,
        @RequestParam(name = "searchStationID", defaultValue = "-1", required = false) stationID: Int,
        @RequestParam(name = "page", defaultValue = "1", required = false) offset: Int,
        @RequestParam(name = "pagesize", defaultValue = "1", required = false) pageSize: Int,
        @RequestParam(name = "sortname", defaultValue = "id", required = false) sortname: String,
        @RequestParam(name = "sortorder", defaultValue = "desc", required = false) sortorder: String
    ): ApiResponseData {
        var orderBy = sortname + " " + sortorder
        var offset1 = (offset - 1) * pageSize
        var items = _online_service?.getPaging(companyID, stationID, orderBy,offset1, pageSize);
        var counts = _online_service?.getCount(companyID, stationID);

        val responseData = ApiResponseData();
        responseData.putDataValue("count",counts!!);
        responseData.putDataValue("Rows",items!!);
        return responseData;
    }


    @Resource
    var _alarm_service: AlarmListService? = null
    @GetMapping("getalarm")
    @ResponseBody
    fun getalarm(
        @RequestParam(name = "searchCompanyID", defaultValue = "0", required = false) companyID: Int,
        @RequestParam(name = "page", defaultValue = "1", required = false) offset: Int,
        @RequestParam(name = "pagesize", defaultValue = "20", required = false) pageSize: Int
    ): ApiResponseData{
        var offset1 = (offset - 1) * pageSize
        var items = _alarm_service?.getPaging(companyID, offset1, pageSize);
        var counts = _alarm_service?.getCount(companyID);

        val responseData = ApiResponseData();
        responseData.putDataValue("count",counts!!);
        responseData.putDataValue("Rows",items!!);
        return responseData;
    }

    @GetMapping("alarmhist")
    @ResponseBody
    fun getAlarmHist(
        @RequestParam(name = "searchCompanyID", defaultValue = "2", required = true) companyID: Int,
        @RequestParam(name = "page", defaultValue = "1", required = false) offset: Int,
        @RequestParam(name = "pagesize", defaultValue = "20", required = false) pageSize: Int,
        @RequestParam(name = "sortname", defaultValue = "id", required = false) sortname: String,
        @RequestParam(name = "sortorder", defaultValue = "desc", required = false) sortorder: String
    ): ApiResponseData {
       // var orderBy = sortname + " " + sortorder
        var offset1 = (offset - 1) * pageSize
        var items = _alarm_service?.getHistList(companyID, offset1, pageSize);
        var counts = items!!.count();

        val responseData = ApiResponseData();
        responseData.putDataValue("count",counts);
        responseData.putDataValue("Rows",items);
        return responseData;
    }


    @Resource
    var _company_service: CompanyService? = null
    //读取公司列表----指定公司 -限定指定id /api/getCompanyList
    @GetMapping("getCompanyList")
    @ResponseBody
    fun getCompanyList( @RequestParam(name = "searchCompanyID", defaultValue = "-1", required = false) CompanyID:
                        Int,
                        @RequestParam(name = "searchCompanyName", defaultValue = "", required = false) cpName: String,
                        @RequestParam(name = "parentID", defaultValue = "-1", required = false) parentID: Int,
                        @RequestParam(name = "page", defaultValue = "1", required = false) offset: Int,
                     @RequestParam(name = "pagesize", defaultValue = "20", required = false) pageSize: Int,
                     @RequestParam(name = "sortname", defaultValue = "id", required = false) sortname: String,
                     @RequestParam(name = "sortorder", defaultValue = "desc", required = false) sortorder: String):
            ApiResponseData {
        var orderBy = sortname + " " + sortorder
        var offset1=(offset-1)*pageSize
        var items = _company_service?.getPaging(cpName,CompanyID,parentID, offset1 , pageSize, orderBy);
        var counts = _company_service?.getCount(cpName,CompanyID,parentID);

        val responseData = ApiResponseData()
        responseData.putDataValue("sid",CompanyID)
        responseData.putDataValue("count",counts!!)
         responseData.putDataValue("Rows",items!!)
       // responseData.putDataValue("rows",items!!)
        return responseData
    }

   // @Resource
    // var _company_service: CompanyService? = null
    //读取公司列表----指定公司 --原始方法
    @PostMapping("pgetCompanyList")
    @ResponseBody
    fun pgetCompanyList( @RequestParam(name = "searchCompanyID", defaultValue = "-1", required = false) CompanyID:
                         Int,
                         @RequestParam(name = "searchCompanyName", defaultValue = "", required = false) cpName: String,
                        @RequestParam(name = "bindCompanyID", defaultValue = "-1", required = false) bindCompanyID:
                         Int,
                        @RequestParam(name = "page", defaultValue = "1", required = false) offset: Int,
                        @RequestParam(name = "pagesize", defaultValue = "20", required = false) pageSize: Int,
                        @RequestParam(name = "sortname", defaultValue = "id", required = false) sortname: String,
                        @RequestParam(name = "sortorder", defaultValue = "desc", required = false) sortorder: String):
            String {
        var orderBy = sortname + " " + sortorder
        var offset1=(offset-1)*pageSize
        var items = _company_service?.pgetPaging(cpName,CompanyID,bindCompanyID, offset1 , pageSize, orderBy);
        var counts = _company_service?.getCount(cpName,CompanyID,bindCompanyID);

       /* 下面的数据，输出与原页面getPaging的一致， */
        val jsonMap = HashMap<String, Any>()
        jsonMap["Rows"] = items!!
        jsonMap["count"] = counts!!
        jsonMap["bid"] = bindCompanyID
        val mapper = ObjectMapper()
        var result = mapper.writeValueAsString(jsonMap)

        return result
    }
    @GetMapping("ggetCompanyList")
    @ResponseBody
    fun ggetCompanyList( @RequestParam(name = "searchCompanyID", defaultValue = "-1", required = false) CompanyID:
                         Int,
                         @RequestParam(name = "searchCompanyName", defaultValue = "", required = false) cpName: String,
                         @RequestParam(name = "bindCompanyID", defaultValue = "-1", required = false) bindCompanyID: Int,
                         @RequestParam(name = "page", defaultValue = "1", required = false) offset: Int,
                         @RequestParam(name = "pagesize", defaultValue = "20", required = false) pageSize: Int,
                         @RequestParam(name = "sortname", defaultValue = "id", required = false) sortname: String,
                         @RequestParam(name = "sortorder", defaultValue = "desc", required = false) sortorder: String):
            String {
        var orderBy = sortname + " " + sortorder
        var offset1=(offset-1)*pageSize
        var items = _company_service?.pgetPaging(cpName,CompanyID,bindCompanyID, offset1 , pageSize, orderBy);
        var counts = _company_service?.getCount(cpName,CompanyID,bindCompanyID);

        /* 下面的数据，输出与原页面getPaging的一致， */
        val jsonMap = HashMap<String, Any>()
        jsonMap["Rows"] = items!!
        jsonMap["count"] = counts!!
        jsonMap["bid"] = bindCompanyID
        val mapper = ObjectMapper()
        var result = mapper.writeValueAsString(jsonMap)

        return result
    }
    @Resource
    var _RtuStation_service2: RtuStationService? = null
    //读取换热站列表----指定公司
    @GetMapping("getStationList")
    @ResponseBody
    fun getStationList( @RequestParam(name = "companyID", defaultValue = "-1", required = false) companyID: Int,
                     @RequestParam(name = "searchStationID", defaultValue = "-1", required = false) stationID: Int,
                  @RequestParam(name = "page", defaultValue = "1", required = false) offset: Int,
                  @RequestParam(name = "pagesize", defaultValue = "20", required = false) pageSize: Int,
                  @RequestParam(name = "sortname", defaultValue = "id", required = false) sortname: String,
                  @RequestParam(name = "sortorder", defaultValue = "desc", required = false) sortorder: String):
            ApiResponseData {

        var orderBy = sortname + " " + sortorder
        var offset1=(offset-1)*pageSize
        var items = _RtuStation_service2?.getPaging(companyID,stationID, "",offset1 , pageSize, orderBy);
        var counts = _RtuStation_service2?.getCount(companyID,stationID);

        val responseData = ApiResponseData()
        responseData.putDataValue("companyID",companyID)
        responseData.putDataValue("stationID",stationID)
        responseData.putDataValue("count",counts!!)
        responseData.putDataValue("Rows",items!!)
        return responseData;
    }


    @Resource
    var stationUnit_service: StationUnitService? = null
    //读取换热站机组信息列表----指定公司、换热站
    @GetMapping("getUnitList")
    @ResponseBody
    fun getUnitList(    @RequestParam(name = "companyID", defaultValue = "-1", required = true) companyID: Int,
                        @RequestParam(name = "stationID", defaultValue = "-1", required = true) stationID: Int,
                        @RequestParam(name = "page", defaultValue = "1", required = false) offset: Int,
                        @RequestParam(name = "pagesize", defaultValue = "20", required = false) pageSize: Int
              ):
            ApiResponseData {
        var offset1=(offset-1)*pageSize
        var items = stationUnit_service?.getPaging(companyID,stationID, offset1 , pageSize);
        var counts = stationUnit_service?.getCount(companyID,stationID);

        val responseData = ApiResponseData()
        responseData.putDataValue("count",counts!!)
        responseData.putDataValue("Rows",items!!)
        return responseData
    }


    @Resource
    var _Realtime_service: ParalistRealtimeService? = null
    //获取指定机组的参数，按时间排序。
    @GetMapping("getpara")
    @ResponseBody
    fun getpara(@RequestParam(name = "stationid", defaultValue = "2", required = true) StationID: Int,
                @RequestParam(name = "subid", defaultValue = "1", required = true) subID: Int,
                @RequestParam(name = "page", defaultValue = "1", required = false) offset: Int,
                @RequestParam(name = "pagesize", defaultValue = "20", required = false) pageSize: Int,
                @RequestParam(name = "sortname", defaultValue = "id", required = false) sortname: String,
                @RequestParam(name = "sortorder", defaultValue = "desc", required = false) sortorder: String):
            ApiResponseData{

        var orderBy = sortname + " " + sortorder
        var offset1=(offset-1)*pageSize
        var items = _Realtime_service?.getPaging(   StationID, subID,
                offset1 , pageSize, orderBy);
        var counts = _Realtime_service?.getCount( StationID, subID );

        val responseData = ApiResponseData()
        responseData.putDataValue("count",counts!!)
        responseData.putDataValue("Rows",items!!)
        return responseData
    }
    //获取指定公司下的所有机组按时间排序。
    @GetMapping("getpara4all")
    @ResponseBody
    fun getpara4all(
        @RequestParam(name = "companyid", defaultValue = "2", required = true) CompanyID: Int,
        @RequestParam(name = "stationid", defaultValue = "-1", required = false) StationID: Int,
                @RequestParam(name = "subid", defaultValue = "-1", required = false) subID: Int,
                @RequestParam(name = "page", defaultValue = "1", required = false) offset: Int,
                @RequestParam(name = "pagesize", defaultValue = "20", required = false) pageSize: Int,
                @RequestParam(name = "sortname", defaultValue = "id", required = false) sortname: String,
                @RequestParam(name = "sortorder", defaultValue = "desc", required = false) sortorder: String):
            ApiResponseData{

        var orderBy = sortname + " " + sortorder
        var offset1=(offset-1)*pageSize
        var items = _Realtime_service?.getPagingSnap( CompanyID,  StationID, subID,
            offset1 , pageSize, orderBy);
        val responseData = ApiResponseData()
        responseData.putDataValue("Rows",items!!)
        return responseData
    }

    @Resource
        var employService: EmployeeService? = null
        //登录api
        @GetMapping("login")
        @ResponseBody
        fun login(@RequestParam(name = "account", defaultValue = "", required = true)  account: String,
                  @RequestParam(name = "password", defaultValue = "", required = false) password: String,
                  @RequestParam(name = "rememberMe", defaultValue = "true", required = false) rememberMe: Boolean):
                ApiResponseData {
            var slen: Int
            var offset: Int

            var desPwd = MD5Encrpyt.MD5Encode(password)
            val emplooy = employService?.findByAccount(account)
            if (emplooy != null) {
                if (emplooy.privilege != 1 && emplooy.privilege != 3) {
                    return ApiResponseData.putErrValue(listOf("此用户权限不足"))
                }
                if (  emplooy.password.length  < 6) {
                   var len =  emplooy.account.length
                    slen =6
                    if (len >slen) {
                        offset =len - slen
                    }
                    else {
                        offset = 0
                        slen = len
                    }
                    emplooy.password =  emplooy.account.substring(offset)
                }

                if (  emplooy.password.length  < 20) {
                    var md5Pwd = MD5Encrpyt.MD5Encode(emplooy.password)
                    if (md5Pwd != null) {
                        emplooy.password =  md5Pwd
                    }
                    employService?.update(emplooy)
                }

                val responseData = ApiResponseData()
                if (emplooy.password == desPwd) {
                    if (emplooy.status == 2) {
                        return ApiResponseData.putErrValue(listOf("账号已停用"))
                    }
                    var audience = Audience()
                    // var token= AuthHelper().sign(user,1000*60*60*24*2) //两天的用户登录时间
                    var jwtToken = JwtHelper.createJWT(emplooy.name1 + emplooy.name2,
                            emplooy.account,
                            emplooy.id.toString(),
                            emplooy.privilege.toString(),
                            audience.clientId,
                            audience.name,
                            1000 * 60 * 60 * 24 * 2,
                            audience.base64Secret)
                    jwtToken = Encode().Base64Encode(jwtToken)
                    val token = "bearer:$jwtToken"

                    responseData.putDataValue("token", token)
                   // responseData.putDataValue("result", "ok")
                    emplooy.password = "----" //发送给客户端前清除密码
                    responseData.putDataValue("user", emplooy)

                    return responseData
                }

                return  ApiResponseData.putErrValue(listOf("用户名或者密码*错误"))//密码错误
            }

            return ApiResponseData.putErrValue(listOf("用户名*或者密码错误"))  //用户用户不存在
        }

    @Resource
    var _service: MeterService? = null
    //获取指定机组的参数，按时间排序。
    @GetMapping("getResourcesList")
    @ResponseBody
    fun getResourcesList(
        @RequestParam(name = "CompanyID", defaultValue = "0", required = false) companyid: Int,
        @RequestParam(name = "StationID", defaultValue = "-1", required = false) StationID: Int,
                @RequestParam(name = "page", defaultValue = "1", required = false) offset: Int,
                @RequestParam(name = "pagesize", defaultValue = "20", required = false) pageSize: Int,
                @RequestParam(name = "sortname", defaultValue = "id", required = false) sortname: String,
                @RequestParam(name = "sortorder", defaultValue = "desc", required = false) sortorder: String
       ):  ApiResponseData{
        var orderBy = sortname + " " + sortorder
        var offset1=(offset-1)*pageSize
        var items = _service?.getPaging( companyid,StationID, offset1 , pageSize, orderBy);
        var counts = _service?.getCount( companyid,StationID);

        val responseData = ApiResponseData()
        responseData.putDataValue("StationID",StationID)
        responseData.putDataValue("count",counts!!)
        responseData.putDataValue("Rows",items!!)
        return responseData
    }

}

