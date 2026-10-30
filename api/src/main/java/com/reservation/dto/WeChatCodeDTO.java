package com.reservation.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 微信登录/绑定入参：小程序 wx.login() 返回的临时 code。
 * 客户端调用：{ "code": "081abc..." }
 */
@Data
public class WeChatCodeDTO {
    @NotBlank(message = "微信 code 不能为空")
    private String code;
}
