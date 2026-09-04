package com.reservation.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 行业专业词汇实体，对应表 sys_term
 * 三级作用域（industry_id + tenant_id 用 0 作哨兵）：
 *   (0,0)        = 平台词（全系统默认，平台管理员维护）
 *   (行业id,0)   = 行业词（平台管理员按行业维护）
 *   (租户id,行业id) = 租户词（租户自定义/覆盖，租户管理员维护）
 * 显示优先级：租户词 &gt; 行业词 &gt; 平台词，逐级回退
 * 多语言：language 字段（ISO 639-1，默认 zh），唯一键含语言维度，
 *         同一 key 同一作用域可维护多个语言版本
 */
@Data
@TableName("sys_term")
public class Term {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 词条编码（业务标识，如 course/teacher/student） */
    private String termKey;

    /** 显示词（该作用域下的词汇值） */
    private String termName;

    /** 语言代码（ISO 639-1：zh中文/en英语/fr法语，默认 zh） */
    private String language;

    /** 用途：label标签/menu菜单/button按钮/tip提示 */
    private String termType;

    /** 所属行业：0=平台级，>0=该行业 */
    private Long industryId;

    /** 所属租户：0=平台/行业级，>0=租户自定义 */
    private Long tenantId;

    /** 同级排序（菜单顺序可用） */
    private Integer sortOrder;

    /** 状态：1启用 0停用（停用=该级回退到下一级） */
    private Integer status;

    /** 备注 */
    private String remark;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
