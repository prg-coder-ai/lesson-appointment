package com.reservation.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 系统配置实体，对应表 sys_system_config
 * 采样间隔、历史数据保留时间、预警阈值等运行参数均存放于此，
 * 由「系统配置」菜单维护，代码中不写死常量
 */
@Data
@TableName("sys_system_config")
public class SystemConfig {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 配置键（英文，唯一） */
    private String configKey;

    /** 配置值（字符串存储，按 valueType 解析） */
    private String configValue;

    /** 配置名称（页面展示） */
    private String configName;

    /** 分组：monitor监控 / tenant租户 / general通用 */
    private String configGroup;

    /** 值类型：int / long / bool / string */
    private String valueType;

    /** 默认值（恢复默认时使用） */
    private String defaultValue;

    private String remark;

    /** 是否允许页面修改：0否 1是 */
    private Integer editable;

    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
