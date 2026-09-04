package com.reservation.service;
//
import com.reservation.common.*;
import com.reservation.query.UserQueryPage;
 
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;

import com.reservation.entity.Tenant;
import com.reservation.entity.User;  
import com.reservation.exception.BusinessException;
import com.reservation.exception.ResourceNotFoundException;
import com.reservation.exception.UserNotFoundException;
import com.reservation.mapper.UserMapper;
import com.reservation.utils.JwtUtil;
import com.reservation.utils.TenantContext;
import lombok.extern.slf4j.Slf4j;
import com.reservation.utils.CryptoUtil;


// 原因可能有以下几种：
// 1. 你的项目中没有 UserMapper 这个类，或者它的包名不是 com.reservation.mapper。
// 请确保 src/main/java/com/reservation/mapper/UserMapper.java 文件存在且包声明正确。
// 2. 你的 IDE 没有识别或者刷新工程。可以尝试重新加载/刷新项目，让 IDE 检测到新创建的文件。
// 3. UserMapper 生成的位置不在源码目录下（如生成在 test 或 build 文件夹等），导致主工程无法识别。
// 4. IDEA/Maven 的编译配置问题，比如未将相关目录标记为 Source Root。
// 5. 代码中包名拼写错误，与实际包名不符。请检查 import 路径、包声明大小写和文件夹结构一致。
// 解决办法：确认 com.reservation.mapper.UserMapper 类文件在项目对应目录下，并且包名、文件名拼写无误，之后点击IDE“Invalidate Caches”或重启。
 
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 用户注册与认证服务，对应设计2.2.1 所有接口的业务逻辑
 */
@Slf4j
@Service
public class UserService {

    @Autowired
    private UserMapper userMapper;
    @Autowired
    private BCryptPasswordEncoder passwordEncoder;
    @Autowired
    private JwtUtil jwtUtil;
    @Autowired
    private CryptoUtil cryptoUtil;

    @Autowired
    private RefreshTokenService refreshTokenService;
    @Autowired
    private TenantService tenantService;
    @Autowired
    private TenantQuotaService tenantQuotaService;
    @Autowired
    private UserSessionService userSessionService;

    // ===================== 字段加密/解密辅助方法 =====================
    // 对 phone/email/name 字段做 AES-GCM 加密并附加 HMAC 搜索索引（复合格式 hmac:ciphertext）
    // 注意：account 已决定不再加密，按明文存储与匹配
    private void encryptUserFields(User user) {
        if (user == null) return;
       // user.setAccount(cryptoUtil.encryptWithIndex(user.getAccount()));
        user.setPhone(cryptoUtil.encryptWithIndex(user.getPhone()));
        user.setEmail(cryptoUtil.encryptWithIndex(user.getEmail()));
        user.setName(cryptoUtil.encryptWithIndex(user.getName()));
    }

    // 解密 phone/email/name 字段（兼容未加密的旧数据；account 不再加密，原样返回）
    private void decryptUserFields(User user) {
        if (user == null) return;
     //   user.setAccount(cryptoUtil.decrypt(user.getAccount()));
        user.setPhone(cryptoUtil.decrypt(user.getPhone()));
        user.setEmail(cryptoUtil.decrypt(user.getEmail()));
        user.setName(cryptoUtil.decrypt(user.getName()));
    }

    private void decryptUserList(List<User> list) {
        if (list == null) return;
        for (User u : list) {
            decryptUserFields(u);
        }
    }

    // 判断是否存在加密字段的模糊查询条件
    private boolean hasFuzzyCondition(UserQueryPage q) {
        return (q.getName() != null && !q.getName().isEmpty())
                //|| (q.getAccount() != null && !q.getAccount().isEmpty())
                || (q.getEmail() != null && !q.getEmail().isEmpty())
                || (q.getPhone() != null && !q.getPhone().isEmpty());
    }

