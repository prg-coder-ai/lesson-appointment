package com.reservation.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 协议 / 政策签署留痕实体，对应表 sys_legal_accept
 *
 * <p>场景 A（平台 ↔ 租户）：subject_type=1，subject_id=租户 id。
 * 场景 B（租户 ↔ 用户）：subject_type=2，subject_id=用户 id。
 * uk_subject_doc 保证同一主体同一文档仅保留最新一次签署记录（含版本与时刻），重签即更新。
 */
@Data
@TableName("sys_legal_accept")
public class LegalAccept {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 签署主体类型：1=租户(场景A) 2=用户(场景B) */
    private Integer subjectType;

    /** 签署主体id：租户id 或 用户id */
    private Long subjectId;

    /** 文档类型：user_agreement / privacy_policy */
    private String docType;

    /** 签署时所读版本（留痕关键） */
    private Integer version;

    /** 签署时间 */
    private LocalDateTime acceptTime;

    /** 签署渠道：web / miniprogram */
    private String channel;

    /** 来源 IP（审计） */
    private String ip;
}
