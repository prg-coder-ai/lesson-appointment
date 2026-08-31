package com.reservation.service; 

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.reservation.common.PageResult;
import com.reservation.entity.Tenant;
import com.reservation.exception.BusinessException;
import com.reservation.exception.ResourceNotFoundException;
import com.reservation.mapper.TenantMapper;
import com.reservation.query.TenantQueryPage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;

/**
 * 租户服务
 * 租户生命周期：新增 / 修改 / 状态流转 / 续期 / 套餐变更 / 软删除 / 恢复
 * 软删除数据保留可恢复；归档导出后清除功能待实现
 */
@Service
public class TenantService {

    private static final Logger log = LoggerFactory.getLogger(TenantService.class);

    /** 状态：正常 */
    public static final int STATUS_NORMAL = 1;
    /** 状态：停用 */
    public static final int STATUS_DISABLED = 2;
    /** 状态：已退租 */
    public static final int STATUS_OFFLINE = 3;

    @Autowired
    private TenantMapper tenantMapper;

    public Tenant getById(Long id) {
        return tenantMapper.selectById(id);
    }

    public Tenant getByCode(String tenantCode) {
        LambdaQueryWrapper<Tenant> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Tenant::getTenantCode, tenantCode);
        return tenantMapper.selectOne(wrapper);
    }

    /**
     * 分页查询租户列表
     */
    public PageResult<Tenant> getTenantListByPage(TenantQueryPage query) {
        LambdaQueryWrapper<Tenant> wrapper = new LambdaQueryWrapper<>();
        // 越权防护：非平台角色只能看自己所属租户
        if (query.getTenantIdFilter() != null) {
            wrapper.eq(Tenant::getId, query.getTenantIdFilter());
        }
        if (query.getDeleted() != null) {
            wrapper.eq(Tenant::getDeleted, query.getDeleted());
        } else {
            wrapper.eq(Tenant::getDeleted, 0);
        }
        if (query.getStatus() != null) {
            wrapper.eq(Tenant::getStatus, query.getStatus());
        }
        if (StringUtils.hasText(query.getKeyword())) {
            String kw = query.getKeyword().trim();
            wrapper.and(w -> w.like(Tenant::getOrgName, kw)
                    .or().like(Tenant::getTenantCode, kw)
                    .or().like(Tenant::getContact, kw));
        }
        if (query.getExpireStart() != null) {
            wrapper.ge(Tenant::getExpireTime, query.getExpireStart());
        }
        if (query.getExpireEnd() != null) {
            wrapper.le(Tenant::getExpireTime, query.getExpireEnd());
        }
        wrapper.orderByDesc(Tenant::getCreateTime);

        Page<Tenant> page = new Page<>(query.getPageNum(), query.getPageSize());
        Page<Tenant> result = tenantMapper.selectPage(page, wrapper);
        return PageResult.of(result);
    }

    public List<Tenant> listAll() {
        LambdaQueryWrapper<Tenant> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Tenant::getDeleted, 0);
        wrapper.orderByAsc(Tenant::getId);
        List<Tenant> list = tenantMapper.selectList(wrapper);
        return list == null ? Collections.emptyList() : list;
    }

    /**
     * 按条件统计租户数
     */
    public long countByWrapper(LambdaQueryWrapper<Tenant> wrapper) {
        Long count = tenantMapper.selectCount(wrapper);
        return count == null ? 0L : count;
    }

    /**
     * 新增租户（平台管理员），默认状态正常、一年后到期
     */
    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public Long insertTenant(Tenant tenant) {
        if (!StringUtils.hasText(tenant.getTenantCode())) {
            throw new BusinessException("租户编码不能为空");
        }
        if (getByCode(tenant.getTenantCode()) != null) {
            throw new BusinessException("租户编码已存在：" + tenant.getTenantCode());
        }
        tenant.setStatus(tenant.getStatus() == null ? STATUS_NORMAL : tenant.getStatus());
        tenant.setDeleted(0);
        if (tenant.getPackageId() == null) {
            tenant.setPackageId(0L);
        }
        if (tenant.getExpireTime() == null) {
            tenant.setExpireTime(LocalDateTime.now().plusYears(1));
        }
        tenantMapper.insert(tenant);
        log.info("新增租户, tenantId={}, code={}", tenant.getId(), tenant.getTenantCode());
        return tenant.getId();
    }

    /**
     * 修改租户信息（平台管理员），不允许修改租户编码
     */
    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public Long updateTenant(Tenant tenant) {
        if (tenant.getId() == null) {
            throw new BusinessException("租户ID不能为空");
        }
        Tenant exist = tenantMapper.selectById(tenant.getId());
        if (exist == null) {
            throw new ResourceNotFoundException("待修改的租户不存在");
        }
        tenant.setTenantCode(exist.getTenantCode());
        tenant.setDeleted(exist.getDeleted());
        tenant.setCreateTime(exist.getCreateTime());
        tenantMapper.updateById(tenant);
        log.info("修改租户, tenantId={}", tenant.getId());
        return tenant.getId();
    }

    /**
     * 软删除租户（保留数据，可恢复）。同步置为已退租并记录退租时间
     */
    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public int softDelete(Long id) {
        Tenant exist = tenantMapper.selectById(id);
        if (exist == null) {
            throw new ResourceNotFoundException("待删除的租户不存在");
        }
        LambdaUpdateWrapper<Tenant> uw = new LambdaUpdateWrapper<>();
        uw.eq(Tenant::getId, id)
          .set(Tenant::getDeleted, 1)
          .set(Tenant::getStatus, STATUS_OFFLINE)
          .set(Tenant::getOfflineTime, LocalDateTime.now());
        int rows = tenantMapper.update(null, uw);
        log.info("软删除租户, tenantId={}, 影响行数={}", id, rows);
        return rows;
    }

    /**
     * 恢复软删除的租户
     */
    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public int restore(Long id) {
        Tenant exist = tenantMapper.selectById(id);
        if (exist == null) {
            throw new ResourceNotFoundException("待恢复的租户不存在");
        }
        if (exist.getDeleted() == null || exist.getDeleted() == 0) {
            throw new BusinessException("该租户未被删除，无需恢复");
        }
        LambdaUpdateWrapper<Tenant> uw = new LambdaUpdateWrapper<>();
        uw.eq(Tenant::getId, id)
          .set(Tenant::getDeleted, 0)
          .set(Tenant::getStatus, STATUS_NORMAL)
          .set(Tenant::getOfflineTime, null);
        int rows = tenantMapper.update(null, uw);
        log.info("恢复租户, tenantId={}, 影响行数={}", id, rows);
        return rows;
    }

    /**
     * 状态流转：1启用 2停用 3退租
     */
    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public int changeStatus(Long id, Integer status) {
        if (status == null || (status != STATUS_NORMAL && status != STATUS_DISABLED && status != STATUS_OFFLINE)) {
            throw new BusinessException("状态值不合法（1正常 2停用 3已退租）");
        }
        Tenant exist = tenantMapper.selectById(id);
        if (exist == null) {
            throw new ResourceNotFoundException("租户不存在");
        }
        LambdaUpdateWrapper<Tenant> uw = new LambdaUpdateWrapper<>();
        uw.eq(Tenant::getId, id).set(Tenant::getStatus, status);
        if (status == STATUS_OFFLINE) {
            uw.set(Tenant::getOfflineTime, LocalDateTime.now());
        }
        int rows = tenantMapper.update(null, uw);
        log.info("租户状态流转, tenantId={}, status={}, 影响行数={}", id, status, rows);
        return rows;
    }

    /**
     * 续期：在当前到期时间基础上增加月数（已过期的从当前时间起算）
     */
    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public int renew(Long id, Integer months) {
        if (months == null || months <= 0) {
            throw new BusinessException("续期月数必须大于0");
        }
        Tenant exist = tenantMapper.selectById(id);
        if (exist == null) {
            throw new ResourceNotFoundException("租户不存在");
        }
        LocalDateTime base = exist.getExpireTime();
        if (base == null || base.isBefore(LocalDateTime.now())) {
            base = LocalDateTime.now();
        }
        LocalDateTime newExpire = base.plusMonths(months);
        LambdaUpdateWrapper<Tenant> uw = new LambdaUpdateWrapper<>();
        uw.eq(Tenant::getId, id).set(Tenant::getExpireTime, newExpire);
        int rows = tenantMapper.update(null, uw);
        log.info("租户续期, tenantId={}, months={}, 新到期时间={}", id, months, newExpire);
        return rows;
    }

    /**
     * 变更套餐（仅更新 package_id，限额校验由 TenantQuotaService 负责）
     */
    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public int changePackage(Long id, Long packageId) {
        Tenant exist = tenantMapper.selectById(id);
        if (exist == null) {
            throw new ResourceNotFoundException("租户不存在");
        }
        LambdaUpdateWrapper<Tenant> uw = new LambdaUpdateWrapper<>();
        uw.eq(Tenant::getId, id).set(Tenant::getPackageId, packageId == null ? 0L : packageId);
        int rows = tenantMapper.update(null, uw);
        log.info("租户变更套餐, tenantId={}, packageId={}, 影响行数={}", id, packageId, rows);
        return rows;
    }
}