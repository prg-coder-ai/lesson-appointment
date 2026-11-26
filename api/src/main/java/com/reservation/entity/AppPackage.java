package com.reservation.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 课堂 App 安装包实体，对应表 sys_app_package
 *
 * <p>「系统配置 → 课堂 App 包管理」的数据载体：平台管理员或租户管理员上传
 * eClassroom 的 Windows / Android / iOS 安装包，教师与学生下载。
 *
 * <p><b>租户可见性</b>：{@code tenantId = 0} 表示平台级包（全部租户可见），
 * {@code tenantId > 0} 表示该租户专属包。本表在
 * {@link com.reservation.config.MyBatisPlusConfig} 的 IGNORE_TABLES 里——
 * 因为它必须同时容纳「平台行」与「租户行」，租户插件自动拼 {@code tenant_id = ?}
 * 会把平台行一起过滤掉。隔离由 Service 层显式条件控制
 * （{@code tenant_id IN (0, 当前租户)}），与 sys_term 的三级作用域同一套路。
 *
 * <p>文件本体落磁盘，表里只存 {@code storedName}（随机前缀文件名）与摘要，
 * 不存绝对路径——换部署目录不需要洗数据。
 */
@Data
@TableName("sys_app_package")
public class AppPackage {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 所属租户：0=平台（全部租户可见），>0=该租户专属 */
    private Long tenantId;

    /** 目标平台：windows / android / ios / macos */
    private String platform;

    /** 版本号（展示用，如 1.0.0） */
    private String version;

    /** 原始文件名（下载时作为附件名回填） */
    private String fileName;

    /** 落盘文件名（随机前缀，防覆盖与防路径猜测） */
    private String storedName;

    /** 文件字节数 */
    private Long fileSize;

    /** SHA-256 摘要 */
    private String fileSha256;

    /** 状态：1=上架可下载 0=已下架 */
    private Integer status;

    /** 备注（更新说明等） */
    private String remark;

    /** 上传人用户ID */
    private String uploaderId;

    /** 上传人角色：platform_admin / admin */
    private String uploaderRole;

    /** 上传人姓名（冗余，便于审计页展示） */
    private String uploaderName;

    /** 累计下载次数 */
    private Integer downloadCount;

    /** 软删除：0正常 1已删除 */
    private Integer deleted;

    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
