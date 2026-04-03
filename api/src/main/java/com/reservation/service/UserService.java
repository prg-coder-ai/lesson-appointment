package com.reservation.service;
//
import com.reservation.common.Result;
import com.reservation.entity.User;
import com.reservation.exception.BusinessException;
import com.reservation.exception.ResourceNotFoundException;
import com.reservation.exception.UserNotFoundException;
import com.reservation.mapper.UserMapper;
// 原因可能有以下几种：
// 1. 你的项目中没有 UserMapper 这个类，或者它的包名不是 com.reservation.mapper。
// 请确保 src/main/java/com/reservation/mapper/UserMapper.java 文件存在且包声明正确。
// 2. 你的 IDE 没有识别或者刷新工程。可以尝试重新加载/刷新项目，让 IDE 检测到新创建的文件。
// 3. UserMapper 生成的位置不在源码目录下（如生成在 test 或 build 文件夹等），导致主工程无法识别。
// 4. IDEA/Maven 的编译配置问题，比如未将相关目录标记为 Source Root。
// 5. 代码中包名拼写错误，与实际包名不符。请检查 import 路径、包声明大小写和文件夹结构一致。
// 解决办法：确认 com.reservation.mapper.UserMapper 类文件在项目对应目录下，并且包名、文件名拼写无误，之后点击IDE“Invalidate Caches”或重启。

import com.reservation.utils.JwtUtil;
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

    // 学生注册（对应设计2.2.1 学生注册接口）
    // 注册（对应设计2.2.1 注册接口）
    @Transactional
    public Result Register(User user) {
        // 校验手机号/邮箱是否已注册（对应业务异常校验）
         System.out.println("input：" + user);
          if( user.getPhone()!="")
        if (userMapper.selectByPhone(user.getPhone()) != null) {
            throw new BusinessException("该手机号已注册");
        }
        if( user.getEmail()!="")
        if (userMapper.selectByEmail(user.getEmail()) != null) {
            throw new BusinessException("该邮箱已注册");
        }
        // 密码加密（对应设计2.3 安全设计-密码加密）
        user.setPassword(passwordEncoder.encode(user.getPassword()));
        // 生成唯一userId（对应通用校验规则-ID类参数）
        user.setUserId(UUID.randomUUID().toString());  
        // 插入数据库
        userMapper.insert(user);
 
         Map<String, String> resultMap = new HashMap<>();
         resultMap.put("userId", user.getUserId());
         resultMap.put("account", user.getAccount());
         //计算token
         String token = jwtUtil.generateToken(user.getUserId(), user.getRole());
         resultMap.put("token", token);
         resultMap.put("role", user.getRole());
                               //data,message
         Result rslt = Result.success(resultMap   ,"注册成功，请登录等待验证");
        
        return rslt;
    }


    // 用户登录（对应设计2.2.1 登录接口）
    public Result login(String account, String password) {
        // 查找用户（账号可为手机号/邮箱，对应设计2.2.1 登录接口请求参数）
       //   System.out.println("login：" + account+"   "+password);
        User user = userMapper.selectByAccount(account);
        if (user == null) {
            throw new ResourceNotFoundException("账号不存在");
        }
        // 校验密码,把password加密后与user.getPassword()比较
       // String encodedPassword = passwordEncoder.encode(password);
       // System.out.println("encode：" + encodedPassword);
       // System.out.println("usercode：" + user.getPassword());
       // if (!encodedPassword.equals(user.getPassword())) {
         //   throw new BusinessException("密码错误");
        //}
       if(! passwordEncoder.matches(password,user.getPassword()))
        {
            throw new BusinessException("密码错误");
        }
        // 校验账号状态（冻结/未审核）
        if ("frozen".equals(user.getStatus())) {
            throw new BusinessException("账号已冻结，请联系管理员");
        }
        if ("inactive".equals(user.getStatus()) && "teacher".equals(user.getRole())) {
            throw new BusinessException("账号未审核，请等待管理员审核");
        }//其它情况--进入相应的页面，若为pendding则等待审核。其他情况，显示正常项目内容。
        // 生成Token
        String token = jwtUtil.generateToken(user.getUserId(), user.getRole());
        // 组装返回数据（对应设计2.2.1 登录返回数据）
        Map<String, String> resultMap = new HashMap<>();
        resultMap.put("userId", user.getUserId());
        resultMap.put("account", user.getAccount());
        resultMap.put("role", user.getRole());
        resultMap.put("token", token);
        System.out.println("login ok：" +resultMap);

        Result rslt = Result.success(resultMap   ,"登陆成功");
        return rslt;
    }
        public void logout() {
                // 解析Token获取用户信息（对应设计2.3 安全设计-Token）
                String userId = jwtUtil.getCurrentUserId();
                // Token失效（在缓存中删除对应用户的Token）
                jwtUtil.invalidateToken(userId); 
            }

    public void sendForgotCode(String account) {
        // 查找用户
        User user = userMapper.selectByPhoneOrEmail(account);
        if (user == null) {
            throw new ResourceNotFoundException("账号不存在");
        }
        
        //生成随机验证码（对应设计2.2.1 密码找回逻辑）
        String verifyCode = "123456"; //  生成随机验证码
        //1 发送验证码到邮箱或者手机短信（对应设计2.2.1 密码找回逻辑）
        //2 将验证码存储到缓存中，key为account，value为verifyCode，设置过期时间为5分钟
    }
    // 验证码验证（密码找回），对应设计2.2.1 密码找回接口
    public void verifyForgotCode(String account, String verifyCode) {
        // 查找用户
        User user = userMapper.selectByPhoneOrEmail(account);
        if (user == null) {
            throw new ResourceNotFoundException("账号不存在");
        }
        // 校验验证码（模拟：实际需对接短信/邮箱接口，校验时效性5分钟，对应通用校验规则-验证码）
        // 从缓存中获取对应账号的验证码进行校验
        if (!"123456".equals(verifyCode)) {  // 模拟验证码，实际需从缓存获取
            throw new BusinessException("验证码错误或已过期");
        }
    }

    // 密码重置，对应设计2.2.1 密码重置接口
    @Transactional
    public void resetPassword(String account, String newPassword, String verifyCode) {
        // 先校验验证码
        verifyForgotCode(account, verifyCode);
        // 查找用户
        User user = userMapper.selectByPhoneOrEmail(account);
        // 校验新密码与原密码是否相同（对应通用校验规则-密码）
       // if (passwordEncoder.matches(newPassword, user.getPassword())) {
       //     throw new BusinessException("新密码不能与原密码相同");
       // }
        // 加密新密码并更新--重置为固定码，用户自行更改
        user.setPassword(passwordEncoder.encode("12345678"));
        userMapper.updatePassword(user);
    }

 /**
     * 根据手机号查询用户（判空 + 抛自定义异常）
     */

    public User selectByPhone(String phone) {
        User user= userMapper.selectByPhone(phone);
       if(user==null)
           throw new UserNotFoundException("手机号【" + phone + "】对应的用户不存在");
        return user;
    }
 public User selectByEmail(String email) {
     // return userMapper.selectByEmail(email)
      //      .orElseThrow(() -> new UserNotFoundException("email" + email + "】对应的用户不存在"));
     User user= userMapper.selectByEmail(email);
     if(user==null)
         throw new UserNotFoundException("email" + email + "】对应的用户不存在");
        return user;
    }
 
