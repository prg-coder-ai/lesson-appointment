# Password Encoder BCrypt: State and Security

`PasswordEncoder`（以Spring Security默认的`BCryptPasswordEncoder`为例）的`encode`算法**是有状态的**，但这个“状态”是**算法内部生成的随机盐值**，并非全局共享的状态，不会导致线程安全问题，也不会影响加密/解密的一致性。

### 核心结论

Spring Security中主流的`PasswordEncoder`实现（`BCryptPasswordEncoder`/`SCryptPasswordEncoder`/`Pbkdf2PasswordEncoder`）的`encode`方法**自身带随机状态（盐值）**，**每次调用encode同一个明文密码，得到的密文结果都不同**；但验证时（`matches`方法）能通过密文自身携带的盐值完成校验，无需单独存储盐值。

### 一、最典型的示例：BCryptPasswordEncoder

这是Spring Security默认推荐的实现，也是你项目中正在使用的，其`encode`的**状态性核心来自随机盐值+工作因子**：

```Java
@Autowired
private BCryptPasswordEncoder passwordEncoder;

// 测试：同一个明文，两次encode结果完全不同
public void testEncode() {
    String pwd = "123456";
    String encode1 = passwordEncoder.encode(pwd); // $2a$10$xxxx...
    String encode2 = passwordEncoder.encode(pwd); // $2a$10$yyyy...
    System.out.println(encode1.equals(encode2)); // false
    
    // 但matches方法能正确验证，因为密文里包含了盐值和工作因子
    System.out.println(passwordEncoder.matches(pwd, encode1)); // true
    System.out.println(passwordEncoder.matches(pwd, encode2)); // true
}
```

### 二、“有状态”的本质：盐值内置在密文中

`BCrypt`的`encode`方法在执行时，会**自动生成一个随机的16位盐值**（还会指定工作因子，默认10），并将**盐值+工作因子+加密后的密文**拼接成最终的字符串，格式为：

```Plain Text
$2a$[工作因子]$[随机盐值][密文主体]
```

- 「状态」就是**每次encode生成的随机盐值**，这是算法的核心安全设计（避免彩虹表破解）；

- 验证时`matches`方法会**从密文中解析出盐值和工作因子**，用相同的算法重新加密明文，再和密文对比，因此无需单独存储盐值。

### 三、不同PasswordEncoder的状态性对比

Spring Security提供的`PasswordEncoder`实现，`encode`方法的状态性分两类，**推荐使用带随机盐值的有状态实现**：

|实现类|encode是否有状态|核心特点|安全性|推荐度|
|---|---|---|---|---|
|BCryptPasswordEncoder|是（随机盐）|单向哈希，盐值内置，慢哈希|高|✅✅✅|
|SCryptPasswordEncoder|是（随机盐）|基于内存硬破解，比BCrypt更安全|极高|✅✅✅|
|Pbkdf2PasswordEncoder|是（随机盐）|符合密码学标准，盐值内置|高|✅✅✅|
|MessageDigestPasswordEncoder（MD5/SHA）|无|需手动指定盐值，易被破解|低|❌|
### 四、关键注意点（结合你的项目）

#### 1. 无线程安全问题

虽然`encode`方法有状态，但这个状态是**方法内的局部变量**（随机盐值在每次调用时重新生成），而非对象的成员变量，因此`BCryptPasswordEncoder`是**线程安全的**，可以单例注入（Spring默认就是单例Bean，你项目中通过`@Bean`配置的方式完全正确）。

#### 2. 无需手动管理盐值

和传统的MD5加密不同，**不需要在数据库中单独建字段存储盐值**，因为盐值已经内置在密文字符串中，存储密文即可完成后续的验证（这也是你项目中直接存储`encode`结果的原因）。

#### 3. 工作因子可自定义（平衡安全和性能）

BCrypt的工作因子（默认10）决定了加密的耗时，值越大，加密越慢，破解难度越高（建议设置10-14，根据服务器性能调整）：

