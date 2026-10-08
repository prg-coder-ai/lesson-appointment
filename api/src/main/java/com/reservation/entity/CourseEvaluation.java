package com.reservation.entity;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

 import java.util.Date;
import java.io.Serializable;
/**
 * 课程评价实体类，对应设计2.4 后续流程-课程评价功能
 *
 * ddl-align: ignore-table 已决定保留表、功能未启用，两处不一致属已知待补项
 * ✅ 已决定保留 course_evaluation 表与本实体（2026-10-08 用户拍板，功能将来启用），**不要删**。
 *    当前状态：无 Mapper/Service/Controller 引用，表实测 0 行，属"表与实体先备好、功能未启用"。
 *    启用前必须先解决两处表/实体不一致：
 *      ① 实体多出 teacherId，但表里没有对应列（表只到 student_id）→ 需补列或删字段；
 *      ② 表有 booking_id NOT NULL 无默认值，而实体无该字段 → 需补字段，否则 insert 必失败。
 *    ⚠️ 本表两个 FK（fk_evaluation_course / fk_evaluation_student）均为 ON DELETE CASCADE，
 *    按项目铁律级联须由程序显式做（见 CascadeRules），不能靠 FK 盲删。
 */
@Data
public class CourseEvaluation implements Serializable {
     private static final long serialVersionUID = 1L;
    /** 租户ID（0=平台/历史单租户数据）— SaaS多租户 */
    private Long tenantId;
    private String evaluationId;  // 唯一标识（UUID）
    @NotBlank(message = "课程ID不能为空")
    private String course_id;       // 关联预约订单（课程结束后可评价）
    @NotBlank(message = "学生ID不能为空")
    private String studentId;    // 关联评价学生
    @NotBlank(message = "教师ID不能为空")
     private String teacherId;    // 关联被评价教师
    @NotNull(message = "评价分数不能为空")
    private Integer rating;       // 评价分数（1-5分，对应设计2.4 评价规则）
    @NotBlank(message = "评价内容不能为空")
    @Size(min = 10, max = 500, message = "评价内容需10-500字")
    private String comment;      // 评价内容
    private Date createTime;   // 评价时间，格式YYYY-MM-DD HH:mm:ss
}
