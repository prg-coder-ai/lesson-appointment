// 预约时间实体（对应设计2.2.3 预约、支付相关接口 ，保存预约对应的所有时间列表）
package com.reservation.dto;

import lombok.Data;
import jakarta.validation.constraints.NotBlank;
//import jakarta.validation.constraints.NotNull;
//import net.sf.jsqlparser.expression.DateTimeLiteralExpression;

//import java.math.BigDecimal;

import java.io.Serializable;
import java.time.LocalDateTime;
 
//从book——id获取schedule_id、course_id、tearcher_id、student_id
//用于查询
@Data
public class AppointmentConditionDTO   implements Serializable{
    private static final long serialVersionUID = 1L;
    
    private String UserId;  //
    private String Role;     
    private int Days;    
}
  