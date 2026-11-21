package com.classroom.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 管理员应急建课请求（B1）。
 *
 * <p>背景：课堂实例只能由排期事件生成，而排期由预约侧维护。「临时补一节课」这种场景
 * 在预约侧往往没有对应排期，管理员只能去运营台手写排期事件报文——字段多、时间格式还容易写错
 * （带 {@code Z} 直接 400）。本 DTO 把这套报文收敛成 6 个字段，由服务端补 eventId/scheduleId。
 *
 * <p><b>它不是「正式排期」</b>：建出来的课堂不会出现在学生的「我的课堂」里，也不参与课时结算
 * （结算依赖 {@code course_schedule} 与 booking，这里都没有）。要结算就走正常排期建课。
 */
@Data
public class CreateTempClassroomReq {

    /** 课程名，展示在课堂标题/监控列表；空则用「临时课堂」。 */
    private String courseName;

    /** 授课教师 userId（必填）——进课堂时按 teacherId 本人判定，填错教师进不去。 */
    private String teacherId;

    /** 教师展示名，空则回退 userId。 */
    private String teacherName;

    /** 学生名单（可空，后续还能用「加学员」接口补）。 */
    private List<StudentItem> students;

    /** 开始时间；空则取服务端当前时间。 */
    private LocalDateTime startTime;

    /** 结束时间；空则按 duration 从开始时间推算。 */
    private LocalDateTime endTime;

    /** 课时长（分钟），默认 60，仅用于推算结束时间与展示。 */
    private Integer duration;

    /**
     * 归属租户。空则用调用者 token 里的租户。
     *
     * <p>平台管理员（token 无租户）建课必须显式传：不传会落 0，租户管理员在监控列表里看不到，
     * 学生进课堂还会被判「无权访问该课堂」。
     */
    private Long tenantId;

    @Data
    public static class StudentItem {
        private String userId;
        private String name;
    }
}