    // 内存模糊匹配（解密后 contains）
    private boolean matchFuzzy(User u, UserQueryPage q) {
        if (q.getName() != null && !q.getName().isEmpty()) {
            if (u.getName() == null || !u.getName().contains(q.getName())) return false;
        }
      //  if (q.getAccount() != null && !q.getAccount().isEmpty()) {
     //       if (u.getAccount() == null || !u.getAccount().contains(q.getAccount())) return false;
     //   }
        if (q.getEmail() != null && !q.getEmail().isEmpty()) {
            if (u.getEmail() == null || !u.getEmail().contains(q.getEmail())) return false;
        }
        if (q.getPhone() != null && !q.getPhone().isEmpty()) {
            if (u.getPhone() == null || !u.getPhone().contains(q.getPhone())) return false;
        }
        return true;
    }

    /**
     * 按租户编码解析有效租户；编码为空、租户不存在、已删除或已停用均返回 null
     */
    private Tenant resolveTenantByCode(String tenantCode) {
        if (tenantCode == null || tenantCode.isBlank()) {
            return null;
        }
        Tenant tenant = tenantService.getByCode(tenantCode.trim());
        if (tenant == null
                || (tenant.getDeleted() != null && tenant.getDeleted() == 1)
                || !Integer.valueOf(1).equals(tenant.getStatus())) {
            return null;
        }
        return tenant;
    }

    // 学生注册（对应设计2.2.1 学生注册接口）
    // 注册（对应设计2.2.1 注册接口）
    @Transactional
    public Result< Object> Register(User user) {
        // 校验手机号/邮箱是否已注册（对应业务异常校验）
         log.debug("UserService Register：" + user);
        // ① 先解析租户归属：优先取租户上下文（已登录的租户内添加用户）；
        //    自助注册、平台代建场景拿不到上下文，按请求中的租户编码解析
        //    注册接口在白名单内没有租户上下文，这里显式设置，
        //    否则租户插件按兜底值拼接条件，账号查重与额度统计都会失效 
        Long regTenantId = TenantContext.getTenantId();
        String regRole = user.getRole() == null ? "student" : user.getRole();
        if (RoleConst.PLATFORM_ADMIN.equals(regRole)) {
            // 方案A：平台管理员租户编码固定为 "platform"，与登录分支 authController 一致解析为 tenantId=0。
            // 注册时显式对齐，避免注册落库的 tenant_id 与登录解析的 tenant_id 不一致导致登录 404。
            // 注意：sys_tenant 中没有 "platform" 这条记录，resolveTenantByCode 会返回 null 而误报 403，
            // 因此平台管理员必须走此分支，不能走下面的真实租户解析。
            regTenantId = 0L;
        } else if (regTenantId == null || regTenantId <= 0) {
            Tenant tenant = resolveTenantByCode(user.getTenantCode());
            log.debug("UserService Register：" + tenant);
            if (tenant == null) {
                return Result.fail(403, "租户编码无效或已停用，请检查注册链接");
            }
            regTenantId = tenant.getId();
        }
        user.setTenantId(regTenantId);
        log.debug("UserService Register：" + user);
        // ② 注册接口在白名单内没有租户上下文，这里显式设置，
        //    否则租户插件按兜底值拼接条件，账号查重与额度统计都会失效
        TenantContext.setTenantId(regTenantId);
        try {
            // ③ 账号查重（租户内唯一，不同租户的账号互不冲突）
            if (existAccount(user.getAccount(), regTenantId)) {
                return Result.fail(400, "该账号已注册，请登录或重置密码");
            }
            // 密码加密（对应设计2.3 安全设计-密码加密）
            user.setPassword(passwordEncoder.encode(user.getPassword()));
            // 生成唯一userId（对应通用校验规则-ID类参数）
            user.setUserId(UUID.randomUUID().toString().replace("-", ""));
            return doRegister(user, regTenantId);
        } finally {
            TenantContext.clear();
        }
    }

