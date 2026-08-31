package com.reservation.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.reservation.common.PageResult;
import com.reservation.entity.PackageTemplate;
import com.reservation.exception.BusinessException;
import com.reservation.exception.ResourceNotFoundException;
import com.reservation.mapper.PackageTemplateMapper;
import com.reservation.mapper.TenantMapper;
import com.reservation.entity.Tenant;
import com.reservation.query.PackageTemplateQueryPage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.Collections;
import java.util.List;

/**
 * 套餐模板服务
 * 套餐模板只定义限额，不含租户信息；租户通过 sys_tenant.package_id 选用模板
 */
@Service
public class PackageTemplateService {

    private static final Logger log = LoggerFactory.getLogger(PackageTemplateService.class);

    /** 状态：启用 */
    public static final int STATUS_ENABLED = 1;
    /** 状态：停用 */
    public static final int STATUS_DISABLED = 2;

    @Autowired
    private PackageTemplateMapper packageTemplateMapper;
    @Autowired
    private TenantMapper tenantMapper;

    /**
     * 新增套餐模板
     */
    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public Long insertTemplate(PackageTemplate template) {
        if (!StringUtils.hasText(template.getTemplateName())) {
            throw new BusinessException("套餐模板名称不能为空");
        }
        if (StringUtils.hasText(template.getTemplateCode())
                && getByCode(template.getTemplateCode()) != null) {
            throw new BusinessException("套餐模板编码已存在：" + template.getTemplateCode());
        }
        defaultLimit(template);
        template.setStatus(template.getStatus() == null ? STATUS_ENABLED : template.getStatus());
        packageTemplateMapper.insert(template);
        log.info("新增套餐模板, templateId={}, name={}", template.getId(), template.getTemplateName());
        return template.getId();
    }

    /**
     * 修改套餐模板
     */
    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public Long updateTemplate(PackageTemplate template) {
        if (template.getId() == null) {
            throw new BusinessException("套餐模板ID不能为空");
        }
        PackageTemplate exist = packageTemplateMapper.selectById(template.getId());
        if (exist == null) {
            throw new ResourceNotFoundException("待修改的套餐模板不存在");
        }
        if (StringUtils.hasText(template.getTemplateCode())
                && !template.getTemplateCode().equals(exist.getTemplateCode())) {
            PackageTemplate sameCode = getByCode(template.getTemplateCode());
            if (sameCode != null && !sameCode.getId().equals(template.getId())) {
                throw new BusinessException("套餐模板编码已存在：" + template.getTemplateCode());
            }
        }
        defaultLimit(template);
        if (template.getStatus() == null) {
            template.setStatus(exist.getStatus());
        }
        packageTemplateMapper.updateById(template);
        log.info("修改套餐模板, templateId={}", template.getId());
        return template.getId();
    }

    /**
     * 删除套餐模板；仍有租户引用时拒绝删除
     */
    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public int deleteTemplate(Long id) {
        if (id == null) {
            throw new BusinessException("套餐模板ID不能为空");
        }
        long used = countTenantUsing(id);
        if (used > 0) {
            throw new BusinessException("仍有 " + used + " 个租户选用该模板，请先变更这些租户的套餐");
        }
        log.info("删除套餐模板, templateId={}", id);
        return packageTemplateMapper.deleteById(id);
    }

    /**
     * 统计选用该模板的租户数
     */
    public long countTenantUsing(Long templateId) {
        LambdaQueryWrapper<Tenant> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Tenant::getPackageId, templateId).eq(Tenant::getDeleted, 0);
        Long count = tenantMapper.selectCount(wrapper);
        return count == null ? 0L : count;
    }

    public PackageTemplate getById(Long id) {
        return packageTemplateMapper.selectById(id);
    }

    public PackageTemplate getByCode(String code) {
        LambdaQueryWrapper<PackageTemplate> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(PackageTemplate::getTemplateCode, code);
        return packageTemplateMapper.selectOne(wrapper);
    }

    public PageResult<PackageTemplate> getTemplateListByPage(PackageTemplateQueryPage query) {
        LambdaQueryWrapper<PackageTemplate> wrapper = new LambdaQueryWrapper<>();
        if (query.getStatus() != null) {
            wrapper.eq(PackageTemplate::getStatus, query.getStatus());
        }
        if (StringUtils.hasText(query.getKeyword())) {
            String kw = query.getKeyword().trim();
            wrapper.and(w -> w.like(PackageTemplate::getTemplateName, kw)
                    .or().like(PackageTemplate::getTemplateCode, kw));
        }
        wrapper.orderByAsc(PackageTemplate::getId);

        Page<PackageTemplate> page = new Page<>(query.getPageNum(), query.getPageSize());
        Page<PackageTemplate> result = packageTemplateMapper.selectPage(page, wrapper);
        return PageResult.of(result);
    }

    /**
     * 全部模板
     */
    public List<PackageTemplate> listAll() {
        LambdaQueryWrapper<PackageTemplate> wrapper = new LambdaQueryWrapper<>();
        wrapper.orderByAsc(PackageTemplate::getId);
        List<PackageTemplate> list = packageTemplateMapper.selectList(wrapper);
        return list == null ? Collections.emptyList() : list;
    }

    /**
     * 启用的模板（下拉选择用）
     */
    public List<PackageTemplate> listEnabled() {
        LambdaQueryWrapper<PackageTemplate> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(PackageTemplate::getStatus, STATUS_ENABLED);
        wrapper.orderByAsc(PackageTemplate::getId);
        List<PackageTemplate> list = packageTemplateMapper.selectList(wrapper);
        return list == null ? Collections.emptyList() : list;
    }

    /**
     * 把模板的限额套用到某个租户套餐上（不覆盖当前数量）
     */
    public void applyLimitsTo(PackageTemplate template, com.reservation.entity.TenantPackage tenantPackage) {
        tenantPackage.setCourseLimit(nz(template.getCourseLimit()));
        tenantPackage.setScheduleLimit(nz(template.getScheduleLimit()));
        tenantPackage.setUserTotalLimit(nz(template.getUserTotalLimit()));
        tenantPackage.setTeacherLimit(nz(template.getTeacherLimit()));
        tenantPackage.setStudentLimit(nz(template.getStudentLimit()));
        tenantPackage.setTeacherPublishLimit(nz(template.getTeacherPublishLimit()));
    }

    private void defaultLimit(PackageTemplate template) {
        template.setCourseLimit(nz(template.getCourseLimit()));
        template.setScheduleLimit(nz(template.getScheduleLimit()));
        template.setUserTotalLimit(nz(template.getUserTotalLimit()));
        template.setTeacherLimit(nz(template.getTeacherLimit()));
        template.setStudentLimit(nz(template.getStudentLimit()));
        template.setTeacherPublishLimit(nz(template.getTeacherPublishLimit()));
    }

    private Integer nz(Integer value) {
        return value == null ? 0 : value;
    }
}
