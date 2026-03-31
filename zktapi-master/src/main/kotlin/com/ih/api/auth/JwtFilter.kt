package com.ih.api.auth

import com.ih.api.common.Encode
import javax.security.auth.login.LoginException
import org.springframework.web.context.support.WebApplicationContextUtils
import javax.servlet.http.HttpServletResponse
import javax.servlet.ServletException
import java.io.IOException
import javax.servlet.FilterChain
import javax.servlet.ServletResponse
import javax.servlet.ServletRequest
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.web.filter.GenericFilterBean
import javax.servlet.http.HttpServletRequest
import io.jsonwebtoken.Claims
import org.springframework.core.annotation.Order
import javax.servlet.annotation.WebFilter
import sun.security.util.HostnameChecker.getServerName



enum class ResultEnum
{
    LOGIN_ERROR,
}
@Order(1)
@WebFilter(filterName = "JwtFilter", urlPatterns = arrayOf("/admin/*"))
class JwtFilter : GenericFilterBean() {

    fun redirectToLogin(response:HttpServletResponse,request:HttpServletRequest)
    {
        val path = request.contextPath
        val basePath = request.getScheme() + "://" + request.getServerName() + ":" + request.getServerPort() + path
        response.setHeader("Cache-Control", "no-store");
        response.setDateHeader("Expires", 0);
        response.setHeader("Prama", "no-cache");
        //此处设置了访问静态资源类
        response.sendRedirect(basePath+"/");
    }

   /* @Autowired
    private var audience: Audience? = null*/

    /**
     * Reserved claims（保留），它的含义就像是编程语言的保留字一样，属于JWT标准里面规定的一些claim。JWT标准里面定好的claim有：
     *
     * iss(Issuser)：代表这个JWT的签发主体；
     * sub(Subject)：代表这个JWT的主体，即它的所有人；
     * aud(Audience)：代表这个JWT的接收对象；
     * exp(Expiration time)：是一个时间戳，代表这个JWT的过期时间；
     * nbf(Not Before)：是一个时间戳，代表这个JWT生效的开始时间，意味着在这个时间之前验证JWT是会失败的；
     * iat(Issued at)：是一个时间戳，代表这个JWT的签发时间；
     * jti(JWT ID)：是JWT的唯一标识。
     * @param req
     * @param res
     * @param chain
     * @throws IOException
     * @throws ServletException
     */
    @Throws(IOException::class, ServletException::class)
    override fun doFilter(req: ServletRequest, res: ServletResponse, chain: FilterChain) {

        val request = req as HttpServletRequest
        val response = res as HttpServletResponse


        var cookies=request.cookies
        if(cookies==null){
            redirectToLogin(response,request)
            return;
        }
        var token:String?=null
        for(cookie in cookies){
            if(cookie.name=="authorization")
            {
                token=cookie.value.toString()
            }
        }
        //等到请求头信息authorization信息
        if(token==null)
        {
            token = request.getHeader("authorization")
        }
        if(token==null || token=="" || token.length<=7){
            redirectToLogin(response,request)
            return;
        }
        if ("OPTIONS" == request.method) {
            response.status = HttpServletResponse.SC_OK
            chain.doFilter(req, res)
        } else {
            if ( !token.startsWith("bearer")) {
                redirectToLogin(response,request)
                return
            }
            var token = token.substring(7)

            try {
             /*   if (audience == null) {
                    val factory = WebApplicationContextUtils.getRequiredWebApplicationContext(request.servletContext)
                    audience = factory.getBean("audience") as Audience
                }
                val claims = JwtHelper.parseJWT(token, audience!!.base64Secret)
                        ?: throw LoginException(ResultEnum.LOGIN_ERROR.toString())*/
                token= Encode().Base64Decode(token)
                var result=JwtHelper.parseJWT(token, Audience().base64Secret);

                if(result!=null){
                    val claims =result
                            ?: throw LoginException(ResultEnum.LOGIN_ERROR.toString())
                    request.setAttribute("claims", claims)
                }
                else
                {
                    redirectToLogin(response,request)
                }
            } catch (e: Exception) {
                redirectToLogin(response,request)
               // throw LoginException(ResultEnum.LOGIN_ERROR.toString())
            }

            chain.doFilter(req, res)
        }
    }
}