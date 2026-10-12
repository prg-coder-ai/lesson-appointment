package com.reservation.common;

import java.util.List;

/**
 * appointment.status 状态常量与「是否仍在占用课次」规则的单一事实来源。
 *
 * <p><b>为什么现在才有这个类</b>：与 {@link BookingStatus} 不同，课次状态一直是以裸字符串
 * 散落在前端若干文件、若干 SQL 与后端若干 service 里。核对现状时发现至少三处各自为政：
 * <ul>
 *   <li>前端 {@code admin-booking.js} 写 {@code cancelling}（学生/整单取消待确认）；</li>
 *   <li>前端教师端「申请改期」写 {@code t-cancelling}（<b>教师</b>改期待确认）；</li>
 *   <li>库中实际存在 {@code t-cancelling} / {@code t-cancelled} 各 1 行。</li>
 * </ul>
 * 三者语义不同却拼写相近，是"业务正确性外包前端"（报告根因 B）的直接产物：
 * 状态机只存在于点击按钮的人脑子里，换个客户端就写不出正确的值。
 *
 * <p><b>前缀约定（务必遵守，否则数据无法反推动作来源）</b>：
 * <ul>
 *   <li>无前缀（{@code active}/{@code cancelled}/{@code changed}/{@code completed}）：整单级动作的落点；</li>
 *   <li>{@code s-}（student）：学生发起、课次级；</li>
 *   <li>{@code t-}（teacher）：教师发起、课次级。<b>切勿把整单级取消写成 {@code t-}</b>，
 *       否则与教师改期撞在一起，无法从数据区分是谁发起的。</li>
 * </ul>
 *
 * <p>跨端口径另见 {@code shared/domain/appointmentState.js}（前端展示文案权威源），
 * 两处枚举需同步登记；新增状态请同时更新两边。
 */
public final class AppointmentStatus {

    private AppointmentStatus() {
    }

    /** 生效：该课次正常占用时间，是课次生成的默认落点 */
    public static final String ACTIVE = "active";
    /** 已发第一次通知 */
    public static final String NOTED1 = "noted1";
    /** 已发第二次通知 */
    public static final String NOTED2 = "noted2";
    /** 已完成 */
    public static final String COMPLETED = "completed";
    /** 已改期 */
    public static final String CHANGED = "changed";

    /**
     * 取消待确认（<b>学生/整单发起</b>）。
     *
     * <p>与 {@link #T_CANCELLING} 的区别是<b>动作发起方与粒度</b>：本值由学生或管理员对
     * <b>整笔预订</b>发起取消申请、等待确认；{@code t-cancelling} 由<b>教师对单个课次</b>
     * 发起改期。用错会导致无法从数据反推是谁发起的取消。
     */
    public static final String CANCELLING = "cancelling";
    /** 同上，单 l 拼写（历史遗留，前端两种都在写） */
    public static final String CANCELING = "canceling";
    /** 已取消：取消申请被批准，或管理员直接取消。课次保留行以便追溯 */
    public static final String CANCELLED = "cancelled";
    /** 同上，单 l 拼写（历史遗留） */
    public static final String CANCELED = "canceled";

    /** 学生发起的课次级取消待确认 */
    public static final String S_CANCELLING = "s-cancelling";
    /** 教师发起的课次级改期待确认——<b>教师专用，不可挪用于整单取消</b> */
    public static final String T_CANCELLING = "t-cancelling";
    /** 教师已取消（课次级） */
    public static final String T_CANCELLED = "t-cancelled";
    /** 教师拒绝（课次级） */
    public static final String T_REJECT = "t-reject";

    /**
     * 已删除／冻结。
     *
     * <p>与 booking 的 {@link BookingStatus#FROZEN} 同义：管理员「删除预订」时，
     * 该预订下的课次一并置为 frozen（前端原先是显式调
     * {@code updateAppointmentsStatusByBookingId(id,"frozen")}）。课次<b>保留行</b>，
     * 不物理删除——否则删除一条预订就抹掉全部上课历史。
     */
    public static final String FROZEN = "frozen";

    /**
     * 终态集合：课次已结束，不再可操作。
     *
     * <p>与前端 {@code APPOINTMENT_CLOSED_STATUSES} 保持一致
     * （completed/cancelled/t-cancelled/changed），另补 {@link #FROZEN}——
     * frozen 在前端被单独判为「已删除」而不在 closed 列表里，但同样不可再操作。
     */
    public static final List<String> CLOSED =
            List.of(COMPLETED, CANCELLED, CANCELED, T_CANCELLED, CHANGED, FROZEN);

    /** 该状态是否已是终态（不可再被联动改写） */
    public static boolean isClosed(String status) {
        if (status == null) {
            return false;
        }
        return CLOSED.contains(status.trim().toLowerCase());
    }

    /** 是否为"取消待确认"族（含学生/整单 cancelling 与教师 t-cancelling） */
    public static boolean isCancelling(String status) {
        if (status == null) {
            return false;
        }
        String s = status.trim().toLowerCase();
        return CANCELLING.equals(s) || CANCELING.equals(s)
                || S_CANCELLING.equals(s) || T_CANCELLING.equals(s);
    }

    /** 是否为"已取消"族（含单 l 拼写与教师 t-cancelled） */
    public static boolean isCancelled(String status) {
        if (status == null) {
            return false;
        }
        String s = status.trim().toLowerCase();
        return CANCELLED.equals(s) || CANCELED.equals(s) || T_CANCELLED.equals(s);
    }

    /**
     * 该课次是否仍在实际占用学生的时间。
     *
     * <p>通知档位（noted1/noted2）与生效同义——它们只是"已通知"的记录位，
     * 仍属正常占位，不能被联动当成"已取消"抹掉。
     */
    public static boolean occupiesTime(String status) {
        if (status == null || status.trim().isEmpty()) {
            return false;
        }
        return !isClosed(status) && !isCancelling(status);
    }
}
