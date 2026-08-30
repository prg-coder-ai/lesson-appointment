package com.reservation.service;
//
import com.reservation.common.*;
import com.reservation.query.UserQueryPage;
 
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;

import com.reservation.entity.User;  
import com.reservation.exception.BusinessException;
import com.reservation.exception.ResourceNotFoundException;
import com.reservation.exception.UserNotFoundException;
import com.reservation.mapper.UserMapper;
import com.reservation.utils.JwtUtil;
import com.reservation.utils.TenantContext;
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

    // ===================== 字段加密/解密辅助方法 =====================
    // 对 account/phone/email/name 字段做 AES-GCM 加密并附加 HMAC 搜索索引（复合格式 hmac:ciphertext）
    private void encryptUserFields(User user) {
        if (user == null) return;
        user.setAccount(cryptoUtil.encryptWithIndex(user.getAccount()));
        user.setPhone(cryptoUtil.encryptWithIndex(user.getPhone()));
        user.setEmail(cryptoUtil.encryptWithIndex(user.getEmail()));
        user.setName(cryptoUtil.encryptWithIndex(user.getName()));
    }

    // 解密 account/phone/email/name 字段（兼容未加密的旧数据）
    private void decryptUserFields(User user) {
        if (user == null) return;
        user.setAccount(cryptoUtil.decrypt(user.getAccount()));
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
                || (q.getAccount() != null && !q.getAccount().isEmpty())
                || (q.getEmail() != null && !q.getEmail().isEmpty())
                || (q.getPhone() != null && !q.getPhone().isEmpty());
    }

    // 内存模糊匹配（解密后 contains）
    private boolean matchFuzzy(User u, UserQueryPage q) {
        if (q.getName() != null && !q.getName().isEmpty()) {
            if (u.getName() == null || !u.getName().contains(q.getName())) return false;
        }
        if (q.getAccount() != null && !q.getAccount().isEmpty()) {
            if (u.getAccount() == null || !u.getAccount().contains(q.getAccount())) return false;
        }
        if (q.getEmail() != null && !q.getEmail().isEmpty()) {
            if (u.getEmail() == null || !u.getEmail().contains(q.getEmail())) return false;
        }
        if (q.getPhone() != null && !q.getPhone().isEmpty()) {
            if (u.getPhone() == null || !u.getPhone().contains(q.getPhone())) return false;
        }
        return true;
    }

    // 学生注册（对应设计2.2.1 学生注册接口）
    // 注册（对应设计2.2.1 注册接口）
    @Transactional
    public Result< Object> Register(User user) {
        // 校验手机号/邮箱是否已注册（对应业务异常校验）
         System.out.println("input：" + user);
         if(existAccount(user.getAccount())) {
            //throw new BusinessException("该账号已注册");
            Result< Object> rslt = Result.fail(400   ,"该账号已注册，请登录或重置密码");
            return rslt;
        }
       
        // 密码加密（对应设计2.3 安全设计-密码加密）
        user.setPassword(passwordEncoder.encode(user.getPassword()));
        // 生成唯一userId（对应通用校验规则-ID类参数）
        user.setUserId(UUID.randomUUID().toString());  
        // 对敏感字段做 AES-GCM 加密 + HMAC 搜索索引后入库
        encryptUserFields(user);
        // 插入数据库
        int result = userMapper.insert(user);
        System.out.println("output：" + result);

         Map<String, String> resultMap = new HashMap<>();
         resultMap.put("userId", user.getUserId());
         // 返回给前端的是明文 account（解密后的值）
         resultMap.put("account", cryptoUtil.decrypt(user.getAccount()));
         //计算token
         // TBD：注册流程的租户归属（user表增加tenant_id后，此处应取真实租户ID）
         Long regTenantId = TenantContext.getTenantId() == null ? 0L : TenantContext.getTenantId();
         String token = jwtUtil.generateToken(regTenantId, user.getUserId(), user.getRole());
         resultMap.put("token", token);
         resultMap.put("role", user.getRole());
                               //data,message
         Result< Object> rslt = Result.success(resultMap   ,"注册成功，请登录等待验证");
         System.out.println("output rslt：" + rslt);
        return rslt;
    }
 
    // 用户登录（对应设计2.2.1 登录接口）
    public Result<HashMap<String, Object>> login( String account, String password, Long tenantId) {
        // 查找用户（账号可为手机号/邮箱，对应设计2.2.1 登录接口请求参数）
       //  System.out.println("userService login：" + account+"   "+password);
        User user = userMapper.selectByAccount(cryptoUtil.searchIndex(account), account);
        HashMap<String, Object> resultMap = new HashMap<>();
        if (user == null) { 
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
            
    // 2. 生成双Token
       // String accessToken = jwtUtil.generateAccessToken(account);
        String refreshToken = jwtUtil.generateRefreshToken(tenantId, user.getUserId());
          resultMap.put("refreshToken", refreshToken);

          resultMap.put("code", 200);
       
       // 3. 持久化刷新Token到数据库
        refreshTokenService.saveNewToken(user.getUserId(), refreshToken, jwtUtil.getRefreshExpireTime());
        
      // System.out.println("login ok with account：" +user.getAccount()); 
        return Result.success(resultMap   ,"登陆成功");
    }
    public void logout() {
            // 解析Token获取用户信息（对应设计2.3 安全设计-Token）
            String userId = jwtUtil.getCurrentUserId();
            // Token失效（在缓存中删除对应用户的Token）
            jwtUtil.invalidateToken(userId); 
        }
  

    // 密码重置，对应设计2.2.1 密码重置接口 "12345678"
    @Transactional
    public Result<HashMap<String, Object>> resetPassword(String account) { 
        // 查找用户
        User user = userMapper.selectByAccount(cryptoUtil.searchIndex(account), account); 
        HashMap<String, Object> resultMap = new HashMap<>();
        if(user!= null ) { 
        // 解密敏感字段（如需回显）
        decryptUserFields(user);
        // 加密新密码并更新--重置为固定码，用户自行更改
        user.setPassword(passwordEncoder.encode("12345678"));
        updatePassword(user);
        return Result.success(resultMap   ,"密码重置成功");
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
        User user = new User();// userMapper.selectByAccount(account); 
        user.setUserId(userId); 
        // 加密新密码并更新- 
         user.setPassword(passwordEncoder.encode(password));
         try {
         updatePassword(user);
         return true;
         } catch (Exception ex) {
            System.out.println("changePassword Error:userId= "+userId);
         };
          return false ;  
    } 
    public User selectByPhone(String phone) {
        User user= userMapper.selectByPhone(cryptoUtil.searchIndex(phone), phone);
       if(user==null){
            // throw new UserNotFoundException("手机号【" + phone + "】对应的用户不存在");
          //  Result< Object> rslt = Result.fail(400   ,"手机号【" + phone + "】对应的用户不存在");
            return null;
       }
       decryptUserFields(user);
        return user;
    }
 public User selectByEmail(String email) {
      // return userMapper.selectByEmail(email)
      //       .orElseThrow(() -> new UserNotFoundException("email" + email + "】对应的用户不存在"));
      User user= userMapper.selectByEmail(cryptoUtil.searchIndex(email), email);
      if(user==null)
          System.out.println("email 【" + email + "】对应的用户不存在");
      else
          decryptUserFields(user);
         return user;
     }
  
public User selectById(String userId) {
      //  return userMapper.selectById(userId)
      //       .orElseThrow(() -> new UserNotFoundException("userId" + userId + "】对应的用户不存在"));
     User user= userMapper.selectById(userId);
     if(user==null)
         System.out.println("userId 【" + userId + "】对应的用户不存在");
     else
         decryptUserFields(user);
     return user;
     }
 /**
     * 根据手机号/邮箱查询用户（登录专用）
     */
    public User selectByPhoneOrEmail(String account) {
        User user = userMapper.selectByPhoneOrEmail(cryptoUtil.searchIndex(account), account);
        if (user == null) {
           System.out.println("账号【" + account + "】不存在");
        } else {
           decryptUserFields(user);
        }
        return user;
    } 
    /**
     * 根据账号查询用户（登录/重置密码专用，入参为明文，内部转 HMAC）
     */
    public User selectByAccount(String account) {
        User user = userMapper.selectByAccount(cryptoUtil.searchIndex(account), account);
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
            System.out.println("不存在【" + role + "】的用户");
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
    public boolean existAccount(String account) {
        if (account == null || account.trim().isEmpty()) {
            return false;
        }
        // 判断账号是手机号还是邮箱
        boolean isEmail = account.contains("@");
        User user = null;
        if (isEmail) {
            user =  selectByEmail(account);
        } else {
            user =  selectByPhone(account);
        }
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