// 课程模板实体（对应设计2.2.2 课程模板相关接口）
package com.reservation.dto;

 
import lombok.Data;

/*import java.io.Serializable;
import java.util.Date;*/
import java.time.LocalDate;
import java.time.LocalTime;

 
import java.util.List; 

@Data
public class ScheduleCreateDTO {
    private String scheduleId;
    private String courseId;
    //private String teacherId;
    //private String ClassroomId;

    private LocalDate startDate;
    private LocalTime startTime;
    private LocalDate endDate;
    private LocalTime endTime;
    
    private Integer repeatType  ; //0-none 1=day/2-week/3-month
    private Integer repeatInterval;
    private List<Integer> repeatDays; // 前端传数组，如 [1,3,5] 
    private String timeZone;      // 前端传的排期时区
    private Integer availableSites;//
    private String status;
    private String name;

}
