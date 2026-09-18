package com.reservation.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.reservation.common.NotifyAudience;
import com.reservation.common.NotifyStage;
import com.reservation.dto.NotifyPointDTO;
import com.reservation.dto.NotifyRuleDTO;
import com.reservation.entity.Course;
import com.reservation.entity.CourseNotifyRule;
import com.reservation.entity.CourseNotifyRulePoint;
import com.reservation.exception.BusinessException;
import com.reservation.mapper.CourseMapper;
import com.reservation.mapper.CourseNotifyRuleMapper;
import com.reservation.mapper.CourseNotifyRulePointMapper;
import com.reservation.utils.TenantContext;
import com.reservation.utils.TermMsg;
import com.reservation.vo.NotifyPlanItemVO;
import com.reservation.vo.NotifyPlanVO;
import com.reservation.vo.NotifyPointVO;
import com.reservation.vo.NotifyRuleVO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 课程上课通知规则服务。
 *
 * <p>负责三件事：
 * <ol>
 *   <li><b>规则维护</b>：租户默认规则 + 课程级覆盖的整组增删改查（租户管理员「系统配置 → 通知规则」）；</li>
 *   <li><b>规则求值</b>：按课次时间求出生效档位（含每档的应发时刻）；</li>
 *   <li><b>试算预览</b>：给定假想的课次时间，把每档的应发时刻摊开给管理员看。</li>
 * </ol>
 *
 * <p><b>求值优先级</b>：课程专属规则 &gt; 租户默认规则 &gt; 本类内置兜底档位。
 * 任一作用域被停用（{@code enabled=0}）、或虽有规则但<b>所有档位都停用</b>，
 * 都视为「未配置」继续向下回落，并在提示里说明降级原因。
 *
 * <p><b>叠加语义是整组覆盖</b>：命中课程规则就整组使用它，不拿租户默认补齐缺的档位。
 * 配置省事交给界面（新建课程规则时预填租户默认的档位）。
 *
 * <p><b>时间口径只有一个</b>：{@code offsetMinutes}（课前偏移分钟）。
 * 「提前 N 天」在库里就是 {@code 1440 × N}，天/小时只是界面录入粒度。
 * 应发时刻 = {@code appointment_datetime − offsetMinutes}。
 * 天级档位刻意不额外配「发送钟点」：与上课时刻同钟点，4 档共用一套算术，
 * 代价是可能落到周末或深夜（已在配置页用应发时刻预览把这个代价显式化）。
 */
@Service
public class NotifyRuleService {

    private static final Logger log = LoggerFactory.getLogger(NotifyRuleService.class);

    /** 租户默认规则用空串做 course_id（MySQL 唯一索引下 NULL 不去重，必须用空串） */
    public static final String TENANT_DEFAULT_COURSE_ID = "";

    /** 偏移量上限：30 天。再大无业务意义，且能挡住误填（如把「3 天」填成 300000） */
    private static final int MAX_MINUTES = 30 * 24 * 60;

    public static final String UNIT_DAY = "day";
    public static final String UNIT_HOUR = "hour";
    public static final String UNIT_MINUTE = "minute";

    private static final int MINUTES_PER_DAY = 24 * 60;
    private static final int MINUTES_PER_HOUR = 60;

    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    /** 内置兜底档位（未做任何配置时使用）：3 天 / 1 天 / 课前 1 小时 / 课前 30 分钟 */
    private static final int[][] BUILTIN = {
            {1, 3 * MINUTES_PER_DAY},
            {2, 1 * MINUTES_PER_DAY},
            {3, 60},
            {4, 30}
    };
    private static final String[] BUILTIN_STAGES = {
            NotifyStage.PRE_FIRST, NotifyStage.PRE_AGAIN, NotifyStage.PRE_SOON, NotifyStage.FINAL_CALL
    };

    @Autowired
    private CourseNotifyRuleMapper ruleMapper;
    @Autowired
    private CourseNotifyRulePointMapper pointMapper;
    @Autowired
    private CourseMapper courseMapper;

    // ========================================================================
    // 一、规则维护
    // ========================================================================

