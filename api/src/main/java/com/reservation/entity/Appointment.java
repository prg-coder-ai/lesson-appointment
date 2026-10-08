// 预约时间实体（对应设计2.2.3 预约、支付相关接口 ，保存预约对应的所有时间列表）
package com.reservation.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import lombok.Data;
import jakarta.validation.constraints.NotBlank;
//import jakarta.validation.constraints.NotNull;
//import net.sf.jsqlparser.expression.DateTimeLiteralExpression;

//import java.math.BigDecimal;

import java.io.Serializable;
import java.time.LocalDateTime;
/* Appointment 数据库表记录学生预定课程后产生的课单时间列表
 可用于：管理员、系统：查询老师、学生的上课时间，发送上课提示
        学生：罗列所有上课时间，以便浏览检视，做好时间管理
        老师: 罗列自己所有的上课时间，以便浏览检视，做好时间管理
        系统：统计现有预约总课时（天、周、月）、已完成课时、下月总课时；有预约的课程列表、有教学任务的老师数量、有预约的学生数量。

*/
/*create table appointment
(
    id                    int auto_increment comment '唯一编号'
        primary key,
    booking_id            varchar(36)                  null comment '预约id',
    class_index           int         default 1        null comment '课时序号',
    appointmemnt_datetime datetime                     null comment '排期预约中的一个课时时间',
    last_datetime         datetime                     null comment '可能修改前的日期时间',
    status                varchar(16) default 'active' not null comment '本预约时间的状态:active生效/noted已发通知1/2/completed已完成/已改期changed'
)
    comment '预约时间列表';

*/
// 修正 MyBatis Plus 关于主键为 primitive int 引发的警告：将 int id 改为 Integer id
// 这是因为 MyBatis-Plus 推荐主键使用包装类型（如 Integer 或 Long），避免原始类型的自动装箱问题与默认值歧义。
// 下面声明主键 id 为 Integer 类型，并进行字段、注解、构造器等一致性调整。

//@TableId(type = IdType.AUTO)
//private Integer id; // 顺序自增，主键，包装类型，避免MyBatis Plus警告

@Data 
 public  class  Appointment    implements Serializable{
    private static final long serialVersionUID = 1L;
    /** 租户ID（0=平台/历史单租户数据）— SaaS多租户 */
    private Long tenantId;
      // 主键自增
    @TableId(type = IdType.AUTO)
    private Integer id;//顺序自增  系统生成唯一标识（UUID），对应通用校验规则-ID类参数
    private String bookingId;  // 对应的预约Id 
    @NotBlank(message = "排期ID对应的课次")
    private Integer classIndex;  // 关联排期对应的课次 0~N-1，-1默认
  
    private LocalDateTime appointmentDatetime;  //当前有效 预约时间，默认时间长度
    private LocalDateTime lastDatetime;  //原始的 预约时间，默认时间长度 ，用于修改的情况
     
    @NotBlank(message = "预约状态不能为空")
    private String status;  //'预约状态（active生效/noted已发通知1/2/cancelled/s-cancelling/t-cancelling/completed已完成（自动移到历史库中，实时库中删除，降低数据量）/已改期changed'、',
   // private LocalDateTime createTime;  // 订单创建时间
  //  private LocalDateTime updateTime;  // 更新时间'
}
//创建预约时间的数据库表sql语句

//从book——id获取schedule_id、course_id、tearcher_id、student_id
//用于查询
//
// ⚠️ 下面这段是 2019 年前后的旧版 DTO 草稿，整体处于 /* */ 注释中，**不是生效代码**。
//    保留它是因为里面有两条对今天仍有参考价值的信息，请勿照抄其中的字段：
//      ① 旧草稿里的 `private String timeZone`（预约时间所在时区）**已作废**：
//         课次自 2026-10-08 起一律存 UTC，appointment 表**没有也不该有** time_zone 列。
//         需要"课次按哪个时区排"请走既有链路 appointment → booking → schedule → course_schedule.time_zone。
//         （见 doc-develop/课次时间UTC化改造方案.md v1.1 的修订说明）
//      ② 旧草稿的字段名带下划线（appointmemnt_datetime / last_datetime，且前者还拼错了），
//         生效实体用的是驼峰 appointmentDatetime / lastDatetime。
/*
public class AppointmentDTO   implements Serializable{
    private static final long serialVersionUID = 1L;
    private String id;//顺序自增  系统生成唯一标识（UUID），对应通用校验规则-ID类参数
    private String bookingId;  // 对应的预约Id
    @NotBlank(message = "排期ID不能为空")
    private String scheduleId;  // 关联排期，对应设计2.2.3 预约接口请求参数

    @NotBlank(message = "排期ID对应的课次")
    private Integer lessenIndex;  // 关联排期对应的课次 0~N-1，-1默认

    @NotBlank(message = "学生ID不能为空")//
    private String studentId;  // 关联学生

    //private String timeZone;  //〔已作废〕课次现为 UTC，不存时区列
    private LocalDateTime appointmemnt_datetime;  //〔旧拼写〕当前有效 预约时间（UTC）
    private LocalDateTime last_datetime;  //〔旧拼写〕原始的 预约时间（UTC），用于修改的情况
     @NotBlank(message = "课程ID不能为空")
    private String courseId;  // 关联课程，
     @NotBlank(message = "老师ID不能为空")
    private String teacherId;  // 关联教师

    @NotBlank(message = "订单状态不能为空")
    private String status;  //'预约状态（1 booked：已预约/bookProved/cancelling/canceled：已取消/3 completed：已完成/overtime：已过时/delete：待删除）',
    private LocalDateTime createTime;  // 订单创建时间
    private LocalDateTime update_time;  // 更新时间'
}
 */
//创建实体的sql语句
//create table if not exists appointment (
//    id int auto_increment comment '唯一编号'
//        primary key,
//    booking_id varchar(36)                  null comment '预约id',
//    class_index int         default 1        null comment '课时序号',
//    appointmemnt_datetime datetime                     null comment '排期预约中的一个课时时间',
//    last_datetime datetime                     null comment '可能修改前的日期时间',
//    status varchar(16) default 'active' not null comment '本预约时间的状态:active生效/noted已发通知1/2/cancelled/s-cancelling/t-cancelling/completed已完成（自动移到历史库中，实时库中删除，降低数据量）/已改期changed'
//)
//    comment '预约时间列表';
//