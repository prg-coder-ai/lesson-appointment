package com.reservation.vo;

import lombok.Data;

import java.io.Serializable;

/**
 * 单档通知的「应发时刻」预览项。
 *
 * <p>管理端配置页拿它做试算：给定一个假想的课次时间，把每档的应发时刻摆出来，
 * 管理员一眼能看出「提前 3 天」落到的是周六下午还是工作日早上——这是纯数字配置最容易踩的坑。
 */
@Data
public class NotifyPlanItemVO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Integer seq;

    private String stage;

    private String stageText;

    private Integer offsetMinutes;

    private String offsetText;

    private String audience;

    private String audienceText;

    /** 应发时刻 = 课次时间 − offsetMinutes */
    private String expectTime;

    /**
     * 相对当前时刻的状态：
     * <ul>
     *   <li>{@code PAST} —— 已过期（窗口已过，不会补发）</li>
     *   <li>{@code WAITING} —— 待发</li>
     *   <li>{@code DISPATCHED} —— 该课次该档已发过（查流水表得到）</li>
     * </ul>
     */
    private String state;

    private String stateText;

    /** 是否已发出（来自 notification_dispatch_log） */
    private Boolean dispatched;
}
