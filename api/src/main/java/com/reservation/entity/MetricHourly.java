package com.reservation.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 系统指标小时聚合，对应表 sys_metric_hourly
 * 由 sys_metric_sample 聚合而来，保留天数由 monitor.retention.hourly.days 控制
 */
@Data
@TableName("sys_metric_hourly")
public class MetricHourly {

    @TableId(type = IdType.AUTO)
    private Long id;

    private LocalDateTime hourTime;

    private BigDecimal cpuSystemAvg;
    private BigDecimal cpuSystemMax;
    private BigDecimal cpuProcessAvg;
    private Long memUsedAvg;
    private Long jvmHeapAvg;
    private Long jvmHeapMax;
    private Long diskUsedMax;
    private Integer threadAvg;

    /** 该小时在线峰值 */
    private Integer onlineMax;

    /** 聚合样本数 */
    private Integer sampleCount;

    private LocalDateTime createTime;
}
