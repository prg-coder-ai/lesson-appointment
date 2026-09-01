package com.reservation.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 行业字典实体，对应表 sys_industry
 * 由「平台管理端 - 系统设置 - 行业管理」维护（仅平台管理员）
 */
@Data
@TableName("sys_industry")
public class Industry {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 行业编码（唯一，如 edu/it/medical） */
    private String code;

    /** 行业名称 */
    private String name;

    /** 状态：1启用 0停用 */
    private Integer status;

    /** 备注 */
    private String remark;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
