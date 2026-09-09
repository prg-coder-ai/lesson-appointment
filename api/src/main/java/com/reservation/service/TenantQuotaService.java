package com.reservation.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.reservation.dto.TenantUsageDTO;
import com.reservation.entity.Booking;
import com.reservation.entity.Course;
import com.reservation.entity.CourseSchedule;
import com.reservation.entity.PackageTemplate;
import com.reservation.entity.Tenant;
import com.reservation.entity.TenantPackage;
import com.reservation.entity.TenantStatsMonthly;
import com.reservation.entity.TeacherPublishedProfile;
import com.reservation.entity.User;
import com.reservation.exception.BusinessException;
import com.reservation.exception.ResourceNotFoundException;
import com.reservation.mapper.BookingMapper;
import com.reservation.mapper.CourseMapper;
import com.reservation.mapper.CourseScheduleMapper;
import com.reservation.mapper.TeacherPublishedProfileMapper;
import com.reservation.mapper.TenantMapper;
import com.reservation.mapper.TenantPackageMapper;
import com.reservation.mapper.TenantStatsMonthlyMapper;
import com.reservation.mapper.UserMapper;
import com.reservation.utils.TenantContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 租户额度服务
 *
 * 数据模型：
 *   套餐模板 sys_package_template —— 规格定义（只有限额）
 *   租户套餐 sys_tenant_package   —— 某租户实际持有的套餐（限额 + 当前数量，一租户一条）
 *   sys_tenant.package_id         —— 租户选用的「套餐模板ID」
 *
 * 职责划分：
 *   TenantPackageService  —— 租户套餐的 CRUD 与额度的原子增减（tryAcquire / release）
 *   TenantQuotaService    —— 面向业务的额度入口：占用/释放/换模板校验/用量统计/对账
 */
@Service
public class TenantQuotaService {

    private static final Logger log = LoggerFactory.getLogger(TenantQuotaService.class);

    /** 额度类型（复用 TenantPackageService 的定义，避免两份枚举） */
    public static final TenantPackageService.QuotaType COURSE = TenantPackageService.QuotaType.COURSE;
    public static final TenantPackageService.QuotaType SCHEDULE = TenantPackageService.QuotaType.SCHEDULE;
    public static final TenantPackageService.QuotaType USER = TenantPackageService.QuotaType.USER;
    public static final TenantPackageService.QuotaType TEACHER = TenantPackageService.QuotaType.TEACHER;
    public static final TenantPackageService.QuotaType STUDENT = TenantPackageService.QuotaType.STUDENT;
    public static final TenantPackageService.QuotaType TEACHER_PUBLISH = TenantPackageService.QuotaType.TEACHER_PUBLISH;

    @Autowired
    private TenantPackageService tenantPackageService;
    @Autowired
    private PackageTemplateService packageTemplateService;
    @Autowired
    private TenantService tenantService;
    @Autowired
    private TenantPackageMapper tenantPackageMapper;
    @Autowired
    private TenantMapper tenantMapper;
    @Autowired
    private CourseMapper courseMapper;
    @Autowired
    private CourseScheduleMapper courseScheduleMapper;
    @Autowired
    private UserMapper userMapper;
    @Autowired
    private BookingMapper bookingMapper;
    @Autowired
    private TeacherPublishedProfileMapper teacherPublishedProfileMapper;
    @Autowired
    private TenantStatsMonthlyMapper tenantStatsMonthlyMapper;
    @Autowired
    private SysConfigService sysConfigService;

    /**
     * 取租户自己的套餐；未配置套餐返回 null，表示不限额
     */
    public TenantPackage getPackageOfTenant(Long tenantId) {
        if (tenantId == null || tenantId <= 0) {
            return null;
        }
        return tenantPackageService.getByTenantId(tenantId);
    }

    /**
     * 取租户选用的套餐模板
     */
    public PackageTemplate getTemplateOfTenant(Long tenantId) {
        Tenant tenant = tenantService.getById(tenantId);
        if (tenant == null || tenant.getPackageId() == null || tenant.getPackageId() <= 0) {
            return null;
        }
        return packageTemplateService.getById(tenant.getPackageId());
    }

    // ==================== 业务侧额度入口 ====================

    /**
     * 占用额度（新增业务数据时调用），超限直接抛业务异常
     */
    public void acquire(Long tenantId, TenantPackageService.QuotaType type) {
        acquire(tenantId, type, 1);
    }

    public void acquire(Long tenantId, TenantPackageService.QuotaType type, int delta) {
        if (!tenantPackageService.tryAcquire(tenantId, type, delta)) {
            throw new BusinessException(type.getLabel() + "数量已达套餐上限，请联系管理员升级套餐");
        }
    }

