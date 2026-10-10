package com.reservation.controller;


import com.reservation.common.*;
import com.reservation.query.*;

import com.reservation.entity.User;
import com.reservation.audit.Audit;
import com.reservation.audit.AuditAction;
import com.reservation.service.UserService;
import com.reservation.utils.PermissionCheck;
import com.reservation.utils.TenantContext;
import org.springframework.validation.annotation.Validated;
// 核心导入：RequestMethod 所在包
import org.springframework.web.bind.annotation.*;
import org.springframework.beans.factory.annotation.Autowired;
//import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
 
/**
 * 用户注册与认证控制器，对应设计2.2.1 所有接口
 */
@RestController
@RequestMapping("/api/v1/user")
@Validated
@Slf4j
public class UserController { 
     @Autowired
    private UserService userService; 
     @Autowired
    private PermissionCheck permissionCheck;

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
        // log.debug("out:" + users);
        return Result.success(users, "查询成功");
    }
     

    @GetMapping("/page")
    @ResponseBody    
    public  Result<PageResult<User>> listByPage( UserQueryPage queryCondition, 
              @RequestHeader("Authorization") String token  ) { 
         PageResult<User> users = userService.listByConditionPage(queryCondition); 
        // log.debug("out:" + users);
        return Result.success(users, "查询成功");
    }

    /**
     * 平台管理员「用户管理」分页接口：跨租户查看/管理 role=platform_admin 与 admin 两类账号。
     * 仅平台管理员可调（permissionCheck.isPlatformAdmin）。返回含 orgName（admin 所属租户机构名，
     * platform_admin 为空，前端显示「平台」）。
     * 前端调用：GET /user/platformPage?pageNum=&pageSize=&status=&account=
     */
    @GetMapping("/platformPage")
    @ResponseBody
    public Result<PageResult<User>> listPlatformAdminPage(UserQueryPage queryCondition,
                                                          @RequestHeader("Authorization") String token) {
        if (!permissionCheck.isPlatformAdmin(token)) {
            throw new com.reservation.exception.NoPermissionException("您无平台管理员权限，无法执行该操作");
        }
        PageResult<User> users = userService.platformAdminPage(queryCondition);
        return Result.success(users, "查询成功");
    }

    /**
     * 平台管理员「用户管理」修改某用户所属公司名称（仅平台管理员）。
     *  - admin(tenant_id>0)：写入其所属租户 sys_tenant.org_name
     *  - platform_admin(tenant_id=0)：写入 tenant_code='platform' 平台自身行的 org_name
     * 请求体：{ userId, orgName }
     */
    @PostMapping("/updateCompany")
    @ResponseBody
    public Result<Object> updateCompany(@RequestBody java.util.Map<String, Object> body,
                                        @RequestHeader("Authorization") String token) {
        if (!permissionCheck.isPlatformAdmin(token)) {
            throw new com.reservation.exception.NoPermissionException("您无平台管理员权限，无法执行该操作");
        }
        String userId = body.get("userId") == null ? null : String.valueOf(body.get("userId"));
        String orgName = body.get("orgName") == null ? null : String.valueOf(body.get("orgName"));
        String err = userService.updateCompanyName(userId, orgName);
        if (err != null) return Result.fail(400, err);
        return Result.success(true, "修改成功");
    }

    @GetMapping("/name/{userId}")
    @ResponseBody
    public Result<String> getUserById( @PathVariable  String userId ) {
        // HashMap<String, Object> condition = new java.util.HashMap<>();  
          User  user  = userService.selectById(userId);  
         if(user != null ) { 
          //  log.debug("ret：" + user);
            return Result.success(user.getName(), "查询成功"); 
    } else  {
       return Result.success("N/A", "查询成功");
    } 
    }
     
     @PostMapping("/register")
     @Audit(action = AuditAction.USER_REGISTER, resourceType = "user")
      @ResponseBody
    public Result<Object> register_a_User(@Validated @RequestBody User user ) {
        // 角色白名单与初始状态（active/pending）全部由 UserService.applyRoleAdmission 判定，
        // 控制器不再自行决定 —— 此前这里对 admin/platform_admin 无条件 setStatus("active")
        // （旁注 //TBD:check if exists a admin before 就是这套 bootstrap 的作者自述），
        // 叠加 login.html 把 admin/platform_admin 做成了下拉选项，
        // 构成完整提权链：自助注册管理员 → 登录 → tenantId=0 时租户插件对所有表放弃租户条件。
        // 判定必须落在 Service 层：本条与 /user/add 共用同一入口逻辑，两处各判一次必然漂移。
        Result<Object> rst = userService.Register(user, false);
        return rst;//Result.success(rst, "注册成功");
    }
 
 
