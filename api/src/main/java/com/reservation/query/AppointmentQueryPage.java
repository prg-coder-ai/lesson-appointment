package com.reservation.query;// query/CourseQuery.java

import com.reservation.common.PageQuery;
import lombok.Data;

/**分页查询入参（Query）
继承通用分页基类，扩展Appointment浏览专属筛选条件 */
 
@Data
public class AppointmentQueryPage  extends PageQuery {
    private String userId;  //与role+Days查询指定用户的预约 用于用户页面
    private String role;     
    private String studentName;// 与days一起查询 用于管理端 TBD
    private String teacherName;// 与Days一起查询 用于管理端 TBD
    private String courseName;//课程名称
    private int days;
   // private String sortField;    
 //   private String sortOrder; 
    private String status;   
}
  