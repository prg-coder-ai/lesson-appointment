package com.reservation.service;

import com.reservation.entity.User;
import com.reservation.exception.BusinessException;
import com.reservation.exception.ResourceNotFoundException;
import com.reservation.mapper.UserMapper;
import com.reservation.utils.JwtUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
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
    @Transactional
    public Map<String, String> studentRegister(User user) {
        // 校验手机号/邮箱是否已注册（对应业务异常校验）
        if (userMapper.selectByPhone(user.getPhone()) != null) {
            throw new BusinessException("该手机号已注册");
        }
        if (userMapper.selectByEmail(user.getEmail()) != null) {
            throw new BusinessException("该邮箱已注册");
        }
        // 密码加密（对应设计2.3 安全设计-密码加密）
        user.setPassword(passwordEncoder.encode(user.getPassword()));
        // 生成唯一userId（对应通用校验规则-ID类参数）
        user.setUserId(UUID.randomUUID().toString());
        // 设置角色为student，状态为active（对应设计2.2.1 学生注册逻辑）
        user.setRole("student");
        user.setStatus("active");
        
        // 插入数据库
        userMapper.insert(user);
        // 生成Token（对应设计2.3 安全设计-Token）
        String token = jwtUtil.generateToken(user.getUserId(), user.getRole());
        // 组装返回数据（对应设计2.2.1 学生注册返回数据）
        Map<String, String> resultMap = new HashMap<>();
        resultMap.put("userId", user.getUserId());
        resultMap.put("token", token);
        return resultMap;
    }

    // 教师注册（对应设计2.2.1 教师注册接口）
    @Transactional
    public void teacherRegister(User user) {
        // 校验手机号/邮箱是否已注册
        if (userMapper.selectByPhone(user.getPhone()) != null) {
            throw new BusinessException("该手机号已注册");
        }
        if (userMapper.selectByEmail(user.getEmail()) != null) {
            throw new BusinessException("该邮箱已注册");
        }
        // 密码加密（对应设计2.3 安全设计-密码加密）
        user.setPassword(passwordEncoder.encode(user.getPassword()));
        // 生成唯一userId
        user.setUserId(UUID.randomUUID().toString());
        // 设置角色为teacher，状态为inactive（待审核，对应设计2.2.1 教师注册逻辑）
        user.setRole("teacher");
        user.setStatus("inactive");
        // 插入数据库
        userMapper.insert(user);
    }

    // 用户登录（对应设计2.2.1 登录接口）
    public Map<String, String> login(String account, String password) {
        // 查找用户（账号可为手机号/邮箱，对应设计2.2.1 登录接口请求参数）
        User user = userMapper.selectByPhoneOrEmail(account);
        if (user == null) {
            throw new ResourceNotFoundException("账号不存在");
        }
        // 校验密码
        if (!passwordEncoder.matches(password, user.getPassword())) {
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
        resultMap.put("role", user.getRole());
        resultMap.put("token", token);
        return resultMap;
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
        // 加密新密码并更新
        user.setPassword(passwordEncoder.encode(newPassword));
        userMapper.updatePassword(user);
    }
}