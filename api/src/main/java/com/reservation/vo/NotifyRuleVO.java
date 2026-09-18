package com.reservation.vo;

import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 通知规则（规则头 + 全部时间点）的展示对象。
 *
 * <p>租户默认规则尚未配置时，界面仍需要一张可编辑的卡片，
 * 故服务端会用内置兜底档位合成一条 {@code id} 为 null 的「虚拟规则」返回，
 * 前端据 {@code id == null} 判断「尚未保存」。
 */
@Data
public class NotifyRuleVO implements Serializable {

    private static final long serialVersionUID = 1L;

    /** 规则头ID；null = 尚未保存（展示的是内置兜底值） */
    private Long id;

    /** 课程ID；空串 = 租户默认规则 */
    private String courseId;

    private String courseName;

    /** 作用域：tenant（租户默认）/ course（课程覆盖） */
    private String scope;

    private String name;

    private Integer enabled;

    private String remark;

    private LocalDateTime updateTime;

    private List<NotifyPointVO> points;

    /** 一句话摘要，如「提前 3 天 → 提前 1 天 → 课前 1 小时 → 课前 30 分钟」 */
    private String summary;
}
