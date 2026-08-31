package com.reservation.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 系统指标采样明细，对应表 sys_metric_sample
 * 保留天数由 sys_system_config 的 monitor.retention.detail.days 控制
 */
@Data
@TableName("sys_metric_sample")
public class MetricSample {

    @TableId(type = IdType.AUTO)
    private Long id;

    private LocalDateTime sampleTime;

    /** 系统CPU使用率(%) */
    private BigDecimal cpuSystem;

    /** 当前进程CPU使用率(%) */
    private BigDecimal cpuProcess;

    private Long memTotal;
    private Long memUsed;
    private Long jvmHeapUsed;
    private Long jvmHeapMax;
    private Long diskTotal;
    private Long diskUsed;
    private Integer threadCount;
    private Long gcCount;
    private Long gcTimeMs;

    /** 采样周期内应用出口字节数（网卡带宽需 OSHI，此处以应用出口流量替代） */
    private Long netOutBytes;

    private Integer onlineUsers;

    private LocalDateTime createTime;
}
