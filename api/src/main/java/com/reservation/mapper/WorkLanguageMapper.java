package com.reservation.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.reservation.entity.WorkLanguage;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * 授课语言枚举 Mapper。
 *
 * <p>表已在 MyBatisPlusConfig.IGNORE_TABLES 中登记（租户端要读 tenant_id=0 的内置项），
 * 因此**租户插件不会追加条件**，任何按租户过滤的查询都必须在本接口的 SQL 里显式写出。
 */
@Mapper
public interface WorkLanguageMapper extends BaseMapper<WorkLanguage> {

    /**
     * 某租户可见的授课语言清单：平台内置（tenant_id=0）＋ 该租户自定义。
     *
     * <p>平台管理员（tenantId=0）只取内置项 —— 让他看到所有租户的自定义项没有意义，
     * 且会让下拉里出现同名重复条目。
     *
     * <p>排序：内置项排在前（tenant_id 升序），同作用域内按 sort_order、id。
     */
    @Select("SELECT * FROM sys_work_language "
          + " WHERE tenant_id = 0 OR (tenant_id = #{tenantId} AND #{tenantId} > 0) "
          + " ORDER BY tenant_id ASC, sort_order ASC, id ASC")
    List<WorkLanguage> selectVisibleForTenant(@Param("tenantId") Long tenantId);

    /** 内置项里是否已存在该 code（租户不允许重复定义内置语言） */
    @Select("SELECT COUNT(*) FROM sys_work_language WHERE tenant_id = 0 AND lang_code = #{langCode}")
    int countBuiltinByCode(@Param("langCode") String langCode);

    /** 本租户是否已有同 code 的自定义项（有则走更新，避免撞 uk_tenant_code） */
    @Select("SELECT * FROM sys_work_language WHERE tenant_id = #{tenantId} AND lang_code = #{langCode} LIMIT 1")
    WorkLanguage selectCustomByCode(@Param("tenantId") Long tenantId, @Param("langCode") String langCode);

    /** 按 code 取该租户可用的授课语言（先内置后自定义），用于落库前校验 code 合法 */
    @Select("SELECT * FROM sys_work_language "
          + " WHERE lang_code = #{langCode} AND (tenant_id = 0 OR (tenant_id = #{tenantId} AND #{tenantId} > 0)) "
          + " ORDER BY tenant_id ASC LIMIT 1")
    WorkLanguage selectVisibleByCode(@Param("tenantId") Long tenantId, @Param("langCode") String langCode);

    /** 内置项总数（诊断用） */
    @Select("SELECT COUNT(*) FROM sys_work_language WHERE tenant_id = 0")
    int countBuiltin();

    /**
     * 该授课语言 code 在本租户被多少条模板/课程/排期引用。
     *
     * <p>三张业务表都走租户插件，子查询里的表同样会被追加 {@code tenant_id = ?}，
     * 所以这里算出来的就是"本租户的引用数"——正是删除前要拦的那个口径。
     * 若插件某天不再处理子查询，结果只会偏大（多算别的租户），表现为"更保守地拒绝删除"，
     * 不会造成误删。
     */
    @Select("SELECT "
          + " (SELECT COUNT(*) FROM course_template WHERE work_language = #{code}) "
          + "+ (SELECT COUNT(*) FROM course WHERE work_language = #{code}) "
          + "+ (SELECT COUNT(*) FROM course_schedule WHERE work_language = #{code})")
    int countReferences(@Param("code") String code);
}
