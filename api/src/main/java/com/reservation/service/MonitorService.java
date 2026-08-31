package com.reservation.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.reservation.entity.AuditLog;
import com.reservation.entity.MetricHourly;
import com.reservation.entity.MetricSample;
import com.reservation.mapper.AuditLogMapper;
import com.reservation.mapper.MetricHourlyMapper;
import com.reservation.mapper.MetricSampleMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.File;
import java.lang.management.GarbageCollectorMXBean;
import java.lang.management.ManagementFactory;
import java.lang.management.MemoryMXBean;
import java.lang.management.OperatingSystemMXBean;
import java.lang.management.ThreadMXBean;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 系统监视服务（单机部署）
 *
 * 采集方式：JDK 自带的 com.sun.management.OperatingSystemMXBean + MemoryMXBean + ThreadMXBean + File，
 * 不引入第三方依赖，避免离线环境下无法下载 actuator / OSHI。
 *
 * 采样间隔与历史数据保留天数均来自 sys_system_config，可在「系统配置」菜单调整。
 *
 * 说明：网卡带宽（bps）JDK 标准 API 无法获取，需要 OSHI 或 SNMP；
 *      netOutBytes 字段预留，当前返回 null，应用级吞吐可通过 /monitor/api-health 查看。
 */
@Service
public class MonitorService {

    private static final Logger log = LoggerFactory.getLogger(MonitorService.class);

    @Autowired
    private MetricSampleMapper metricSampleMapper;
    @Autowired
    private MetricHourlyMapper metricHourlyMapper;
    @Autowired
    private AuditLogMapper auditLogMapper;
    @Autowired
    private SysConfigService sysConfigService;
    @Autowired
    private UserSessionService userSessionService;

    /**
     * 采集一次系统指标（不入库）
     */
    public MetricSample collect() {
        MetricSample sample = new MetricSample();
        sample.setSampleTime(LocalDateTime.now());

        OperatingSystemMXBean os = ManagementFactory.getOperatingSystemMXBean();
        if (os instanceof com.sun.management.OperatingSystemMXBean sunOs) {
            sample.setCpuSystem(round(sunOs.getSystemCpuLoad() * 100));
            sample.setCpuProcess(round(sunOs.getProcessCpuLoad() * 100));
            sample.setMemTotal(sunOs.getTotalMemorySize());
            sample.setMemUsed(sunOs.getTotalMemorySize() - sunOs.getFreeMemorySize());
        }

        MemoryMXBean memory = ManagementFactory.getMemoryMXBean();
        sample.setJvmHeapUsed(memory.getHeapMemoryUsage().getUsed());
        sample.setJvmHeapMax(memory.getHeapMemoryUsage().getMax());

        // 磁盘：取应用当前工作目录所在分区
        File root = new File(".").getAbsoluteFile();
        sample.setDiskTotal(root.getTotalSpace());
        sample.setDiskUsed(root.getTotalSpace() - root.getUsableSpace());

        ThreadMXBean threads = ManagementFactory.getThreadMXBean();
        sample.setThreadCount(threads.getThreadCount());

        long gcCount = 0;
        long gcTime = 0;
        for (GarbageCollectorMXBean gc : ManagementFactory.getGarbageCollectorMXBeans()) {
            if (gc.getCollectionCount() > 0) {
                gcCount += gc.getCollectionCount();
            }
            if (gc.getCollectionTime() > 0) {
                gcTime += gc.getCollectionTime();
            }
        }
        sample.setGcCount(gcCount);
        sample.setGcTimeMs(gcTime);

        sample.setOnlineUsers(userSessionService.countOnline(null));
        return sample;
    }

    /**
     * 采样并落库（定时任务调用）
     */
    public void sampleAndSave() {
        try {
            MetricSample sample = collect();
            metricSampleMapper.insert(sample);
        } catch (Exception e) {
            log.warn("系统指标采样失败: {}", e.getMessage());
        }
    }