```Java
// 自定义工作因子，项目中可这样配置Bean
@Bean
public BCryptPasswordEncoder bCryptPasswordEncoder() {
    return new BCryptPasswordEncoder(12); // 工作因子12
}
```

#### 4. 单向加密，不可逆

`PasswordEncoder`的`encode`是**单向哈希算法**，没有对应的`decode`方法（也无法解密），验证只能通过`matches`方法，这是密码存储的安全最佳实践（即使数据库泄露，也无法还原明文密码）。

### 五、和你项目的结合

你项目中在`TeacherServiceImpl`里用`bCryptPasswordEncoder.encode(user.getPassword())`加密密码，完全符合安全规范：

1. 每次注册用户，同一个密码会生成不同的密文，避免彩虹表攻击；

2. 数据库仅存储密文，无需存储盐值，简化表结构；

3. 登录时只需调用`passwordEncoder.matches(前端传入密码, 数据库密文)`即可完成验证；

4. 单例Bean注入，无线程安全问题，可在多请求下正常使用。

### 总结

1. `PasswordEncoder`（BCrypt/SCrypt/Pbkdf2）的`encode`**有状态**，状态为**每次调用生成的随机盐值**；

2. 状态是局部的，**线程安全**，可放心单例使用；

3. 盐值内置在密文中，**无需单独存储**，验证通过`matches`方法自动解析；

4. 同一个明文多次encode结果不同，但`matches`能正确验证，这是安全设计，而非bug。

### 六、登录成功后安全状态设置（适配项目，实现antMatchers之外页面正常访问）

结合你项目的Spring Security配置，登录成功后设置安全状态的核心是：**登录验证通过后，将用户信息存入SecurityContext（安全上下文），同时配置安全拦截规则，让已认证用户可访问非antMatchers放行的页面/接口**，具体实现分3步，完全适配你的教师注册/登录业务。

#### 1. 核心原理

Spring Security的安全状态由`SecurityContextHolder`（安全上下文持有者）管理，登录成功后，需将`Authentication`（认证信息）存入上下文，后续请求会自动校验上下文是否有合法认证信息：

- 未登录：上下文无认证信息，拦截所有非antMatchers放行的请求，跳转登录页；

- 已登录：上下文有认证信息，放行所有配置允许的请求（antMatchers之外的页面/接口）。

#### 2. 具体实现（分代码模块，直接复制到项目）

##### （1）登录接口实现（Controller层，处理登录请求，设置安全状态）

```Java
@Controller
@RequestMapping("/user")
public class LoginController {
    
    @Autowired
    private UserService userService;
    @Autowired
    private BCryptPasswordEncoder passwordEncoder;
    
    // 登录接口（接收前端表单/JSON参数，适配你项目的传参方式）
    @PostMapping("/login")
    @ResponseBody
    public String login(@RequestParam String email, @RequestParam String password) {
        // 1. 查询用户（调用你项目中已有的selectByEmail方法）
        User user = userService.selectByEmail(email);
        if (user == null) {
            return "用户不存在";
        }
        
        // 2. 密码校验（使用BCryptPasswordEncoder的matches方法）
        if (!passwordEncoder.matches(password, user.getPassword())) {
            return "密码错误";
        }
        
        // 3. 登录成功：设置安全状态（核心步骤）
        // 封装用户认证信息（角色需和数据库一致，如teacher/student）
        UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                user.getEmail(), // 用户名（可用邮箱/手机号）
                user.getPassword(), // 密码（可传null，不影响验证）
                Collections.singletonList(new SimpleGrantedAuthority("ROLE_" + user.getRole())) // 角色（必须加ROLE_前缀）
        );
        
        // 将认证信息存入安全上下文（自动维护会话，无需手动管理）
        SecurityContextHolder.getContext().setAuthentication(authentication);
        
        return "登录成功";
    }
    
    // 退出登录：清除安全状态
    @GetMapping("/logout")
    public String logout() {
        SecurityContextHolder.clearContext(); // 清除上下文，安全状态失效
        return "redirect:/login.html"; // 跳回登录页
    }
}
```

