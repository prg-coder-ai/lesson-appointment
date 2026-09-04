package com.reservation.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.reservation.common.PageResult;
import com.reservation.entity.TenantPackage;
import com.reservation.exception.BusinessException;
import com.reservation.exception.ResourceNotFoundException;
import com.reservation.mapper.TenantPackageMapper;
import com.reservation.query.TenantPackageQueryPage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collections;
import java.util.List;

/**
 * 租户套餐服务，对应表 sys_tenant_package
 *
 * 定位：一个租户一条套餐记录（tenant_id 必填且唯一），
 *      限额通常从套餐模板（sys_package_template）套用，当前数量由业务增/删时实时增减。
 *
 * 与套餐模板的区别：
 *   套餐模板（sys_package_template）—— 规格定义，只描述限额，无租户信息；
 *   租户套餐（sys_tenant_package）—— 某租户实际持有的套餐，限额 + 当前用量。
 */
@Service
public class TenantPackageService {

    private static final Logger log = LoggerFactory.getLogger(TenantPackageService.class);

    @Autowired
    private TenantPackageMapper tenantPackageMapper;

    @Autowired
    private TenantService tenantService;

    @Autowired
    private PackageTemplateService packageTemplateService;

    /**
     * 创建租户套餐（一租户仅一条）
     */
    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public Long insertPackage(TenantPackage pkg) {
        if (pkg.getTenantId() == null) {
            throw new BusinessException("租户ID不能为空");
        }
        if (tenantService.getById(pkg.getTenantId()) == null) {
            throw new ResourceNotFoundException("指定租户不存在");
        }
        if (getByTenantId(pkg.getTenantId()) != null) {
            throw new BusinessException("该租户已存在套餐记录，请直接修改");
        }
        // 当前数量初始为 0，限额缺省按 0（不限）处理
        resetCurrent(pkg);
        defaultLimit(pkg);

        tenantPackageMapper.insert(pkg);
        log.info("创建租户套餐, tenantId={}, packageId={}", pkg.getTenantId(), pkg.getId());
        return pkg.getId();
    }

    /**
     * 按套餐模板为租户创建套餐（租户首次开通时使用）
     */
    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public Long createFromTemplate(Long tenantId, Long templateId) {
        if (tenantId == null) {
            throw new BusinessException("租户ID不能为空");
        }
        if (tenantService.getById(tenantId) == null) {
            throw new ResourceNotFoundException("指定租户不存在");
        }
        TenantPackage exist = getByTenantId(tenantId);
        if (exist != null) {
            throw new BusinessException("该租户已存在套餐记录，如需换模板请使用「变更套餐」");
        }
        TenantPackage pkg = new TenantPackage();
        pkg.setTenantId(tenantId);
        resetCurrent(pkg);
        defaultLimit(pkg);
        if (templateId != null && templateId > 0) {
            com.reservation.entity.PackageTemplate template = packageTemplateService.getById(templateId);
            if (template == null) {
                throw new ResourceNotFoundException("指定的套餐模板不存在");
            }
            packageTemplateService.applyLimitsTo(template, pkg);
        }
        tenantPackageMapper.insert(pkg);
        log.info("按模板创建租户套餐, tenantId={}, templateId={}, packageId={}", tenantId, templateId, pkg.getId());
        return pkg.getId();
    }

    /**
     * 修改租户套餐限额，不允许变更租户归属与当前数量
     */
    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public Long updatePackage(TenantPackage pkg) {
        if (pkg.getId() == null) {
            throw new BusinessException("套餐ID不能为空");
        }
        TenantPackage exist = tenantPackageMapper.selectById(pkg.getId());
        if (exist == null) {
            throw new ResourceNotFoundException("待修改的套餐记录不存在");
        }
        if (pkg.getTenantId() != null && !pkg.getTenantId().equals(exist.getTenantId())) {
            throw new BusinessException("不允许变更套餐所属租户");
        }
        pkg.setTenantId(exist.getTenantId());
        pkg.setCourseCurrent(exist.getCourseCurrent());
        pkg.setScheduleCurrent(exist.getScheduleCurrent());
        pkg.setUserCurrent(exist.getUserCurrent());
        pkg.setTeacherCurrent(exist.getTeacherCurrent());
        pkg.setStudentCurrent(exist.getStudentCurrent());
        pkg.setTeacherPublishCurrent(exist.getTeacherPublishCurrent());
        if (pkg.getCourseLimit() == null) pkg.setCourseLimit(exist.getCourseLimit());
        if (pkg.getScheduleLimit() == null) pkg.setScheduleLimit(exist.getScheduleLimit());
        if (pkg.getUserTotalLimit() == null) pkg.setUserTotalLimit(exist.getUserTotalLimit());
        if (pkg.getTeacherLimit() == null) pkg.setTeacherLimit(exist.getTeacherLimit());
        if (pkg.getStudentLimit() == null) pkg.setStudentLimit(exist.getStudentLimit());
        if (pkg.getTeacherPublishLimit() == null) pkg.setTeacherPublishLimit(exist.getTeacherPublishLimit());

        tenantPackageMapper.updateById(pkg);
        log.info("修改租户套餐, packageId={}, tenantId={}", pkg.getId(), exist.getTenantId());
        return pkg.getId();
    }

    /**
     * 删除租户套餐（删除后该租户视为不限额）
     */
    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public int deletePackage(Long id) {
        if (id == null) {
            throw new BusinessException("套餐ID不能为空");
        }
        log.info("删除租户套餐, packageId={}", id);
        return tenantPackageMapper.deleteById(id);
    }

