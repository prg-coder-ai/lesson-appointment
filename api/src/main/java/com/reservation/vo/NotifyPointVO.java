package com.reservation.vo;

import com.reservation.entity.CourseNotifyRulePoint;
import lombok.Data;

import java.io.Serializable;

/**
 * 通知时间点的展示对象（管理端界面 + 发送流水回显共用）。
 *
 * <p>同时给出「分钟」与「界面录入形态」两套表示：
 * {@code offsetMinutes} 是唯一参与计算的量，{@code offsetValue + inputUnit} 是还原给管理员看的原始录入，
 * 例如库里存 4320，界面显示「3 天」。
 */
@Data
public class NotifyPointVO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;

    /** 档位序号 1..N，越大离上课越近 */
    private Integer seq;

    private String stage;

    private String stageText;

    /** 课前偏移分钟（唯一参与计算的量） */
    private Integer offsetMinutes;

    /** 偏移量的可读文案，如「3 天」「1 小时 30 分钟」 */
    private String offsetText;

    /** 界面录入数值（配合 inputUnit 还原原始录入，如 3 + day = 3 天） */
    private Integer offsetValue;

    /** 界面录入粒度 day / hour / minute */
    private String inputUnit;

    private String audience;

    private String audienceText;

    private Integer enabled;

    public static NotifyPointVO of(CourseNotifyRulePoint p, int offsetValue, String offsetText) {
        NotifyPointVO vo = new NotifyPointVO();
        vo.setId(p.getId());
        vo.setSeq(p.getSeq());
        vo.setStage(p.getStage());
        vo.setOffsetMinutes(p.getOffsetMinutes());
        vo.setOffsetValue(offsetValue);
        vo.setInputUnit(p.getInputUnit());
        vo.setAudience(p.getAudience());
        vo.setEnabled(p.getEnabled());
        vo.setOffsetText(offsetText);
        return vo;
    }
}
