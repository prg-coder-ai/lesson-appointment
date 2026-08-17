package com.reservation.dto;

import lombok.Data;

/**
 * 教师发布信息 保存 / 发布 请求体
 * 对应 enterPublishMode 前端提交
 */
@Data
public class TeacherPublishedProfileDTO {
    /** 编辑已有草稿时传，新建时为null */
    private String publishedProfileId;

    private String teacherId;

    private String teacherProfessionalId;

    private String title;

    /** draft / published */
    private String status;

    /** 字段勾选 JSON 字符串 */
    private String fieldConfig;

    /** 样式配置 JSON 字符串 */
    private String styleConfig;

    /** 原始数据快照 JSON（临时保存用） */
    private String draftData;

    /** 生成的静态HTML（仅发布时需要） */
    private String staticHtml;
}
