package com.reservation.vo;

import lombok.Data;

import java.io.Serializable;
import java.util.List;

/**
 * 通知计划的预览结果：某课程在某课次时间下，各档实际会怎么发。
 *
 * <p>同时回带「用的是哪一级规则」与降级说明，避免管理员改了租户默认却发现课程覆盖没生效时无从排查。
 */
@Data
public class NotifyPlanVO implements Serializable {

    private static final long serialVersionUID = 1L;

    private String courseId;

    private String courseName;

    /** 生效规则来源：course（课程覆盖）/ tenant（租户默认）/ builtin（内置兜底） */
    private String scope;

    private String scopeText;

    /** 命中课程规则但被停用时的降级说明 */
    private String fallbackNotice;

    /** 假想的课次时间 */
    private String lessonTime;

    private List<NotifyPlanItemVO> points;
}
