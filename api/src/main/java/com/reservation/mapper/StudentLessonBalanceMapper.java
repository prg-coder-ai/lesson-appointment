package com.reservation.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.reservation.entity.StudentLessonBalance;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.math.BigDecimal;

/**
 * 学生课时余额 Mapper。
 *
 * <p><b>全部方法 {@code @InterceptorIgnore(tenantLine)}</b>：扣减发生在课堂回调线程
 * （免登录白名单，没有 {@code TenantContext}）。TenantLineInnerInterceptor 在 tenantId 为 null 时
 * 会兜底拼 {@code tenant_id = -1}，结果是「更新 0 行」——余额永远扣不动，且不报错。
 * 租户一律由调用方显式传入并写进 SQL。
 *
 * <p><b>并发用行锁（{@code FOR UPDATE}）而不是乐观锁重试</b>：同一事务内重试在 RR 隔离级别下
 * 读到的是同一快照，version 永远不变，重试恒定失败——这个坑比不加锁更难查。
 * {@code version} 列保留作审计与将来跨事务场景使用。
 */
@Mapper
public interface StudentLessonBalanceMapper extends BaseMapper<StudentLessonBalance> {

    @InterceptorIgnore(tenantLine = "true")
    @Select("SELECT * FROM student_lesson_balance WHERE tenant_id = #{tenantId} AND student_id = #{studentId} LIMIT 1")
    StudentLessonBalance selectByTenantStudent(@Param("tenantId") Long tenantId,
                                               @Param("studentId") String studentId);

    /** 取行并加行锁（必须在事务内调用），用于「读版本 → 改余额 → 写流水」的临界区 */
    @InterceptorIgnore(tenantLine = "true")
    @Select("SELECT * FROM student_lesson_balance WHERE tenant_id = #{tenantId} AND student_id = #{studentId} FOR UPDATE")
    StudentLessonBalance selectForUpdate(@Param("tenantId") Long tenantId,
                                         @Param("studentId") String studentId);

    /**
     * 建账户（已存在则忽略）。用 INSERT IGNORE 而不是「先查后插」：
     * 两个线程同时给同一学生扣不同课次时，先查后插会双方都查不到、双双插入撞唯一键。
     */
    @InterceptorIgnore(tenantLine = "true")
    @Insert("INSERT IGNORE INTO student_lesson_balance"
            + " (tenant_id, student_id, total_lessons, used_lessons, remaining_lessons, version)"
            + " VALUES (#{tenantId}, #{studentId}, 0.00, 0.00, 0.00, 0)")
    int insertIfAbsent(@Param("tenantId") Long tenantId, @Param("studentId") String studentId);

    /**
     * 扣减：used += delta、remaining -= delta。允许 remaining 为负（欠课时）。
     * 调用前必须已 {@link #selectForUpdate} 锁行。
     */
    @InterceptorIgnore(tenantLine = "true")
    @Update("UPDATE student_lesson_balance"
            + " SET used_lessons = used_lessons + #{delta},"
            + "     remaining_lessons = remaining_lessons - #{delta},"
            + "     version = version + 1"
            + " WHERE tenant_id = #{tenantId} AND student_id = #{studentId}")
    int applyUsedDelta(@Param("tenantId") Long tenantId,
                       @Param("studentId") String studentId,
                       @Param("delta") BigDecimal delta);

    /** 退回/充值：total += delta、remaining += delta（delta 为负数时表示减少） */
    @InterceptorIgnore(tenantLine = "true")
    @Update("UPDATE student_lesson_balance"
            + " SET total_lessons = total_lessons + #{delta},"
            + "     remaining_lessons = remaining_lessons + #{delta},"
            + "     version = version + 1"
            + " WHERE tenant_id = #{tenantId} AND student_id = #{studentId}")
    int applyTotalDelta(@Param("tenantId") Long tenantId,
                        @Param("studentId") String studentId,
                        @Param("delta") BigDecimal delta);
}
