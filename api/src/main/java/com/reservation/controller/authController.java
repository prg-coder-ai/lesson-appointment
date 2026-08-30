package  com.reservation.controller;

 import com.reservation.dto.LoginDTO;
 import  com.reservation.dto.RefreshDTO;
 import com.reservation.dto.RefreshTokenPO;
 import com.reservation.dto.TokenDTO;

import com.reservation.common.Result;
import com.reservation.entity.User;
import com.reservation.service.UserService;
 import com.reservation.service.RefreshTokenService;

 import com.reservation.utils.JwtUtil;
import com.reservation.audit.Audit;
import com.reservation.audit.AuditAction;

import com.reservation.entity.Tenant;
import com.reservation.service.TenantService;

 import jakarta.validation.constraints.NotBlank;
import org.springframework.beans.factory.annotation.Autowired;
 import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
 import org.springframework.security.core.authority.SimpleGrantedAuthority;
 import org.springframework.security.core.context.SecurityContextHolder;
 import org.springframework.validation.annotation.Validated;
// 核心导入：RequestMethod 所在包
 import org.springframework.web.bind.annotation.*; 
 import jakarta.validation.constraints.Pattern;
 import java.util.Collections;
import java.util.HashMap; 
 /**
     * 用户登录接口，对应设计2.2.1 接口：/api/v1/user/login
     * TBD：在线状态online：yes/no 
          * 功能说明：
          * 1. 用户登录接口，接收用户提交的账号(account)和密码(password)信息。
          * 2. 调用 UserService.login(account, password) 完成账户密码校验、用户状态检查（冻结/未审核）、Token/refreshToken 生成、Token 持久化等核心登录流程。
          * 3. 登录成功后，封装 Spring Security 所需 UsernamePasswordAuthenticationToken，对认证信息（角色权限等）进行安全上下文设置，实现后续接口的身份感知和权限控制。
          * 4. controller 至此已将核心安全信息写入 Spring Security 上下文，实现与前端登录流程的状态同步。
          *
          * 原理解析：
          * - 前后端分离应用采用 Token 鉴权，登录接口返回 accessToken 和 refreshToken，accessToken 短时用于资源访问，refreshToken 支持免登刷新。
          * - 控制层主动生成 Spring Security 认证对象（含角色/权限），写入全局安全上下文，解决 token 场景下无 session/用户态的问题，为后续接口自动注入当前用户凭据。
          * - 支持多端、token机制下的灵活身份自动识别和权限管控，是现代前后端分离项目的安全核心做法。
          */

 @RestController
@RequestMapping("/auth")
@Validated
public class authController {
     @Autowired
    private TenantService tenantService;
    @Autowired
    private UserService userService;
     @Autowired
     private RefreshTokenService refreshTokenService;
     @Autowired
     private JwtUtil jwtUtil;
      @PostMapping("/login")
    @Audit(action = AuditAction.USER_LOGIN, resourceType = "user")
    @ResponseBody
    public Result  <HashMap<String, Object>>  toLogin( @Validated @RequestBody LoginDTO userdto){
             String account = userdto.getAccount();
             String password = userdto.getPassword(); 
             String tenantCode = userdto.getTenantCode();
             String role = userdto.getRole();
             Long tenantId;
             String userType;
            
            // 平台管理员登录
        if ("platform".equals(tenantCode) && "platform_admin".equals(role)) { 
            tenantId = 0L;
            userType = "平台管理员";
        } else {
            // 租户端登录：先校验租户状态
            Tenant tenant = tenantService.getByCode(tenantCode);
            if (tenant == null || tenant.getStatus() != 1) {
                return Result.error("租户编码无效或已停用");
            }
            userType = "租户端";
            // 校验租户端用户状态
           
            tenantId = tenant.getId();  
          }

        // 调用服务层实现登录逻辑，返回userId、name，role、account、Token,freshToken（对应设计2.2.1 登录返回数据）
        Result<HashMap<String, Object>> rst= userService.login( account, password); //setOnline(false) 
        // 3. 登录成功：设置安全状态（核心步骤） ?token?
        // 封装用户认证信息（角色需和数据库一致，如teacher/student）
        UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken( 
            account, // 用户名（可用邮箱/手机号）
            password, // 密码（可传null，不影响验证）
            Collections.singletonList(new SimpleGrantedAuthority("ROLE_" + role)) // 角色（必须加ROLE_前缀）
        );//TBD :tenantid 是否需要传入

        // 将认证信息存入安全上下文（自动维护会话，无需手动管理）
        SecurityContextHolder.getContext().setAuthentication(authentication); 
        // 4. 返回登录成功结果（包含token）
        return rst;//Result.success(resultMap, "登录成功");
    }
 /**
     * 无感刷新AccessToken核心接口
     * TBD: refreshDTO中添加login的输出参数
     */
    @PostMapping("/refreshToken")
    public Result<TokenDTO> refreshToken(@RequestBody RefreshDTO refreshDTO) {
        System.out.println("refreshToken refreshDTO:"+refreshDTO);
        String oldRefreshToken = refreshDTO.getRefreshToken();
        String account = refreshDTO.getAccount();
        String role = refreshDTO.getRole();

        // 1. 校验数据库中凭证是否存在、未过期
        // 凭证失效场景说明：
        //   后端返回 HTTP 200 + body.code=401（Result 是普通 POJO，Spring 默认 HTTP 200）
        //   前端 axios 拿到 HTTP 200 不会自动 reject，进入 if(refreshRes.data.code===200) 判断：
        //     - 不通过 → 手动 throw new Error(refreshRes.data.message) → 进 catch
        //     - catch 中从 refreshErr.message 取后端 message 提示用户
        //   所以这里用 Result.fail(401, ...) 和 Result.unauthorized(...) 行为完全等价，
        //   选 fail 是因为语义更直观（一看就知道业务码是 401）
        RefreshTokenPO tokenPo = refreshTokenService.checkValidToken(oldRefreshToken);
        if (tokenPo == null) {
            return Result.fail(401, "刷新凭证已失效，请重新登录");
        }
        String userId = tokenPo.getUserId();
        Long tenantId =  jwtUtil.getCurrentTenantId();//.TBD 
        // 2. 生成新双Token
        String newAccess = jwtUtil.generateToken(tenantId,userId,role);
        String newRefresh = jwtUtil.generateRefreshToken(tenantId,userId);

        // 3. 删除旧刷新Token，存入新凭证（旧凭证立即失效）
        refreshTokenService.removeOldToken(oldRefreshToken);
       // TenantContext.setTenantId(tenantId);
        refreshTokenService.saveNewToken(userId, newRefresh, jwtUtil.getRefreshExpireTime());

//
UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                account, // 用户名（可用邮箱/手机号）
                null, // 密码（可传null，不影响验证）
                Collections.singletonList(new SimpleGrantedAuthority("ROLE_" + role)) // 角色（必须加ROLE_前缀）
        ); 
        // 将认证信息存入安全上下文（自动维护会话，无需手动管理）
        SecurityContextHolder.getContext().setAuthentication(authentication);
        /*
         * 下面几行代码的原理说明：
         * 
         * UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
         *         account,
         *         null,
         *         Collections.singletonList(new SimpleGrantedAuthority("ROLE_" + role))
         * );
         * 这行代码的作用是根据当前用户的账号（account）、其角色（role），
         * 封装一个Spring Security的认证对象（UsernamePasswordAuthenticationToken），
         * 其中密码可以为null不影响后续验证，角色需要加"ROLE_"前缀以便Spring Security识别。
         *
         * SecurityContextHolder.getContext().setAuthentication(authentication);
         * 这行代码将上述生成的认证对象security token存入Spring Security的全局上下文中，
         * 使得后续请求能够感知到当前用户的身份，实现token机制下无session情况下的安全身份管理。
         *
         * 这样做的好处是：即使没有传统的session和cookie认证，后续接口可以直接通过
         * SecurityContextHolder获取到当前用户的角色、账号等认证信息，支持基于注解
         * 或Spring Security统一权限拦截。
         */
  

