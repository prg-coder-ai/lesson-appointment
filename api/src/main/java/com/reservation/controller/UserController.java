package com.reservation.controller;


import com.reservation.common.*;
import com.reservation.query.*;

import com.reservation.entity.User;
import com.reservation.audit.Audit;
import com.reservation.audit.AuditAction;
import com.reservation.service.UserService;
import org.springframework.validation.annotation.Validated;
// 核心导入：RequestMethod 所在包
import org.springframework.web.bind.annotation.*;
import org.springframework.beans.factory.annotation.Autowired;
//import java.util.HashMap;
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
        // System.out.println("out:" + users);
        return Result.success(users, "查询成功");
    }
     

    @GetMapping("/page")
    @ResponseBody    
    public  Result<PageResult<User>> listByPage( UserQueryPage queryCondition, 
              @RequestHeader("Authorization") String token  ) { 
         PageResult<User> users = userService.listByConditionPage(queryCondition); 
        // System.out.println("out:" + users);
        return Result.success(users, "查询成功");
    }

    @GetMapping("/name/{userId}")
    @ResponseBody
    public Result<String> getUserById( @PathVariable  String userId ) {
        // HashMap<String, Object> condition = new java.util.HashMap<>();  
          User  user  = userService.selectById(userId);  
         if(user != null ) { 
          //  System.out.println("ret：" + user);
            return Result.success(user.getName(), "查询成功"); 
    } else  {
       return Result.success("N/A", "查询成功");
    } 
    }
     
     @PostMapping("/register")
     @Audit(action = AuditAction.USER_REGISTER, resourceType = "user")
      @ResponseBody
    public Result<Object> register_a_User(@Validated @RequestBody User user ) {
        // 调用服务层实现注册逻辑，返回userId和Token（对应设计2.2.1 学生注册返回数据）
        //// 调用服务层实现注册逻辑，返回userId和Token（对应设计2.2.1 学生注册返回数据）
        ///  教师
        String role = user.getRole();
        // [DEBUG-PLATFORM] 平台管理员注册链路调试输出：打印进入 controller 的关键字段
        System.out.println("[DEBUG-PLATFORM] adminRegister 入参 role=" + role
                + ", account=" + user.getAccount()
                + ", tenantCode=" + user.getTenantCode()
                + ", name=" + user.getName());
        if(role== null || role.isEmpty())
        {
            role="student";
        }
       // user.setRole(role);
        // 注意两点：
        // 1) 必须用 equals 比较。role 来自请求体反序列化，用 == 比较引用恒成立为 false
        // 2) 角色值必须与 RoleConst 一致（platform_admin 用下划线）。
        //    此前写成 "platform-admin"（连字符），导致注册出来的平台管理员在登录
        //    与权限校验时都匹配不上 RoleConst.PLATFORM_ADMIN，账号完全不可用
        if (RoleConst.ADMIN.equals(role) || RoleConst.PLATFORM_ADMIN.equals(role)) {
           user.setStatus("active");//TBD:check if exists a admin before
           // [DEBUG-PLATFORM] 命中管理员/平台管理员分支：确认角色值与状态
           System.out.println("[DEBUG-PLATFORM] register 命中管理员分支 role=" + role
                   + " -> status=active, 是否平台管理员=" + RoleConst.PLATFORM_ADMIN.equals(role));
        }  else   {
            user.setStatus("pending");//需要管理员审核
         }
        Result<Object> rst = userService.Register(user);
        // [DEBUG-PLATFORM] 注册返回：打印 userId/account/role 供前端核对
        System.out.println("[DEBUG-PLATFORM] adminRegister 返回 code=" + rst.getCode()
                + ", account=" + user.getAccount() + ", role=" + role);
        return rst;//Result.success(rst, "注册成功");
    }
 
 