    /**
     * 系统概览：实时指标 + 运行信息
     */
    public Map<String, Object> getOverview() {
        MetricSample current = collect();
        Map<String, Object> data = new HashMap<>();
        data.put("sampleTime", current.getSampleTime());

        Map<String, Object> cpu = new HashMap<>();
        cpu.put("system", current.getCpuSystem());
        cpu.put("process", current.getCpuProcess());
        cpu.put("cores", Runtime.getRuntime().availableProcessors());
        data.put("cpu", cpu);

        Map<String, Object> memory = new HashMap<>();
        memory.put("total", current.getMemTotal());
        memory.put("used", current.getMemUsed());
        memory.put("jvmHeapUsed", current.getJvmHeapUsed());
        memory.put("jvmHeapMax", current.getJvmHeapMax());
        data.put("memory", memory);

        Map<String, Object> disk = new HashMap<>();
        disk.put("total", current.getDiskTotal());
        disk.put("used", current.getDiskUsed());
        data.put("disk", disk);

        Map<String, Object> jvm = new HashMap<>();
        jvm.put("threadCount", current.getThreadCount());
        jvm.put("gcCount", current.getGcCount());
        jvm.put("gcTimeMs", current.getGcTimeMs());
        jvm.put("jvmName", ManagementFactory.getRuntimeMXBean().getVmName());
        jvm.put("javaVersion", ManagementFactory.getRuntimeMXBean().getSpecVersion());
        jvm.put("uptimeMs", ManagementFactory.getRuntimeMXBean().getUptime());
        data.put("jvm", jvm);

        data.put("onlineUsers", current.getOnlineUsers());
        // 网卡带宽需 OSHI / SNMP，当前环境未引入，预留字段返回 null
        data.put("netOutBytes", null);
        data.put("netNote", "网卡带宽需 OSHI 依赖，当前未引入；应用级吞吐请查看 /monitor/api-health");
        return data;
    }

    /**
     * 历史趋势：返回指定小时内的采样明细（按时间正序）
     */
    public List<MetricSample> getTrend(int hours) {
        LocalDateTime since = LocalDateTime.now().minusHours(Math.max(1, hours));
        LambdaQueryWrapper<MetricSample> wrapper = new LambdaQueryWrapper<>();
        wrapper.ge(MetricSample::getSampleTime, since);
        wrapper.orderByAsc(MetricSample::getSampleTime);
        List<MetricSample> list = metricSampleMapper.selectList(wrapper);
        return list == null ? Collections.emptyList() : list;
    }

    /**
     * 小时聚合：把上一小时的明细聚合成一条小时记录
     */
    public int aggregateHourly() {
        LocalDateTime hourStart = LocalDateTime.now().minusHours(1).withMinute(0).withSecond(0).withNano(0);
        LocalDateTime hourEnd = hourStart.plusHours(1);

        LambdaQueryWrapper<MetricSample> wrapper = new LambdaQueryWrapper<>();
        wrapper.ge(MetricSample::getSampleTime, hourStart)
               .lt(MetricSample::getSampleTime, hourEnd);
        List<MetricSample> samples = metricSampleMapper.selectList(wrapper);
        if (samples == null || samples.isEmpty()) {
            return 0;
        }

        MetricHourly hourly = new MetricHourly();
        hourly.setHourTime(hourStart);
        hourly.setSampleCount(samples.size());
        hourly.setCpuSystemAvg(avg(samples, s -> s.getCpuSystem()));
        hourly.setCpuSystemMax(max(samples, s -> s.getCpuSystem()));
        hourly.setCpuProcessAvg(avg(samples, s -> s.getCpuProcess()));
        hourly.setMemUsedAvg(avgLong(samples, MetricSample::getMemUsed));
        hourly.setJvmHeapAvg(avgLong(samples, MetricSample::getJvmHeapUsed));
        hourly.setJvmHeapMax(samples.stream().map(MetricSample::getJvmHeapMax)
                .filter(v -> v != null && v > 0).mapToLong(Long::longValue).max().orElse(0L));
        hourly.setDiskUsedMax(samples.stream().map(MetricSample::getDiskUsed)
                .filter(v -> v != null && v > 0).mapToLong(Long::longValue).max().orElse(0L));
        hourly.setThreadAvg((int) Math.round(samples.stream()
                .map(MetricSample::getThreadCount).filter(java.util.Objects::nonNull)
                .mapToInt(Integer::intValue).average().orElse(0)));
        hourly.setOnlineMax(samples.stream().map(MetricSample::getOnlineUsers)
                .filter(java.util.Objects::nonNull).mapToInt(Integer::intValue).max().orElse(0));

        // 同一小时重复聚合时覆盖旧记录
        LambdaQueryWrapper<MetricHourly> existWrapper = new LambdaQueryWrapper<>();
        existWrapper.eq(MetricHourly::getHourTime, hourStart);
        MetricHourly exist = metricHourlyMapper.selectOne(existWrapper);
        if (exist != null) {
            hourly.setId(exist.getId());
            metricHourlyMapper.updateById(hourly);
        } else {
            metricHourlyMapper.insert(hourly);
        }
        return samples.size();
    }

