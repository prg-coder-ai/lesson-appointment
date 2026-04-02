package com.reservation.controller;

 import com.reservation.config.CorsConfig; 
 
import jakarta.validation.constraints.NotBlank;
import com.reservation.common.Result;
import com.reservation.entity.User;
import com.reservation.service.UserService;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
// 核心导入：RequestMethod 所在包
 import org.springframework.web.bind.annotation.*;

 import jakarta.validation.constraints.Pattern;

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

    @GetMapping("/list")
    @ResponseBody
    public String listUser( ) {
      // Result<List<User>>   List<User>  ret= userService.list();//

        return "ancd";//Result.success(null, "hello");
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
        System.out.println("rst：" + rst);
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
    public Result  <Void>  toLogin( @Validated @RequestBody User user){
             String account = user.getAccount();
             String password = user.getPassword();
        //打印输入参数
        System.out.println("controller login input:"+ account+ password);
        // 调用服务层实现登录逻辑，返回userId、role、Token（对应设计2.2.1 登录返回数据）
        Result rst= userService.login(account, password);
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