    /**
     * 释放额度（删除业务数据时调用）
     */
    public void release(Long tenantId, TenantPackageService.QuotaType type) {
        release(tenantId, type, 1);
    }

    public void release(Long tenantId, TenantPackageService.QuotaType type, int delta) {
        tenantPackageService.release(tenantId, type, delta);
    }

    // ==================== 变更套餐 ====================

    /**
     * 变更租户套餐模板：套用模板限额 + 更新 sys_tenant.package_id
     * 降级时若已用量超出新模板限额则拒绝
     */
    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public Long switchTemplate(Long tenantId, Long templateId) {
        PackageTemplate template = packageTemplateService.getById(templateId);
        if (template == null) {
            throw new ResourceNotFoundException("指定的套餐模板不存在");
        }
        TenantPackage pkg = tenantPackageService.getByTenantId(tenantId);
        if (pkg == null) {
            // 尚无套餐记录时直接按模板创建
            return tenantPackageService.createFromTemplate(tenantId, templateId);
        }
        validateAgainstTemplate(tenantId, template);

        packageTemplateService.applyLimitsTo(template, pkg);
        // 只更新限额，不触碰当前数量
        TenantPackage update = new TenantPackage();
        update.setId(pkg.getId());
        update.setTenantId(pkg.getTenantId());
        update.setCourseLimit(pkg.getCourseLimit());
        update.setScheduleLimit(pkg.getScheduleLimit());
        update.setUserTotalLimit(pkg.getUserTotalLimit());
        update.setTeacherLimit(pkg.getTeacherLimit());
        update.setStudentLimit(pkg.getStudentLimit());
        update.setTeacherPublishLimit(pkg.getTeacherPublishLimit());
        tenantPackageMapper.updateById(update);

        tenantService.changePackage(tenantId, templateId);
        log.info("租户变更套餐模板, tenantId={}, templateId={}", tenantId, templateId);
        return pkg.getId();
    }

    /**
     * 校验：目标模板的限额能否容纳当前已用量
     */
    public void validateAgainstTemplate(Long tenantId, PackageTemplate template) {
        check(template.getCourseLimit(), countUsage(tenantId, COURSE), COURSE);
        check(template.getScheduleLimit(), countUsage(tenantId, SCHEDULE), SCHEDULE);
        check(template.getUserTotalLimit(), countUsage(tenantId, USER), USER);
        check(template.getTeacherLimit(), countUsage(tenantId, TEACHER), TEACHER);
        check(template.getStudentLimit(), countUsage(tenantId, STUDENT), STUDENT);
        check(template.getTeacherPublishLimit(), countUsage(tenantId, TEACHER_PUBLISH), TEACHER_PUBLISH);
    }

    private void check(Integer limit, int current, TenantPackageService.QuotaType type) {
        if (limit == null || limit <= 0) {
            return; // 0 = 不限
        }
        if (current > limit) {
            throw new BusinessException("无法降级：当前" + type.getLabel() + "用量 " + current
                    + " 已超出目标套餐限额 " + limit);
        }
    }

    // ==================== 用量统计（实时，用于展示与对账） ====================

    public int countUsage(Long tenantId, TenantPackageService.QuotaType type) {
        if (tenantId == null) {
            return 0;
        }
        switch (type) {
            case COURSE -> {
                LambdaQueryWrapper<Course> w = new LambdaQueryWrapper<>();
                w.eq(Course::getTenantId, tenantId);
                return count(courseMapper, w);
            }
            case SCHEDULE -> {
                LambdaQueryWrapper<CourseSchedule> w = new LambdaQueryWrapper<>();
                w.eq(CourseSchedule::getTenantId, tenantId);
                return count(courseScheduleMapper, w);
            }
            case USER -> {
                LambdaQueryWrapper<User> w = new LambdaQueryWrapper<>();
                w.eq(User::getTenantId, tenantId);
                return count(userMapper, w);
            }
            case TEACHER -> {
                return countActiveByRole(tenantId, "teacher");
            }
            case STUDENT -> {
                return countActiveByRole(tenantId, "student");
            }
            case TEACHER_PUBLISH -> {
                return countPublished(tenantId);
            }
        }
        return 0;
    }