    /**
     * 租户上下文硬校验。
     *
     * <p><b>为什么必须有这一步</b>：租户插件的 {@code ignoreTable} 在
     * {@code tenantId = 0}（平台管理员）时返回 true，<b>完全不拼租户条件</b>；
     * 而 {@code checkAdmin} 是放行平台管理员的。若不在这里拦住，
     * 平台管理员调用本接口时 {@code selectOne} 可能读到<b>别的租户</b>的规则行
     * （默认规则用空串做 course_id，跨租户全都撞在同一个值上）。
     * 通知规则是租户业务配置，只允许有明确租户身份的人读写。
     */
    private void requireTenantContext() {
        Long tenantId = TenantContext.getTenantId();
        if (tenantId == null || tenantId == 0L) {
            throw new BusinessException(TermMsg.t("上课通知规则按租户隔离，请以租户管理员身份操作"));
        }
    }

    /** 列出本租户的全部规则：默认规则置顶，课程覆盖按更新时间倒序 */
    public List<NotifyRuleVO> listRules() {
        requireTenantContext();
        LambdaQueryWrapper<CourseNotifyRule> wrapper = new LambdaQueryWrapper<>();
        wrapper.orderByDesc(CourseNotifyRule::getUpdateTime).orderByDesc(CourseNotifyRule::getId);
        List<CourseNotifyRule> rows = ruleMapper.selectList(wrapper);
        if (rows == null) {
            rows = new ArrayList<>();
        }

        Map<Long, List<CourseNotifyRulePoint>> pointMap = loadPointsByRuleIds(
                rows.stream().map(CourseNotifyRule::getId).collect(Collectors.toList()));

        Map<String, String> courseNameMap = loadCourseNames(rows.stream()
                .map(CourseNotifyRule::getCourseId)
                .filter(cid -> cid != null && !cid.isEmpty())
                .collect(Collectors.toSet()));

        List<NotifyRuleVO> result = new ArrayList<>();
        CourseNotifyRule tenantDefault = null;
        for (CourseNotifyRule row : rows) {
            if (row.getCourseId() == null || row.getCourseId().isEmpty()) {
                tenantDefault = row;
            } else {
                result.add(toVO(row, courseNameMap.getOrDefault(row.getCourseId(), row.getCourseId()),
                        pointMap.getOrDefault(row.getId(), Collections.emptyList())));
            }
        }
        // 默认规则置顶；尚未配置时用内置兜底档位补一张「虚拟卡」，界面可直接编辑保存
        result.add(0, toVO(tenantDefault, null,
                tenantDefault == null ? Collections.emptyList() : pointMap.getOrDefault(tenantDefault.getId(), Collections.emptyList())));
        return result;
    }

    /** 取单个作用域的规则（含全部档位，含停用档）；不存在时返回内置兜底的虚拟规则 */
    public NotifyRuleVO getRule(String courseId) {
        requireTenantContext();
        String cid = courseId == null ? TENANT_DEFAULT_COURSE_ID : courseId.trim();
        CourseNotifyRule row = selectByCourseId(cid);
        List<CourseNotifyRulePoint> points = row == null
                ? Collections.emptyList() : loadPoints(row.getId());
        String courseName = null;
        if (!cid.isEmpty()) {
            Course course = courseMapper.selectById(cid);
            courseName = course == null ? cid : course.getCourseName();
        }
        return toVO(row, courseName, points);
    }