    /**
     * 注册主体：额度校验、加密、入库、签发 Token。
     * 调用前必须已确定租户归属、设置 TenantContext，并完成账号查重。
     */
    private Result<Object> doRegister(User user, Long regTenantId) {
        // 校验租户注册名额：用户总数 + 按角色的教师/学生名额（原子占用，超限直接返回）
        try {
            // 平台管理员（tenantId=0）不归属任何真实租户、没有套餐记录，跳过配额占用，
            // 否则 tenantPackageService.tryAcquire(0,...) 找不到记录会返回 false 而误报“已达上限”。
            if (regTenantId != null && regTenantId > 0) {
                tenantQuotaService.acquire(regTenantId, TenantQuotaService.USER);
                String role = user.getRole() == null ? "student" : user.getRole();
                TenantPackageService.QuotaType roleQuota =
                        "teacher".equals(role) ? TenantQuotaService.TEACHER : TenantQuotaService.STUDENT;
                tenantQuotaService.acquire(regTenantId, roleQuota);
            }
        } catch (BusinessException e) {
            return Result.fail(403, e.getMessage());
        }
        // 对敏感字段做 AES-GCM 加密 + HMAC 搜索索引后入库
        encryptUserFields(user);
        // 插入数据库
        int result = userMapper.insert(user);
        log.debug("output：" + result);

         Map<String, String> resultMap = new HashMap<>();
         resultMap.put("userId", user.getUserId());
         // account 不再加密，直接返回入库的明文值
         resultMap.put("account", user.getAccount());
         //计算token（租户归属已在插入前确定）
         String token = jwtUtil.generateToken(regTenantId, user.getUserId(), user.getRole());
         resultMap.put("token", token);
         resultMap.put("role", user.getRole());
         //?? tenantCode 也返回给前端，便于后续登录时传入
         resultMap.put("tenantCode", user.getTenantCode());
         //data,message
         Result< Object> rslt = Result.success(resultMap   ,"注册成功，请登录等待验证");
         log.debug("output rslt：" + rslt);
        return rslt;
    }
 
    /**
     * 仅对"尚未归属租户的存量用户"（tenant_id 为 NULL）在首次登录时自动归属到当前请求租户，
     * 使存量账号不必停机刷数据即可完成迁移。
     * 逻辑边界（与平台管理员区分清楚）：
     *   - tenant_id = NULL → 真正未归属，自动绑定到本次请求的 tenantId；
     *   - tenant_id = 0    → 平台管理员（合法的特殊租户，见 authController.PLATFORM_TENANT_CODE），不做自动归属；
     *   - tenant_id > 0    → 普通租户用户，必须与实际所属租户一致。
     */
    private void bindUserToTenant(User user, Long tenantId) {
        if (tenantId == null || tenantId <= 0) {
            return; // tenantId=0 为平台管理员、或请求未带租户，均不做自动归属
        }
        user.setTenantId(tenantId);
        userMapper.bindTenant(user.getUserId(), tenantId);
        log.warn("存量用户自动归属租户, userId={}, tenantId={}", user.getUserId(), tenantId);
    }