// 添加用户
    @PostMapping("/add") 
    @ResponseBody
    public Result<Object> addUser(@Validated @RequestBody User user) {
        
         user.setStatus("active");
        Result<Object> rst = userService.Register(user); 
       // System.out.println("rst：" + rst);
        return rst; 
    }

    @PostMapping("/updateStatus")
    @Audit(action = AuditAction.USER_APPROVE, resourceType = "user", resourceId = "user.userId")
    @ResponseBody
    public Result<Object> updateStatus(@RequestBody User user) {
        // 不加 @Validated：修改状态只需 userId + status，不应触发实体上的
        // @NotBlank(account) / @AtLeastOneNotBlank(phone,email) 等注册专用校验
        if (user.getUserId() == null || user.getUserId().trim().isEmpty()) {
            return Result.fail(400, "用户Id不能为空");
        }
        if (user.getStatus() == null || user.getStatus().trim().isEmpty()) {
            return Result.fail(400, "状态不能为空");
        }

        int ret = userService.updateStatus(user);
     //   System.out.println("ret " + ret);
        return   Result.success(ret, "修改成功");
    }
  

//按角色查询用户列表---may be deleted ,replaced by listByGet、listByPage
    @GetMapping("/student/list")
    @ResponseBody
    public Result<List<User>>  studentList() { 
        // HashMap<String, Object> condition = new java.util.HashMap<>();  
        // condition.put("role", "student");
          String role="student";
          List<User> users = userService.listByRole(role);
        // System.out.println("out:" + users);
        return Result.success(users, "查询成功");
    } 
    @GetMapping("/teacher/list")
    @ResponseBody
    public Result<List<User>>  teacherList() { 
          String role="teacher";
          List<User> users = userService.listByRole(role);
         //System.out.println("out:" + users);
        return Result.success(users, "查询成功");
    } 
 
    /**
     * 查询账号（邮箱/电话）是否已存在
     * 前端调用：GET /user/account/exist?account=xxx
     * 返回 Result<Boolean>
     */
    @GetMapping("/account/exist")
    @ResponseBody
    public Result<Boolean> accountExist(@RequestParam("account") String account) {
        if (account == null || account.trim().isEmpty()) {
            return Result.success(false, "账号不能为空");
        }
        boolean existed = userService.existAccount(account.trim());
        return Result.success(existed, existed ? "账号已存在" : "账号可用");
    }


    @PostMapping("/account/changePassword")
    @Audit(action = AuditAction.USER_CHANGE_PASSWORD, resourceType = "user", resourceId = "userId")
    @ResponseBody
    public Result<Boolean> changePassword(@RequestParam("userId") String userId,
                                          @RequestParam("password") String password) {
                                            
        if (userId == null || userId.trim().isEmpty()) {
            return Result.success(false, "用户Id不能为空");
        }
        boolean bok = userService.changePassword(userId.trim(),password);
        return Result.success(bok, bok ? "修改成功" : "修改失败");
    } 

    /**
     * 查询截至指定月份的教师和学生总数（含月初、月末）
     * 前端调用: GET /user/static/byMonth?year=2024&month=06
     * 返回: {
     *   "teacherMonthStart": 100,
     *   "teacherMonthEnd": 110,
     *   "studentMonthStart": 250,
     *   "studentMonthEnd": 270
     * } statistical
     */
    @GetMapping("/statistical/byMonth")
    @ResponseBody
    public Result<Map<String, Integer>> getUserStaticsByMonth(
            @RequestParam("year") int year,
            @RequestParam("month") int month
    ) {
        // 计算指定年月的月初与月末日期
        java.time.LocalDate monthStart = java.time.LocalDate.of(year, month, 1);
        java.time.LocalDate monthEnd = monthStart.with(java.time.temporal.TemporalAdjusters.lastDayOfMonth());

        // 教师数
        int teacherMonthStart = userService.countByRoleAtDate("teacher", monthStart.atStartOfDay());
        int teacherMonthEnd = userService.countByRoleAtDate("teacher", monthEnd.atTime(0, 0, 0));
        // 学生数
        int studentMonthStart = userService.countByRoleAtDate("student", monthStart.atStartOfDay());
        int studentMonthEnd = userService.countByRoleAtDate("student", monthEnd.atTime(23, 59, 59));

        Map<String, Integer> data = new java.util.HashMap<>();
        data.put("teacherMonthStart", teacherMonthStart);
        data.put("teacherMonthEnd", teacherMonthEnd);
        data.put("studentMonthStart", studentMonthStart);
        data.put("studentMonthEnd", studentMonthEnd);

        return Result.success(data, "查询成功");
    }

}
 