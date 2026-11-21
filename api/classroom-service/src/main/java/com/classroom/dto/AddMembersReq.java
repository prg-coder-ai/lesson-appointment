package com.classroom.dto;

import lombok.Data;

import java.util.List;

/**
 * 管理员给指定课堂临时加学员（B2）。
 *
 * <p>为什么需要它：正式路径是「指定学生」→ 生成 booking → 学生被
 * {@code ClassroomAccessGuard.hasValidBooking()} 放行。但临时课堂没有排期
 * （{@code course_schedule} 无此行），那条路径走不通；上课中也不能靠
 * {@code updated} 事件补名单（{@code handleUpdated} 对 LIVE/PAUSED 直接忽略）。
 * 所以需要一个直接写名单 + 出勤行的入口。
 */
@Data
public class AddMembersReq {

    /** 要加的学员（只写 userId 也行，name 仅用于参与者面板展示）。 */
    private List<CreateTempClassroomReq.StudentItem> students;

    /** 加人原因，写入 classroom_audit_log 的 note。 */
    private String note;
}
