package com.reservation.controller;

 import com.reservation.config.CorsConfig; 
 
import jakarta.validation.constraints.NotBlank;
import com.reservation.common.Result;
import com.reservation.entity.User;
import com.reservation.service.UserService;

import org.springframework.beans.factory.annotation.Autowired;
 import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
 import org.springframework.security.core.authority.SimpleGrantedAuthority;
 import org.springframework.security.core.context.SecurityContextHolder;
 import org.springframework.validation.annotation.Validated;
// 核心导入：RequestMethod 所在包
 import org.springframework.web.bind.annotation.*;

 import jakarta.validation.constraints.Pattern;

 import java.util.Collections;
 import java.util.List;
 import java.util.Map;
 
/**
 * 用户注册与认证控制器，对应设计2.2.1 所有接口
 */
@RestController
@RequestMapping("/user")
@Validated
public class UserController {

    @Autowired
    private UserService userService;


    //TBD条件：role,所属机构
    // INSERT_YOUR_CODE
    /**
     * 用户列表查询（支持 GET 参数传递）
     * 支持前端通过 URL 查询参数“/user/list?role=teacher&status=active”
     * 推荐使用@RequestParam 映射各参数，或者用Map接收全部参数
     */
    @GetMapping("/list")
    @ResponseBody
    public Result<List<User>> listUserByGet(
            @RequestParam(required = false) String role,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String name,
            @RequestParam(required = false) String email,
            @RequestParam(required = false) String phone,
            @RequestParam(required = false) String userId,
            @RequestParam(required = false) String account
    ) {
        Map<String, Object> condition = new java.util.HashMap<>();
        if (role != null && !role.isEmpty()) condition.put("role", role);
        if (status != null && !status.isEmpty()) condition.put("status", status);
        if (name != null && !name.isEmpty()) condition.put("name", name);
        if (email != null && !email.isEmpty()) condition.put("email", email);
        if (phone != null && !phone.isEmpty()) condition.put("phone", phone);
        if (userId != null && !userId.isEmpty()) condition.put("userId", userId);
        if (account != null && !account.isEmpty()) condition.put("account", account);

        List<User> users = userService.listByCondition(condition);
         System.out.println("out:" + users);
        return Result.success(users, "查询成功");
    }
     
    /**
     * 学生注册接口，对应设计2.2.1 接口：/api/v1/user/student/register
     */
    @PostMapping("/student/register")
    public Result<Void> studentRegister(@Validated @RequestBody User user) {
        // 调用服务层实现注册逻辑，返回userId和Token（对应设计2.2.1 学生注册返回数据）
         user.setRole("student");
        user.setStatus("pending");
        Result rst = userService.Register(user);
       // System.out.println("rst：" + rst);
        return rst;//Result.success(rst, "注册成功,请等待管理员审核");
    }

    /**
     * 教师注册接口，对应设计2.2.1 接口：/api/v1/user/teacher/register
     */
    @PostMapping("/teacher/register")
     
    public Result<Void> teacherRegister(@Validated @RequestBody User user) {
        // 调用服务层提交注册申请，等待管理员审核（对应设计2.2.1 教师注册功能说明）
         user.setRole("teacher");
        user.setStatus("pending");
        Result rst = userService.Register(user);
// 判断的rst
        return rst;// Result.success(null, "注册申请提交成功，请等待管理员审核");
    }

    /**
     * 用户登录接口，对应设计2.2.1 接口：/api/v1/user/login
     */
    @PostMapping("/login")
    @ResponseBody
    public Result  <Void>  toLogin( @Validated @RequestBody User user){
             String account = user.getAccount();
             String password = user.getPassword();
        //打印输入参数
        //System.out.println("controller login input:"+ account+ password);
        // 调用服务层实现登录逻辑，返回userId、role、Token（对应设计2.2.1 登录返回数据）
        Result rst= userService.login(account, password);

        // 3. 登录成功：设置安全状态（核心步骤） ?token?
        // 封装用户认证信息（角色需和数据库一致，如teacher/student）
        UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                account, // 用户名（可用邮箱/手机号）
                password, // 密码（可传null，不影响验证）
                Collections.singletonList(new SimpleGrantedAuthority("ROLE_" + user.getRole())) // 角色（必须加ROLE_前缀）
        );

        // 将认证信息存入安全上下文（自动维护会话，无需手动管理）
        SecurityContextHolder.getContext().setAuthentication(authentication);
       // System.out.println("controller login out:"+rst);
        return rst;//Result.success(resultMap, "登录成功");
    }

    /**
     * 密码找回（验证码验证），对应设计2.2.1 接口：/api/v1/user/password/forgot
     */
    @PostMapping("/password/forgot")
    public Result<Void> forgotPassword(
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
    public Result<Void> resetPassword(
            @NotBlank(message = "账号不能为空") String account,
            @NotBlank(message = "新密码不能为空")
            @Pattern(regexp = "^(?=.*[a-zA-Z])(?=.*\\d).{8,20}$", message = "新密码需包含字母和数字，长度8-20位") String newPassword,
            @NotBlank(message = "验证码不能为空") String verifyCode) {
        // 调用服务层重置密码（对应设计2.2.1 密码重置功能说明）
        userService.resetPassword(account, newPassword, verifyCode);
        return Result.success(null, "密码重置成功");
    }

    @PostMapping("/user/update")
    public Result<Void> updateUser(  User user) {
            int ret= userService.update(user);//
        if (ret>0) {
            return Result.success(null, "数据更新成功");
        }
        return Result.success(null, "数据更新失败");
    }


}