// 添加用户（管理端后台建号）
    @PostMapping("/add")
    @Audit(action = AuditAction.USER_REGISTER, resourceType = "user")
    @ResponseBody
    public Result<Object> addUser(@Validated @RequestBody User user,
                                  @RequestHeader("Authorization") String token) {
        // P0-1：本条与 /user/register 是**两条独立的提权入口**，只修注册接口会漏掉这里。
        // 原实现无任何角色校验、且无条件 setStatus("active") —— 任何登录用户（含学生）都能
        // 调它给自己建一个 admin/platform_admin 且立即可用。
        //
        // 收口口径：**按调用者权限限定可建角色**，而不是一律拒绝 admin。
        // 平台管理员需要靠本接口在后台开出租户管理员（platform_admin.html 的「新增用户」下拉
        // 只有 platform_admin / admin 两项），一刀切会把该功能打死；
        // 但"谁可以创建什么"必须由服务端裁定，不能由请求体的 role 说了算。
        String callerRole = permissionCheck.getRoleFromToken(token);
        boolean callerIsPlatformAdmin = RoleConst.PLATFORM_ADMIN.equals(callerRole);
        boolean callerIsAdmin = RoleConst.ADMIN.equals(callerRole);

        if (!callerIsAdmin && !callerIsPlatformAdmin) {
            throw new com.reservation.exception.NoPermissionException("仅管理员可新增用户");
        }
        // 租户管理员不得创建平台管理员 —— 否则租户管理员能横向拿到跨租户权限，
        // 这正是 P0-1 要断的链；平台管理员自身不受此限（全局唯一性由 Service 层兜底）。
        String role = user.getRole() == null || user.getRole().isEmpty()
                ? RoleConst.TEACHER : user.getRole().trim();
        if (!callerIsPlatformAdmin && RoleConst.PLATFORM_ADMIN.equals(role)) {
            throw new com.reservation.exception.NoPermissionException("仅平台管理员可创建平台管理员账号");
        }

        Result<Object> rst = userService.Register(user, true);
   // log.debug("rst：" + rst);
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
     //   log.debug("ret " + ret);
        return   Result.success(ret, "修改成功");
    }

    /**
     * 修改用户基本资料：姓名 / 手机号 / 电子邮箱 / 状态。
     * 前端调用：POST /user/updateInfo，请求体 { userId, name, phone, email, status }
     *
     * 账号（account）明确不可修改：它是登录标识，改动会导致用户无法登录，
     * 也会破坏租户内唯一性约束；即使请求体里带了 account，Service 也一律忽略。
     *
     * 不加 @Validated：与 updateStatus 同理，实体上的 @NotBlank(account) 等属于
     * 注册专用校验，局部更新（只改姓名）不应触发。
     */
    @PostMapping("/updateInfo")
    @Audit(action = AuditAction.USER_UPDATE, resourceType = "user", resourceId = "user.userId")
    @ResponseBody
    public Result<Object> updateInfo(@RequestBody User user) {
        if (user == null || user.getUserId() == null || user.getUserId().trim().isEmpty()) {
            return Result.fail(400, "用户Id不能为空");
        }
        int ret = userService.updateUserInfo(user);
        if (ret <= 0) {
            return Result.fail(404, "用户不存在或不属于当前租户");
        }
        return Result.success(ret, "修改成功");
    }
  

//按角色查询用户列表---may be deleted ,replaced by listByGet、listByPage
    @GetMapping("/student/list")
    @ResponseBody
    public Result<List<User>>  studentList() { 
        // HashMap<String, Object> condition = new java.util.HashMap<>();  
        // condition.put("role", "student");
          String role="student";
          List<User> users = userService.listByRole(role);
        // log.debug("out:" + users);
        return Result.success(users, "查询成功");
    } 
  @GetMapping("/teacher/list")
  @ResponseBody
  public Result<List<User>>  teacherList() { 
        String role="teacher";
        List<User> users = userService.listByRole(role);
       //log.debug("out:" + users);
        return Result.success(users, "查询成功");
  } 

    /**
     * 消息中心：接收人解析。前端/自动发送据 scope 解析目标接收人列表（不含密码）。
     * scope: tenant_admin(本租户管理员) | platform_admin(全部平台管理员) |
     *        teachers(本租户教师) | students(本租户学生) |
     *        my_teachers(当前学生已约课教师) | my_students(当前教师已约课学生)
     * 仅平台管理员可传 tenantId 跨租户查询；其余身份按自身租户过滤。
     */
    @GetMapping("/message-recipients")
    @ResponseBody
    public Result<List<User>> messageRecipients(@RequestParam String scope,
            @RequestParam(required = false) Long tenantId,
            @RequestHeader("Authorization") String token) {
        return userService.messageRecipients(scope, tenantId, token);
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
            return Result.fail(400, "账号不能为空");
        }
        boolean existed = userService.existAccount(account.trim(), TenantContext.getTenantId());
        return Result.success(existed, existed ? "账号已存在" : "账号可用");
    }


    @PostMapping("/account/changePassword")
    @Audit(action = AuditAction.USER_CHANGE_PASSWORD, resourceType = "user", resourceId = "userId")
    @ResponseBody
    public Result<Object> changePassword(@RequestParam("userId") String userId,
                                         @RequestParam("password") String password,
                                         // 本人改密时必填的原密码；管理员代管重置时忽略该参数
                                         @RequestParam(value = "oldPassword", required = false) String oldPassword,
                                         @RequestHeader("Authorization") String token) {
        // P0-2：原先只凭 userId 就改密码 —— 任何登录用户都能改掉他人密码并用新密码登录。
        // 现由 Service 按调用者身份分两种合法路径（本人改密需验原密码 / 管理员同租户代管），
        // 其余一律 403。归属与原密码校验必须在 Service 做：控制器拿不到 role 与租户的可信副本。
        Result<Object> err = userService.changePassword(
                userId, password,
                permissionCheck.getUserIdFromToken(token),
                permissionCheck.getRoleFromToken(token),
                permissionCheck.getTenantIdFromToken(token),
                oldPassword);
        if (err != null) {
            return err;
        }
        return Result.success(true, "修改成功");
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
 