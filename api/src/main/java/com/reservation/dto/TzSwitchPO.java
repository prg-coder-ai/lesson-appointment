//  
package com.reservation.entity;

import lombok.Data;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.util.Date;
import java.io.Serializable;

@Data
public class TzSwitchPO   implements Serializable{
    private static final long serialVersionUID = 1L;
    private String timeZone;  //
    private String dateTime; //在timeZone下的日期和时间 
    private String switchToTimeZone; //待转换到的时区， 
}