        TokenDTO dto = new TokenDTO();
        dto.setToken(newAccess);//userid role
        dto.setRefreshToken(newRefresh);//userid
      //  System.out.println("controller refreshToken:"+dto);
        return Result.success(dto,"refreshToken ok");
    } 

  /**
     * 用户主动登出，销毁当前刷新凭证
     */
    @PostMapping("/logout")
    @Audit(action = AuditAction.USER_LOGOUT, resourceType = "user")
    public Result<Boolean> logout(@RequestBody RefreshDTO refreshDTO) {
      // 1. 清空认证
    SecurityContextHolder.clearContext();
/*
    // 2. 清除 Cookie（真正登出）
    Cookie cookie = new Cookie("token", null);
    cookie.setPath("/");
    cookie.setHttpOnly(true);
    cookie.setMaxAge(0);
    response.addCookie(cookie);*/
        refreshTokenService.logout(refreshDTO.getRefreshToken());
        return Result.success(true,"ok" );
    }

    /**
     * 后台管理：强制踢出指定用户（删除该用户全部刷新凭证）
     * 调用后该用户所有页面401自动跳转登录
     */
    @DeleteMapping("/kick/{userId}")
    @Audit(action = AuditAction.ADMIN_FORCE_LOGOUT, resourceType = "user", resourceId = "userId")
    public Result <Object> kickUser(@PathVariable String userId) {
        int count = refreshTokenService.kickUser(userId);
        // 3. 刷新页面提示
        System.out.println("controller kick: "+count) ;
        if(count  !=0 )
        return Result.success( true,"ok"     );
        else  return  Result.success( false,"kick failed"     );
    }
    /**
     * 密码找回（验证码验证），对应设计2.2.1 接口：/api/v1/user/password/forgot
     * ---》用户密码忘记后，通过管理员重置该用户的密码，然后用户登录后自行修改密码
     */
    /*@PostMapping("/password/forgot")
      @ResponseBody
    public Result <Object>   forgotPassword(
            @NotBlank(message = "账号不能为空") String account,
            @NotBlank(message = "验证码不能为空")
            @Pattern(regexp = "^\\d{6}$", message = "验证码格式错误") String verifyCode) {
        // 调用服务层验证验证码（对应设计2.2.1 密码找回功能说明）
        userService.verifyForgotCode(account, verifyCode);
        return Result.success(null, "验证码验证成功，请重置密码");
    }
*/
    /**
     * 密码重置，对应设计2.2.1 接口：/api/v1/user/password/reset
     */
      @PostMapping("/password/reset")
      @ResponseBody
    public Result <Object>  resetPassword(
            @NotBlank(message = "账号不能为空") String account)
            {
        // 调用服务层重置密码（对应设计2.2.1 密码重置功能说明）
        userService.resetPassword(account);
        return Result.success(null, "密码重置成功");
    }
}
/**
 
CREATE TABLE `user_refresh_token` (
  id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
  user_id  varchar(36) NOT NULL COMMENT '登录用户ID',
  refresh_token VARCHAR(512) NOT NULL COMMENT '刷新凭证',
  expire_time DATETIME NOT NULL COMMENT '过期时间',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id),
  INDEX idx_refresh_token (refresh_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT '用户刷新Token持久化表'; 
 */