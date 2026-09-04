package com.reservation.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.reservation.entity.TeacherCertificate;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * 教师资格证书 Mapper
 * 继承 BaseMapper 获得内置 CRUD
 */
@Mapper
public interface TeacherCertificateMapper extends BaseMapper<TeacherCertificate> {

    /**
     * 按教师ID查询全部证书（按 sort_no 排序）
     */
    @Select("SELECT * FROM teacher_certificate WHERE teacher_id = #{teacherId} ORDER BY sort_no ASC, create_time ASC")
    List<TeacherCertificate> listByTeacherId(@Param("teacherId") String teacherId);

    /**
     * 按教师ID删除全部证书（修改时先删后插）
     */
    @Delete("DELETE FROM teacher_certificate WHERE teacher_id = #{teacherId}")
    int deleteByTeacherId(@Param("teacherId") String teacherId);
}
