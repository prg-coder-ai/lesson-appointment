// 预约订单实体（对应设计2.2.3 预约、支付相关接口）
package com.reservation.entity;

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