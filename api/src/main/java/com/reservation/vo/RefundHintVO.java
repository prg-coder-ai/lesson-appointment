package com.reservation.vo;

import lombok.Data;

/**
 * 退改规则提示结果。
 *
 * <p>学生提交请假前、管理员审核确认请假前，都由服务端用同一次计算给出该对象，
 * 保证两端看到的判定结论与文案完全一致（前端不自行算时间差，避免客户端时钟误差）。
 */
@Data
public class RefundHintVO {

    /** 是否命中了库中已配置的规则：false 表示走服务端内置默认值 */
    private Boolean matched;

    /** 规则来源：course 课程专属 / tenant 租户默认 / builtin 内置兜底 */
    private String scope;

    /** 规则来源中文说明，如「课程专属规则」「租户默认规则」「系统内置默认」 */
    private String scopeText;

    private String courseId;
    private String courseName;

    private Integer appointmentId;
    private String bookingId;

    /** 课次时间（yyyy-MM-dd HH:mm） */
    private String lessonTime;

    /** 距上课还有多少分钟（负数=已过时） */
    private Long minutesAhead;

    /** 提前量可读文案，如「1 天 6 小时」「35 分钟」「已过上课时间」 */
    private String aheadText;

    /**
     * 判定档位：
     * <ul>
     *   <li>{@code free}    — 免责（全额退）</li>
     *   <li>{@code partial} — 部分退费</li>
     *   <li>{@code none}    — 不退费</li>
     *   <li>{@code past}    — 已过上课时间</li>
     * </ul>
     */
    private String level;

    /** 档位中文，如「免责（全额退费）」 */
    private String levelText;

    /** 该档位对应的退费比例（%）：free=100 / partial=配置值 / none=0 / past=0 */
    private Integer refundPercent;

    /** 是否可退费（refundPercent > 0） */
    private Boolean refundable;

    /** 直接可展示的完整提示文案（已按当前租户术语渲染） */
    private String message;

    /** 规则三档说明，如「提前≥24 小时免责；≥12 小时退 50%；不足 12 小时不退费」 */
    private String ruleText;

    /** 规则阈值（分钟），便于前端自行排版 */
    private Integer freeBeforeMinutes;
    private Integer partialBeforeMinutes;
    private Integer partialRefundPercent;

    /** 规则阈值可读文案，如「24 小时」「12 小时」 */
    private String freeBeforeText;
    private String partialBeforeText;

    /**
     * 降级提示：存在被停用（或上级缺失）因而未生效的规则时说明原因，
     * 例如「该课程专属规则已停用，当前按租户默认规则执行」；无需说明时为 null。
     */
    private String fallbackNotice;
}
