package com.reservation.dto;

import lombok.Data;

import java.io.Serializable;
import java.util.List;

/**
 * 保存上课通知规则的入参（整组覆盖式保存：一次性提交该作用域下的全部时间点）。
 *
 * <p>为什么是整组提交而不是逐档增删改：档位顺序靠 {@code offsetMinutes} 随
 * {@code seq} 严格递减来保证，逐档改动很容易在中间态出现「1 天」排在「2 小时」之后，
 * 服务端还得处理这种暂时非法状态。整组提交后服务端先校验再整体落库，不存在中间态。
 */
@Data
public class NotifyRuleDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    /** 课程ID；空串 / null = 本租户的默认规则 */
    private String courseId;

    /** 规则名（仅界面显示） */
    private String name;

    /** 整组是否启用：0 视为未配置，回落上一级；不传按 1 */
    private Integer enabled;

    private String remark;

    /** 时间点明细，至少一档 */
    private List<NotifyPointDTO> points;
}