##### （2）Spring Security配置（核心：拦截规则，区分放行/需认证请求）

配置`SecurityFilterChain`，明确antMatchers放行的请求（如登录页、注册页、静态资源），其余请求需已认证（登录后才能访问），这是实现“antMatchers之外页面正常打开”的关键：

```Java
@Configuration
@EnableWebSecurity
public class SecurityConfig {
    
    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            // 关闭CSRF（开发环境可关闭，生产环境需开启）
            .csrf().disable()
            // 配置拦截规则
            .authorizeHttpRequests(auth -> auth
                // 1. antMatchers放行：登录页、注册页、静态资源、接口
                .antMatchers("/login.html", "/teacher-register.html", "/teacher/register", "/user/login").permitAll()
                .antMatchers("/js/**", "/css/**", "/img/**").permitAll() // 静态资源放行
                // 2. 其余所有请求：必须已认证（登录后才能访问）
                .anyRequest().authenticated()
            )
            // 配置登录失败/未登录的跳转（可选，适配你的页面）
            .formLogin(form -> form
                .loginPage("/login.html") // 未登录时跳转的登录页
                .loginProcessingUrl("/user/login") // 登录请求接口（和Controller一致）
                .failureUrl("/login.html?error=true") // 登录失败跳转
                .defaultSuccessUrl("/index.html", true) // 登录成功默认跳转页
            )
            // 配置退出登录
            .logout(logout -> logout
                .logoutUrl("/user/logout") // 退出接口（和Controller一致）
                .logoutSuccessUrl("/login.html") // 退出成功跳转页
                .invalidateHttpSession(true) // 销毁会话
            );
        
        return http.build();
    }
}
```

##### （3）Service层补充（复用已有方法，无需额外开发）

确保`UserService`中包含`selectByEmail`方法（你项目中已实现），用于登录时查询用户信息：

```Java
@Service
public class UserServiceImpl implements UserService {
    
    @Autowired
    private UserMapper userMapper;
    
    @Override
    public User selectByEmail(String email) {
        return userMapper.selectByEmail(email);
    }
    // 其余已有方法（如注册）不变
}
```

#### 3. 关键注意点（避免配置失效）

- 角色前缀必须加`ROLE_`：Spring Security默认要求角色以`ROLE_`为前缀（如`ROLE_teacher`），否则权限校验失效，登录后仍无法访问受保护页面；

- 安全上下文自动维护：`SecurityContextHolder`默认使用`ThreadLocal`存储上下文，会话期间（默认30分钟）无需重复设置，后续请求会自动读取；

- antMatchers放行规则：需明确放行登录页、注册页、静态资源，避免出现“登录页被拦截”的死循环；

- 会话销毁：退出登录时需调用`SecurityContextHolder.clearContext()`，同时销毁HttpSession，确保安全状态完全清除。

#### 4. 效果验证

1. 未登录状态：访问`/index.html`（非antMatchers放行页面），自动跳转至`/login.html`；

2. 登录成功：调用`/user/login`接口，验证通过后，安全上下文存入认证信息，可正常访问`/index.html`、`/teacher/list`等所有非antMatchers放行的页面/接口；

3. 退出登录：调用`/user/logout`，安全上下文清除，再次访问受保护页面，重新跳转登录页。

该配置完全适配你项目的现有架构（教师注册、BCrypt加密、MyBatis映射），无需修改已有业务代码，仅新增登录接口和Security配置即可实现需求。

### 七、配置中路径与角色前缀匹配检查方法（适配本项目）

检查核心：确保`SecurityConfig`中的**路径配置**与项目实际文件路径、接口路径一致，**角色前缀**符合Spring Security规范且与数据库角色值匹配，避免出现“登录后无法访问页面”“权限校验失效”等问题，分两步实操检查，全程可直接对应项目代码。

#### 第一步：路径匹配检查（核心，避免拦截失效）

重点检查`SecurityConfig`中`antMatchers`配置的路径，与项目中实际的页面、接口、静态资源路径完全一致（大小写敏感、路径层级不遗漏），具体检查步骤：