    public TenantPackage getById(Long id) {
        return tenantPackageMapper.selectById(id);
    }

    /**
     * 按租户ID查询套餐（额度校验入口）
     */
    public TenantPackage getByTenantId(Long tenantId) {
        if (tenantId == null) {
            return null;
        }
        LambdaQueryWrapper<TenantPackage> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(TenantPackage::getTenantId, tenantId);
        return tenantPackageMapper.selectOne(wrapper);
    }

    public PageResult<TenantPackage> getPackageListByPage(TenantPackageQueryPage query) {
        LambdaQueryWrapper<TenantPackage> wrapper = new LambdaQueryWrapper<>();
        wrapper.orderByAsc(TenantPackage::getId);

        Page<TenantPackage> page = new Page<>(query.getPageNum(), query.getPageSize());
        Page<TenantPackage> result = tenantPackageMapper.selectPage(page, wrapper);
        return PageResult.of(result);
    }

    public List<TenantPackage> listAll() {
        List<TenantPackage> list = tenantPackageMapper.selectList(null);
        return list == null ? Collections.emptyList() : list;
    }

    // ==================== 额度占用/释放（业务侧调用） ====================

    /**
     * 额度类型枚举：currentColumn=当前数量列，limitColumn=限额列，label=业务名称
     * 列名由枚举内部常量提供（非用户输入），无注入风险
     */
    public enum QuotaType {
        COURSE("course_current", "course_limit", "课程"),
        SCHEDULE("schedule_current", "schedule_limit", "排期"),
        USER("user_current", "user_total_limit", "注册用户"),
        TEACHER("teacher_current", "teacher_limit", "注册教师"),
        STUDENT("student_current", "student_limit", "注册学生"),
        TEACHER_PUBLISH("teacher_publish_current", "teacher_publish_limit", "教师信息发布");

        final String currentColumn;
        final String limitColumn;
        final String label;

        QuotaType(String currentColumn, String limitColumn, String label) {
            this.currentColumn = currentColumn;
            this.limitColumn = limitColumn;
            this.label = label;
        }

        public String getLabel() {
            return label;
        }
    }

    /**
     * 尝试占用额度（原子操作，条件 UPDATE 保证并发安全）
     * 约定：tenantId 为空或 0（平台）不限额；租户未配置套餐记录视为不限额
     *
     * @return true=占用成功（或无需限额）；false=已达套餐上限
     */
    public boolean tryAcquire(Long tenantId, QuotaType type) {
        return tryAcquire(tenantId, type, 1);
    }

    public boolean tryAcquire(Long tenantId, QuotaType type, int delta) {
        if (tenantId == null || tenantId <= 0 || delta <= 0) {
            return true; // 平台/未识别租户不限额
        }
        if (getByTenantId(tenantId) == null) {
            return true; // 未配置套餐 = 不限额
        }
        String cur = type.currentColumn;
        String lim = type.limitColumn;
        UpdateWrapper<TenantPackage> uw = new UpdateWrapper<>();
        uw.setSql(cur + " = " + cur + " + {0}", delta)
          .eq("tenant_id", tenantId)
          .apply("(" + lim + " = 0 OR " + cur + " + {0} <= " + lim + ")", delta);
        int rows = tenantPackageMapper.update(null, uw);
        if (rows == 0) {
            log.info("额度占用被拒, tenantId={}, type={}, delta={}", tenantId, type.getLabel(), delta);
        }
        return rows > 0;
    }

    /**
     * 释放额度（删除业务数据时调用），当前数量不为负
     * tenantId 为空或 0、无套餐记录时静默跳过
     */
    public void release(Long tenantId, QuotaType type) {
        release(tenantId, type, 1);
    }

    public void release(Long tenantId, QuotaType type, int delta) {
        if (tenantId == null || tenantId <= 0 || delta <= 0) {
            return;
        }
        if (getByTenantId(tenantId) == null) {
            return;
        }
        String cur = type.currentColumn;
        UpdateWrapper<TenantPackage> uw = new UpdateWrapper<>();
        uw.setSql(cur + " = " + cur + " - {0}", delta)
          .eq("tenant_id", tenantId)
          .apply(cur + " >= {0}", delta);
        int rows = tenantPackageMapper.update(null, uw);
        if (rows > 0) {
            log.info("释放额度, tenantId={}, type={}, delta={}", tenantId, type.getLabel(), delta);
        }
    }

    private void resetCurrent(TenantPackage pkg) {
        pkg.setCourseCurrent(0);
        pkg.setScheduleCurrent(0);
        pkg.setUserCurrent(0);
        pkg.setTeacherCurrent(0);
        pkg.setStudentCurrent(0);
        pkg.setTeacherPublishCurrent(0);
    }

    private void defaultLimit(TenantPackage pkg) {
        if (pkg.getCourseLimit() == null) pkg.setCourseLimit(0);
        if (pkg.getScheduleLimit() == null) pkg.setScheduleLimit(0);
        if (pkg.getUserTotalLimit() == null) pkg.setUserTotalLimit(0);
        if (pkg.getTeacherLimit() == null) pkg.setTeacherLimit(0);
        if (pkg.getStudentLimit() == null) pkg.setStudentLimit(0);
        if (pkg.getTeacherPublishLimit() == null) pkg.setTeacherPublishLimit(0);
    }
}
