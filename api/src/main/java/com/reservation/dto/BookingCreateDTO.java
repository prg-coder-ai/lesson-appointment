// 预约订BookingCreateDTO（对应设计2.2.3 预约）
package com.reservation.dto;

import lombok.Data;
/*import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.util.Date;*/
import java.io.Serializable;

@Data
public class BookingCreateDTO   implements Serializable{
    private static final long serialVersionUID = 1L;
    /** 租户ID — SaaS多租户；服务端应以 TenantContext 覆盖，勿信任客户端传值 */
    private Long tenantId;
    private String bookingId;  
    private String scheduleId;  
    private String studentId;   
    private String status;   
}