    /**
     * 清理历史明细数据，保留天数从配置读取
     */
    public int cleanDetail() {
        int days = sysConfigService.getInt(SysConfigService.KEY_RETENTION_DETAIL, 7);
        if (days <= 0) {
            return 0;
        }
        LambdaQueryWrapper<MetricSample> wrapper = new LambdaQueryWrapper<>();
        wrapper.lt(MetricSample::getSampleTime, LocalDateTime.now().minusDays(days));
        int rows = metricSampleMapper.delete(wrapper);
        if (rows > 0) {
            log.info("清理指标明细, 保留{}天, 删除{}条", days, rows);
        }
        return rows;
    }

    /**
     * 清理小时聚合数据，保留天数从配置读取
     */
    public int cleanHourly() {
        int days = sysConfigService.getInt(SysConfigService.KEY_RETENTION_HOURLY, 90);
        if (days <= 0) {
            return 0;
        }
        LambdaQueryWrapper<MetricHourly> wrapper = new LambdaQueryWrapper<>();
        wrapper.lt(MetricHourly::getHourTime, LocalDateTime.now().minusDays(days));
        int rows = metricHourlyMapper.delete(wrapper);
        if (rows > 0) {
            log.info("清理指标小时聚合, 保留{}天, 删除{}条", days, rows);
        }
        return rows;
    }

    /**
     * 小时聚合趋势（长期趋势用，避免明细被清理后无数据）
     */
    public List<MetricHourly> getHourlyTrend(int days) {
        LocalDateTime since = LocalDateTime.now().minusDays(Math.max(1, days));
        LambdaQueryWrapper<MetricHourly> wrapper = new LambdaQueryWrapper<>();
        wrapper.ge(MetricHourly::getHourTime, since);
        wrapper.orderByAsc(MetricHourly::getHourTime);
        List<MetricHourly> list = metricHourlyMapper.selectList(wrapper);
        return list == null ? new ArrayList<>() : list;
    }

