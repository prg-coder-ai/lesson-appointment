package com.reservation.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 授课语言枚举实体，对应表 sys_work_language。
 *
 * <p><b>它解决什么问题</b>：{@code course.language_type} / {@code course_template.language_type}
 * 存的一直是 classType 的 code（教育行业 english=英语课，法律行业 english 经 sys_term
 * 显示成「劳动」），回答的是"这是哪一类课程/咨询"。而"用哪种语言上课"是另一个维度，
 * 与行业无关，必须用固定枚举表达 —— 就是本表。
 *
 * <p><b>作用域</b>：
 * <ul>
 *   <li>{@code tenantId = 0}：平台内置项（英语/法语/汉语/德语/西班牙语/土耳其语），
 *       任何租户都能用，且租户不可修改或删除；</li>
 *   <li>{@code tenantId > 0}：该租户自定义追加的授课语言（如某机构要加"意大利语"）。</li>
 * </ul>
 *
 * <p><b>为什么不复用 sys_term</b>：sys_term 的结构是"一个 term_key 对应一个显示词"，
 * 靠 industry_id / language 做作用域和 i18n，本质是**键值映射**；而这里需要的是
 * **可增删的清单**，且清单项本身就是业务值（lang_code 会落进 course.work_language）。
 * 硬塞进 sys_term 只能每个语言编一个 term_key，正是造成 language_type 语义漂移的老路。
 *
 * <p><b>为什么登记进 IGNORE_TABLES</b>：租户端必须能读到 tenant_id=0 的内置项，
 * 走租户插件会被拼上 {@code tenant_id = ?} 而查空。代价是插件不再兜底隔离，
 * 所有读写 SQL 都必须显式带 tenant_id 条件（见 WorkLanguageService）。
 */
@Data
@TableName("sys_work_language")
public class WorkLanguage {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 作用域：0=平台内置，>0=租户自定义 */
    private Long tenantId;

    /** 授课语言代码（小写，进入 course.work_language；如 english/french/turkish） */
    private String langCode;

    /** 中文显示名 */
    private String nameZh;

    /** 英文显示名（可空，界面语言为 en 时使用） */
    private String nameEn;

    /** 法文显示名（可空，界面语言为 fr 时使用） */
    private String nameFr;

    /** 排序（小者在前） */
    private Integer sortOrder;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
