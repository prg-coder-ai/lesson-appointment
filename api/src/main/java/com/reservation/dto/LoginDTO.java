package com.reservation.dto;


import jakarta.validation.constraints.NotBlank;
import lombok.Data;
@Data
public class LoginDTO {
    private String account;
    private String password;
    private String tenantCode;  // 租户编码（SaaS多租户登录用，平台管理员传"platform"）

    private String userId;  // 系统生成唯一标识（UUID），对应通用校验规则-ID类参数
 
    private String phone; 
    private String email; 
      private String role;
 
    private String name; 
    private String languageType;  // 枚举值：英语/日语/韩语/法语/德语/西班牙语
 
    private String status;

    // ================= 登录风控（2026-10-22 P1） =================
    // 全部可选：老客户端不传也能登录（只是评分里"无设备标识 +10"恒定生效）。

    /** 设备标识（端上派生后上报）。只作降权信号——清缓存/改机工具都能重置它。 */
    private String deviceId;

    /** 端上判定的环境异常：模拟器 / root / hook / 调试开启。 */
    private Boolean emuFlag;

    /** 挑战票据 id（上一次 code=1002 响应下发，重试登录时原样带回）。 */
    private String challengeId;

    /** 用户拖动的横向位移（px，相对背景图左上角）。 */
    private Integer moveX;

    /** 拖动轨迹采样点数（真人拖动 ≥8）。 */
    private Integer trackPoints;

    /** 拖动耗时（毫秒），用于挡"瞬移式"脚本作答。 */
    private Long costMs;
}