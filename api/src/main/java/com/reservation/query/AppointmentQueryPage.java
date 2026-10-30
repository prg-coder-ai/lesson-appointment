package com.reservation.query;// query/CourseQuery.java

import com.reservation.common.PageQuery;
import lombok.Data;

/**分页查询入参（Query）
继承通用分页基类，扩展Appointment浏览专属筛选条件 */
 
@Data
public class AppointmentQueryPage  extends PageQuery {
    private Long tenantId;  // 租户ID（精准筛选，SaaS多租户；null=不限）
    private String userId;  //与role+Days查询指定用户的预约 用于用户页面
    private String userRole;     
    private String studentName;// 与days一起查询 用于管理端 TBD
    private String teacherName;// 与Days一起查询 用于管理端 TBD
    private String courseName;//课程名称
    private int days;
   // private String sortField;
 //   private String sortOrder;
    private String status;
    /** 用户时区（IANA，如 Asia/Shanghai）。课次时间是 UTC，返回前按它转成用户本地时间。
     *  <p>可空：为空时后端原样返回 UTC，由前端自行渲染。 */
    private String userTimeZone;
}
  