package com.classroom.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.classroom.entity.EclassroomInstance;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * 课堂实例 Mapper（跨 schema 只读）。
 *
 * <p>查询主系统 {@code lesson_appointment.sys_eclassroom_instance} 表，
 * 获取实例状态信息。使用 {@code @InterceptorIgnore} 避免多租户插件干扰。
 */
@Mapper
@InterceptorIgnore(tenantLine = "true")
public interface EclassroomInstanceMapper {

    /**
     * 按 ID 查询实例（仅查未删除的）。
     */
    @Select("SELECT * FROM lesson_appointment.sys_eclassroom_instance WHERE id = #{id} AND deleted = 0 LIMIT 1")
    EclassroomInstance selectByIdNotDeleted(@Param("id") Long id);
}