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

    /**
     * 按实例编码查询（仅查未删除的）。
     *
     * <p>本服务靠 {@code classroom.instance-code}（env {@code INSTANCE_CODE}）认领"我是哪一台"，
     * 再用它读出该实例的 {@code max_capacity} 做开课准入。用编码而不是 IP/端口：
     * 同一台机器上换实例、容器化后 IP 漂移都不会让上限张冠李戴。
     */
    @Select("SELECT * FROM lesson_appointment.sys_eclassroom_instance WHERE instance_code = #{code} AND deleted = 0 LIMIT 1")
    EclassroomInstance selectByInstanceCode(@Param("code") String code);
}