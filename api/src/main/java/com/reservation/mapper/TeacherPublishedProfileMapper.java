package com.reservation.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.reservation.entity.TeacherPublishedProfile;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface TeacherPublishedProfileMapper extends BaseMapper<TeacherPublishedProfile> {

    /**
     * 按教师取「最新已发布版本」——忽略租户隔离。
     *
     * <p><b>为什么必须忽略：</b>公开页（teacherPublishedProfile.html）是免登录的对外分享链接，
     * 请求没有租户上下文，{@code TenantContext.getTenantId()} 为 null，
     * 而 TenantLineInnerInterceptor 会把 null 兜底成 -1（见 MyBatisPlusConfig.getTenantId），
     * 于是 SQL 被追加 {@code tenant_id = -1}，恒不命中——即便库里确有已发布记录，
     * 公开链接也会报「该教师暂无已发布的个人介绍」。
     *
     * <p>公开页本就与「请求方属于哪个租户」无关（链接是发给家长的，家长没有租户身份），
     * 因此这里显式跳过租户条件。记录自身的归属仍由 teacher_id 精确锁定。
     */
    @InterceptorIgnore(tenantLine = "true")
    @Select("SELECT * FROM teacher_published_profile "
            + "WHERE teacher_id = #{teacherId} AND status = 'published' "
            + "ORDER BY published_at DESC LIMIT 1")
    TeacherPublishedProfile selectLatestPublishedIgnoreTenant(@Param("teacherId") String teacherId);

    /**
     * 按主键查询——忽略租户隔离（供公开接口 public-get 使用，理由同上）。
     *
     * <p>调用方仍需自行校验 status，保证草稿 / 归档不对外泄露。
     */
    @InterceptorIgnore(tenantLine = "true")
    @Select("SELECT * FROM teacher_published_profile WHERE published_profile_id = #{id}")
    TeacherPublishedProfile selectByIdIgnoreTenant(@Param("id") String id);
}
