// 预约订单实体（对应设计2.2.3 预约、支付相关接口）
package com.language.reservation.entity;

import lombok.Data;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.util.Date;

@Data
public class Order {
    private String orderId;  // 系统生成唯一标识（UUID），对应通用校验规则-ID类参数
    @NotBlank(message = "排期ID不能为空")
    private String scheduleId;  // 关联排期，对应设计2.2.3 预约接口请求参数
    @NotBlank(message = "学生ID不能为空")
    private String studentId;  // 关联学生，对应权限校验
    @NotNull(message = "订单金额不能为空")
    private BigDecimal orderAmount;  // 对应课程课时费，保留2位小数
    @NotBlank(message = "订单状态不能为空")
    private String orderStatus;  // 枚举值：pending_pay（待支付）、paid（已支付）、cancelled（已取消）、completed（已完成）
    private Date createTime;  // 订单创建时间
    private Date payTime;  // 支付时间
    private String payType;  // 支付方式，枚举值：wechat/alipay/balance（对应设计2.2.3 支付接口）
}

// 支付信息实体（对应设计2.2.3 支付接口请求参数）
@Data
public class PayInfo {
    @NotBlank(message = "订单ID不能为空")
    private String orderId;  // 对应通用校验规则-ID类参数
    @NotBlank(message = "支付方式不能为空")
    private String payType;  // 枚举值：wechat/alipay/balance（对应设计2.2.3 专属校验规则）
    @NotBlank(message = "支付参数不能为空")
    private String payParams;  // 对应支付方式的参数（如微信openid），对应设计2.2.3 专属校验规则
    @NotBlank(message = "支付签名不能为空")
    private String paySign;  // 支付签名，用于校验合法性（对应设计2.3 安全设计）
}

// 课程查询筛选参数（对应设计2.2.3 课程列表查询接口）
@Data
public class CourseQueryParam {
    private String languageType;  // 可选，语言类型枚举值
    @NotBlank(message = "课程形式不能为空")
    private String classForm;  // 枚举值：一对一/小班课/大班课（对应设计2.2.3 专属校验规则）
    @NotBlank(message = "教师类型不能为空")
    private String teacherType;  // 枚举值：外教/中教（对应设计2.2.3 专属校验规则）
    private String startTime;  // 可选，筛选开始时间
    private String endTime;  // 可选，筛选结束时间
}