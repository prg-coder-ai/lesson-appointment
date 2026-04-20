// 预约订BookingCreateDTO（对应设计2.2.3 预约）
package com.reservation.entity;

import lombok.Data;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.util.Date;
import java.io.Serializable;

@Data
public class BookingCreateDTO   implements Serializable{
    private static final long serialVersionUID = 1L;
    private String bookingId;  
    private String scheduleId;  
    private String studentId;   
    private String status;   
}