    // 用户登录（对应设计2.2.1 登录接口）
    public Result<HashMap<String, Object>> login( String account, String password, Long tenantId) {
        // 查找用户（账号可为手机号/邮箱，对应设计2.2.1 登录接口请求参数）
       //  log.debug("userService login：" + account+"   "+password);
        User user = userMapper.getUserByAccount( account,tenantId);
        log.debug("userService login：" + user);
        HashMap<String, Object> resultMap = new HashMap<>();
        if (user == null) { 
          resultMap.put("message", "账号不存在");
          resultMap.put("code", 404);
           return Result.success(resultMap,"账号不存在");
        }
        // 校验账号归属：账号必须属于当前请求租户。
        // 归属不符时返回与"账号不存在"一致的响应，避免据此枚举其他租户的账号
        Long userTenantId = user.getTenantId();
        if (userTenantId == null) {
            // 仅 tenant_id 为 NULL 才视为"尚未归属租户的存量用户"，首次登录自动绑定到当前请求租户。
            // 注意：tenant_id = 0 是平台管理员（合法的特殊租户），不是未归属哨兵，绝不能在此自动重绑；
            //       平台管理员必须用 tenantCode=platform 登录，否则在下面 else-if 中因 0 != 请求租户
            //       被判为"账号不存在"(404)，从而无法被任何真实租户冒领。
            bindUserToTenant(user, tenantId);
        } else if (!userTenantId.equals(tenantId)) {
            log.warn("跨租户登录被拒绝, account={}, 用户所属租户={}, 请求租户={}",
                    account, userTenantId, tenantId);
            resultMap.put("message", "账号不存在");
            resultMap.put("code", 404);
            return Result.success(resultMap,"账号不存在");
        }
        // 解密敏感字段
        decryptUserFields(user);
        // 校验密码,把password加密后与user.getPassword()比较
       // String encodedPassword = passwordEncoder.encode(password); 
       if(! passwordEncoder.matches(password,user.getPassword()))
        { 
           resultMap.put("message", "密码错误");
           resultMap.put("code", 400);
           return Result.success(resultMap,"密码错误");    
        }
        // 校验账号状态（冻结/未审核） && "teacher".equals(user.getRole())
        if ("frozen".equals(user.getStatus())) { 
             resultMap.put("message", "账号已冻结，请联系管理员");
             resultMap.put("code", 400);
             return Result.success(resultMap,"账号已冻结，请联系管理员");
        }
        if ("inactive".equals(user.getStatus()) ) {
             resultMap.put("message", "账号未审核，请等待管理员审核");    
             resultMap.put("code", 400);
             return Result.success(resultMap,"账号未审核，请等待管理员审核");   
        }//其它情况--进入相应的页面，若为pendding则等待审核。其他情况，显示正常项目内容。
        // 生成Token（tenantId 由 controller 根据租户编码解析后传入）
        String token = jwtUtil.generateToken(tenantId, user.getUserId(), user.getRole());
        // 组装返回数据（对应设计2.2.1 登录返回数据）
        resultMap.put("userId", user.getUserId());
        resultMap.put("account", user.getAccount());
        resultMap.put("name", user.getName());
        resultMap.put("role", user.getRole());
        resultMap.put("token", token);
       //?? tenantCode 也返回给前端，便于后续登录时传入
       resultMap.put("tenantCode", user.getTenantCode());
    // 2. 生成双Token
       // String accessToken = jwtUtil.generateAccessToken(account);
        String refreshToken = jwtUtil.generateRefreshToken(tenantId, user.getUserId());
          resultMap.put("refreshToken", refreshToken);

          resultMap.put("code", 200);
       
       // 3. 持久化刷新Token到数据库
        refreshTokenService.saveNewToken(user.getUserId(), refreshToken, jwtUtil.getRefreshExpireTime());

        // 4. 记录登录会话（在线统计数据来源）
        userSessionService.onLogin(token, tenantId, user.getUserId(), user.getRole(),
                currentRequestIp(), currentRequestUserAgent());

      // log.debug("login ok with account：" +user.getAccount()); 
        return Result.success(resultMap   ,"登陆成功");
    }

    /**
     * 取当前请求IP（会话记录用，取不到返回null不影响主流程）
     */
    private String currentRequestIp() {
        try {
            org.springframework.web.context.request.ServletRequestAttributes attrs =
                    (org.springframework.web.context.request.ServletRequestAttributes)
                            org.springframework.web.context.request.RequestContextHolder.getRequestAttributes();
            if (attrs == null) {
                return null;
            }
            return attrs.getRequest().getRemoteAddr();
        } catch (Exception e) {
            return null;
        }
    }

