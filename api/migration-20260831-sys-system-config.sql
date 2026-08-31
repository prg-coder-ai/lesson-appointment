-- ============================================================
-- 系统配置表：sys_system_config
-- 对应实体：com.reservation.entity.SystemConfig
-- 数据库：lesson_appointment
--
-- 说明：
--   采样间隔、历史数据保留时间、在线判定窗口、预警阈值等运行参数全部存放于此表，
--   由「系统配置」菜单维护，代码中不写死常量（SysConfigService 读取）。
--   配置键需与 SysConfigService 中的 KEY_* 常量严格一致，见文件末尾对照表。
-- ============================================================

USE lesson_appointment;

CREATE TABLE IF NOT EXISTS `sys_system_config` (
  `id`            BIGINT       NOT NULL AUTO_INCREMENT                  COMMENT '自增主键',
  `config_key`    VARCHAR(100) NOT NULL                                 COMMENT '配置键（英文，唯一）',
  `config_value`  VARCHAR(500) DEFAULT NULL                             COMMENT '配置值（字符串存储，按 value_type 解析）',
  `config_name`   VARCHAR(200) NOT NULL                                 COMMENT '配置名称（页面展示）',
  `config_group`  VARCHAR(50)  NOT NULL DEFAULT 'monitor'               COMMENT '分组：monitor监控 / tenant租户 / general通用',
  `value_type`    VARCHAR(20)  NOT NULL DEFAULT 'int'                   COMMENT '值类型：int / long / bool / string',
  `default_value` VARCHAR(500) DEFAULT NULL                             COMMENT '默认值（恢复默认时使用）',
  `remark`        VARCHAR(500) DEFAULT NULL                             COMMENT '说明',
  `editable`      TINYINT      NOT NULL DEFAULT 1                       COMMENT '是否允许页面修改：0否（系统内置） 1是',
  `create_time`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP       COMMENT '创建时间',
  `update_time`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_config_key` (`config_key`),
  KEY `idx_group` (`config_group`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统配置表';

-- ============================================================
-- 默认配置项（可重复执行：已存在则跳过）
-- ============================================================
INSERT INTO `sys_system_config`
  (`config_key`, `config_value`, `config_name`, `config_group`, `value_type`, `default_value`, `remark`, `editable`)
VALUES
  ('monitor.sample.interval.seconds', '60',   '指标采样间隔（秒）',       'monitor', 'int',  '60',   '系统指标落库频率，改小更精确但数据量更大', 1),
  ('monitor.retention.detail.days',   '7',    '明细数据保留天数',         'monitor', 'int',  '7',    'sys_metric_sample 保留天数', 1),
  ('monitor.retention.hourly.days',   '90',   '小时聚合保留天数',         'monitor', 'int',  '90',   'sys_metric_hourly 保留天数', 1),
  ('monitor.online.idle.minutes',     '5',    '在线判定活跃窗口（分钟）', 'monitor', 'int',  '5',    '最近N分钟内有活动即视为在线', 1),
  ('monitor.api.slow.threshold.ms',   '1000', '慢接口阈值（毫秒）',       'monitor', 'int',  '1000', '接口耗时超过该值计入慢接口统计', 1),
  ('monitor.quota.warn.percent',      '80',   '额度预警阈值（%）',        'monitor', 'int',  '80',   '用量占比达到该值标黄', 1),
  ('monitor.quota.danger.percent',    '95',   '额度告警阈值（%）',        'monitor', 'int',  '95',   '用量占比达到该值标红', 1),
  ('monitor.task.enabled',            '1',    '启用监控定时任务',         'monitor', 'bool', '1',    '关闭后不再采样与清理', 1),
  ('tenant.expire.warn.days',         '30',   '到期预警天数',             'tenant',  'int',  '30',   '距到期N天内列入预警名单', 1),
  ('tenant.stats.retention.months',   '12',   '租户月度快照保留月数',     'tenant',  'int',  '12',   '超过该月数的历史快照自动清理', 1)
ON DUPLICATE KEY UPDATE `config_key` = VALUES(`config_key`);

-- ============================================================
-- 字段与实体属性对照（map-underscore-to-camel-case = true）
-- ============================================================
--  id             -> id             BIGINT          自增主键
--  config_key     -> configKey      VARCHAR(100)    配置键，唯一
--  config_value   -> configValue    VARCHAR(500)    配置值
--  config_name    -> configName     VARCHAR(200)    配置名称
--  config_group   -> configGroup    VARCHAR(50)     分组
--  value_type     -> valueType      VARCHAR(20)     值类型
--  default_value  -> defaultValue   VARCHAR(500)    默认值
--  remark         -> remark         VARCHAR(500)    说明
--  editable       -> editable       TINYINT         是否允许页面修改
--  create_time    -> createTime     DATETIME        创建时间
--  update_time    -> updateTime     DATETIME        更新时间
--
-- ============================================================
-- 配置键与代码常量对应（SysConfigService）
-- ============================================================
--  KEY_SAMPLE_INTERVAL  = monitor.sample.interval.seconds
--  KEY_RETENTION_DETAIL = monitor.retention.detail.days
--  KEY_RETENTION_HOURLY = monitor.retention.hourly.days
--  KEY_ONLINE_IDLE      = monitor.online.idle.minutes
--  KEY_SLOW_THRESHOLD   = monitor.api.slow.threshold.ms
--  KEY_QUOTA_WARN       = monitor.quota.warn.percent
--  KEY_QUOTA_DANGER     = monitor.quota.danger.percent
--  KEY_TASK_ENABLED     = monitor.task.enabled
--  KEY_EXPIRE_WARN      = tenant.expire.warn.days
--  KEY_STATS_RETENTION  = tenant.stats.retention.months

-- ============================================================
-- 验证语句（建表后执行确认）
-- ============================================================
-- SELECT config_group, config_key, config_value, default_value, value_type, editable
-- FROM sys_system_config ORDER BY config_group, id;
-- 预期：monitor 组 8 条 + tenant 组 2 条，共 10 条
