package com.reservation.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 教师发布信息 / 转发配置表实体
 * 对应 migration-20260815-teacher-published-profile.sql
 */
@Data
@TableName("teacher_published_profile")
public class TeacherPublishedProfile implements Serializable {
    private static final long serialVersionUID = 1L;

    /** 租户ID（0=平台/历史单租户数据）— SaaS多租户 */
    private Long tenantId;

    @TableId(type = IdType.ASSIGN_UUID)
    private String publishedProfileId;

    private String teacherId;

    private String teacherProfessionalId;

    private String title;

    /** draft / published / archived */
    private String status;

    /** 字段勾选与排序 JSON */
    private String fieldConfig;

    /** 样式配置 JSON */
    private String styleConfig;

    /** 临时保存的原始数据快照 JSON */
    private String draftData;

    /** 生成的完整静态HTML（内嵌图片base64） */
    private String staticHtml;

    private LocalDateTime publishedAt;

    private String publishedByUserId;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