    private String currentRequestUserAgent() {
        try {
            org.springframework.web.context.request.ServletRequestAttributes attrs =
                    (org.springframework.web.context.request.ServletRequestAttributes)
                            org.springframework.web.context.request.RequestContextHolder.getRequestAttributes();
            if (attrs == null) {
                return null;
            }
            return attrs.getRequest().getHeader("User-Agent");
        } catch (Exception e) {
            return null;
        }
    }
    public void logout() {
            // 解析Token获取用户信息（对应设计2.3 安全设计-Token）
            String userId = jwtUtil.getCurrentUserId();
            // Token失效（在缓存中删除对应用户的Token）
            jwtUtil.invalidateToken(userId); 
        }
  

    // 密码重置，对应设计2.2.1 密码重置接口 "12345678"
    @Transactional
    public Result<HashMap<String, Object>> resetPassword(String account, Long tenantId) {
        // 查找用户
        User user = userMapper.getUserByAccount(account, tenantId);
        HashMap<String, Object> resultMap = new HashMap<>();
        if (user != null) {
            // 解密敏感字段（如需回显）
            decryptUserFields(user);
            // 加密新密码并更新--重置为固定码，用户自行更改
            user.setPassword(passwordEncoder.encode("12345678"));
            updatePassword(user);
            return Result.success(resultMap, "密码重置成功");
            // userMapper.updatePassword(user.getUserId(),user.getPassword());
        } else {
           // throw new BusinessException("账号 【" + account + "】对应的用户不存在");
           resultMap.put("message", "账号 【" + account + "】对应的用户不存在");
           resultMap.put("code", 404);
           return Result.success(resultMap,"账号不存在");
        }   

    } 

 @Transactional
    public boolean changePassword(String userId,String password) { 
        // 查找用户
        User user = new User();// userMapper.getUserByAccount(account); 
        user.setUserId(userId); 
        // 加密新密码并更新- 
         user.setPassword(passwordEncoder.encode(password));
         try {
         updatePassword(user);
         return true;
         } catch (Exception ex) {
            log.debug("changePassword Error:userId= "+userId);
         };
          return false ;  
    } 
    public List<User> selectByPhone(String phone) {
        List<User> users = userMapper.selectByPhone(cryptoUtil.searchIndex(phone), phone);
        if (users == null || users.isEmpty()) {
            // throw new UserNotFoundException("手机号【" + phone + "】对应的用户不存在");
            return new java.util.ArrayList<>();
        }
        decryptUserList(users);
        return users;
    }
 public List<User> selectByEmail(String email) {
      // return userMapper.selectByEmail(email)
      //       .orElseThrow(() -> new UserNotFoundException("email" + email + "】对应的用户不存在"));
      List<User> users = userMapper.selectByEmail(cryptoUtil.searchIndex(email), email);
      if(users == null || users.isEmpty()) {
          log.debug("email 【" + email + "】对应的用户不存在");
          return new java.util.ArrayList<>();
      }
      decryptUserList(users);
      return users;
     }
  
public User selectById(String userId) {
      //  return userMapper.selectById(userId)
      //       .orElseThrow(() -> new UserNotFoundException("userId" + userId + "】对应的用户不存在"));
     User user= userMapper.selectById(userId);
     if(user==null)
         log.debug("userId 【" + userId + "】对应的用户不存在");
     else
         decryptUserFields(user);
     return user;
     }
 /**
     * 根据手机号/邮箱查询用户（登录专用）
     */
    public List<User> selectByPhoneOrEmail(String account) {
        List<User> users = userMapper.selectByPhoneOrEmail(cryptoUtil.searchIndex(account), account);
        if (users == null || users.isEmpty()) {
           log.debug("账号【" + account + "】不存在");
           return new java.util.ArrayList<>();
        }
        decryptUserList(users);
        return users;
    } 
    /**
     * 根据账号查询用户（登录/重置密码专用，入参为明文，内部转 HMAC）
     */
    public User getUserByAccount(String account, Long tenantId) {
        User user = userMapper.getUserByAccount(account, tenantId);
        if (user != null) {
            decryptUserFields(user);
        }
        return user;
    }

