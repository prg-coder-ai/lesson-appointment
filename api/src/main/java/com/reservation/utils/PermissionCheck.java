package com.reservation.utils;

import com.reservation.exception.NoPermissionException;
import com.reservation.exception.UnLoginException;
import com.reservation.mapper.UserMapper;
import com.reservation.entity.User;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * PermissionCheck工具类，核心实现接口权限校验，对应设计2.3 安全设计-RBAC模型
 * 被CourseController、StudentReservationController注入使用，实现角色校验和权限控制
 */
@Component
public class PermissionCheck {

    @Autowired
    private JwtUtil jwtUtil;
    @Autowired
    private UserMapper userMapper;

    /**
     * 校验：仅管理员可操作（对应CourseController创建课程模板等接口）
     * @param token 请求头中的Authorization Token
     */
    public void checkAdmin(String token) {
        // 解析Token中的角色
        String role = jwtUtil.getRoleFromToken(token);
        // 校验角色是否为admin，否则抛出权限不足异常
        if (!"admin".equals(role)) {
            throw new NoPermissionException("您无管理员权限，无法执行该操作");
        }
    }

    /**
     * 校验：仅教师可操作（对应CourseController创建课程、设置排期等接口）
     * @param token 请求头中的Authorization Token
     */
    public void checkTeacher(String token) {
        // 解析Token中的角色和用户ID
        String role = jwtUtil.getRoleFromToken(token);
        String userId = jwtUtil.getUserIdFromToken(token);
        // 1. 校验角色为teacher
        if (!"teacher".equals(role)) {
            throw new NoPermissionException("您无教师权限，无法执行该操作");
        }
        // 2. 校验教师账号状态为active（对应设计2.2.1 教师注册审核逻辑）
        User teacher = userMapper.selectById(userId);
        if (teacher == null || !"active".equals(teacher.getStatus())) {
            throw new NoPermissionException("教师账号未审核或已冻结，无法执行操作");
        }
    }

    /**
     * 校验：仅学生可操作（对应StudentReservationController所有学生接口）
     * @param token 请求头中的Authorization Token
     */
    public void checkStudent(String token) {
        // 解析Token中的角色和用户ID
        String role = jwtUtil.getRoleFromToken(token);
        String userId = jwtUtil.getUserIdFromToken(token);
        // 1. 校验角色为student
        if (!"student".equals(role)) {
            throw new NoPermissionException("您无学生权限，无法执行该操作");
        }
        // 2. 校验学生账号状态为active
        User student = userMapper.selectById(userId);
        if (student == null || !"active".equals(student.getStatus())) {
            throw new NoPermissionException("学生账号未激活或已冻结，无法执行操作");
        }
    }

    /**
     * 校验：教师或管理员可操作（对应CourseController查询课程模板列表等接口）
     * @param token 请求头中的Authorization Token
     */
    public void checkTeacherOrAdmin(String token) {
        String role = jwtUtil.getRoleFromToken(token);
        String userId = jwtUtil.getUserIdFromToken(token);
        // 校验角色为admin，或角色为teacher且账号状态active
        if ("admin".equals(role)) {
            return; // 管理员直接通过
        } else if ("teacher".equals(role)) {
            User teacher = userMapper.selectById(userId);
            if (teacher != null && "active".equals(teacher.getStatus())) {
                return; // 教师账号正常，通过校验
            }
        }
        // 以上条件均不满足，抛出权限不足异常
        throw new NoPermissionException("您无权限执行该操作");
    }

    /**
     * 辅助方法：从Token中获取用户ID，用于订单归属、课程归属校验
     * @param token 请求头中的Authorization Token
     * @return 用户ID（userId）
     */
    public String getUserIdFromToken(String token) {
        try {
            return jwtUtil.getUserIdFromToken(token);
        } catch (Exception e) {
            throw new UnLoginException("Token解析失败，请重新登录");
        }
    }

    /**
     * 辅助校验：教师创建课程/排期时，校验课程归属（课程的teacherId与Token中userId一致）
     * @param token Token
     * @param teacherId 课程/排期中的教师ID
     */
    public void checkTeacherOwner(String token, String teacherId) {
        // 校验教师权限
        checkTeacher(token);
        // 获取Token中的教师ID
        String currentTeacherId = getUserIdFromToken(token);
        // 校验课程/排期归属当前教师
        if (!currentTeacherId.equals(teacherId)) {
            throw new NoPermissionException("您无权操作其他教师的课程/排期");
        }
    }

    /**
     * 辅助校验：学生操作订单时，校验订单归属（订单的studentId与Token中userId一致）
     * @param token Token
     * @param studentId 订单中的学生ID
     */
    public void checkStudentOwner(String token, String studentId) {
        // 校验学生权限
        checkStudent(token);
        // 获取Token中的学生ID
        String currentStudentId = getUserIdFromToken(token);
        // 校验订单归属当前学生
        if (!currentStudentId.equals(studentId)) {
            throw new NoPermissionException("您无权操作他人订单");
        }
    }
}