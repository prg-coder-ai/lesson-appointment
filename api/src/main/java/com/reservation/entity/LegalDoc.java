package com.reservation.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 法律文档实体，对应表 sys_legal_doc
 *
 * <p>作用域（与 sys_term 三级模型对齐）：
 *   tenant_id = 0  = 平台级（平台管理员制定，租户只能签不能改）
 *   tenant_id &gt; 0 = 租户覆盖级（租户管理员可覆盖本租户版本）
 *   industry_id 预留行业级微调，暂默认 0。
 * 读取优先级：租户级 &gt; 平台级（逐级回退）；多语言走 language 字段，目标语言缺失回退 zh。
 *
 * <p>本表已登记进 {@code MyBatisPlusConfig.IGNORE_TABLES}：表虽含 tenant_id 列，
 * 但该列是「作用域维度」而非「租户隔离维度」，隔离由业务层显式按
 * doc_type + tenant_id + language 过滤，不能走租户插件（否则会被拼 tenant_id=? 误伤）。
 */
@Data
@TableName("sys_legal_doc")
public class LegalDoc {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 文档类型：user_agreement / privacy_policy */
    private String docType;

    /** 作用域：0=平台级；>0=租户覆盖级 */
    private Long tenantId;

    /** 行业id（预留行业级微调，暂默认 0） */
    private Long industryId;

    /** 语言代码（ISO 639-1：zh/en/fr，默认 zh） */
    private String language;

    /** 文档标题 */
    private String title;

    /** 正文（HTML 或 Markdown，前端渲染） */
    private String content;

    /** 版本号（每次保存 +1，从 1 起） */
    private Integer version;

    /** 状态：1=启用 0=停用（停用回退上级） */
    private Integer status;

    /** 生效时间 */
    private LocalDateTime effectiveTime;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