    private int updatePassword(User user)
    {
        // 更新密码--已经hash变换
          String useid = user.getUserId();
          String password= user.getPassword();
          int ret = userMapper.updatePassword(useid,password);
        return ret;
    }
    
    //更新状态
     public int updateStatus(User user)
    {     String useid = user.getUserId();
          String status= user.getStatus();
           return  userMapper.updateStatus(useid,status);
       
    }

    /**
     * 更新用户基本资料：姓名 / 手机号 / 电子邮箱 / 状态。
     * 账号（account）是登录标识，不在可改范围内。
     *
     * 两个容易踩的坑，这里都显式处理了：
     *
     * 1) phone/email/name 在库里是 AES-GCM 密文（见 encryptUserFields）。若把前端传来的
     *    明文直接落库，会造成：列表查询 decrypt 得到乱码、HMAC 搜索索引丢失导致
     *    按手机号/邮箱再也检索不到该用户。因此必须与注册路径一样先 encryptWithIndex 再入库。
     *
     * 2) 支持局部更新（未传的字段保持原值），所以不能拿"本次请求里的 phone/email"
     *    直接判断"至少留一项联系方式"——要先取出原记录合并后再校验，
     *    否则"只改姓名"这种合法请求会被误拒。
     *
     * @param user 含 userId，以及待更新的 name/phone/email/status（null 表示不更新）
     * @return 影响行数；0 表示用户不存在或不属于当前租户（租户插件会自动追加 tenant_id 条件）
     */
    @Transactional
    public int updateUserInfo(User user) {
        if (user == null || user.getUserId() == null || user.getUserId().trim().isEmpty()) {
            throw new BusinessException("用户Id不能为空");
        }
        String userId = user.getUserId().trim();

        // 取出原记录：既用于校验归属，也用于合并未传字段
        User exist = userMapper.selectById(userId);
        if (exist == null) {
            return 0;
        }
        decryptUserFields(exist);

        String name  = user.getName()  != null ? user.getName().trim()  : exist.getName();
        String phone = user.getPhone() != null ? user.getPhone().trim() : exist.getPhone();
        String email = user.getEmail() != null ? user.getEmail().trim() : exist.getEmail();

        // 合并后再校验，避免"只改姓名"被误拒
        if ((phone == null || phone.isEmpty()) && (email == null || email.isEmpty())) {
            throw new BusinessException("手机号和电子邮箱至少填写一项");
        }

        String status = (user.getStatus() == null || user.getStatus().trim().isEmpty())
                ? null : user.getStatus().trim();

        // encryptWithIndex(null) 返回 null，Mapper 的 <if> 会跳过对应字段
        return userMapper.updateUserInfo(
                userId,
                cryptoUtil.encryptWithIndex(name),
                cryptoUtil.encryptWithIndex(phone),
                cryptoUtil.encryptWithIndex(email),
                status);
    }
   //TBD: test
    public List<User>   listByCondition(Map<String, Object> condition)
    {
        // 将 Map 条件转换为 UserQueryPage，复用 listByConditionAll + 内存模糊过滤
        UserQueryPage query = new UserQueryPage();
        if (condition.get("role") != null) query.setRole(String.valueOf(condition.get("role")));
        if (condition.get("status") != null) query.setStatus(String.valueOf(condition.get("status")));
        if (condition.get("userId") != null) query.setUserId(String.valueOf(condition.get("userId")));
        if (condition.get("name") != null) query.setName(String.valueOf(condition.get("name")));
        if (condition.get("account") != null) query.setAccount(String.valueOf(condition.get("account")));
        if (condition.get("email") != null) query.setEmail(String.valueOf(condition.get("email")));
        if (condition.get("phone") != null) query.setPhone(String.valueOf(condition.get("phone")));
        if (condition.get("tenantId") != null) query.setTenantId(Long.valueOf(String.valueOf(condition.get("tenantId"))));

        List<User> all = userMapper.listByConditionAll(query);
        decryptUserList(all);

        if (hasFuzzyCondition(query)) {
            List<User> filtered = new java.util.ArrayList<>();
            if (all != null) {
                for (User u : all) {
                    if (u != null && matchFuzzy(u, query)) {
                        filtered.add(u);
                    }
                }
            }
            return filtered;
        }
        return all;
    };
 
 
     public PageResult<User>   listByConditionPage(UserQueryPage query)
    {
        List <User> retList;
        int total;

        if (hasFuzzyCondition(query)) {
            // 含加密字段模糊条件：全量查询（仅按 role/status/userId），内存解密 + contains 过滤 + 手动分页
            List<User> all = userMapper.listByConditionAll(query);
            decryptUserList(all);
            List<User> filtered = new java.util.ArrayList<>();
            if (all != null) {
                for (User u : all) {
                    if (u != null && matchFuzzy(u, query)) {
                        filtered.add(u);
                    }
                }
            }
            total = filtered.size();
            int pageNum = query.getPageNum() == null ? 1 : query.getPageNum();
            int pageSize = query.getPageSize() == null ? 10 : query.getPageSize();
            int from = (pageNum - 1) * pageSize;
            int to = Math.min(from + pageSize, total);
            retList = (from < total) ? filtered.subList(from, to) : new java.util.ArrayList<>();
        } else {
            // 无加密字段模糊条件：SQL 层分页查询
            retList = userMapper.listByConditionPage(query); 
            decryptUserList(retList);
            total = userMapper.selectCountByContion(query);
        }

        // 删除密码字段 
        if (retList != null) {
            for (User user : retList) {
                if (user != null) {
                    user.setPassword(null); // 删除password
                }
            }
        }
 
        Page<User> page = new Page<>(query.getPageNum(), query.getPageSize());
        page.setRecords(retList);
        page.setTotal(total);
        PageResult<User> result = PageResult.of(page);
        return result;
    };
 

