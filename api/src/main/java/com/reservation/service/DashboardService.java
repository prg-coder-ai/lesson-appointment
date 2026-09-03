package com.reservation.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.reservation.common.PageResult;
import com.reservation.dto.TenantUsageDTO;
import com.reservation.entity.Tenant;
import com.reservation.entity.TenantStatsMonthly;
import com.reservation.entity.User;
import com.reservation.mapper.TenantMapper;
import com.reservation.mapper.UserMapper;
import com.reservation.query.TenantQueryPage;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 平台看板服务：运行管理（租户用量与额度）+ 运营统计（租户增减、在线情况）
 */
@Service
public class DashboardService {

    @Autowired
    private TenantService tenantService;
    @Autowired
    private TenantQuotaService tenantQuotaService;
    @Autowired
    private UserSessionService userSessionService;
    @Autowired
    private SysConfigService sysConfigService;
    @Autowired
    private TenantMapper tenantMapper;
    @Autowired
    private UserMapper userMapper;

    /**
     * 运行管理：全租户用量分页（含额度占比与环比）
     */
    public PageResult<TenantUsageDTO> getTenantUsagePage(TenantQueryPage query) {
        PageResult<Tenant> page = tenantService.getTenantListByPage(query);
        String month = TenantQuotaService.currentMonth();
        List<TenantUsageDTO> rows = new ArrayList<>();
        if (page.getRows() != null) {
            for (Tenant tenant : page.getRows()) {
                rows.add(buildUsage(tenant, month));
            }
        }
        return new PageResult<>(rows, page.getTotal(), page.getPageNum(), page.getPageSize(), page.getTotalPages());
    }

    /**
     * 运行管理：单租户用量详情（含环比）
     */
    public TenantUsageDTO getTenantUsage(Long tenantId) {
        Tenant tenant = tenantService.getById(tenantId);
        if (tenant == null) {
            return null;
        }
        return buildUsage(tenant, TenantQuotaService.currentMonth());
    }

    private TenantUsageDTO buildUsage(Tenant tenant, String month) {
        TenantUsageDTO dto = tenantQuotaService.getUsage(tenant.getId());
        TenantStatsMonthly last = tenantQuotaService.getLastMonthSnapshot(tenant.getId(), month);
        if (last != null) {
            dto.setCourseDelta(diff(dto.getCourseCount(), last.getCourseCount()));
            dto.setScheduleDelta(diff(dto.getScheduleCount(), last.getScheduleCount()));
            dto.setTeacherDelta(diff(dto.getTeacherCount(), last.getTeacherCount()));
            dto.setStudentDelta(diff(dto.getStudentCount(), last.getStudentCount()));
            dto.setBookingDelta(diff(dto.getBookingCount(), last.getBookingCount()));
        }
        return dto;
    }

    /**
     * 运营统计：平台总览
     */
    public Map<String, Object> getOverview() {
        Map<String, Object> data = new HashMap<>();
        YearMonth currentMonth = YearMonth.now();
        LocalDateTime monthStart = currentMonth.atDay(1).atStartOfDay();
        LocalDateTime now = LocalDateTime.now();

        data.put("tenantTotal", countTenant(w -> w.eq(Tenant::getDeleted, 0)));
        data.put("tenantNewThisMonth",
                countTenant(w -> w.eq(Tenant::getDeleted, 0).ge(Tenant::getCreateTime, monthStart)));
        data.put("tenantOfflineThisMonth",
                countTenant(w -> w.ge(Tenant::getOfflineTime, monthStart).le(Tenant::getOfflineTime, now)));

        data.put("userTotal", countUser(null));
        data.put("userNewThisMonth", countUser(monthStart));
        data.put("onlineTotal", userSessionService.countOnline(null));
        data.put("onlineByTenant", userSessionService.countOnlineByTenant());
        data.put("expireWarningDays", sysConfigService.getInt(SysConfigService.KEY_EXPIRE_WARN, 30));
        data.put("expireWarning", getExpireWarning() != null ? getExpireWarning().size() : "n/a");
        return data;
    }

    /**
     * 运营统计：租户增减趋势（按月）
     */
    public List<Map<String, Object>> getTenantTrend(int months) {
        int range = months <= 0 ? 12 : months;
        List<Map<String, Object>> trend = new ArrayList<>();
        YearMonth current = YearMonth.now();
        for (int i = range - 1; i >= 0; i--) {
            YearMonth ym = current.minusMonths(i);
            LocalDateTime start = ym.atDay(1).atStartOfDay();
            LocalDateTime end = ym.plusMonths(1).atDay(1).atStartOfDay();

            Map<String, Object> item = new HashMap<>();
            item.put("month", ym.toString());
            item.put("newCount", countTenant(w -> w.ge(Tenant::getCreateTime, start).lt(Tenant::getCreateTime, end)));
            item.put("offlineCount",
                    countTenant(w -> w.ge(Tenant::getOfflineTime, start).lt(Tenant::getOfflineTime, end)));
            trend.add(item);
        }
        return trend;
    }

    /**
     * 运营统计：在线情况
     */
    public Map<String, Object> getOnline() {
        Map<String, Object> data = new HashMap<>();
        data.put("onlineTotal", userSessionService.countOnline(null));
        data.put("onlineByTenant", userSessionService.countOnlineByTenant());
        data.put("idleMinutes", sysConfigService.getInt(SysConfigService.KEY_ONLINE_IDLE, 5));
        return data;
    }

    /**
     * 到期预警租户名单
     */
    public List<Tenant> getExpireWarning() {
        int warnDays = sysConfigService.getInt(SysConfigService.KEY_EXPIRE_WARN, 30);
        LocalDateTime deadline = LocalDateTime.now().plusDays(warnDays);
        LambdaQueryWrapper<Tenant> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Tenant::getDeleted, 0)
               .le(Tenant::getExpireTime, deadline)
               .orderByAsc(Tenant::getExpireTime)
               .last("LIMIT 100");
        List<Tenant> list = tenantMapper.selectList(wrapper);
        return list == null ? new ArrayList<>() : list;
    }

    private Integer diff(Integer current, Integer last) {
        if (current == null || last == null) {
            return null;
        }
        return current - last;
    }

    private long countTenant(java.util.function.Consumer<LambdaQueryWrapper<Tenant>> filter) {
        LambdaQueryWrapper<Tenant> wrapper = new LambdaQueryWrapper<>();
        filter.accept(wrapper);
        Long count = tenantMapper.selectCount(wrapper);
        return count == null ? 0L : count;
    }

    private long countUser(LocalDateTime createdSince) {
        LambdaQueryWrapper<User> wrapper = new LambdaQueryWrapper<>();
        if (createdSince != null) {
            wrapper.ge(User::getCreateTime, createdSince);
        }
        Long count = userMapper.selectCount(wrapper);
        return count == null ? 0L : count;
    }
}
