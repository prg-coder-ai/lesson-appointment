package com.reservation.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.reservation.entity.SystemConfig;
import com.reservation.exception.BusinessException;
import com.reservation.mapper.SystemConfigMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * 系统配置服务
 * 采样间隔、历史数据保留时间、预警阈值等运行参数全部存放于数据库，
 * 通过「系统配置」菜单维护，代码中不写死常量
 */
@Service
public class SysConfigService {

    private static final Logger log = LoggerFactory.getLogger(SysConfigService.class);

    /** 系统配置键：指标采样间隔（秒） */
    public static final String KEY_SAMPLE_INTERVAL = "monitor.sample.interval.seconds";
    /** 明细数据保留天数 */
    public static final String KEY_RETENTION_DETAIL = "monitor.retention.detail.days";
    /** 小时聚合保留天数 */
    public static final String KEY_RETENTION_HOURLY = "monitor.retention.hourly.days";
    /** 在线判定活跃窗口（分钟） */
    public static final String KEY_ONLINE_IDLE = "monitor.online.idle.minutes";
    /** 慢接口阈值（毫秒） */
    public static final String KEY_SLOW_THRESHOLD = "monitor.api.slow.threshold.ms";
    /** 额度预警阈值（%） */
    public static final String KEY_QUOTA_WARN = "monitor.quota.warn.percent";
    /** 额度告警阈值（%） */
    public static final String KEY_QUOTA_DANGER = "monitor.quota.danger.percent";
    /** 到期预警天数 */
    public static final String KEY_EXPIRE_WARN = "tenant.expire.warn.days";
    /** 租户月度快照保留月数 */
    public static final String KEY_STATS_RETENTION = "tenant.stats.retention.months";
    /** 是否启用监控定时任务 */
    public static final String KEY_TASK_ENABLED = "monitor.task.enabled";

    @Autowired
    private SystemConfigMapper systemConfigMapper;

    public SystemConfig getByKey(String key) {
        LambdaQueryWrapper<SystemConfig> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SystemConfig::getConfigKey, key);
        return systemConfigMapper.selectOne(wrapper);
    }

    /**
     * 读取字符串配置，缺失时返回默认值
     */
    public String getString(String key, String defaultValue) {
        SystemConfig cfg = getByKey(key);
        if (cfg == null || cfg.getConfigValue() == null) {
            return defaultValue;
        }
        return cfg.getConfigValue();
    }

    public int getInt(String key, int defaultValue) {
        String value = getString(key, null);
        if (value == null || value.isBlank()) {
            return defaultValue;
        }
        try {
            return Integer.parseInt(value.trim());
        } catch (NumberFormatException e) {
            log.warn("配置项{}值非法: {}，使用默认值{}", key, value, defaultValue);
            return defaultValue;
        }
    }

    public long getLong(String key, long defaultValue) {
        String value = getString(key, null);
        if (value == null || value.isBlank()) {
            return defaultValue;
        }
        try {
            return Long.parseLong(value.trim());
        } catch (NumberFormatException e) {
            log.warn("配置项{}值非法: {}，使用默认值{}", key, value, defaultValue);
            return defaultValue;
        }
    }

    public boolean getBool(String key, boolean defaultValue) {
        String value = getString(key, null);
        if (value == null || value.isBlank()) {
            return defaultValue;
        }
        return "1".equals(value.trim()) || "true".equalsIgnoreCase(value.trim());
    }

    public List<SystemConfig> listAll() {
        LambdaQueryWrapper<SystemConfig> wrapper = new LambdaQueryWrapper<>();
        wrapper.orderByAsc(SystemConfig::getConfigGroup).orderByAsc(SystemConfig::getId);
        List<SystemConfig> list = systemConfigMapper.selectList(wrapper);
        return list == null ? new ArrayList<>() : list;
    }

    public List<SystemConfig> listByGroup(String group) {
        LambdaQueryWrapper<SystemConfig> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SystemConfig::getConfigGroup, group);
        wrapper.orderByAsc(SystemConfig::getId);
        List<SystemConfig> list = systemConfigMapper.selectList(wrapper);
        return list == null ? new ArrayList<>() : list;
    }

    /**
     * 修改配置值（只读配置不允许修改）
     */
    public int updateByKey(String key, String value) {
        SystemConfig cfg = getByKey(key);
        if (cfg == null) {
            throw new BusinessException("配置项不存在：" + key);
        }
        if (cfg.getEditable() != null && cfg.getEditable() == 0) {
            throw new BusinessException("该配置为系统内置项，不允许修改");
        }
        SystemConfig update = new SystemConfig();
        update.setId(cfg.getId());
        update.setConfigValue(value);
        int rows = systemConfigMapper.updateById(update);
        log.info("修改系统配置, key={}, {} -> {}", key, cfg.getConfigValue(), value);
        return rows;
    }

    /**
     * 恢复默认值
     */
    public int resetToDefault(String key) {
        SystemConfig cfg = getByKey(key);
        if (cfg == null) {
            throw new BusinessException("配置项不存在：" + key);
        }
        SystemConfig update = new SystemConfig();
        update.setId(cfg.getId());
        update.setConfigValue(cfg.getDefaultValue());
        return systemConfigMapper.updateById(update);
    }
}