    public List<User> listByRole(String role) {
        List<User> users = userMapper.listByRole(role);
        if (users == null || users.isEmpty()) {
            log.debug("不存在【" + role + "】的用户");
        } else {
            decryptUserList(users);
        }
        return users;
    }

    /**
     * 检查账号（手机号或邮箱）是否已注册
     * @param account 用户账号（手机号或邮箱）
     * @return 是否已存在
     */
    public boolean existAccount(String account, Long tenantId) {
        if (account == null || account.trim().isEmpty()) {
            return false;
        }
        User user = userMapper.getUserByAccount(account, tenantId);
        // 判断账号是手机号还是邮箱
        // 预留：按联系方式查重时，同一手机号/邮箱可对应多个账号（一对多，见 List<User> 返回约定），
        // 故以下取首个匹配即可；当前 existAccount 仍按 account 精确查重，本分支暂未启用。
      /*   List<User> matched;
        if (account.contains("@")) {
            matched = selectByEmail(account);
        } else {
            matched = selectByPhone(account);
        }
        user = (matched == null || matched.isEmpty()) ? null : matched.get(0); 
        */
        return user != null;
    }
    /**
     * 统计截至某一天指定角色的用户数量
     * @param role 用户角色（如 "teacher", "student"）
     * @param dateTime 截止时间（含，LocalDateTime）
     * @return 截止该时间点的累计指定角色用户数
     */
    public  Integer   countByRoleAtDate(String role, java.time.LocalDateTime dateTime) {
        if (role == null || dateTime == null) {
            return 0;
        }
        // 由于数据库类型、时间字段名不确定，这里假设有create_time字段记录注册时间
        // Mapper 需提供 countByRoleAtDate(role, datetime)
        // 将 LocalDateTime 转换为 java.util.Date 以兼容常用 MyBatis Mapper
        java.util.Date until = java.sql.Timestamp.valueOf(dateTime);
        return userMapper.countByRoleAtDate(role, until);
    }

} 
/*
只检查login的问题，数据库中没有账号，却没有捕捉到异常
2 、注册没有成功
错误分析：
异常 `org.apache.ibatis.binding.BindingException: Invalid bound statement (not found): com.reservation.mapper.UserMapper.selectByPhone` 表示 MyBatis 在运行时没有找到 `UserMapper` 接口的 `selectByPhone` 方法在 XML 中的 SQL 映射。原因可能如下：

1. XML 映射文件（UserMapper.xml）中未正确声明或注册该方法。须检查 `<select id="selectByPhone"` ...> 标签。
2. Mapper 接口和 XML 中方法名字、参数、namespace是否完全匹配。namespace 必须为 `com.reservation.mapper.UserMapper`，方法 id 必须为 `selectByPhone`。
3. XML 文件位置和命名需与 MyBatis 配置一致，确保已被正确扫描。
4. 某些 MyBatis 配置或拼写错误导致 XML 文件未加载。

解决方法：
- 确认 `UserMapper.xml` 文件内容无误且已在 resource 路径下（通常为 `src/main/resources/mybatis/mapper/UserMapper.xml`）。
- `<mapper namespace="com.reservation.mapper.UserMapper">` 正确。
- 有如下内容：
    <select id="selectByPhone" parameterType="String" resultMap="userResultMap">
        SELECT * FROM `user` WHERE phone = #{phone}
    </select>
- 若注解和 XML 同时配置，推荐优先用其中之一（避免混用）。
- 检查配置文件（如 application.yml/properties）的 mybatis.mapper-locations 路径是否正确指向 mapper 文件夹。

结论：
此错误通常是 XML 路径、namespace、方法名未匹配或 XML 未加载导致的。
*/
/**
 * 使用 MyBatis 时，既可以只用 Mapper 的 Java 接口+注解（直接在接口方法上用 @Select、@Insert 等注解编写 SQL），
 * 也可以只用 Java 接口 + XML（把 SQL 写到 XML 配置文件里），
 * 但推荐写 XML，便于维护和复杂 SQL。
 * 
 * 一般情况下：
 * - 如果在 Java 接口方法中使用注解（如 @Select），可以不用对应的 XML 文件。
 * - 如果在 XML 文件中写了 SQL（如 <select>），Java 接口方法只需要声明，无需注解，必须要有与 XML 对应的方法名和参数。
 * 
 * 不能单独只有 Java 接口而无任何 SQL 来源（注解或 XML），也不能只有 XML 而没有 Java 接口。
 * 
 * 生产中建议分离 SQL 和代码逻辑，把 SQL 都写在 XML 文件里，Java 方法和 XML 方法保持一致。
 * 
 * 结论：只要有注解SQL或XML SQL其一即可。但都需有 Java Mapper 接口类。
 */
/**
 * MyBatis 的 Java Mapper 接口（如 UserMapper.java）通常放在 `src/main/java/` 下对应的包中，
 * 推荐的目录结构为：
 *   src/main/java/com/yourcompany/project/mapper/
 * 
 * 也就是和 entity（实体）、service、controller 等并列，比如：
 *   com.reservation.mapper.UserMapper (即 /src/main/java/com/reservation/mapper/UserMapper.java)
 * 
 * 保证和 XML Mapper 文件的 namespace 属性 (`namespace="com.reservation.mapper.UserMapper"`) 保持一致。
 * 
 * XML 文件则一般放在：
 *   src/main/resources/mybatis/mapper/UserMapper.xml
 */