    public int countBooking(Long tenantId) {
        LambdaQueryWrapper<Booking> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Booking::getTenantId, tenantId);
        Long count = bookingMapper.selectCount(wrapper);
        return count == null ? 0 : count.intValue();
    }

    private int countActiveByRole(Long tenantId, String role) {
        LambdaQueryWrapper<User> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(User::getTenantId, tenantId)
               .eq(User::getRole, role)
               .eq(User::getStatus, "active");
        Long count = userMapper.selectCount(wrapper);
        return count == null ? 0 : count.intValue();
    }

    /**
     * 教师信息发布数（已归档的不计入占用）
     */
    private int countPublished(Long tenantId) {
        LambdaQueryWrapper<TeacherPublishedProfile> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(TeacherPublishedProfile::getTenantId, tenantId)
               .ne(TeacherPublishedProfile::getStatus, "archived");
        Long count = teacherPublishedProfileMapper.selectCount(wrapper);
        return count == null ? 0 : count.intValue();
    }

    private <T> int count(com.baomidou.mybatisplus.core.mapper.BaseMapper<T> mapper,
                          LambdaQueryWrapper<T> wrapper) {
        Long count = mapper.selectCount(wrapper);
        return count == null ? 0 : count.intValue();
    }

    // ==================== 运行管理：用量视图 ====================

    /**
     * 租户用量与额度占比
     * 用量取实时统计值（真实），限额取租户套餐记录
     */
    public TenantUsageDTO getUsage(Long tenantId) {
        Tenant tenant = tenantService.getById(tenantId);
        TenantUsageDTO dto = new TenantUsageDTO();
        if (tenant == null) {
            return dto;
        }
        TenantPackage pkg = getPackageOfTenant(tenantId);
        int warn = sysConfigService.getInt(SysConfigService.KEY_QUOTA_WARN, 80);
        int danger = sysConfigService.getInt(SysConfigService.KEY_QUOTA_DANGER, 95);

        dto.setTenantId(tenant.getId());
        dto.setTenantCode(tenant.getTenantCode());
        dto.setOrgName(tenant.getOrgName());
        dto.setPackageId(tenant.getPackageId());

        fill(dto, COURSE, pkg, countUsage(tenantId, COURSE));
        fill(dto, SCHEDULE, pkg, countUsage(tenantId, SCHEDULE));
        fill(dto, USER, pkg, countUsage(tenantId, USER));
        fill(dto, TEACHER, pkg, countUsage(tenantId, TEACHER));
        fill(dto, STUDENT, pkg, countUsage(tenantId, STUDENT));
        fill(dto, TEACHER_PUBLISH, pkg, countUsage(tenantId, TEACHER_PUBLISH));

        dto.setBookingCount(countBooking(tenantId));
        dto.setQuotaLevel(pkg == null ? "unlimited" : "normal");

        int maxPercent = maxOf(dto.getCoursePercent(), dto.getSchedulePercent(), dto.getUserPercent(),
                dto.getTeacherPercent(), dto.getStudentPercent(), dto.getTeacherPublishPercent());
        if (pkg != null) {
            if (maxPercent >= danger) {
                dto.setQuotaLevel("danger");
            } else if (maxPercent >= warn) {
                dto.setQuotaLevel("warn");
            }
        }
        return dto;
    }

    private void fill(TenantUsageDTO dto, TenantPackageService.QuotaType type, TenantPackage pkg, int current) {
        int limit = pkg == null ? 0 : limitOf(pkg, type);
        int percent = (limit <= 0 || current == 0) ? 0 : Math.min(999, (int) Math.round(current * 100.0 / limit));
        switch (type) {
            case COURSE -> {
                dto.setCourseCount(current);
                dto.setCourseLimit(limit);
                dto.setCoursePercent(percent);
            }
            case SCHEDULE -> {
                dto.setScheduleCount(current);
                dto.setScheduleLimit(limit);
                dto.setSchedulePercent(percent);
            }
            case USER -> {
                dto.setUserCount(current);
                dto.setUserLimit(limit);
                dto.setUserPercent(percent);
            }
            case TEACHER -> {
                dto.setTeacherCount(current);
                dto.setTeacherLimit(limit);
                dto.setTeacherPercent(percent);
            }
            case STUDENT -> {
                dto.setStudentCount(current);
                dto.setStudentLimit(limit);
                dto.setStudentPercent(percent);
            }
            case TEACHER_PUBLISH -> {
                dto.setTeacherPublishCount(current);
                dto.setTeacherPublishLimit(limit);
                dto.setTeacherPublishPercent(percent);
            }
        }
    }

    private int limitOf(TenantPackage pkg, TenantPackageService.QuotaType type) {
        Integer limit = switch (type) {
            case COURSE -> pkg.getCourseLimit();
            case SCHEDULE -> pkg.getScheduleLimit();
            case USER -> pkg.getUserTotalLimit();
            case TEACHER -> pkg.getTeacherLimit();
            case STUDENT -> pkg.getStudentLimit();
            case TEACHER_PUBLISH -> pkg.getTeacherPublishLimit();
        };
        return limit == null ? 0 : limit;
    }

    private int maxOf(Integer... values) {
        int max = 0;
        if (values != null) {
            for (Integer v : values) {
                if (v != null && v > max) {
                    max = v;
                }
            }
        }
        return max;
    }

    // ==================== 对账与快照 ====================

    /**
     * 对账：把租户套餐的当前数量校正为实际统计值（防止并发异常、手工改库导致漂移）
     *
     * @return true=存在偏差并已校正
     */
    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public boolean reconcile(Long tenantId) {
        TenantPackage pkg = getPackageOfTenant(tenantId);
        if (pkg == null) {
            return false;
        }
        TenantPackage update = new TenantPackage();
        update.setId(pkg.getId());
        boolean changed = false;
        for (TenantPackageService.QuotaType type : TenantPackageService.QuotaType.values()) {
            int real = countUsage(tenantId, type);
            int cur = currentOf(pkg, type);
            if (real != cur) {
                log.warn("套餐额度对账发现偏差, tenantId={}, type={}, 记录值={}, 实际值={}",
                        tenantId, type.getLabel(), cur, real);
                changed = true;
            }
            setCurrent(update, type, real);
        }
        if (changed) {
            tenantPackageMapper.updateById(update);
        }
        return changed;
    }

    /**
     * 全量对账（定时任务调用）
     */
    public int reconcileAll() {
        LambdaQueryWrapper<Tenant> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Tenant::getDeleted, 0);
        List<Tenant> tenants = tenantMapper.selectList(wrapper);
        if (tenants == null || tenants.isEmpty()) {
            return 0;
        }
        int fixed = 0;
        for (Tenant tenant : tenants) {
            // 定时任务无 HTTP 上下文，需显式设置租户上下文，
            // 否则租户插件会按兜底值拼接条件，导致统计恒为 0（进而把额度误清零）
            TenantContext.setTenantId(tenant.getId());
            try {
                if (reconcile(tenant.getId())) {
                    fixed++;
                }
            } catch (Exception e) {
                log.warn("租户额度对账失败, tenantId={}, 原因={}", tenant.getId(), e.getMessage());
            } finally {
                TenantContext.clear();
            }
        }
        if (fixed > 0) {
            log.info("套餐额度对账完成, 校正租户数={}", fixed);
        }
        return fixed;
    }

    private int currentOf(TenantPackage pkg, TenantPackageService.QuotaType type) {
        Integer value = switch (type) {
            case COURSE -> pkg.getCourseCurrent();
            case SCHEDULE -> pkg.getScheduleCurrent();
            case USER -> pkg.getUserCurrent();
            case TEACHER -> pkg.getTeacherCurrent();
            case STUDENT -> pkg.getStudentCurrent();
            case TEACHER_PUBLISH -> pkg.getTeacherPublishCurrent();
        };
        return value == null ? 0 : value;
    }

    private void setCurrent(TenantPackage pkg, TenantPackageService.QuotaType type, int value) {
        switch (type) {
            case COURSE -> pkg.setCourseCurrent(value);
            case SCHEDULE -> pkg.setScheduleCurrent(value);
            case USER -> pkg.setUserCurrent(value);
            case TEACHER -> pkg.setTeacherCurrent(value);
            case STUDENT -> pkg.setStudentCurrent(value);
            case TEACHER_PUBLISH -> pkg.setTeacherPublishCurrent(value);
        }
    }

    /**
     * 构建租户月度用量快照
     */
    public TenantStatsMonthly buildMonthlySnapshot(Long tenantId, String month) {
        TenantStatsMonthly stat = new TenantStatsMonthly();
        stat.setTenantId(tenantId);
        stat.setStatMonth(month);
        stat.setCourseCount(countUsage(tenantId, COURSE));
        stat.setScheduleCount(countUsage(tenantId, SCHEDULE));
        stat.setTeacherCount(countActiveByRole(tenantId, "teacher"));
        stat.setStudentCount(countActiveByRole(tenantId, "student"));
        stat.setBookingCount(countBooking(tenantId));
        stat.setCreateTime(LocalDateTime.now());
        return stat;
    }

    public TenantStatsMonthly getSnapshot(Long tenantId, String month) {
        if (tenantId == null || month == null) {
            return null;
        }
        LambdaQueryWrapper<TenantStatsMonthly> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(TenantStatsMonthly::getTenantId, tenantId)
               .eq(TenantStatsMonthly::getStatMonth, month);
        return tenantStatsMonthlyMapper.selectOne(wrapper);
    }

    /**
     * 取上月快照，用于计算环比
     */
    public TenantStatsMonthly getLastMonthSnapshot(Long tenantId, String currentMonth) {
        return getSnapshot(tenantId, previousMonth(currentMonth));
    }

    public static String previousMonth(String month) {
        java.time.YearMonth ym = java.time.YearMonth.parse(month);
        return ym.minusMonths(1).toString();
    }

    public static String currentMonth() {
        return java.time.YearMonth.now().toString();
    }
}
