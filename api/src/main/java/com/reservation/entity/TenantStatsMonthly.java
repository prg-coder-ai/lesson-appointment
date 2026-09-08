package com.reservation.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 租户月度用量快照，对应表 sys_tenant_stats_monthly
 * 运行管理「与上月的变化」依赖此表，每月1日凌晨由定时任务生成
 */
@Data
@TableName("sys_tenant_stats_monthly")
public class TenantStatsMonthly {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    /** 统计月份（yyyy-MM） */
    private String statMonth;

    private Integer teacherCount;
    private Integer studentCount;
    private Integer courseCount;
    private Integer scheduleCount;
    private Integer bookingCount;

    private LocalDateTime createTime;
}
