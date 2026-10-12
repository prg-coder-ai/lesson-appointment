package com.reservation.dto;

import lombok.Data;

import java.io.Serializable;

/**
 * 教师职业信息 —— 公开列表卡片视图（落地页师资滚动卡片用）。
 *
 * <p>安全约束：本 VO <b>绝不</b>携带 {@code draftData}（原始数据快照含手机号/邮箱/账号/base64 照片等未勾选字段），
 * 仅暴露对外展示所需的少量字段；{@code draftData} 的解析与字段抽取在 Service 层完成，解析结果经裁剪后才进入本对象。
 *
 * <p>{@code coverUrl} 为可直接用于 CSS {@code background} 的完整值（形如 {@code url(https://...)}），
 * 前端缺省时回退到渐变占位，无需额外拼接。
 */
@Data
public class TeacherPublishedProfileCardVO implements Serializable {
    private static final long serialVersionUID = 1L;

    /** 发布记录主键（点击卡片跳 teacherPublishedProfile.html?id= 用） */
    private String publishedProfileId;

    private String teacherId;

    /** 教师姓名（取自 draftData.name） */
    private String name;

    /** 职业信息标题（实体独立列，发布时填写） */
    private String title;

    /** 一句话简介（取自 draftData.bioText；缺省回退 subject） */
    private String summary;

    /** 封面图 CSS 值（形如 url(...)；null 表示前端用渐变占位） */
    private String coverUrl;
}
