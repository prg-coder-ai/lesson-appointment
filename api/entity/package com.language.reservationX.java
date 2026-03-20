package com.language.reservation.entity;

import lombok.Data;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.util.Date;

/**
 * 预约订单实体类，对应设计2.3 学生预约模块-预约下单、支付、取消等接口
 * 关联排期（scheduleId）、学生（studentId）、课程（courseId）
 */
@Data
public class ReservationOrder {
    private String orderId;  // 唯一标识（UUID），对应通用校验规则-ID类参数
    @NotBlank(message = "排期ID不能为空")
    private String scheduleId;  // 关联课程排期
    @NotBlank(message = "课程ID不能为空")
    private String courseId;    // 关联教师课程
    @NotBlank(message = "学生ID不能为空")
    private String studentId;   // 关联学生
    @NotNull(message = "订单金额不能为空")
    private BigDecimal orderAmount;  // 订单金额（对应课程模板课时费），保留2位小数
    @NotBlank(message = "订单状态不能为空")
    private String orderStatus; // 枚举值：pending（待支付）/paid（已支付）/cancelled（已取消）/refunded（已退款）
    private String payTime;     // 支付时间，格式YYYY-MM-DD HH:mm:ss（对应通用校验规则-时间）
    private String cancelTime;  // 取消时间，格式同上
    private String refundTime;  // 退款时间，格式同上
    private String payNo;       // 支付流水号（支付宝返回）
    private Date createTime;    // 订单创建时间（自动生成）
}

/**
 * 预约查询条件实体，对应设计2.3 预约查询接口的请求参数
 */
@Data
public class ReservationQuery {
    private String studentId;    // 学生ID（默认当前登录学生）
    private String courseId;     // 课程ID（可选）
    private String scheduleId;   // 排期ID（可选）
    private String orderStatus;  // 订单状态（可选，筛选对应状态订单）
    private String startDate;    // 开始日期（可选，格式YYYY-MM-DD）
    private String endDate;      // 结束日期（可选，格式YYYY-MM-DD）
}
