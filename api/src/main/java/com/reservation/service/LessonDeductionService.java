package com.reservation.service;

import com.reservation.common.AppointmentStatus;
import com.reservation.entity.Appointment;
import com.reservation.entity.Booking;
import com.reservation.entity.StudentLessonBalance;
import com.reservation.entity.StudentLessonFlow;
import com.reservation.mapper.BookingMapper;
import com.reservation.mapper.StudentLessonBalanceMapper;
import com.reservation.mapper.StudentLessonFlowMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 课时扣减服务（2026-10-28，课时扣减方案 v2 第三节）。
 *
 * <h3>唯一规则：只看有没有请假</h3>
 * <ul>
 *   <li>请假族 / 教师取消 / 改期 / 冻结 → <b>0 课时</b>（判据见
 *       {@link AppointmentStatus#isLessonExempt}，勿在此重写字符串比较）；</li>
 *   <li>其余状态（含「全程没来」与「来了 3 分钟就走」）→ <b>1 课时</b>。</li>
 * </ul>
 * <b>与出席了多久完全无关</b>——这是用户 2026-10-28 的明确决策，不要"优化"成按时长分档。
 *
 * <h3>幂等</h3>
 * 靠 {@code student_lesson_flow.uk_slf_biz(tenant_id, biz_key)} 唯一键，键为
 * {@code classroom:{appointmentId}}。同一课次无论被课堂回调、重试还是兜底任务碰多少次，
 * 第二次插入撞键 → 内层事务整体回滚（余额一并回滚）→ 外层返回「已结算」。
 *
 * <h3>为什么用 TransactionTemplate 而不是 @Transactional</h3>
 * 需要「扣余额 + 写流水」原子，但**撞唯一键时不能让异常污染外层**。
 * 若在外层事务里 catch 住 DuplicateKeyException，Spring 已把事务标记 rollback-only，
 * 后续提交会抛 {@code UnexpectedRollbackException}；若不上抛又吞掉，余额就已经多扣了。
 * 分两层：内层 execute 回滚干净，外层安全地识别"这是幂等命中"。
 */
@Service
public class LessonDeductionService {

    private static final Logger log = LoggerFactory.getLogger(LessonDeductionService.class);

    /** 流水来源：课堂结算 */
    public static final String SOURCE_CLASSROOM = "classroom";
    /** 流水来源：请假退回 */
    public static final String SOURCE_LEAVE = "leave";
    /** 流水来源：人工调整 */
    public static final String SOURCE_MANUAL = "manual";

    private final StudentLessonBalanceMapper balanceMapper;
    private final StudentLessonFlowMapper flowMapper;
    private final BookingMapper bookingMapper;
    private final TransactionTemplate transactionTemplate;

    /** 每课次计扣课时（未请假时） */
    @Value("${lesson.deduction.per-class:1.0}")
    private BigDecimal perClassLessons;

    public LessonDeductionService(StudentLessonBalanceMapper balanceMapper,
                                  StudentLessonFlowMapper flowMapper,
                                  BookingMapper bookingMapper,
                                  PlatformTransactionManager transactionManager) {
        this.balanceMapper = balanceMapper;
        this.flowMapper = flowMapper;
        this.bookingMapper = bookingMapper;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
    }

    /**
     * 结算一个课次：没请假就扣 1 课时并减余量。
     *
     * <p>调用方（课堂回调 / 兜底任务）不需要自己判请假，也不要自己判是否已扣过——本方法全包。
     *
     * @param appointment 课次（必须含 id / bookingId / status）
     * @return 结算结果；{@code deducted=false} 时看 {@code exempt} / {@code duplicate} 区分原因
     */
    public DeductResult settleByAppointment(Appointment appointment) {
        if (appointment == null || appointment.getId() == null) {
            throw new IllegalArgumentException("课时结算缺少课次或课次ID");
        }
        Long tenantId = appointment.getTenantId() == null ? 0L : appointment.getTenantId();
        String bizKey = classroomBizKey(appointment.getId());

        // 1. 请假族 / 教师取消 / 改期 / 冻结 → 免扣。不写流水（写 0 会占住 bizKey，
        //    导致「请假被驳回后补扣」永远插不进去）。
        if (AppointmentStatus.isLessonExempt(appointment.getStatus())) {
            log.info("课次免扣课时(状态={}): appointmentId={}, tenantId={}",
                    appointment.getStatus(), appointment.getId(), tenantId);
            return DeductResult.exempt(appointment.getId());
        }

        // 2. 快路径幂等：已结算过直接返回（避免每次重试都进事务）
        if (flowMapper.countByBizKey(tenantId, bizKey) > 0) {
            log.info("课次已结算，跳过重复扣减: appointmentId={}, bizKey={}", appointment.getId(), bizKey);
            return DeductResult.duplicate(appointment.getId());
        }

        // 3. 归户：学生从 booking 取（appointment 只有 booking_id）。
        //    必须走 IgnoreTenant —— 回调线程没有 TenantContext，插件会拼 tenant_id=-1 查不到。
        Booking booking = bookingMapper.selectByIdIgnoreTenant(appointment.getBookingId());
        if (booking == null) {
            throw new IllegalArgumentException("课次无法归户，预订不存在: bookingId=" + appointment.getBookingId());
        }
        String studentId = booking.getStudentId();
        if (studentId == null || studentId.trim().isEmpty()) {
            throw new IllegalArgumentException("预订缺少学生ID: bookingId=" + booking.getBookingId());
        }

        BigDecimal delta = perClassLessons == null ? BigDecimal.ONE : perClassLessons;

        try {
            BigDecimal remainingAfter = transactionTemplate.execute(status ->
                    doDeductInTx(appointment, tenantId, studentId, booking.getBookingId(), delta, bizKey));
            log.info("课时已扣减: appointmentId={}, studentId={}, tenantId={}, 扣减={}, 余量={}",
                    appointment.getId(), studentId, tenantId, delta, remainingAfter);
            return DeductResult.deducted(appointment.getId(), delta, remainingAfter);
        } catch (DuplicateKeyException e) {
            // 并发下另一线程抢先结算：内层事务已整体回滚（余额没动），此处按幂等成功处理
            log.info("课时结算并发命中，按已结算处理: appointmentId={}, bizKey={}", appointment.getId(), bizKey);
            return DeductResult.duplicate(appointment.getId());
        }
    }

    /**
     * 事务内：锁余额行 → 扣减 → 写流水。任一步失败整体回滚。
     *
     * @return 变动后的剩余课时
     */
    private BigDecimal doDeductInTx(Appointment appointment, Long tenantId, String studentId,
                                    String bookingId, BigDecimal delta, String bizKey) {
        // 账户不存在则先建（total=0，允许负余额=欠课时）
        balanceMapper.insertIfAbsent(tenantId, studentId);
        StudentLessonBalance balance = balanceMapper.selectForUpdate(tenantId, studentId);
        if (balance == null) {
            // insertIfAbsent 之后仍取不到，说明并发删/租户写错，不能静默跳过
            throw new IllegalStateException("课时余额行不存在: tenantId=" + tenantId + ", studentId=" + studentId);
        }

        int affected = balanceMapper.applyUsedDelta(tenantId, studentId, delta);
        if (affected <= 0) {
            throw new IllegalStateException("课时余额扣减失败(影响 0 行): studentId=" + studentId);
        }

        BigDecimal before = balance.getRemainingLessons() == null ? BigDecimal.ZERO : balance.getRemainingLessons();
        BigDecimal remainingAfter = before.subtract(delta);

        StudentLessonFlow flow = new StudentLessonFlow();
        flow.setTenantId(tenantId);
        flow.setFlowId(UUID.randomUUID().toString().replace("-", ""));
        flow.setStudentId(studentId);
        flow.setBookingId(bookingId);
        flow.setScheduleId(null);
        flow.setClassIndex(appointment.getClassIndex());
        flow.setAppointmentId(appointment.getId());
        flow.setChangeLessons(delta.negate());
        flow.setRemainingAfter(remainingAfter);
        flow.setSource(SOURCE_CLASSROOM);
        flow.setBizKey(bizKey);
        flow.setReason("课堂结算（未请假，按课时扣减）");
        flow.setCreateTime(LocalDateTime.now());
        // 撞 uk_slf_biz → DuplicateKeyException → 整个事务回滚（余额一并回滚）
        flowMapper.insertExplicit(flow);

        if (remainingAfter.compareTo(BigDecimal.ZERO) < 0) {
            log.warn("学生课时余额为负(欠课时): tenantId={}, studentId={}, remaining={}",
                    tenantId, studentId, remainingAfter);
        }
        return remainingAfter;
    }

    /** 课堂结算的幂等键 */
    public static String classroomBizKey(Integer appointmentId) {
        return "classroom:" + appointmentId;
    }

    /** 请假退回的幂等键 */
    public static String leaveBizKey(Integer appointmentId) {
        return "leave:" + appointmentId;
    }

    /**
     * 人工调整（运营补录课时 / 改判补扣）。{@code bizKey} 由调用方给，
     * 保证「同一次调整」重复提交不会翻倍。
     *
     * @param delta 正数=加课时，负数=减课时
     */
    public DeductResult manualAdjust(Long tenantId, String studentId, BigDecimal delta,
                                     String reason, String operatorId, String bizKey) {
        if (delta == null || delta.compareTo(BigDecimal.ZERO) == 0) {
            throw new IllegalArgumentException("调整课时不能为 0");
        }
        if (reason == null || reason.trim().isEmpty()) {
            throw new IllegalArgumentException("人工调整必须填写原因");
        }
        String key = (bizKey == null || bizKey.trim().isEmpty()) ? "manual:" + UUID.randomUUID() : bizKey;
        try {
            BigDecimal after = transactionTemplate.execute(status -> {
                balanceMapper.insertIfAbsent(tenantId, studentId);
                StudentLessonBalance balance = balanceMapper.selectForUpdate(tenantId, studentId);
                if (balance == null) throw new IllegalStateException("课时余额行不存在: " + studentId);
                balanceMapper.applyTotalDelta(tenantId, studentId, delta);

                BigDecimal before = balance.getRemainingLessons() == null ? BigDecimal.ZERO : balance.getRemainingLessons();
                BigDecimal remainingAfter = before.add(delta);

                StudentLessonFlow flow = new StudentLessonFlow();
                flow.setTenantId(tenantId);
                flow.setFlowId(UUID.randomUUID().toString().replace("-", ""));
                flow.setStudentId(studentId);
                flow.setChangeLessons(delta);
                flow.setRemainingAfter(remainingAfter);
                flow.setSource(SOURCE_MANUAL);
                flow.setBizKey(key);
                flow.setReason(reason);
                flow.setOperatorId(operatorId);
                flow.setCreateTime(LocalDateTime.now());
                flowMapper.insertExplicit(flow);
                return remainingAfter;
            });
            return DeductResult.deducted(null, delta, after);
        } catch (DuplicateKeyException e) {
            return DeductResult.duplicate(null);
        }
    }

    /** 结算结果 */
    public static class DeductResult {
        /** 本次是否真的扣/退了 */
        public boolean deducted;
        /** 是否因请假族而免扣 */
        public boolean exempt;
        /** 是否命中幂等（已结算过） */
        public boolean duplicate;
        public Integer appointmentId;
        public BigDecimal change;
        public BigDecimal remainingAfter;

        static DeductResult deducted(Integer apptId, BigDecimal change, BigDecimal remainingAfter) {
            DeductResult r = new DeductResult();
            r.deducted = true;
            r.appointmentId = apptId;
            r.change = change == null ? BigDecimal.ZERO : change.negate();
            r.remainingAfter = remainingAfter;
            return r;
        }

        static DeductResult exempt(Integer apptId) {
            DeductResult r = new DeductResult();
            r.exempt = true;
            r.appointmentId = apptId;
            r.change = BigDecimal.ZERO;
            return r;
        }

        static DeductResult duplicate(Integer apptId) {
            DeductResult r = new DeductResult();
            r.duplicate = true;
            r.appointmentId = apptId;
            r.change = BigDecimal.ZERO;
            return r;
        }
    }
}
