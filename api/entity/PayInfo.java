// 预约订单实体（对应设计2.2.3 预约、支付相关接口）
package com.language.reservation.entity;

import lombok.Data;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.util.Date;
   
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
