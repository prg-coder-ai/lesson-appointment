package com.reservation.service;

import com.reservation.common.PageResult;
import com.reservation.entity.StudentLessonBalance;
import com.reservation.entity.User;
import com.reservation.exception.ResourceNotFoundException;
import com.reservation.mapper.StudentLessonBalanceMapper;
import com.reservation.mapper.StudentLessonFlowMapper;
import com.reservation.mapper.UserMapper;
import com.reservation.vo.LessonBalanceVO;
import com.reservation.vo.LessonFlowVO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.List;

/**
 * 课时账本的**只读**查询服务（"我的课时"页面数据源）。
 *
 * <p>写入路径全部在 {@link LessonDeductionService}，本类只读，两者不要混：
 * 扣减涉及行锁与幂等键，一旦读路径也去写余额，很容易在展示页把账写坏。
 *
 * <p><b>租户口径</b>：账本的 {@code tenant_id} 是扣减时从课次上取的（不是从请求头取）。
 * 这里查询也用请求头里的 token 租户，两者在"学生只在自己租户上课"的前提下等价；
 * 若将来出现跨租户代课，需要改成按学生实际所属租户查。
 */
@Slf4j
@Service
public class LessonLedgerService {

    private final StudentLessonBalanceMapper balanceMapper;
    private final StudentLessonFlowMapper flowMapper;
    private final UserMapper userMapper;

    public LessonLedgerService(StudentLessonBalanceMapper balanceMapper,
                               StudentLessonFlowMapper flowMapper,
                               UserMapper userMapper) {
        this.balanceMapper = balanceMapper;
        this.flowMapper = flowMapper;
        this.userMapper = userMapper;
    }

    /**
     * 查某学生的课时账户。
     *
     * <p>没有账本记录时返回 {@code hasAccount=false} 的全零视图，**不抛异常**：
     * 学生的第一节课上完之前本来就没有账本，这不是错误状态。
     */
    public LessonBalanceVO getBalance(Long tenantId, String studentId) {
        long tid = tenantId == null ? 0L : tenantId;
        StudentLessonBalance balance = balanceMapper.selectByTenantStudent(tid, studentId);

        LessonBalanceVO vo = new LessonBalanceVO();
        vo.setStudentId(studentId);
        if (balance == null) {
            vo.setTotalLessons(BigDecimal.ZERO);
            vo.setUsedLessons(BigDecimal.ZERO);
            vo.setRemainingLessons(BigDecimal.ZERO);
            vo.setHasAccount(false);
            vo.setOwed(false);
            vo.setTip("暂无课时记录（首次上课后自动生成）");
            return vo;
        }
        BigDecimal total = nz(balance.getTotalLessons());
        BigDecimal used = nz(balance.getUsedLessons());
        BigDecimal remaining = nz(balance.getRemainingLessons());

        vo.setTotalLessons(total);
        vo.setUsedLessons(used);
        vo.setRemainingLessons(remaining);
        vo.setHasAccount(true);
        vo.setOwed(remaining.compareTo(BigDecimal.ZERO) < 0);
        vo.setTip(buildTip(remaining, vo.getOwed()));
        return vo;
    }

    /**
     * 盘示文案。放在后端而不是前端：课时为负要不要提示"补缴"是业务口径，
     * 前端各端（Web / 小程序 / 将来的 App）不该各写一套判断。
     */
    private String buildTip(BigDecimal remaining, boolean owed) {
        if (owed) {
            return "欠 " + remaining.abs().stripTrailingZeros().toPlainString() + " 课时，请联系管理员补缴";
        }
        if (remaining.compareTo(BigDecimal.ZERO) == 0) {
            return "课时已用完，请联系管理员充值";
        }
        return "剩余 " + remaining.stripTrailingZeros().toPlainString() + " 课时";
    }

    /** 学生流水分页（新的在前） */
    public PageResult<LessonFlowVO> pageFlows(Long tenantId, String studentId, int pageNum, int pageSize) {
        long tid = tenantId == null ? 0L : tenantId;
        int page = Math.max(pageNum, 1);
        int size = Math.min(Math.max(pageSize, 1), 100);
        int offset = (page - 1) * size;

        long total = flowMapper.countByStudent(tid, studentId);
        List<LessonFlowVO> rows = total == 0
                ? List.of()
                : flowMapper.pageByStudent(tid, studentId, offset, size);

        int totalPages = size == 0 ? 0 : (int) ((total + size - 1) / size);
        return new PageResult<>(rows, total, page, size, totalPages);
    }

    /**
     * 教师/管理员查看某学生账本前的归属校验。
     *
     * <p>用 {@code selectById} 而不是裸 SQL：租户插件会自动附加 {@code tenant_id} 条件，
     * 跨租户的 studentId 直接查不到 → 404，天然挡住越权（平台管理员 tenantId=0 时插件放行全量）。
     */
    public void assertStudentVisible(String studentId) {
        if (studentId == null || studentId.trim().isEmpty()) {
            throw new ResourceNotFoundException("学生不存在");
        }
        User u = userMapper.selectById(studentId);
        if (u == null) {
            throw new ResourceNotFoundException("学生不存在或不属于本机构");
        }
    }

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }
}