1. 检查页面路径（如登录页、注册页）
      

2. 项目页面存储路径：确认页面文件（`login.html`、`teacher-register.html`、`index.html`）是否放在`src/main/resources/templates/`下（与项目配置的`spring.thymeleaf.prefix=classpath:/templates/`对应）；

3. 配置路径校验：对比`SecurityConfig`中`antMatchers`放行的页面路径（`/login.html`、`/teacher-register.html`），与页面文件名完全一致，无多余后缀（如`.html`不能漏）、无路径层级错误（如不能写成`/page/login.html`，除非页面放在`templates/page/`下）；

4. 测试验证：未登录状态下，直接访问`http://localhost:8081/login.html`、`http://localhost:8081/teacher-register.html`，能正常打开则路径匹配正确；若跳转404或登录页，则路径配置错误。

5. 检查接口路径（如登录、注册接口）

6. 接口路径对比：对比`SecurityConfig`中放行的接口（`/teacher/register`、`/user/login`），与Controller层接口的`@RequestMapping`、`@PostMapping`路径完全一致；
       

7. 例：`LoginController`中登录接口是`@PostMapping(&#34;/login&#34;)`，类上是`@RequestMapping("/user")`，则完整接口路径是`/user/login`，需与`SecurityConfig`中放行路径完全匹配；

8. 注意：接口路径区分`GET/POST`请求方式，但`antMatchers`未指定请求方式时，默认放行所有方式，若配置了请求方式（如`antMatchers(HttpMethod.POST, "/user/login").permitAll()`），需与Controller接口请求方式一致。

9. 测试验证：用Postman或前端页面调用`/teacher/register`（注册）、`/user/login`（登录）接口，未登录状态下能正常返回响应（无403禁止访问），则接口路径匹配正确。

10. 检查静态资源路径（如js、css、img）
      

11. 静态资源存储路径：确认静态资源（js、css、img文件夹）是否放在`src/main/resources/templates/`或`src/main/resources/static/`下（与项目配置的`spring.web.resources.static-locations`对应）；

12. 配置路径校验：`antMatchers("/js/**", "/css/**", "/img/**").permitAll()` 中，`/**` 表示匹配该文件夹下所有文件及子文件夹，确保静态资源路径前缀（`/js`、`/css`）与实际文件夹名一致；

13. 测试验证：打开登录页、注册页，查看页面样式、图片是否正常加载（无404报错），则静态资源路径匹配正确。

#### 第二步：角色前缀匹配检查（核心，避免权限失效）

重点检查`LoginController`中角色封装的`ROLE_`前缀，与Spring Security规范、数据库角色值匹配，具体检查步骤（贴合你项目的教师角色场景）：

1. 检查角色前缀配置（必须加`ROLE_`）
      

2. 代码校验：打开`LoginController`，查看角色封装代码`new SimpleGrantedAuthority("ROLE_" + user.getRole())`，确保`ROLE_`前缀没有遗漏、没有多余字符（如不能写成`Role_`、`ROLE`）；

3. 规范说明：Spring Security默认要求角色标识必须以`ROLE_`为前缀，否则权限校验会失效——即使登录成功，也无法访问受保护的页面/接口，这是Spring Security权限管理的核心规范之一。

4. 检查角色值与数据库匹配
      

5. 数据库校验：查看项目`user`表的`role`字段，确认教师角色值为`teacher`（与你项目注册时设置的`role: "teacher"`一致）；

6. 代码匹配：确保`user.getRole()`获取到的角色值（如`teacher`），与`ROLE_`拼接后为`ROLE_teacher`，无字符大小写错误（如数据库角色是`Teacher`，代码中拼接后为`ROLE_Teacher`，会导致权限不匹配）；

7. 扩展检查：若项目后续新增管理员角色（如`admin`），需确保数据库`role`字段值为`admin`，代码中拼接后为`ROLE_admin`，与权限配置保持一致，实现不同角色的权限区分。

8. 测试验证（最直接的校验方式）
      

