package com.reservation.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.reservation.entity.NotificationDispatchLog;
import org.apache.ibatis.annotations.Mapper;

/**
 * 通知发送流水（幂等键所在）。
 *
 * <p>本表有 {@code tenant_id} 列，走全局租户插件自动隔离。
 * 但定时任务没有 HTTP 上下文，租户插件会兜底拼 {@code tenant_id = -1} 导致查询恒空、
 * 写入的租户也错位——所以 {@code NotifyTask} 必须在每个租户的处理循环里显式
 * {@code TenantContext.setTenantId(...)}（照 {@code MonitorTask.snapshotTenantStats} 的写法）。
 */
@Mapper
public interface NotificationDispatchLogMapper extends BaseMapper<NotificationDispatchLog> {
    // 自带 CRUD；幂等靠 insert 撞唯一键 uk_dispatch_once，而非「先查后插」
}
