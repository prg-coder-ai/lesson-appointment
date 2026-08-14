package com.reservation.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.reservation.entity.TeacherProfessional;
import com.reservation.query.TeacherProfessionalQueryPage;
import com.reservation.vo.TeacherProfessionalListVO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 教师职业信息 Mapper
 * 继承 BaseMapper 获得 MyBatis-Plus 内置 insert/deleteById/updateById/selectById 等
 * 复杂联表查询放 XML（listByConditionPage / selectCountByCondition）
 * 对应 notes §2 Mapper 约定
 */
@Mapper
public interface TeacherProfessionalMapper extends BaseMapper<TeacherProfessional> {

    /**
     * 分页条件查询（联表 user 取 name/account/phone/email，子查询取证书数+第一张证书URL）
     * @param query 查询条件（含分页参数）
     * @return 列表 VO
     */
    List<TeacherProfessionalListVO> listByConditionPage(@Param("query") TeacherProfessionalQueryPage query);

    /**
     * 条件查询总数（用于分页 total）
     */
    int selectCountByCondition(@Param("query") TeacherProfessionalQueryPage query);
}