9. 登录测试：使用教师账号（数据库`role`为`teacher`）登录，登录成功后，访问`/index.html`、`/teacher/list`等非`antMatchers`放行的页面/接口，能正常访问则角色前缀匹配正确；

10. 异常排查：若登录成功后仍无法访问，大概率是角色前缀遗漏或角色值不匹配，可在`LoginController`中添加打印语句（`System.out.println("角色：" + "ROLE_" + user.getRole())`），启动项目后查看控制台打印的角色值，确认是否为`ROLE_teacher`。

#### 补充：常见匹配错误及解决方法

- 路径错误：页面/接口能访问，但被Spring Security拦截 → 检查`antMatchers`是否放行该路径，路径是否有大小写、层级错误；

- 角色错误：登录成功后无法访问受保护页面 → 检查角色前缀`ROLE_`是否遗漏，数据库`role`字段值与代码中拼接的角色值是否一致；

- 静态资源错误：页面样式/图片加载失败 → 检查静态资源路径配置，确保`antMatchers`放行静态资源，且路径与实际文件夹名一致。

通过以上两步检查，可确保配置中的路径、角色前缀与项目完全匹配，避免因配置不匹配导致的安全拦截失效、权限校验异常等问题，适配你项目的现有架构，无需额外修改业务代码。

### 八、补充：系统生成的token有什么作用，前后端如何传递和验证（适配本项目）

结合你项目已配置的JWT密钥（`jwt.secret=comreservationapp`），系统生成的token（通常为JWT令牌）是**无状态的身份凭证**，核心用于替代传统会话，实现登录状态的跨请求、跨服务验证，适配前后端分离或多端访问场景，以下内容完全贴合你项目的Spring Security架构，可直接集成使用。

#### 一、token的核心作用（贴合项目场景）

token是登录成功后，后端为前端生成的“身份通行证”，替代`SecurityContext`的会话存储（避免服务器存储会话压力），核心作用有3点：

- 身份认证：证明当前请求的发起者是“已登录的合法用户”，无需每次请求都重新输入账号密码；

- 权限校验：token中可携带用户角色（如`ROLE_teacher`），后端验证token时可同步校验用户权限，决定是否放行请求；

- 无状态可扩展：token自身包含所有必要信息（用户ID、角色、过期时间），服务器无需存储会话，支持多服务器部署（如项目扩容），前端可在多页面/多终端复用登录状态。

#### 二、前后端token的传递方式（适配你项目的请求场景）

传递核心原则：**前端存储token，每次请求（除放行接口外）携带token，后端统一拦截验证**，具体方式分2步，贴合你项目的前端表单/接口请求：

##### 1. 前端传递token（2种常用方式，优先推荐第一种）

