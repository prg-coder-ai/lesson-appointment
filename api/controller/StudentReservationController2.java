

import com.language.reservation.common.Result;
import com.language.reservation.entity.ReservationOrder;
import com.language.reservation.entity.ReservationQuery;
import com.language.reservation.service.StudentReservationService;
import com.language.reservation.utils.PermissionCheck;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;

/**
 * 学生预约模块控制器，对应设计2.3 学生预约模块所有接口
 * 接口权限：仅学生可操作（通过PermissionCheck校验）
 */
@RestController
@RequestMapping("/reservation")
@Validated
public class StudentReservationController {

    @Autowired
    private StudentReservationService reservationService;
    @Autowired
    private PermissionCheck permissionCheck;

    /**
     * 预约下单接口，对应设计2.3 接口：/api/v1/reservation/create（学生权限）
     * 功能：学生选择排期创建预约订单，生成待支付订单
     */
    @PostMapping("/create")
    public Result<Map<String, String>> createReservation(
            @Validated @RequestBody ReservationOrder order,
            @RequestHeader("Authorization") String token) {
        // 权限校验：仅学生可操作
        permissionCheck.checkStudent(token);
        // 校验订单归属当前学生（确保学生只能创建自己的订单）
        String studentId = permissionCheck.getUserIdFromToken(token);
        order.setStudentId(studentId);
        // 调用服务层创建订单
        Map<String, String> resultMap = reservationService.createReservation(order);
        return Result.success(resultMap, "预约订单创建成功，请尽快支付");
    }

    /**
     * 订单支付接口，对应设计2.3 接口：/api/v1/reservation/pay（学生权限）
     * 功能：学生支付待支付订单，对接支付宝支付
     */
    @PostMapping("/pay")
    public Result<Map<String, String>> payOrder(
            @NotBlank(message = "订单ID不能为空") String orderId,
            @RequestHeader("Authorization") String token) {
        // 权限校验：仅学生可操作
        permissionCheck.checkStudent(token);
        // 校验订单归属当前学生
        String studentId = permissionCheck.getUserIdFromToken(token);
        permissionCheck.checkStudentOwner(token, studentId);
        // 调用服务层发起支付，返回支付宝支付页面链接
        Map<String, String> payInfo = reservationService.payOrder(orderId, studentId);
        return Result.success(payInfo, "支付链接生成成功");
    }

    /**
     * 支付同步回调接口，对应设计2.3 支付功能-同步回调
     * 功能：支付宝支付成功后跳转回调，更新订单状态
     */
    @GetMapping("/pay/return")
    public Result<Map<String, String>> payReturn(HttpServletRequest request) {
        // 解析支付宝回调参数，更新订单状态
        Map<String, String> resultMap = reservationService.handlePayReturn(request);
        return Result.success(resultMap, "支付成功");
    }

    /**
     * 支付异步回调接口，对应设计2.3 支付功能-异步回调
     * 功能：支付宝后台异步通知，确保订单状态同步（防止前端未回调）
     */
    @PostMapping("/pay/notify")
    public String payNotify(HttpServletRequest request) {
        // 处理支付宝异步通知，更新订单状态，返回success告知支付宝已接收
        boolean handleSuccess = reservationService.handlePayNotify(request);
        return handleSuccess ? "success" : "fail";
    }

    /**
     * 取消预约接口，对应设计2.3 接口：/api/v1/reservation/cancel（学生权限）
     * 功能：学生取消未支付订单，或符合条件的已支付订单（未到课）
     */
    @PostMapping("/cancel")
    public Result<Void> cancelReservation(
            @NotBlank(message = "订单ID不能为空") String orderId,
            @RequestHeader("Authorization") String token) {
        // 权限校验：仅学生可操作
        permissionCheck.checkStudent(token);
        // 校验订单归属当前学生
        String studentId = permissionCheck.getUserIdFromToken(token);
        reservationService.checkOrderOwner(orderId, studentId);
        // 调用服务层取消订单
        reservationService.cancelReservation(orderId);
        return Result.success(null, "预约订单取消成功");
    }

    /**
     * 预约查询接口，对应设计2.3 接口：/api/v1/reservation/list（学生权限）
     * 功能：学生查询自己的所有预约订单，支持多条件筛选
     */
    @GetMapping("/list")
    public Result<Map<String, Object>> getReservationList(
            ReservationQuery query,
            @RequestHeader("Authorization") String token) {
        // 权限校验：仅学生可操作
        permissionCheck.checkStudent(token);
        // 设置当前学生ID为查询条件（默认查询自己的订单）
        String studentId = permissionCheck.getUserIdFromToken(token);
        query.setStudentId(studentId);
        // 调用服务层查询订单列表（含分页）
        Map<String, Object> resultMap = reservationService.getReservationList(query);
        return Result.success(resultMap, "订单查询成功");
    }

    /**
     * 订单详情接口，对应设计2.3 接口：/api/v1/reservation/detail（学生权限）
     * 功能：学生查看单个预约订单的详细信息
     */
    @GetMapping("/detail")
    public Result<ReservationOrder> getReservationDetail(
            @NotBlank(message = "订单ID不能为空") String orderId,
            @RequestHeader("Authorization") String token) {
        // 权限校验：仅学生可操作
        permissionCheck.checkStudent(token);
        // 校验订单归属当前学生
        String studentId = permissionCheck.getUserIdFromToken(token);
        reservationService.checkOrderOwner(orderId, studentId);
        // 调用服务层查询订单详情
        ReservationOrder order = reservationService.getReservationDetail(orderId);
        return Result.success(order, "订单详情查询成功");
    }
}