    /**
     * 接口健康度：基于审计日志统计 QPS、错误率、平均耗时、P95 与慢接口 Top10
     */
    public Map<String, Object> getApiHealth(int minutes) {
        int slowThreshold = sysConfigService.getInt(SysConfigService.KEY_SLOW_THRESHOLD, 1000);
        int window = minutes <= 0 ? 60 : minutes;
        java.util.Date since = java.util.Date.from(
                LocalDateTime.now().minusMinutes(window)
                        .atZone(java.time.ZoneId.systemDefault()).toInstant());

        LambdaQueryWrapper<AuditLog> countWrapper = new LambdaQueryWrapper<>();
        countWrapper.ge(AuditLog::getCreatedAt, since);
        long total = auditLogMapper.selectCount(countWrapper);

        LambdaQueryWrapper<AuditLog> failWrapper = new LambdaQueryWrapper<>();
        failWrapper.ge(AuditLog::getCreatedAt, since).eq(AuditLog::getResultStatus, "fail");
        long fail = auditLogMapper.selectCount(failWrapper);

        LambdaQueryWrapper<AuditLog> listWrapper = new LambdaQueryWrapper<>();
        listWrapper.ge(AuditLog::getCreatedAt, since);
        List<AuditLog> logs = auditLogMapper.selectList(listWrapper);

        List<Integer> costs = new ArrayList<>();
        int slowCount = 0;
        Map<String, List<Integer>> byUrl = new HashMap<>();
        if (logs != null) {
            for (AuditLog log : logs) {
                Integer cost = log.getCostMs();
                if (cost == null) {
                    continue;
                }
                costs.add(cost);
                if (cost >= slowThreshold) {
                    slowCount++;
                }
                byUrl.computeIfAbsent(
                        String.valueOf(log.getRequestUrl()), k -> new ArrayList<>()).add(cost);
            }
        }
        Collections.sort(costs);

        Map<String, Object> data = new HashMap<>();
        data.put("windowMinutes", window);
        data.put("totalRequests", total);
        data.put("failRequests", fail);
        data.put("errorRate", total == 0 ? BigDecimal.ZERO : round(fail * 100.0 / total));
        data.put("qps", total == 0 ? BigDecimal.ZERO : round(total * 1.0 / (window * 60)));
        data.put("avgCostMs", costs.isEmpty() ? 0
                : Math.round(costs.stream().mapToInt(Integer::intValue).average().orElse(0)));
        data.put("p95CostMs", costs.isEmpty() ? 0 : costs.get((int) Math.ceil(costs.size() * 0.95) - 1));
        data.put("slowCount", slowCount);
        data.put("slowThresholdMs", slowThreshold);

        // 慢接口 Top10：按平均耗时降序
        List<Map<String, Object>> slowApis = new ArrayList<>();
        byUrl.entrySet().stream()
                .sorted((a, b) -> Double.compare(
                        b.getValue().stream().mapToInt(Integer::intValue).average().orElse(0),
                        a.getValue().stream().mapToInt(Integer::intValue).average().orElse(0)))
                .limit(10)
                .forEach(e -> {
                    Map<String, Object> item = new HashMap<>();
                    item.put("url", e.getKey());
                    item.put("count", e.getValue().size());
                    item.put("avgCostMs", Math.round(
                            e.getValue().stream().mapToInt(Integer::intValue).average().orElse(0)));
                    item.put("maxCostMs", e.getValue().stream().mapToInt(Integer::intValue).max().orElse(0));
                    slowApis.add(item);
                });
        data.put("slowApis", slowApis);
        return data;
    }

    // ---------------- 内部工具 ----------------

    private BigDecimal round(double value) {
        if (value < 0) {
            return BigDecimal.ZERO;
        }
        return BigDecimal.valueOf(value).setScale(2, RoundingMode.HALF_UP);
    }

    private BigDecimal avg(List<MetricSample> samples, java.util.function.Function<MetricSample, BigDecimal> getter) {
        double sum = 0;
        int count = 0;
        for (MetricSample s : samples) {
            BigDecimal v = getter.apply(s);
            if (v != null) {
                sum += v.doubleValue();
                count++;
            }
        }
        return count == 0 ? BigDecimal.ZERO : round(sum / count);
    }

    private BigDecimal max(List<MetricSample> samples, java.util.function.Function<MetricSample, BigDecimal> getter) {
        double m = 0;
        for (MetricSample s : samples) {
            BigDecimal v = getter.apply(s);
            if (v != null && v.doubleValue() > m) {
                m = v.doubleValue();
            }
        }
        return round(m);
    }

    private Long avgLong(List<MetricSample> samples, java.util.function.Function<MetricSample, Long> getter) {
        long sum = 0;
        int count = 0;
        for (MetricSample s : samples) {
            Long v = getter.apply(s);
            if (v != null) {
                sum += v;
                count++;
            }
        }
        return count == 0 ? 0L : sum / count;
    }
}
