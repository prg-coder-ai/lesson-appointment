package com.reservation.entity;

import lombok.Data;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.util.Date;
import java.io.Serializable; 

//用于查询预约
@Data
public class BookingQueryParaDTO   implements Serializable{
    private static final long serialVersionUID = 1L;
    private String id;//Booking id
    private String scheduleId;  //  
    private String userRole;
    private String userId;  
    private String status;//'预约状态（ 空''/1 booked：已预约/bookProved/cancelling/canceled：已取消/3 completed：已完成/overtime：已过时）',
  
 }