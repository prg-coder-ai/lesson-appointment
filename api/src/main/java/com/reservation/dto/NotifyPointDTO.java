package com.reservation.dto;

import lombok.Data;

import java.io.Serializable;

/**
 * 通知时间点明细的入参。
 *
 * <p><b>为什么不只收「分钟数」</b>：管理员的思维单位是「提前 3 天」「课前 30 分钟」，
 * 界面上是一个数字加一个粒度下拉。若让前端自己乘 1440 再提交，
 * 换算规则就散到前端了（以后加「周」这个粒度要改两处，且前端算错了服务端看不出来）。
 * 这里收「数值 + 粒度」，由服务端统一换算成分钟——单一换算点，界面上永远显示原始值。
 *
 * <p>{@code offsetMinutes} 若显式传入则优先（供接口直接调用者使用），否则用
 * {@code offsetValue × 粒度倍数}。
 */
@Data
public class NotifyPointDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    /** 档位序号 1..N，越大离上课越近；不传按数组顺序补齐 */
    private Integer seq;

    /** 档位码 PRE_FIRST / PRE_AGAIN / PRE_SOON / FINAL_CALL */
    private String stage;

    /** 界面录入的数值（配合 inputUnit） */
    private Integer offsetValue;

    /** 课前偏移分钟；显式传入时优先于 offsetValue */
    private Integer offsetMinutes;

    /** 录入粒度 day / hour / minute */
    private String inputUnit;

    /** 接收人 STUDENT / TEACHER / BOTH */
    private String audience;

    /** 该档是否启用；不传按 1 */
    private Integer enabled;
}
