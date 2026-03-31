/*
@Controller
class LoginController {
    @Resource
    var employService: EmployeeService? = null


    @PostMapping("login")
    @ResponseBody
    fun login(@RequestParam account: String, @RequestParam password: String, @RequestParam rememberMe: Boolean): ResponseData {
        //var desPwd = AESEncoder.AESEncode(AESEncoder.salt, password)
        var desPwd = MD5Encrpyt.MD5Encode(password)
        val emplooy = employService?.findByAccount(account)
        if (emplooy != null) {
            if (emplooy.privilege != 1 && emplooy.privilege != 3) {
                return ResponseData.putErrValue(listOf("此用户权限不足"))
            }
           if (  emplooy.password.length  < 20) {
               var md5Pwd = MD5Encrpyt.MD5Encode(emplooy.password)
               if (md5Pwd != null) {
                   emplooy.password =  md5Pwd
               }
               employService?.update(emplooy)
           }

            val responseData = ResponseData()
            if (emplooy.password == desPwd) {
                if (emplooy.status == 2) {
                    return ResponseData.putErrValue(listOf("账号已停用"))
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
                emplooy.password = "" //发送给客户端前清除密码
                responseData.putDataValue("user", emplooy)
                return responseData
            }
            return ResponseData.putErrValue(listOf("用户名或者密码错误")) //密码错误
        }
        return ResponseData.putErrValue(listOf("用户名或者密码错误")) //用户用户不存在
    }


    @GetMapping("/")
    @ResponseBody
    fun loginForm(@RequestParam(required = false, defaultValue = "") returnUrl: String): ModelAndView {
        return ModelAndView("login")
    }


}*/