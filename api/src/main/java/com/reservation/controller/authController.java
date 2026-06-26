package  com.reservation.controller;

 import  com.reservation.entity.RefreshDTO;
 import com.reservation.entity.RefreshTokenPO;
 import com.reservation.entity.TokenDTO;

import com.reservation.common.Result;
import com.reservation.entity.User;
import com.reservation.service.UserService;
 import com.reservation.service.RefreshTokenService;

 import com.reservation.utils.JwtUtil;

 import jakarta.validation.constraints.NotBlank;
import org.springframework.beans.factory.annotation.Autowired;
 import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
 import org.springframework.security.core.authority.SimpleGrantedAuthority;
 import org.springframework.security.core.context.SecurityContextHolder;
 import org.springframework.validation.annotation.Validated;
// 核心导入：RequestMethod 所在包
 import org.springframework.web.bind.annotation.*; 
 import jakarta.validation.constraints.Pattern;

 import javax.servlet.http.Cookie;
 import javax.servlet.http.HttpServletResponse;
 import java.util.Collections;
 import java.util.List;
 import java.util.Map;

 @RestController
@RequestMapping("/auth")
@Validated
public class authController {
    
    @Autowired
    private UserService userService;
     @Autowired
     private RefreshTokenService refreshTokenService;
     @Autowired
     private JwtUtil jwtUtil;
   /**
     * 用户登录接口，对应设计2.2.1 接口：/api/v1/user/login
     * TBD：在线状态online：yes/no
     */
    @PostMapping("/login")
    @ResponseBody
    public Result  <Void>  toLogin( @Validated @RequestBody User user){
             String account = user.getAccount();
             String password = user.getPassword();


        // 调用服务层实现登录逻辑，返回userId、role、Token,freshToken（对应设计2.2.1 登录返回数据）
        Result rst= userService.login(account, password); //setOnline(false)
          
        // 3. 登录成功：设置安全状态（核心步骤） ?token?
        // 封装用户认证信息（角色需和数据库一致，如teacher/student）
        UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                account, // 用户名（可用邮箱/手机号）
                password, // 密码（可传null，不影响验证）
                Collections.singletonList(new SimpleGrantedAuthority("ROLE_" + user.getRole())) // 角色（必须加ROLE_前缀）
        );

        // 将认证信息存入安全上下文（自动维护会话，无需手动管理）
        SecurityContextHolder.getContext().setAuthentication(authentication);
        System.out.println("controller login:"+rst);
  
        return rst;//Result.success(resultMap, "登录成功");
    }
 /**
     * 无感刷新AccessToken核心接口
     * TBD: refreshDTO中添加login的输出参数
     */
    @PostMapping("/refreshToken")
    public Result<TokenDTO> refreshToken(@RequestBody RefreshDTO refreshDTO) {
        String oldRefreshToken = refreshDTO.getRefreshToken();
        // 1. 校验数据库中凭证是否存在、未过期
        RefreshTokenPO tokenPo = refreshTokenService.checkValidToken(oldRefreshToken);
        if (tokenPo == null) {
            return Result.unauthorized("刷新凭证已失效，请重新登录");
        }
        String userId = tokenPo.getUserId();
        String role = tokenPo.getRole();
        // 2. 生成新双Token
        String newAccess = jwtUtil.generateToken(userId,role);
        String newRefresh = jwtUtil.generateRefreshToken(userId);

        // 3. 删除旧刷新Token，存入新凭证（旧凭证立即失效）
        refreshTokenService.removeOldToken(oldRefreshToken);
        refreshTokenService.saveNewToken(userId, newRefresh, jwtUtil.getRefreshExpireTime());

        TokenDTO dto = new TokenDTO();
        dto.setToken(newAccess);
        dto.setRefreshToken(newRefresh);
          System.out.println("controller refreshToken:"+dto);
        return Result.success(dto,"refreshToken ok");
    }

 /* @PostMapping("/logout")
  @ResponseBody
public Result<void> logout(HttpServletResponse response) {
    // 1. 清空认证
    SecurityContextHolder.clearContext();

    // 2. 清除 Cookie（真正登出）
    Cookie cookie = new Cookie("token", null);
    cookie.setPath("/");
    cookie.setHttpOnly(true);
    cookie.setMaxAge(0);
    response.addCookie(cookie);
     refreshTokenService.logout(refreshDTO.getRefreshToken());

    return Result.success();
}
*/

  /**
     * 用户主动登出，销毁当前刷新凭证
     */
    @PostMapping("/logout")
    public Result<Void> logout(@RequestBody RefreshDTO refreshDTO) {
        refreshTokenService.logout(refreshDTO.getRefreshToken());
        return Result.success(null,"ok" );
    }

    /**
     * 后台管理：强制踢出指定用户（删除该用户全部刷新凭证）
     * 调用后该用户所有页面401自动跳转登录
     */
    @DeleteMapping("/kick/{userId}")
    public Result kickUser(@PathVariable String userId) {
        int count = refreshTokenService.kickUser(userId);
         System.out.println("controller kick: "+count);
        if(count  !=0 )
        return Result.success( true,"ok"     );
        else  return  Result.fail( 500,"kick failed"     );
    }
    /**
     * 密码找回（验证码验证），对应设计2.2.1 接口：/api/v1/user/password/forgot
     */
    @PostMapping("/password/forgot")
      @ResponseBody
    public Result  forgotPassword(
            @NotBlank(message = "账号不能为空") String account,
            @NotBlank(message = "验证码不能为空")
            @Pattern(regexp = "^\\d{6}$", message = "验证码格式错误") String verifyCode) {
        // 调用服务层验证验证码（对应设计2.2.1 密码找回功能说明）
        userService.verifyForgotCode(account, verifyCode);
        return Result.success(null, "验证码验证成功，请重置密码");
    }

    /**
     * 密码重置，对应设计2.2.1 接口：/api/v1/user/password/reset
     */
    @PostMapping("/password/reset")
      @ResponseBody
    public Result  resetPassword(
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