    /**
     * 整组保存（新增或覆盖）：{@code courseId} 为空串/null 即保存租户默认规则。
     *
     * <p>档位顺序由服务端按 {@code offsetMinutes} 降序重排后落到 {@code seq} 上——
     * 不采信调用方传的 seq。理由：seq 是「顺序」的派生量，若让调用方同时维护
     * 「顺序」和「提前量」两个真相，迟早出现「seq=2 的时间点落在 seq=1 之前」的脏配置。
     */
    @Transactional(rollbackFor = Exception.class)
    public Long save(NotifyRuleDTO dto) {
        requireTenantContext();
        if (dto == null) {
            throw new BusinessException(TermMsg.t("规则内容不能为空"));
        }
        String courseId = dto.getCourseId() == null ? TENANT_DEFAULT_COURSE_ID : dto.getCourseId().trim();
        if (!courseId.isEmpty() && courseMapper.selectById(courseId) == null) {
            throw new BusinessException(TermMsg.t("课程不存在或不属于当前租户，无法配置通知规则"));
        }
        List<CourseNotifyRulePoint> parsed = parsePoints(dto.getPoints());
        if (parsed.isEmpty()) {
            throw new BusinessException(TermMsg.t("至少要配置一个通知时间点"));
        }
        String name = dto.getName();
        if (name != null && name.length() > 64) {
            throw new BusinessException(TermMsg.t("规则名不能超过 64 个字符"));
        }
        String remark = dto.getRemark();
        if (remark != null && remark.length() > 255) {
            throw new BusinessException(TermMsg.t("备注不能超过 255 个字符"));
        }

        CourseNotifyRule existing = selectByCourseId(courseId);
        CourseNotifyRule row = new CourseNotifyRule();
        row.setCourseId(courseId);
        row.setName(name);
        row.setEnabled(dto.getEnabled() == null ? 1 : dto.getEnabled());
        row.setRemark(remark);

        Long ruleId;
        if (existing == null) {
            ruleMapper.insert(row);
            ruleId = row.getId();
            log.info("新增上课通知规则, courseId='{}', 档位数={}", courseId, parsed.size());
        } else {
            row.setId(existing.getId());
            ruleMapper.updateById(row);
            ruleId = existing.getId();
            log.info("更新上课通知规则, courseId='{}', 档位数={}", courseId, parsed.size());
        }

        // 明细整组重建：整组覆盖式保存，全删重建最简单，也不会留下孤儿行。
        // 发送流水存的是 offset/seq 快照（不是 point_id），故重建导致的 id 变化无影响。
        LambdaQueryWrapper<CourseNotifyRulePoint> delWrapper = new LambdaQueryWrapper<>();
        delWrapper.eq(CourseNotifyRulePoint::getRuleId, ruleId);
        pointMapper.delete(delWrapper);
        for (CourseNotifyRulePoint p : parsed) {
            p.setId(null);
            p.setRuleId(ruleId);
            pointMapper.insert(p);
        }
        return ruleId;
    }

    /**
     * 删除规则行。
     *
     * @param courseId 课程ID；空串表示删除租户默认规则（删除后回落到内置兜底）
     * @return 受影响行数（规则头 0/1）
     */
    @Transactional(rollbackFor = Exception.class)
    public int deleteRule(String courseId) {
        requireTenantContext();
        String cid = courseId == null ? TENANT_DEFAULT_COURSE_ID : courseId.trim();
        if (cid.isEmpty()) {
            throw new BusinessException(TermMsg.t("租户默认规则不支持删除，如需停用请把「启用」关掉"));
        }
        CourseNotifyRule existing = selectByCourseId(cid);
        if (existing == null) {
            return 0;
        }
        LambdaQueryWrapper<CourseNotifyRulePoint> delPoints = new LambdaQueryWrapper<>();
        delPoints.eq(CourseNotifyRulePoint::getRuleId, existing.getId());
        pointMapper.delete(delPoints);
        int rows = ruleMapper.deleteById(existing.getId());
        log.info("删除上课通知规则, courseId='{}', 影响{}行", cid, rows);
        return rows;
    }

