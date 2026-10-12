package com.reservation.vo;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 退改规则列表项（租户管理员的「系统配置 → 退改规则」展示用）。
 *
 * <p>在规则实体之上补了课程名称与作用域标记，省去前端逐条再查课程。
 */
@Data
public class RefundRuleVO {

    private Long id;

    /** 课程ID；空串表示该租户的默认规则 */
    private String courseId;

    /** 课程名称；默认规则时为「租户默认规则」 */
    private String courseName;

    /** 作用域：course 课程专属 / tenant 租户默认 */
    private String scope;

    private Integer enabled;

    private Integer freeBeforeMinutes;
    private String freeUnit;
    private Integer partialBeforeMinutes;
    private String partialUnit;
    private Integer partialRefundPercent;

    private String remark;

    private LocalDateTime updateTime;

    /** 规则三档可读说明 */
    private String ruleText;
}
