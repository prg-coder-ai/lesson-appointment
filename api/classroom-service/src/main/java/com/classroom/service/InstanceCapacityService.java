package com.classroom.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.classroom.entity.Classroom;
import com.classroom.entity.EclassroomInstance;
import com.classroom.mapper.ClassroomMapper;
import com.classroom.mapper.EclassroomInstanceMapper;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 课堂实例并发容量准入（2026-11-20）。
 *
 * <p><b>补的是什么洞</b>：{@code sys_eclassroom_instance.max_capacity}（平台端「最大容量」）
 * 在此之前是纯记录字段——能填能显示，没有任何代码读它，第 N+1 间课照样开。分析见
 * {@code doc-develop/08-电子课堂/课堂实例容量字段现状分析与实现建议-20261120.md}。
 *
 * <p><b>为什么准入必须在课堂服务侧</b>：开课动作（{@code POST /classrooms/{sid}/start}
 * 与自动开课扫描器）都在 8092 上执行，主服务只发事件。所以上限要在这里判。
 *
 * <p><b>本服务怎么知道"我是哪一台"</b>：靠 {@code classroom.instance-code}
 * （env {@code INSTANCE_CODE}），用它去 {@code lesson_appointment.sys_eclassroom_instance}
 * 读自己的 {@code max_capacity}。**不用 IP/端口**：同机换实例、容器化 IP 漂移都会让上限张冠李戴。
 *
 * <p><b>未配置时怎么办</b>：不做限制（fail-open），但**启动时打一条 WARN 明说**
 * ——容量是保护性约束，配错就全站开不了课的代价远大于"暂时不限制"；
 * 而"静默不生效"正是这次要根治的问题，所以必须留下痕迹。
 *
 * <p><b>并发口径</b>：与平台端「进行中」逐字一致 = 今日 {@code start_time} 且 {@code status=LIVE}。
 * 刻意不数"所有 LIVE"：历史遗留的僵尸课堂（自动下课没生效）会把并发永久顶满，
 * 变成"一个坏数据毁掉整台实例的开课能力"。僵尸课堂由运营台的告警单独暴露。
 */
@Service
public class InstanceCapacityService {

    private static final Logger log = LoggerFactory.getLogger(InstanceCapacityService.class);

    /** 上限配置的缓存时长：平台端改「最大容量」后最多 1 分钟生效，够用且不必每次开课都跨库查。 */
    private static final long CACHE_TTL_MS = 60 * 1000L;

    @Value("${classroom.instance-code:}")
    private String instanceCode;

    @Autowired
    private EclassroomInstanceMapper instanceMapper;
    @Autowired
    private ClassroomMapper classroomMapper;

    /** 缓存的上限；null = 未启用/查不到（不限制） */
    private volatile Long cachedMaxCapacity;
    private volatile long cachedAt;

    @PostConstruct
    public void reportOnStartup() {
        if (instanceCode == null || instanceCode.isBlank()) {
            log.warn("[capacity] 未配置 classroom.instance-code（env INSTANCE_CODE），"
                    + "开课容量准入**未启用** —— 本实例不会按 sys_eclassroom_instance.max_capacity 拦截开课。"
                    + "要启用请在 /etc/lesson/classroom.env 里配置 INSTANCE_CODE=<实例编码>");
            return;
        }
        Long max = resolveMaxCapacity();
        if (max == null) {
            log.warn("[capacity] instance_code={} 在 sys_eclassroom_instance 中查不到可用记录"
                    + "（或该实例 max_capacity 为空），容量准入未启用", instanceCode);
        } else {
            log.info("[capacity] 容量准入已启用：instance_code={}, max_capacity={}", instanceCode, max);
        }
    }

    /**
     * 当前实例的并发课堂上限。
     *
     * @return 上限；{@code null} 或 {@code <= 0} 表示不限制
     */
    public Long maxCapacity() {
        if (instanceCode == null || instanceCode.isBlank()) return null;
        long now = System.currentTimeMillis();
        if (cachedAt != 0 && now - cachedAt < CACHE_TTL_MS) {
            return cachedMaxCapacity;
        }
        Long max = resolveMaxCapacity();
        cachedMaxCapacity = max;
        cachedAt = now;
        return max;
    }

    /** 本实例当前并发课堂数（今日 LIVE，口径与平台端「进行中」一致）。 */
    public long liveCount() {
        LocalDateTime dayStart = LocalDate.now().atStartOfDay();
        LambdaQueryWrapper<Classroom> w = new LambdaQueryWrapper<>();
        w.eq(Classroom::getStatus, "LIVE")
         .ge(Classroom::getStartTime, dayStart)
         .lt(Classroom::getStartTime, dayStart.plusDays(1));
        Long n = classroomMapper.selectCount(w);
        return n == null ? 0L : n;
    }

    /** 是否已达上限（未配置上限时恒 false）。 */
    public boolean isFull() {
        Long max = maxCapacity();
        if (max == null || max <= 0) return false;
        return liveCount() >= max;
    }

    /** 拒绝开课时给运营/教师看的文案：必须带上"当前 / 上限"，否则用户只会以为系统坏了。 */
    public String fullMessage() {
        Long max = maxCapacity();
        long live = liveCount();
        return "课堂实例并发已达上限（进行中 " + live + " / 上限 " + max
                + "），请稍后重试；若长期不足请联系平台管理员扩容";
    }

    /** 清掉缓存（平台端改完容量后由内部端点触发，或运维手工调）。 */
    public void evictCache() {
        cachedAt = 0;
        cachedMaxCapacity = null;
    }

    private Long resolveMaxCapacity() {
        if (instanceCode == null || instanceCode.isBlank()) return null;
        try {
            EclassroomInstance inst = instanceMapper.selectByInstanceCode(instanceCode);
            if (inst == null) return null;
            Integer max = inst.getMaxCapacity();
            return (max == null || max <= 0) ? null : max.longValue();
        } catch (Exception e) {
            // 跨库查询失败不能让开课全体失败：退回"不限制"，但把原因留在日志里
            log.warn("[capacity] 读取实例上限失败(本次不做限制): instance_code={}, err={}",
                    instanceCode, e.getMessage());
            return null;
        }
    }
}
