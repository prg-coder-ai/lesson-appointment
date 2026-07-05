package com.reservation.dto;
import lombok.Data;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

@Data
public class ScheduleGenerateDTO {
    private LocalDate startDate;//
    private LocalDate endDate;//包含结束日期，

    private LocalTime startTime;//每次默认1小时
    private String repeatType;    // none/day/week/month
    private Integer interval;//重复周期
    private List<Integer> repeatDays; // 1=周一 ... 7=周日，1~31日 
    private String timeZone;      //排期计划所用的时区
    private String userTimeZone;      // 前端传的用户时区
}