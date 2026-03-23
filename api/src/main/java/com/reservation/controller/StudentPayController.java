/*StudentReservationController.java*/

package com.reservation.controller;

import com.reservation.common.Result;
import com.reservation.entity.CourseQueryParam;
import com.reservation.entity.Order;
import com.reservation.entity.PayInfo;
import com.reservation.service.StudentReservationService;
import com.reservation.utils.PermissionCheck;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 学生预约模块控制器，对应设计2.2.3 学生预约模块所有接口，仅学生可操作（除公开查询接口）
 */
@RestController
@RequestMapping("/course/student")
@Validated
public class StudentPayController {

    @Autowired
    private StudentPayService payService;
    @Autowired
    private PermissionCheck permissionCheck;

    /**
     * 学生查询课程列表，对应设计2.2.3 接口：/api/v1/course/student/list（学生权限）
     */
    @GetMapping("/list")
    public Result<Map<String, List<Map<String, Object>>>> getCourseList(
            @Validated CourseQueryParam queryParam,
            @RequestHeader("Authorization") String token) {
        // 权限校验：仅学生可操作（对应设计2.3 安全设计-权限控制）
        permissionCheck.checkStudent(token);
        // 调用服务层查询课程，返回课程列表（包含课程信息、教师信息、排期信息）
        List<Map<String, Object>> courseList = reservationService.getCourseList(queryParam);
        Map<String, List<Map<String, Object>>> resultMap = Map.of("courseList", courseList);
        return Result.success(resultMap, "课程列表查询成功");
    }

    /**
     * 学生创建预约订单，对应设计2.2.3 接口：/api/v1/order/create（学生权限）
     */
    @PostMapping("/order/create")
    public Result<Map<String, String>> createOrder(
            @NotBlank(message = "排期ID不能为空") String scheduleId,
            @RequestHeader("Authorization") String token) {
        // 权限校验：仅学生可操作
        permissionCheck.checkStudent(token);
        // 获取当前学生ID（从Token中解析，对应设计2.3 安全设计-Token）
        String studentId = permissionCheck.getUserIdFromToken(token);
        // 调用服务层创建订单，返回orderId（对应设计2.2.3 预约接口返回数据）
        Map<String, String> resultMap = reservationService.createOrder(scheduleId, studentId);
        return Result.success(resultMap, "预约订单创建成功，请尽快支付");
    }

    /**
     * 学生支付订单，对应设计2.2.3 接口：/api/v1/pay/process（学生权限）
     */
    @PostMapping("/pay/process")
    public Result<Map<String, String>> processPay(
            @Validated @RequestBody PayInfo payInfo,
            @RequestHeader("Authorization") String token) {
        // 权限校验：仅学生可操作
        permissionCheck.checkStudent(token);
        // 获取当前学生ID，校验订单归属（对应设计2.3 安全设计-权限控制）
        String studentId = permissionCheck.getUserIdFromToken(token);
        // 调用服务层处理支付，返回支付结果（如支付链接、支付状态）
        Map<String, String> resultMap = reservationService.processPay(payInfo, studentId);
        return Result.success(resultMap, "支付处理成功");
    }

    /**
     * 学生查询个人预约订单列表，对应设计2.2.3 接口：/api/v1/order/student/list（学生权限）
     */
    @GetMapping("/order/list")
    public Result<Map<String, List<Order>>> getStudentOrderList(
            @RequestParam(required = false) String orderStatus,
            @RequestHeader("Authorization") String token) {
        // 权限校验：仅学生可操作
        permissionCheck.checkStudent(token);
        String studentId = permissionCheck.getUserIdFromToken(token);
        // 调用服务层查询订单列表（支持按订单状态筛选）
        List<Order> orderList = reservationService.getStudentOrderList(studentId, orderStatus);
        Map<String, List<Order>> resultMap = Map.of("orderList", orderList);
        return Result.success(resultMap, "订单列表查询成功");
    }

    /**
     * 学生取消预约订单，对应设计2.2.3 接口：/api/v1/order/cancel/student（学生权限）
     */
    @PostMapping("/order/cancel")
    public Result<Void> cancelOrder(
            @NotBlank(message = "订单ID不能为空") String orderId,
            @RequestHeader("Authorization") String token) {
        // 权限校验：仅学生可操作
        permissionCheck.checkStudent(token);
        String studentId = permissionCheck.getUserIdFromToken(token);
        // 调用服务层取消订单（校验取消时间限制，对应设计2.2.3 专属校验规则）
        reservationService.cancelOrder(studentId, orderId);
        return Result.success(null, "订单取消成功");
    }
}