package com.reservation.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

/**
 * 引用完整性级联执行 Mapper（报告根因 C）。
 *
 * <p><b>为什么不用 MyBatis-Plus 的 BaseMapper</b>：级联必须按
 * 「父表 + 父键 → 子表 + 子键」动态组合执行 SQL，表名与列名在运行时才确定，
 * 无法用实体类承载。
 *
 * <p><b>为什么全部方法都 {@code @InterceptorIgnore(tenantLine = "true")}</b>：
 * 级联的定位条件就是父键本身。若让租户插件追加 {@code tenant_id = -1}
 * （无租户上下文时）或拼上当前租户，会出现两类错误：
 * <ul>
 *   <li>平台管理员删除某租户数据时 {@code tenantId=0} 被短路，插件不加条件——尚可；
 *       但<b>租户管理员</b>删自己数据时插件会加条件，与按父键定位叠加虽不冲突，
 *       真正的问题是<b>数据维护页的跨租户清理</b>与定时任务无租户上下文，
 *       会被拼成 {@code tenant_id = -1} 而恒不命中（与
 *       {@code public-endpoint-tenant-bypass} 记录的是同一类坑）。</li>
 *   <li>更严重的是：漏删。<b>级联漏删不会报错</b>——插件加个条件让 UPDATE 影响 0 行，
 *   程序以为"没有子记录"，实际是"没找到"。这正是悬空引用的成因，必须避免。</li>
 * </ul>
 * 因此本 Mapper 一律显式忽略租户插件，租户边界由<b>调用方入口的权限校验</b>保证
 * （删除接口本就有 checkTeacherOrAdmin / checkPlatformAdmin）。
 *
 * <p><b>不用数据库级联</b>：见 {@link com.reservation.common.CascadeRules} 类注释——
 * 现有 14 个 FK 的 DELETE_RULE 全是 CASCADE，正是 109 条悬空课次的成因。
 */
@Mapper
public interface CascadeMapper {

    // ========== 子行定位（用于预估影响面 / dryRun） ==========

    /** 按父键取子表行数（用于删除前告知用户"会连带影响多少条"） */
    @InterceptorIgnore(tenantLine = "true")
    @Select("SELECT COUNT(*) FROM ${childTable} WHERE ${childKeyColumn} = #{parentKey}")
    int countChild(@Param("childTable") String childTable,
                   @Param("childKeyColumn") String childKeyColumn,
                   @Param("parentKey") String parentKey);

    /** 取子表主键值列表（按父键） */
    @InterceptorIgnore(tenantLine = "true")
    @Select("SELECT ${childKeyColumn} FROM ${childTable} WHERE ${childKeyColumn} = #{parentKey}")
    List<String> listChildKeys(@Param("childTable") String childTable,
                               @Param("childKeyColumn") String childKeyColumn,
                               @Param("parentKey") String parentKey);

    /**
     * 取某列的现有值集合（用于判断哪些子行会被改动，KEEP/SKIP 场景的诊断用）。
     * {@code statusColumn} 可为 null（表示不需要该列）。
     */
    @InterceptorIgnore(tenantLine = "true")
    @Select("SELECT ${valueColumn} FROM ${table} WHERE ${keyColumn} = #{parentKey}")
    List<String> listValues(@Param("table") String table,
                            @Param("keyColumn") String keyColumn,
                            @Param("valueColumn") String valueColumn,
                            @Param("parentKey") String parentKey);

    // ========== 软删除：置状态（保留行） ==========

    /**
     * 把子表状态列统一置为 {@code targetStatus}。
     *
     * <p>{@code skipStatuses} 为 null 时不限制原状态；非空时只改原状态<b>不在</b>该集合里的行
     * ——用于"不覆盖已是终态的行"（例如 completed/changed 是真实上过的课，不能改成 frozen）。
     * 传空字符串集合表示"不改任何行"，避免 SQL 拼出 {@code IN ()} 语法错。
     */
    @InterceptorIgnore(tenantLine = "true")
    @Update({"<script>",
            "UPDATE ${childTable} SET ${statusColumn} = #{targetStatus}",
            "WHERE ${childKeyColumn} = #{parentKey}",
            "<if test='skipStatuses != null and skipStatuses.size() > 0'>",
            "  AND (${statusColumn} IS NULL OR ${statusColumn} NOT IN",
            "  <foreach item='s' collection='skipStatuses' open='(' separator=',' close=')'>#{s}</foreach>)",
            "</if>",
            "</script>"})
    int freezeChild(@Param("childTable") String childTable,
                    @Param("childKeyColumn") String childKeyColumn,
                    @Param("statusColumn") String statusColumn,
                    @Param("parentKey") String parentKey,
                    @Param("targetStatus") String targetStatus,
                    @Param("skipStatuses") List<String> skipStatuses);

