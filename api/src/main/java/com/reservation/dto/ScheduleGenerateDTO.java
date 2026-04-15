package com.reservation.entity;
import lombok.Data;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

@Data
public class ScheduleGenerateDTO {
    private LocalDate startDate;
    private LocalDate endDate;

    private LocalTime startTime;
    private String repeatType;    // none/day/week/month
    private Integer interval;//重复周期
    private List<Integer> repeatDays; // 1=周一 ... 7=周日，1~31日 
    private String timeZone;      // 前端传的用户时区
}