public User selectById(String userId) {
     //  return userMapper.selectById(userId)
     //       .orElseThrow(() -> new UserNotFoundException("userId" + userId + "】对应的用户不存在"));
    User user= userMapper.selectById(userId);
    if(user==null)
        throw new UserNotFoundException("userId" + userId + "】对应的用户不存在");
    return user;
    }
 /**
     * 根据手机号/邮箱查询用户（登录专用）
     */
    public User selectByPhoneOrEmail(String account) {
        User user = userMapper.selectByPhoneOrEmail(account);
        if (user == null) {
            throw new UserNotFoundException("账号【" + account + "】不存在");
        }
        return user;
    }

    public int update(User user)
    {
        // 校验 userId 是否存在
        if (user == null || user.getUserId() == null || user.getUserId().isEmpty()) {
            throw new IllegalArgumentException("用户ID不能为空");
        }
        // 可加入其他合法性校验，如手机、邮箱等
        int ret = userMapper.update(user);
        if (ret <= 0) {
            throw new UserNotFoundException("用户信息更新失败，用户不存在");
        }
        return ret;
    }
    public int updatePassword(User user)
    {
        // 更新密码
        int ret = userMapper.updatePassword(user);
        return ret;
    }

    public List<User> list()
    {
        List <User> ret = userMapper.list();

        return ret;
    }
    public List<User>   listByCondition(Map<String, Object> condition)
    {
        List <User> ret = userMapper.listByCondition(condition);

        return ret;
    };
}

/*
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