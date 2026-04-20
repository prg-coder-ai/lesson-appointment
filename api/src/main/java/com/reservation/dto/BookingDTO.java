package com.reservation.entity;

import lombok.Data;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.util.Date;
import java.io.Serializable;
//用于设置预约状态
@Data
public class BookingDTO   implements Serializable{
    private static final long serialVersionUID = 1L;
    private String id;  // 系统生成唯一标识（UUID），对应通用校验规则-ID类参数  
    private String status;  //'预约状态（ 空''/1 booked：已预约/bookProved/cancelling/canceled：已取消/3 completed：已完成/overtime：已过时）',
 
}
 