- 方式一：请求头（推荐，安全且规范）
        2. 后端接收token后端通过拦截器（或Spring Security过滤器）统一拦截请求，从请求头中提取token，无需在每个接口中单独接收，后续会补充完整拦截验证逻辑。三、前后端token的验证流程（核心，适配你项目的JWT配置）结合你项目已配置的JWT密钥（`jwt.secret=comreservationapp`），token验证流程分“后端生成token→前端携带token→后端验证token”三步，全程可直接集成到现有代码：1. 第一步：后端生成token（登录成功后，补充到LoginController）需先添加JWT依赖（若未添加），然后编写JWT工具类，登录成功后生成token并返回给前端：`// 1. 先在pom.xml添加JWT依赖（若未添加）
<dependency>
    <groupId>io.jsonwebtoken</groupId>
    <artifactId>jjwt</artifactId>
    <version>0.9.1</version>
</dependency>

// 2. 编写JWT工具类（可直接复制到项目，使用你项目的JWT密钥）
import io.jsonwebtoken.*;
import java.util.Date;

public class JwtUtil {
    // 读取你项目application.properties中的jwt.secret
    private static final String JWT_SECRET = "comreservationapp";
    // 读取你项目的jwt.expiration（3600000ms = 1小时）
    private static final long JWT_EXPIRATION = 3600000;

    // 生成token（登录成功后调用）
    public static String generateToken(String username, String role) {
        Date now = new Date();
        Date expirationDate = new Date(now.getTime() + JWT_EXPIRATION);
        
        return Jwts.builder()
                .setSubject(username) // 存储用户名（如邮箱）
                .claim("role", role) // 存储角色（如ROLE_teacher）
                .setIssuedAt(now) // 生成时间
                .setExpiration(expirationDate) // 过期时间
                .signWith(SignatureAlgorithm.HS512, JWT_SECRET) // 用密钥签名
                .compact();
    }

    // 从token中获取用户名
    public static String getUsernameFromToken(String token) {
        Claims claims = Jwts.parser()
                .setSigningKey(JWT_SECRET)
                .parseClaimsJws(token)
                .getBody();
        return claims.getSubject();
    }

    // 从token中获取角色
    public static String getRoleFromToken(String token) {
        Claims claims = Jwts.parser()
                .setSigningKey(JWT_SECRET)
                .parseClaimsJws(token)
                .getBody();
        return (String) claims.get("role");
    }

    // 验证token是否有效（未过期、签名正确）
    public static boolean validateToken(String token) {
        try {
            Jwts.parser().setSigningKey(JWT_SECRET).parseClaimsJws(token);
            return true;
        } catch (Exception e) {
            // token过期、签名错误、token非法，均返回false
            return false;
        }
    }
}

// 3. 改造LoginController，登录成功后生成并返回token
@PostMapping("/login")
@ResponseBody
public String login(@RequestParam String email, @RequestParam String password) {
    // 1. 查询用户、2. 密码校验（原有代码不变）
    User user = userService.selectByEmail(email);
    if (user == null) {
        return "用户不存在";
    }
    if (!passwordEncoder.matches(password, user.getPassword())) {
        return "密码错误";
    }
    
    // 新增：生成token（角色拼接ROLE_，与之前权限配置一致）
    String role = "ROLE_" + user.getRole();
    String token = JwtUtil.generateToken(email, role);
    
    // 可选：同时设置SecurityContext（兼容原有安全状态）
    UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
            email, null, Collections.singletonList(new SimpleGrantedAuthority(role))
    );
    SecurityContextHolder.getContext().setAuthentication(authentication);
    
    // 返回token给前端（前端接收后存储）
    return token; // 建议返回JSON格式，如{"code":200, "token":token, "msg":"登录成功"}
}`2. 第二步：前端携带token（已有示例，补充细节）前端接收后端返回的token后，存储到`localStorage`，并在所有非放行请求中携带，注意2点：3. 第三步：后端验证token（核心，配置Spring Security拦截）通过Spring Security的过滤器，统一拦截请求、验证token，替代部分`SecurityContext`的校验，确保未携带有效token的请求无法访问受保护页面/接口：`// 1. 编写JWT过滤器（拦截所有请求，验证token）
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.web.filter.OncePerRequestFilter;
import javax.servlet.FilterChain;
import javax.servlet.ServletException;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Collections;

public class JwtAuthenticationFilter extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain) throws ServletException, IOException {
        // 1. 从请求头中提取token
        String authorizationHeader = request.getHeader("Authorization");
        String token = null;
        if (authorizationHeader != null && authorizationHeader.startsWith("Bearer ")) {
            token = authorizationHeader.substring(7); // 截取Bearer后面的token值
        }
        
        // 2. 验证token是否有效
        if (token != null && JwtUtil.validateToken(token)) {
            // 从token中获取用户名和角色
            String username = JwtUtil.getUsernameFromToken(token);
            String role = JwtUtil.getRoleFromToken(token);
            
            // 封装认证信息，存入SecurityContext（适配原有权限校验）
            UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                    username, null, Collections.singletonList(new SimpleGrantedAuthority(role))
            );
            SecurityContextHolder.getContext().setAuthentication(authentication);
        }
        
        // 继续执行后续过滤器（放行或拦截）
        filterChain.doFilter(request, response);
    }
}

// 2. 在SecurityConfig中配置过滤器（新增，与原有配置兼容）
@Configuration
@EnableWebSecurity
public class SecurityConfig {
    
    // 注入JWT过滤器
    @Bean
    public JwtAuthenticationFilter jwtAuthenticationFilter() {
        return new JwtAuthenticationFilter();
    }
    
    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .csrf().disable()
            .authorizeHttpRequests(auth -> auth
                .antMatchers("/login.html", "/teacher-register.html", "/teacher/register", "/user/login").permitAll()
                .antMatchers("/js/**", "/css/**", "/img/**").permitAll()
                .anyRequest().authenticated()
            )
            .formLogin(form -> form
                .loginPage("/login.html")
                .loginProcessingUrl("/user/login")
                .failureUrl("/login.html?error=true")
                .defaultSuccessUrl("/index.html", true)
            )
            .logout(logout -> logout
                .logoutUrl("/user/logout")
                .logoutSuccessUrl("/login.html")
                .invalidateHttpSession(true)
            )
            // 新增：添加JWT过滤器，在用户名密码认证过滤器之前执行
            .addFilterBefore(jwtAuthenticationFilter(), UsernamePasswordAuthenticationFilter.class);
        
        return http.build();
    }
}`四、关键注意点（适配你项目，避免token验证失效）五、效果验证

    - 存储token：登录成功后，前端接收后端返回的token，存入`localStorage`（持久化，刷新页面不丢失）或`sessionStorage`（临时存储，关闭页面失效）；

    - 携带token：每次请求（如访问`/index.html`、`/teacher/list`）时，在请求头中添加`Authorization: Bearer [token值]`，示例（fetch请求）：
                `// 登录成功后存储token
    fetch("/user/login", {
        method: "POST",
        headers: {"Content-Type": "application/x-www-form-urlencoded"},
        body: "email=xxx&password=xxx"
    }).then(res => res.text()).then(data => {
        if(data === "登录成功") {
            // 假设后端返回token（后续会补充后端生成逻辑）
            localStorage.setItem("token", 后端返回的token值);
        }
    });
    
    // 后续请求携带token
    fetch("/index.html", {
        method: "GET",
        headers: {
            "Authorization": "Bearer " + localStorage.getItem("token")
        }
    });`

    - 方式二：URL参数（不推荐，安全性低，仅临时测试用）
            

        - 携带方式：将token拼接在URL末尾，如`http://localhost:8081/index.html?token=xxx`；

        - 注意：URL参数会暴露在地址栏、浏览器历史记录中，易泄露，生产环境禁止使用。

    - token过期处理：若后端返回“token过期”，前端清除`localStorage`中的token，跳转至登录页；

    - 放行接口无需携带：`/login.html`、`/teacher-register.html`等antMatchers放行接口，无需携带token，避免无效请求。

    - JWT密钥一致性：JWT工具类中的`JWT_SECRET`必须与你项目`application.properties`中的`jwt.secret`完全一致（无多余空格、大小写一致），否则会出现签名验证失败；

    - token过期时间：与`jwt.expiration`保持一致，建议设置1-2小时，过期后前端需重新登录获取新token；

    - 角色一致性：token中存储的角色必须是`ROLE_teacher`（与之前权限配置一致），否则权限校验失效；

    - token安全性：前端禁止将token存储在`cookie`中（易受CSRF攻击），优先使用`localStorage`，且敏感操作（如退出）需清除token；

    - 兼容原有配置：新增JWT过滤器后，不影响原有`SecurityContext`的使用，实现“会话+token”双重兼容，适配不同请求场景。

    1. 登录：调用`/user/login`接口，获取后端返回的token，前端存入`localStorage`；

    2. 访问受保护页面：携带token请求`/index.html`，后端验证token有效，正常放行；

    3. token无效/过期：删除`localStorage`中的token，或等待token过期后请求，后端拦截并跳转至登录页；

    4. 退出登录：前端清除`localStorage`中的token，后端清除`SecurityContext`，再次请求受保护页面需重新登录。
> （注：文档部分内容可能由 AI 生成）