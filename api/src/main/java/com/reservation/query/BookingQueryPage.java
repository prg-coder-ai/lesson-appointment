package com.reservation.query;// query/CourseQuery.java

import com.reservation.common.PageQuery;
import lombok.Data;

/**分页查询入参（Query）
继承通用分页基类，扩展booking浏览专属筛选条件 */
@Data
public class BookingQueryPage extends PageQuery {
    private String userRole;    //用户角色 --精确
    private String userId;
    private String teacherInfo;  // TBD  教师信息--（模糊匹配 账号、邮件、电话、姓名）
    private String studentInfo;//TBD 学生信息   
    private String courseName;// 课程名称 --排期ID
    private String status;       // 状态（启用/禁用）    
} 