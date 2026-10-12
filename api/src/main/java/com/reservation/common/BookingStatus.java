package com.reservation.common;

import java.util.List;

/**
 * booking.status 状态常量与「是否占用席位」规则的单一事实来源。
 *
 * 背景：状态字符串原先硬编码散落在前端 9 个文件与多处 SQL 中，历史上出现过
 * cancelled/canceled、cancelling/canceling 两套拼写并存（前端按下不表、两种都判），
 * bookProved 只存在于 Java 注释里而前端已无。新增状态前请先在此登记，
 * 避免“加一个状态、排查九个文件”。
 *
 * 席位规则：剩余席位 = 排期总席位 − 占位预订数；候补(waiting)不占席位。
 */
public final class BookingStatus {

    private BookingStatus() {
    }

    /** 学生提交预订，等待管理员确认 */
    public static final String BOOKING = "booking";
    /** 管理员已确认（正式预订） */
    public static final String BOOKED = "booked";
    /** 学生申请取消，等待管理员确认——此阶段原预订依然有效，仍占席位 */
    public static final String CANCELING = "canceling";
    /** 同上，双 l 拼写（历史遗留，前端两种都在用） */
    public static final String CANCELLING = "cancelling";
    /** 已取消（席位已释放） */
    public static final String CANCELLED = "cancelled";
    /** 同上，单 l 拼写（历史遗留） */
    public static final String CANCELED = "canceled";
    /** 候补申请：名额已满时的排队；不占席位、不生成课次 */
    public static final String WAITING = "waiting";
    /** 管理员拒绝预订申请（席位不占用） */
    public static final String REJ_BOOKING = "rej-booking";
    /** 管理员拒绝取消申请——预订继续有效，仍占席位 */
    public static final String REJ_CANCELLING = "rej-cancelling";
    /**
     * 已删除／冻结。
     *
     * <p>booking 表**没有 is_deleted 列**，管理员的「删除」动作就是把这个字段置成 frozen
     * （前端 deleteBookingByFrozen → operateBookingStatus(id, "frozen")，同时把该预订下的
     * appointment 一并置 frozen、状态文案显示为「已删除」）。因此它是一条真实的落库状态，
     * 不是动作值。
     */
    public static final String FROZEN = "frozen";
    /** 真删除（仅作为 updateStatus 的动作值，走 deleteById，不落库） */
    public static final String DELETE = "delete";

    /**
     * 不占席位的状态：候补、已取消、预订被拒、已删除。
     *
     * <p>其余状态（booking / booked / canceling / cancelling / rej-cancelling…）
     * 一律视为占位——取消申请在管理员确认之前，原预订依然有效。
     *
     * <p>frozen 曾经漏在这里：它是「已删除」，却按占位计入，导致删除一条预订后
     * 席位被永久吃掉，排期一直显示满员、候补永远递补不进来（与当初 cancelled 同类）。
     */
    public static final List<String> NON_OCCUPYING =
            List.of(WAITING, CANCELLED, CANCELED, REJ_BOOKING, FROZEN);

    /**
     * 该状态是否占用一个席位。
     * null / 空 视为占位：DB 列是 NOT NULL DEFAULT 'booked'，
     * 实体不设值时由数据库补默认值，等于“占位”。
     */
    public static boolean occupiesSeat(String status) {
        if (status == null || status.trim().isEmpty()) {
            return true;
        }
        return !NON_OCCUPYING.contains(status.trim());
    }

    /** 是否为候补态 */
    public static boolean isWaiting(String status) {
        return status != null && WAITING.equalsIgnoreCase(status.trim());
    }

    /**
     * 是否为「已确认的正式预订」。
     * 注意 booked 与 bookProved 历史上都被用来表示“已确认”，此处把两种都认下来，
     * 避免因为状态文案不统一而漏判。
     */
    public static boolean isBooked(String status) {
        if (status == null) {
            return false;
        }
        String s = status.trim();
        return BOOKED.equalsIgnoreCase(s) || "bookProved".equalsIgnoreCase(s);
    }
}
