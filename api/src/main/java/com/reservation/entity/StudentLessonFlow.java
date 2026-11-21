package com.reservation.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 课时流水（账本的唯一事实来源）。
 *
 * <p><b>{@code bizKey} 是防重复扣费的唯一保障</b>，靠数据库唯一键
 * {@code uk_slf_biz(tenant_id, biz_key)} 拦截，不依赖分布式锁：
 * <ul>
 *   <li>{@code classroom:{appointmentId}} —— 课堂结算，一课次一条；</li>
 *   <li>{@code leave:{appointmentId}} —— 请假退回，一课次一条；</li>
 *   <li>{@code manual:{uuid}} —— 人工调整，每次一个新键。</li>
 * </ul>
 * 重复回调 / 重试 / 兜底任务再跑一次，第二次插入会撞唯一键，捕获后视为「已结算」直接返回成功。
 */
@Data
@TableName("student_lesson_flow")
public class StudentLessonFlow implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    /** 流水号（UUID） */
    private String flowId;

    private String studentId;
    private String bookingId;
    private String scheduleId;

    /** 课次序号 */
    private Integer classIndex;

    /** 关联课次ID */
    private Integer appointmentId;

    /** 变动课时：负数=消耗，正数=退回/充值 */
    private BigDecimal changeLessons;

    /** 变动后余量（对账用） */
    private BigDecimal remainingAfter;

    /** 来源：classroom课堂扣减 / leave请假退回 / manual人工 / grant充值 */
    private String source;

    /** 幂等业务键（唯一） */
    private String bizKey;

    private String reason;
    private String operatorId;

    private LocalDateTime createTime;
}