    /**
     * 把原状态在 {@code fromStatuses} 内的行置为 {@code targetStatus}（恢复语义）。
     *
     * <p>用于「恢复」动作：软删时被冻结的行要复原，但同表里其它状态
     * （如 pending 待审批）属于审批结论，不该被这次恢复顺手改掉。
     * {@code fromStatuses} 为空则本方法不做任何事（无谓的全表改写比不改更危险）。
     */
    @InterceptorIgnore(tenantLine = "true")
    @Update({"<script>",
            "UPDATE ${childTable} SET ${statusColumn} = #{targetStatus}",
            "WHERE ${childKeyColumn} = #{parentKey}",
            "<if test='fromStatuses != null and fromStatuses.size() > 0'>",
            "  AND ${statusColumn} IN",
            "  <foreach item='s' collection='fromStatuses' open='(' separator=',' close=')'>#{s}</foreach>",
            "</if>",
            "<if test='fromStatuses == null or fromStatuses.size() == 0'>",
            "  AND 1 = 0",
            "</if>",
            "</script>"})
    int restoreChildStatus(@Param("childTable") String childTable,
                           @Param("childKeyColumn") String childKeyColumn,
                           @Param("statusColumn") String statusColumn,
                           @Param("parentKey") String parentKey,
                           @Param("targetStatus") String targetStatus,
                           @Param("fromStatuses") List<String> fromStatuses);

    // ========== 物理删除 ==========

    /** 按父键物理删除子表行 */
    @InterceptorIgnore(tenantLine = "true")
    @Delete("DELETE FROM ${childTable} WHERE ${childKeyColumn} = #{parentKey}")
    int deleteChild(@Param("childTable") String childTable,
                    @Param("childKeyColumn") String childKeyColumn,
                    @Param("parentKey") String parentKey);

    /** 按父键列表批量物理删除子表行（IN 形式，避免逐条往返） */
    @InterceptorIgnore(tenantLine = "true")
    @Delete({"<script>",
            "DELETE FROM ${childTable} WHERE ${childKeyColumn} IN",
            "<foreach item='k' collection='parentKeys' open='(' separator=',' close=')'>#{k}</foreach>",
            "</script>"})
    int deleteChildByKeys(@Param("childTable") String childTable,
                          @Param("childKeyColumn") String childKeyColumn,
                          @Param("parentKeys") List<String> parentKeys);

    // ========== 置空引用 ==========

    /** 把子表外键列置 NULL，保留行 */
    @InterceptorIgnore(tenantLine = "true")
    @Update("UPDATE ${childTable} SET ${childKeyColumn} = NULL WHERE ${childKeyColumn} = #{parentKey}")
    int clearChildRef(@Param("childTable") String childTable,
                      @Param("childKeyColumn") String childKeyColumn,
                      @Param("parentKey") String parentKey);

    /** 诊断用：统计"子表存在行、但其父键在父表中不存在"的悬空行数（按父表名与键列） */
    @InterceptorIgnore(tenantLine = "true")
    @Select("SELECT COUNT(*) FROM ${childTable} c "
            + "LEFT JOIN ${parentTable} p ON c.${childKeyColumn} = p.${parentKeyColumn} "
            + "WHERE c.${childKeyColumn} IS NOT NULL AND p.${parentKeyColumn} IS NULL")
    int countOrphans(@Param("childTable") String childTable,
                     @Param("childKeyColumn") String childKeyColumn,
                     @Param("parentTable") String parentTable,
                     @Param("parentKeyColumn") String parentKeyColumn);
}
