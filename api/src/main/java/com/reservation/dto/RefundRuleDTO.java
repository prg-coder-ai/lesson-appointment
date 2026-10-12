package com.reservation.dto;

import lombok.Data;

/**
 * 退改规则保存入参（租户管理员「系统配置 → 退改规则」提交）。
 *
 * <p>时间点由前端按所选粒度（小时/分钟）换算成<b>分钟</b>后再提交，
 * 同时把粒度回传用于回显；服务端只认分钟，粒度字段不参与计算。
 */
@Data
public class RefundRuleDTO {

    /**
     * 课程ID：
     * <ul>
     *   <li>空串或 null → 保存本租户的<b>默认规则</b></li>
     *   <li>非空 → 保存该课程的<b>专属覆盖</b>规则</li>
     * </ul>
     */
    private String courseId;

    /** 是否启用：1启用 0停用；不传按 1 处理 */
    private Integer enabled;

    /** 免责线（分钟）：提前量 ≥ 该值 → 免责 */
    private Integer freeBeforeMinutes;

    /** 免责线录入粒度：hour / minute；不传按 hour 处理（仅回显用） */
    private String freeUnit;

    /** 部分退费线（分钟）：提前量 ≥ 该值且不足免责线 → 按比例退费 */
    private Integer partialBeforeMinutes;

    /** 部分退费线录入粒度：hour / minute；不传按 hour 处理（仅回显用） */
    private String partialUnit;

    /** 部分退费比例（%）：0-100 */
    private Integer partialRefundPercent;

    private String remark;
}