    /** 供管理端下拉用：列出当前租户所有课程 */
    public List<Map<String, Object>> listCourseOptions() {
        requireTenantContext();
        LambdaQueryWrapper<Course> wrapper = new LambdaQueryWrapper<>();
        wrapper.select(Course::getCourseId, Course::getCourseName, Course::getTeacherId);
        wrapper.orderByDesc(Course::getCreateTime);
        List<Course> courses = courseMapper.selectList(wrapper);
        if (courses == null) {
            return Collections.emptyList();
        }
        List<Map<String, Object>> options = new ArrayList<>();
        for (Course c : courses) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("courseId", c.getCourseId());
            item.put("courseName", c.getCourseName());
            item.put("teacherId", c.getTeacherId());
            options.add(item);
        }
        return options;
    }

    // ========================================================================
    // 二、规则求值
    // ========================================================================

    /** 求值结果：生效档位 + 来源作用域 + 降级说明 */
    public static class Effective {
        /** 生效的规则头；为 null 表示用的是内置兜底（界面可据此提示「尚未配置」） */
        public CourseNotifyRule rule;
        /** 生效的档位，仅含启用项，按 offsetMinutes 降序（越靠前越早发） */
        public List<CourseNotifyRulePoint> points;
        /** course / tenant / builtin */
        public String scope;
        public String fallbackNotice;

        public boolean isBuiltin() {
            return "builtin".equals(scope);
        }
    }

    /**
     * 解析某课程实际生效的通知档位。
     *
     * <p>「整组覆盖」的判定在这里落地：只要能命中一级<b>启用且至少有一档启用</b>的规则，
     * 就整组采用它，不再向下看；否则继续回落，并记录降级原因。
     */
    public Effective resolve(String courseId) {
        CourseNotifyRule courseRow = (courseId == null || courseId.isEmpty())
                ? null : selectByCourseId(courseId);
        CourseNotifyRule tenantRow = selectByCourseId(TENANT_DEFAULT_COURSE_ID);

        List<CourseNotifyRulePoint> coursePoints = enabledPoints(courseRow);
        List<CourseNotifyRulePoint> tenantPoints = enabledPoints(tenantRow);

        Effective eff = new Effective();
        if (courseRow != null && isEnabled(courseRow) && !coursePoints.isEmpty()) {
            eff.rule = courseRow;
            eff.points = coursePoints;
            eff.scope = "course";
            return eff;
        }
        if (tenantRow != null && isEnabled(tenantRow) && !tenantPoints.isEmpty()) {
            eff.rule = tenantRow;
            eff.points = tenantPoints;
            eff.scope = "tenant";
            if (courseRow != null) {
                eff.fallbackNotice = TermMsg.t("该课程的通知规则未启用（或所有档位均已停用），当前按租户默认规则执行");
            }
            return eff;
        }
        eff.rule = null;
        eff.points = builtinPoints();
        eff.scope = "builtin";
        if (courseRow != null) {
            eff.fallbackNotice = TermMsg.t("该课程的通知规则未启用（或所有档位均已停用），且租户未配置默认规则，当前按系统内置时间点执行");
        } else if (tenantRow != null) {
            eff.fallbackNotice = TermMsg.t("租户默认通知规则未启用（或所有档位均已停用），当前按系统内置时间点执行");
        }
        return eff;
    }

    /**
     * 试算预览：给定假想的课次时间，列出每档的应发时刻。
     *
     * <p>{@code lessonTime} 为空时按「明天此刻」试算，保证界面一定有东西可看。
     */
    public NotifyPlanVO preview(String courseId, String lessonTime) {
        requireTenantContext();
        LocalDateTime lesson = parseTime(lessonTime);
        if (lesson == null) {
            lesson = LocalDateTime.now().plusDays(1).withSecond(0).withNano(0);
        }
        return buildPlan(courseId, lesson, null);
    }

    /**
     * 按真实课次时间求各档应发时刻（可带「该档是否已发」）。
     *
     * <p>两个调用方：发送服务在推送前取生效档位；管理端排查「为什么这档没发」。
     * 刻意<b>不做</b>租户上下文校验——调用方（定时任务 / HTTP 接口）自己保证上下文已就绪，
     * 这里再加一道会在定时任务里误报（任务已显式 setTenantId，但那是合法租户身份）。
     */
    public NotifyPlanVO plan(String courseId, LocalDateTime lesson, Set<Integer> dispatchedSeqs) {
        return buildPlan(courseId, lesson, dispatchedSeqs);
    }

    private NotifyPlanVO buildPlan(String courseId, LocalDateTime lesson, Set<Integer> dispatchedSeqs) {
        Effective eff = resolve(courseId);
        NotifyPlanVO plan = new NotifyPlanVO();
        plan.setCourseId(courseId);
        plan.setScope(eff.scope);
        plan.setScopeText(scopeText(eff.scope));
        plan.setFallbackNotice(eff.fallbackNotice);
        plan.setLessonTime(lesson.format(FMT));
        if (courseId != null && !courseId.isEmpty()) {
            Course course = courseMapper.selectById(courseId);
            plan.setCourseName(course == null ? courseId : course.getCourseName());
        }

        LocalDateTime now = LocalDateTime.now();
        List<NotifyPlanItemVO> items = new ArrayList<>();
        for (CourseNotifyRulePoint p : eff.points) {
            NotifyPlanItemVO item = new NotifyPlanItemVO();
            item.setSeq(p.getSeq());
            item.setStage(p.getStage());
            item.setStageText(NotifyStage.text(p.getStage()));
            item.setOffsetMinutes(p.getOffsetMinutes());
            item.setOffsetText(formatMinutes(p.getOffsetMinutes()));
            item.setAudience(p.getAudience());
            item.setAudienceText(NotifyAudience.text(p.getAudience()));
            LocalDateTime expect = lesson.minusMinutes(p.getOffsetMinutes() == null ? 0 : p.getOffsetMinutes());
            item.setExpectTime(expect.format(FMT));

            boolean dispatched = dispatchedSeqs != null && p.getSeq() != null
                    && dispatchedSeqs.contains(p.getSeq());
            item.setDispatched(dispatched);
            if (dispatched) {
                item.setState("DISPATCHED");
                item.setStateText("已发送");
            } else if (!expect.isAfter(now)) {
                // 应发时刻已过：不会再补发（错窗即跳过的策略）
                item.setState("PAST");
                item.setStateText(lesson.isBefore(now) ? "课次已过，不发送" : "已过期，不补发");
            } else if (lesson.isBefore(now)) {
                item.setState("PAST");
                item.setStateText("课次已过，不发送");
            } else {
                item.setState("WAITING");
                item.setStateText("待发送");
            }
            items.add(item);
        }
        plan.setPoints(items);
        return plan;
    }

    // ========================================================================
    // 三、工具方法
    // ========================================================================

    /**
     * 校验并归一化前端提交的档位列表。
     *
     * <p>按 {@code offsetMinutes} 降序重排后重编 {@code seq}（1..N，连续无洞），
     * 顺带完成「严格递减」校验：排序后若出现相邻相等，说明配置重复，直接拒绝。
     */
    private List<CourseNotifyRulePoint> parsePoints(List<NotifyPointDTO> dtos) {
        List<CourseNotifyRulePoint> list = new ArrayList<>();
        if (dtos == null || dtos.isEmpty()) {
            return list;
        }
        int index = 0;
        for (NotifyPointDTO dto : dtos) {
            if (dto == null) {
                continue;
            }
            int minutes = resolveMinutes(dto);
            if (minutes <= 0) {
                throw new BusinessException(TermMsg.t("通知时间点必须大于 0（提前量不能为零或负数）"));
            }
            if (minutes > MAX_MINUTES) {
                throw new BusinessException(TermMsg.t("单个通知时间点不能超过 30 天"));
            }
            String stage;
            if (dto.getStage() == null || dto.getStage().isBlank()) {
                // 未指定档位时按配置顺序推断（第 1 档=首次预告、第 2 档=再次预告…），
                // 超出内置档位数的按「再次预告」处理——stage 只决定文案口吻，不影响发送时机
                stage = index < BUILTIN_STAGES.length ? BUILTIN_STAGES[index] : NotifyStage.PRE_AGAIN;
            } else if (!NotifyStage.isValid(dto.getStage())) {
                throw new BusinessException(TermMsg.t("通知档位取值非法，只能是首次预告/再次预告/课前预告/最后提示"));
            } else {
                stage = NotifyStage.normalize(dto.getStage());
            }
            index++;
            CourseNotifyRulePoint p = new CourseNotifyRulePoint();
            p.setOffsetMinutes(minutes);
            p.setStage(stage);
            p.setInputUnit(normalizeUnit(dto.getInputUnit()));
            p.setAudience(NotifyAudience.normalize(dto.getAudience()));
            p.setEnabled(dto.getEnabled() == null ? 1 : (dto.getEnabled() == 0 ? 0 : 1));
            list.add(p);
        }

        // 按提前量降序（越早发排前面）；相同提前量视为重复配置
        list.sort((a, b) -> Integer.compare(b.getOffsetMinutes(), a.getOffsetMinutes()));
        for (int i = 1; i < list.size(); i++) {
            if (list.get(i).getOffsetMinutes().equals(list.get(i - 1).getOffsetMinutes())) {
                Map<String, String> vars = new LinkedHashMap<>();
                vars.put("offset", formatMinutes(list.get(i).getOffsetMinutes()));
                throw new BusinessException(TermMsg.t(
                        "存在两个提前量相同的通知时间点（{offset}），请调整或删除其中一个", vars));
            }
        }
        for (int i = 0; i < list.size(); i++) {
            list.get(i).setSeq(i + 1);
        }
        if (list.stream().noneMatch(p -> p.getEnabled() != null && p.getEnabled() == 1)) {
            throw new BusinessException(TermMsg.t("至少要启用一个通知时间点，否则该规则不会发出任何通知"));
        }
        return list;
    }

    /** 把「数值 + 粒度」换算成分钟；显式传 offsetMinutes 时优先 */
    private int resolveMinutes(NotifyPointDTO dto) {
        if (dto.getOffsetMinutes() != null) {
            return dto.getOffsetMinutes();
        }
        if (dto.getOffsetValue() == null) {
            throw new BusinessException(TermMsg.t("通知时间点不能为空"));
        }
        int value = dto.getOffsetValue();
        if (value < 0) {
            throw new BusinessException(TermMsg.t("通知时间点不能为负数"));
        }
        switch (normalizeUnit(dto.getInputUnit())) {
            case UNIT_DAY:
                return value * MINUTES_PER_DAY;
            case UNIT_HOUR:
                return value * MINUTES_PER_HOUR;
            default:
                return value;
        }
    }

    /** 分钟数还原成「界面上原本录入的数值」+ 粒度，用于回显 */
    public int toInputValue(Integer minutes, String unit) {
        if (minutes == null) {
            return 0;
        }
        switch (normalizeUnit(unit)) {
            case UNIT_DAY:
                return minutes / MINUTES_PER_DAY;
            case UNIT_HOUR:
                return minutes / MINUTES_PER_HOUR;
            default:
                return minutes;
        }
    }

    /**
     * 分钟数转可读文案：4320 → 「3 天」，90 → 「1 小时 30 分钟」，30 → 「30 分钟」。
     *
     * <p>精度取舍：天级档位优先用天表达（管理员配的就是「3 天」），
     * 余数继续用小时/分钟表达；纯小时/分钟档位不会出现「0 天 X 小时」这种别扭说法。
     */
    public String formatMinutes(Integer minutes) {
        if (minutes == null) {
            return "-";
        }
        if (minutes <= 0) {
            return "0 分钟";
        }
        int days = minutes / MINUTES_PER_DAY;
        int rest = minutes % MINUTES_PER_DAY;
        int hours = rest / MINUTES_PER_HOUR;
        int mins = rest % MINUTES_PER_HOUR;
        StringBuilder sb = new StringBuilder();
        if (days > 0) {
            sb.append(days).append(" 天");
        }
        if (hours > 0) {
            if (sb.length() > 0) {
                sb.append(" ");
            }
            sb.append(hours).append(" 小时");
        }
        if (mins > 0) {
            if (sb.length() > 0) {
                sb.append(" ");
            }
            sb.append(mins).append(" 分钟");
        }
        if (sb.length() == 0) {
            sb.append("0 分钟");
        }
        return sb.toString();
    }

    /** 提前量的「课前」口语化文案：4320 → 「课前 3 天」，30 → 「课前 30 分钟」 */
    public String formatBeforeLesson(Integer minutes) {
        if (minutes == null) {
            return "-";
        }
        return "课前 " + formatMinutes(minutes);
    }

    public String scopeText(String scope) {
        if ("course".equals(scope)) {
            return "课程专属规则";
        }
        if ("tenant".equals(scope)) {
            return "租户默认规则";
        }
        return "系统内置时间点";
    }

    private String normalizeUnit(String unit) {
        if (unit == null) {
            return UNIT_HOUR;
        }
        String u = unit.trim().toLowerCase();
        if (UNIT_DAY.equals(u) || UNIT_MINUTE.equals(u) || UNIT_HOUR.equals(u)) {
            return u;
        }
        return UNIT_HOUR;
    }

    /** 只保留启用档位，按 offset 降序 */
    private List<CourseNotifyRulePoint> enabledPoints(CourseNotifyRule rule) {
        if (rule == null || rule.getId() == null) {
            return Collections.emptyList();
        }
        List<CourseNotifyRulePoint> all = loadPoints(rule.getId());
        List<CourseNotifyRulePoint> enabled = new ArrayList<>();
        for (CourseNotifyRulePoint p : all) {
            if (p.getEnabled() == null || p.getEnabled() == 1) {
                enabled.add(p);
            }
        }
        enabled.sort((a, b) -> Integer.compare(
                b.getOffsetMinutes() == null ? 0 : b.getOffsetMinutes(),
                a.getOffsetMinutes() == null ? 0 : a.getOffsetMinutes()));
        return enabled;
    }

    /** 合成「不落库」的内置兜底档位（id 为 null，界面据此判断未配置） */
    private List<CourseNotifyRulePoint> builtinPoints() {
        List<CourseNotifyRulePoint> list = new ArrayList<>();
        for (int i = 0; i < BUILTIN.length; i++) {
            CourseNotifyRulePoint p = new CourseNotifyRulePoint();
            p.setSeq(BUILTIN[i][0]);
            p.setStage(BUILTIN_STAGES[i]);
            p.setOffsetMinutes(BUILTIN[i][1]);
            p.setInputUnit(BUILTIN[i][1] % MINUTES_PER_DAY == 0 ? UNIT_DAY : UNIT_MINUTE);
            p.setAudience(NotifyAudience.BOTH);
            p.setEnabled(1);
            list.add(p);
        }
        list.sort((a, b) -> Integer.compare(b.getOffsetMinutes(), a.getOffsetMinutes()));
        return list;
    }

    private List<CourseNotifyRulePoint> loadPoints(Long ruleId) {
        if (ruleId == null) {
            return Collections.emptyList();
        }
        LambdaQueryWrapper<CourseNotifyRulePoint> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(CourseNotifyRulePoint::getRuleId, ruleId);
        wrapper.orderByAsc(CourseNotifyRulePoint::getSeq);
        List<CourseNotifyRulePoint> list = pointMapper.selectList(wrapper);
        return list == null ? Collections.emptyList() : list;
    }

    private Map<Long, List<CourseNotifyRulePoint>> loadPointsByRuleIds(List<Long> ruleIds) {
        Map<Long, List<CourseNotifyRulePoint>> map = new HashMap<>();
        List<Long> ids = ruleIds.stream().filter(java.util.Objects::nonNull).collect(Collectors.toList());
        if (ids.isEmpty()) {
            return map;
        }
        LambdaQueryWrapper<CourseNotifyRulePoint> wrapper = new LambdaQueryWrapper<>();
        wrapper.in(CourseNotifyRulePoint::getRuleId, ids);
        wrapper.orderByAsc(CourseNotifyRulePoint::getSeq);
        List<CourseNotifyRulePoint> list = pointMapper.selectList(wrapper);
        if (list != null) {
            for (CourseNotifyRulePoint p : list) {
                map.computeIfAbsent(p.getRuleId(), k -> new ArrayList<>()).add(p);
            }
        }
        return map;
    }

    private Map<String, String> loadCourseNames(Set<String> courseIds) {
        Map<String, String> map = new HashMap<>();
        if (courseIds == null || courseIds.isEmpty()) {
            return map;
        }
        List<Course> courses = courseMapper.selectBatchIds(courseIds);
        if (courses != null) {
            for (Course c : courses) {
                if (c != null && c.getCourseId() != null) {
                    map.put(c.getCourseId(), c.getCourseName());
                }
            }
        }
        return map;
    }

    private CourseNotifyRule selectByCourseId(String courseId) {
        LambdaQueryWrapper<CourseNotifyRule> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(CourseNotifyRule::getCourseId, courseId);
        wrapper.last("LIMIT 1");
        return ruleMapper.selectOne(wrapper);
    }

    private boolean isEnabled(CourseNotifyRule rule) {
        return rule.getEnabled() == null || rule.getEnabled() == 1;
    }

    /** 解析 'yyyy-MM-dd HH:mm[:ss]' / 'yyyy-MM-dd' */
    public LocalDateTime parseTime(String text) {
        if (text == null || text.isBlank()) {
            return null;
        }
        String s = text.trim().replace('T', ' ');
        try {
            if (s.length() >= 16) {
                return LocalDateTime.parse(s.substring(0, 16), FMT);
            }
            return LocalDateTime.parse(s + " 00:00", FMT);
        } catch (Exception e) {
            log.warn("通知时间解析失败: {}", text);
            return null;
        }
    }

    private NotifyRuleVO toVO(CourseNotifyRule rule, String courseName,
                              List<CourseNotifyRulePoint> points) {
        NotifyRuleVO vo = new NotifyRuleVO();
        if (rule == null) {
            // 尚未配置：展示内置兜底档位，id 为 null，前端据此提示「尚未保存」
            vo.setCourseId(TENANT_DEFAULT_COURSE_ID);
            vo.setScope("tenant");
            vo.setName("租户默认规则（尚未保存，以下为系统内置时间点）");
            vo.setEnabled(1);
            vo.setPoints(toPointVOs(builtinPoints()));
            vo.setSummary(summary(builtinPoints()));
            return vo;
        }
        boolean tenantDefault = rule.getCourseId() == null || rule.getCourseId().isEmpty();
        vo.setId(rule.getId());
        vo.setCourseId(rule.getCourseId());
        vo.setScope(tenantDefault ? "tenant" : "course");
        vo.setName(rule.getName());
        vo.setEnabled(rule.getEnabled());
        vo.setRemark(rule.getRemark());
        vo.setUpdateTime(rule.getUpdateTime());
        vo.setCourseName(tenantDefault
                ? "租户默认规则"
                : (courseName == null || courseName.isEmpty() ? rule.getCourseId() : courseName));
        vo.setPoints(toPointVOs(points));
        vo.setSummary(summary(points));
        return vo;
    }

    private List<NotifyPointVO> toPointVOs(List<CourseNotifyRulePoint> points) {
        List<NotifyPointVO> list = new ArrayList<>();
        if (points == null) {
            return list;
        }
        for (CourseNotifyRulePoint p : points) {
            list.add(NotifyPointVO.of(p, toInputValue(p.getOffsetMinutes(), p.getInputUnit()),
                    formatMinutes(p.getOffsetMinutes())));
        }
        // 展示顺序按「离上课由远及近」，与时间轴一致
        list.sort((a, b) -> Integer.compare(
                b.getOffsetMinutes() == null ? 0 : b.getOffsetMinutes(),
                a.getOffsetMinutes() == null ? 0 : a.getOffsetMinutes()));
        return list;
    }

    /** 一句话摘要：「提前 3 天 → 提前 1 天 → 课前 1 小时 → 课前 30 分钟」 */
    private String summary(List<CourseNotifyRulePoint> points) {
        if (points == null || points.isEmpty()) {
            return "（未配置任何时间点）";
        }
        List<CourseNotifyRulePoint> sorted = new ArrayList<>(points);
        sorted.sort((a, b) -> Integer.compare(
                b.getOffsetMinutes() == null ? 0 : b.getOffsetMinutes(),
                a.getOffsetMinutes() == null ? 0 : a.getOffsetMinutes()));
        List<String> parts = new ArrayList<>();
        for (CourseNotifyRulePoint p : sorted) {
            String text = formatMinutes(p.getOffsetMinutes());
            if (p.getEnabled() != null && p.getEnabled() == 0) {
                text = text + "（已停用）";
            }
            parts.add(text);
        }
        return String.join(" → ", parts);
    }
}
