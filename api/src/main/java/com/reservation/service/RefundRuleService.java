package com.reservation.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.reservation.dto.RefundRuleDTO;
import com.reservation.entity.Appointment;
import com.reservation.entity.Booking;
import com.reservation.entity.Course;
import com.reservation.entity.CourseRefundRule;
import com.reservation.entity.CourseSchedule;
import com.reservation.exception.BusinessException;
import com.reservation.mapper.AppointmentMapper;
import com.reservation.mapper.BookingMapper;
import com.reservation.mapper.CourseMapper;
import com.reservation.mapper.CourseRefundRuleMapper;
import com.reservation.mapper.CourseScheduleMapper;
import com.reservation.utils.TenantContext;
import com.reservation.utils.TermMsg;
import com.reservation.vo.RefundHintVO;
import com.reservation.vo.RefundRuleVO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

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
 * 课程退改规则服务。
 *
 * <p>负责三件事：
 * <ol>
 *   <li><b>规则维护</b>：租户默认规则 + 课程级覆盖的增删改查（租户管理员「系统配置 → 退改规则」）；</li>
 *   <li><b>规则求值</b>：按「学年课次时间 − 当前时间」的提前量，判定为免责 / 部分退费 / 不退费；</li>
 *   <li><b>提示文案</b>：学生提交请假前、管理员审核确认请假前，都由这里给出同一份判定与文案，
 *       两端结论必然一致（前端不自行算时间差，避免客户端时钟误差导致分歧）。</li>
 * </ol>
 *
 * <p><b>求值优先级</b>：课程专属规则 &gt; 租户默认规则 &gt; 本类内置兜底默认值。
 * 任一级别被停用（enabled=0）即视为未配置，继续向下回落，并在提示里说明降级原因。
 *
 * <p><b>时间基准</b>：该<b>课次</b>的时间（{@code appointment.appointment_datetime}），
 * 而不是排期首课时间——学生请假针对的是具体某一次课。
 */
@Service
public class RefundRuleService {

    private static final Logger log = LoggerFactory.getLogger(RefundRuleService.class);

    /** 租户默认规则用空串做 course_id（MySQL 唯一索引下 NULL 不去重，必须用空串） */
    public static final String TENANT_DEFAULT_COURSE_ID = "";

    /** 内置兜底：提前 24 小时免责 */
    private static final int BUILTIN_FREE_MINUTES = 24 * 60;
    /** 内置兜底：提前 12 小时起部分退费 */
    private static final int BUILTIN_PARTIAL_MINUTES = 12 * 60;
    /** 内置兜底：部分退费比例 */
    private static final int BUILTIN_PARTIAL_PERCENT = 50;

    /** 阈值上限：30 天。再大无业务意义，且能挡住误填（如把「24 小时」填成 240000） */
    private static final int MAX_MINUTES = 30 * 24 * 60;

    private static final String UNIT_HOUR = "hour";
    private static final String UNIT_MINUTE = "minute";

    private static final DateTimeFormatter LESSON_TIME_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    @Autowired
    private CourseRefundRuleMapper ruleMapper;
    @Autowired
    private AppointmentMapper appointmentMapper;
    @Autowired
    private BookingMapper bookingMapper;
    @Autowired
    private CourseScheduleMapper courseScheduleMapper;
    @Autowired
    private CourseMapper courseMapper;

    // ========================================================================
    // 一、规则维护
    // ========================================================================

    /**
     * 租户上下文硬校验。
     *
     * <p><b>为什么必须有这一步</b>：租户插件的 {@code ignoreTable} 在
     * {@code tenantId = 0}（平台管理员）时返回 true，<b>完全不拼租户条件</b>。
     * 而 {@code checkAdmin} 是放行平台管理员的，若不在这里拦住，
     * 平台管理员调用本接口时 {@code selectOne} 可能读到<b>别的租户</b>的规则行
     * （默认规则用空串做 course_id，跨租户全都撞在同一个值上）。
     * 退改规则是租户业务配置，只允许有明确租户身份的人读写。
     */
    private void requireTenantContext() {
        Long tenantId = TenantContext.getTenantId();
        if (tenantId == null || tenantId == 0L) {
            throw new BusinessException("退改规则按租户隔离，请以租户管理员身份操作");
        }
    }

    /**
     * 列出本租户的退改规则：默认规则置顶，课程规则按更新时间倒序。
     * 默认规则尚未配置时，用内置兜底值补一条「虚拟」项（id 为 null），方便界面直接编辑保存。
     */
    public List<RefundRuleVO> listRules() {
        requireTenantContext();
        LambdaQueryWrapper<CourseRefundRule> wrapper = new LambdaQueryWrapper<>();
        wrapper.orderByDesc(CourseRefundRule::getUpdateTime).orderByDesc(CourseRefundRule::getId);
        List<CourseRefundRule> rows = ruleMapper.selectList(wrapper);
        if (rows == null) {
            rows = new ArrayList<>();
        }

        // 批量取课程名，避免逐条查库
        Set<String> courseIds = rows.stream()
                .map(CourseRefundRule::getCourseId)
                .filter(cid -> cid != null && !cid.isEmpty())
                .collect(Collectors.toSet());
        Map<String, String> courseNameMap = new HashMap<>();
        if (!courseIds.isEmpty()) {
            List<Course> courses = courseMapper.selectBatchIds(courseIds);
            if (courses != null) {
                for (Course c : courses) {
                    if (c != null && c.getCourseId() != null) {
                        courseNameMap.put(c.getCourseId(), c.getCourseName());
                    }
                }
            }
        }

        List<RefundRuleVO> result = new ArrayList<>();
        CourseRefundRule tenantDefault = null;
        for (CourseRefundRule row : rows) {
            if (row.getCourseId() == null || row.getCourseId().isEmpty()) {
                tenantDefault = row;
            } else {
                result.add(toVO(row, courseNameMap.getOrDefault(row.getCourseId(), row.getCourseId())));
            }
        }
        // 默认规则置顶
        result.add(0, toVO(tenantDefault, null));
        return result;
    }

    /**
     * 计算某门课程实际生效的规则（课程专属 &gt; 租户默认 &gt; 内置兜底）。
     *
     * @param courseId 课程ID，可为空（为空时直接查租户默认）
     * @return 一定非 null：库里没有配置时返回按内置兜底值合成的对象（id 为 null）
     */
    public CourseRefundRule getEffectiveRule(String courseId) {
        requireTenantContext();
        return resolveRule(courseId).rule;
    }

    /** 规则解析结果：生效规则 + 来源作用域 + 降级说明 */
    private static class Resolved {
        CourseRefundRule rule;
        String scope;
        String fallbackNotice;
    }

    /** 求值优先级：课程专属（启用）→ 租户默认（启用）→ 内置兜底；被停用即视为未配置，继续向下回落 */
    private Resolved resolveRule(String courseId) {
        Resolved resolved = new Resolved();
        CourseRefundRule courseRow = (courseId == null || courseId.isEmpty())
                ? null : selectByCourseId(courseId);
        CourseRefundRule tenantRow = selectByCourseId(TENANT_DEFAULT_COURSE_ID);

        if (courseRow != null && isEnabled(courseRow)) {
            resolved.rule = courseRow;
            resolved.scope = "course";
        } else if (tenantRow != null && isEnabled(tenantRow)) {
            resolved.rule = tenantRow;
            resolved.scope = "tenant";
            if (courseRow != null) {
                resolved.fallbackNotice = "该课程的专属规则已停用，当前按租户默认规则执行";
            }
        } else {
            resolved.rule = builtinRule();
            resolved.scope = "builtin";
            if (courseRow != null) {
                resolved.fallbackNotice = "该课程的专属规则已停用，且租户未配置默认规则，当前按系统内置默认执行";
            } else if (tenantRow != null) {
                resolved.fallbackNotice = "租户默认规则已停用，当前按系统内置默认执行";
            }
        }
        return resolved;
    }

    /** 保存（新增或覆盖）规则：courseId 为空串/null 即保存租户默认规则 */
    public CourseRefundRule save(RefundRuleDTO dto) {
        if (dto == null) {
            throw new BusinessException("规则内容不能为空");
        }
        String courseId = dto.getCourseId() == null ? TENANT_DEFAULT_COURSE_ID : dto.getCourseId().trim();
        if (!courseId.isEmpty()) {
            Course course = courseMapper.selectById(courseId);
            if (course == null) {
                throw new BusinessException("课程不存在或不属于当前租户，无法配置规则");
            }
        }

        int freeMinutes = requireMinutes(dto.getFreeBeforeMinutes(), "免责时间点");
        int partialMinutes = requireMinutes(dto.getPartialBeforeMinutes(), "部分退费时间点");
        if (freeMinutes < partialMinutes) {
            throw new BusinessException("免责时间点必须大于或等于部分退费时间点，否则三档区间会自相矛盾");
        }
        Integer percentObj = dto.getPartialRefundPercent();
        int percent = percentObj == null ? BUILTIN_PARTIAL_PERCENT : percentObj;
        if (percent < 0 || percent > 100) {
            throw new BusinessException("部分退费比例需在 0~100 之间");
        }
        if (percent == 100) {
            throw new BusinessException("部分退费比例为 100% 等同于免责，请直接调整免责时间点");
        }
        if (percent == 0) {
            throw new BusinessException("部分退费比例为 0% 等同于不退费，请直接调整部分退费时间点");
        }

        CourseRefundRule existing = selectByCourseId(courseId);
        CourseRefundRule row = new CourseRefundRule();
        row.setCourseId(courseId);
        row.setEnabled(dto.getEnabled() == null ? 1 : dto.getEnabled());
        row.setFreeBeforeMinutes(freeMinutes);
        row.setFreeUnit(normalizeUnit(dto.getFreeUnit()));
        row.setPartialBeforeMinutes(partialMinutes);
        row.setPartialUnit(normalizeUnit(dto.getPartialUnit()));
        row.setPartialRefundPercent(percent);
        row.setRemark(dto.getRemark());

        if (existing == null) {
            ruleMapper.insert(row);
            log.info("新增退改规则, courseId='{}', 免责{}分钟, 部分退费{}分钟/{}%",
                    courseId, freeMinutes, partialMinutes, percent);
        } else {
            row.setId(existing.getId());
            ruleMapper.updateById(row);
            log.info("更新退改规则, courseId='{}', 免责{}分钟, 部分退费{}分钟/{}%",
                    courseId, freeMinutes, partialMinutes, percent);
        }
        return row;
    }

    /**
     * 删除规则行。
     *
     * @param courseId 课程ID；空串表示删除租户默认规则（删除后回落到内置兜底默认）
     * @return 受影响行数
     */
    public int deleteRule(String courseId) {
        requireTenantContext();
        String cid = courseId == null ? TENANT_DEFAULT_COURSE_ID : courseId.trim();
        LambdaQueryWrapper<CourseRefundRule> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(CourseRefundRule::getCourseId, cid);
        int rows = ruleMapper.delete(wrapper);
        log.info("删除退改规则, courseId='{}', 影响{}行", cid, rows);
        return rows;
    }

    // ========================================================================
    // 二、规则求值 / 提示
    // ========================================================================

    /**
     * 按课次ID给出退改规则提示。学生端、管理端审核都用这一个入口。
     *
     * <p>链路：appointment → booking → course_schedule → course，
     * 拿到课次时间与课程后求值。
     */
    public RefundHintVO hintByAppointment(Integer appointmentId) {
        if (appointmentId == null) {
            throw new BusinessException("课次ID不能为空");
        }
        Appointment appointment = appointmentMapper.selectById(appointmentId);
        if (appointment == null) {
            throw new BusinessException("课次不存在");
        }
        String courseId = null;
        String courseName = null;
        String bookingId = appointment.getBookingId();
        if (bookingId != null && !bookingId.isEmpty()) {
            Booking booking = bookingMapper.selectById(bookingId);
            if (booking != null && booking.getScheduleId() != null) {
                CourseSchedule schedule = courseScheduleMapper.selectById(booking.getScheduleId());
                if (schedule != null) {
                    courseId = schedule.getCourseId();
                }
            }
        }
        if (courseId != null && !courseId.isEmpty()) {
            Course course = courseMapper.selectById(courseId);
            if (course != null) {
                courseName = course.getCourseName();
            }
        }
        return evaluate(courseId, courseName, appointment.getAppointmentDatetime(),
                appointmentId, bookingId);
    }

    /**
     * 按「排期 + 课次时间」给出提示（课次记录尚未生成时的兜底入口，例如预定前的规则预览）。
     */
    public RefundHintVO hintBySchedule(String scheduleId, String lessonTime) {
        String courseId = null;
        String courseName = null;
        if (scheduleId != null && !scheduleId.isEmpty()) {
            CourseSchedule schedule = courseScheduleMapper.selectById(scheduleId);
            if (schedule != null) {
                courseId = schedule.getCourseId();
                if (courseId != null && !courseId.isEmpty()) {
                    Course course = courseMapper.selectById(courseId);
                    if (course != null) {
                        courseName = course.getCourseName();
                    }
                }
            }
        }
        return evaluate(courseId, courseName, parseLessonTime(lessonTime), null, null);
    }

    /** 无法定位课次/排期时，按课程ID直接求值（用于管理端配置页预览） */
    public RefundHintVO previewByCourse(String courseId, String lessonTime) {
        requireTenantContext();
        String courseName = null;
        if (courseId != null && !courseId.isEmpty()) {
            Course course = courseMapper.selectById(courseId);
            if (course != null) {
                courseName = course.getCourseName();
            }
        }
        return evaluate(courseId, courseName, parseLessonTime(lessonTime), null, null);
    }

    /**
     * 核心判定：给定课程与课次时间，算出档位与提示文案。
     *
     * @param courseId     课程ID，可为 null
     * @param courseName   课程名，仅用于文案
     * @param lessonTime   课次时间，可为 null（为 null 时按内置默认值给「未知时间」提示）
     * @param appointmentId 课次ID，仅回填
     * @param bookingId     预订ID，仅回填
     */
    public RefundHintVO evaluate(String courseId, String courseName,
                                 LocalDateTime lessonTime, Integer appointmentId, String bookingId) {
        // 规则解析必须发生在明确的租户上下文里，否则 selectOne 可能跨租户命中
        requireTenantContext();
        // 1. 取生效规则（含降级说明）
        CourseRefundRule courseRow = (courseId == null || courseId.isEmpty())
                ? null : selectByCourseId(courseId);
        CourseRefundRule tenantRow = selectByCourseId(TENANT_DEFAULT_COURSE_ID);

        CourseRefundRule effective;
        String scope;
        String fallbackNotice = null;
        if (courseRow != null && isEnabled(courseRow)) {
            effective = courseRow;
            scope = "course";
        } else if (tenantRow != null && isEnabled(tenantRow)) {
            effective = tenantRow;
            scope = "tenant";
            if (courseRow != null) {
                fallbackNotice = "该课程的专属规则已停用，当前按租户默认规则执行";
            }
        } else {
            effective = builtinRule();
            scope = "builtin";
            if (courseRow != null) {
                fallbackNotice = "该课程的专属规则已停用，且租户未配置默认规则，当前按系统内置默认执行";
            } else if (tenantRow != null) {
                fallbackNotice = "租户默认规则已停用，当前按系统内置默认执行";
            }
        }

        RefundHintVO vo = new RefundHintVO();
        vo.setMatched(!"builtin".equals(scope));
        vo.setScope(scope);
        vo.setScopeText(scopeText(scope));
        vo.setCourseId(courseId);
        vo.setCourseName(courseName);
        vo.setAppointmentId(appointmentId);
        vo.setBookingId(bookingId);
        vo.setFreeBeforeMinutes(effective.getFreeBeforeMinutes());
        vo.setPartialBeforeMinutes(effective.getPartialBeforeMinutes());
        vo.setPartialRefundPercent(effective.getPartialRefundPercent());
        vo.setFreeBeforeText(formatMinutes(effective.getFreeBeforeMinutes()));
        vo.setPartialBeforeText(formatMinutes(effective.getPartialBeforeMinutes()));
        vo.setRuleText(buildRuleText(effective));
        vo.setFallbackNotice(fallbackNotice);

        if (lessonTime == null) {
            // 时间未知：不下判定，只把规则摆出来，避免误导
            vo.setMinutesAhead(null);
            vo.setAheadText("未知");
            vo.setLevel(null);
            vo.setLevelText("无法判定（课次时间缺失）");
            vo.setRefundPercent(null);
            vo.setRefundable(null);
            vo.setMessage(TermMsg.t(
                    "当前课次时间缺失，无法判定退改档位。规则为：{rule}。",
                    single("rule", vo.getRuleText())));
            return vo;
        }

        vo.setLessonTime(lessonTime.format(LESSON_TIME_FMT));
        long minutesAhead = Duration.between(LocalDateTime.now(), lessonTime).toMinutes();
        vo.setMinutesAhead(minutesAhead);
        vo.setAheadText(aheadText(minutesAhead));

        int freeLine = effective.getFreeBeforeMinutes() == null ? BUILTIN_FREE_MINUTES : effective.getFreeBeforeMinutes();
        int partialLine = effective.getPartialBeforeMinutes() == null ? BUILTIN_PARTIAL_MINUTES : effective.getPartialBeforeMinutes();
        int percent = effective.getPartialRefundPercent() == null ? BUILTIN_PARTIAL_PERCENT : effective.getPartialRefundPercent();

        String level;
        String levelText;
        int refundPercent;
        String verdict;
        if (minutesAhead < 0) {
            level = "past";
            levelText = "已过上课时间";
            refundPercent = 0;
            verdict = "该课次的上课时间已过，不予退费";
        } else if (minutesAhead >= freeLine) {
            level = "free";
            levelText = "免责（全额退）";
            refundPercent = 100;
            verdict = "可免责退改，不收取任何费用（退 100%）";
        } else if (minutesAhead >= partialLine) {
            level = "partial";
            levelText = "部分退费";
            refundPercent = percent;
            verdict = "可部分退费，退还 " + percent + "%";
        } else {
            level = "none";
            levelText = "不退费";
            refundPercent = 0;
            verdict = "不予退费（退 0%）";
        }
        vo.setLevel(level);
        vo.setLevelText(levelText);
        vo.setRefundPercent(refundPercent);
        vo.setRefundable(refundPercent > 0);

        Map<String, String> vars = new LinkedHashMap<>();
        vars.put("courseName", courseName == null || courseName.isEmpty() ? "" : "《" + courseName + "》");
        vars.put("lessonTime", vo.getLessonTime());
        vars.put("ahead", vo.getAheadText());
        vars.put("verdict", verdict);
        vars.put("rule", vo.getRuleText());
        vars.put("scope", vo.getScopeText());
        String template = "本次课次 {courseName} 时间为 {lessonTime}，距上课还有 {ahead}。"
                + "依退改规则（{scope}）：{verdict}。";
        String message = TermMsg.t(template, vars);
        if (fallbackNotice != null) {
            message = message + " 提示：" + fallbackNotice + "。";
        }
        vo.setMessage(message);
        return vo;
    }

    // ========================================================================
    // 三、工具方法
    // ========================================================================

    /** 规则三档说明，如「提前≥24 小时免责；≥12 小时退 50%；不足 12 小时不退费」 */
    public String buildRuleText(CourseRefundRule rule) {
        if (rule == null) {
            return "";
        }
        int free = rule.getFreeBeforeMinutes() == null ? BUILTIN_FREE_MINUTES : rule.getFreeBeforeMinutes();
        int partial = rule.getPartialBeforeMinutes() == null ? BUILTIN_PARTIAL_MINUTES : rule.getPartialBeforeMinutes();
        int percent = rule.getPartialRefundPercent() == null ? BUILTIN_PARTIAL_PERCENT : rule.getPartialRefundPercent();
        return "提前≥" + formatMinutes(free) + "免责；≥" + formatMinutes(partial)
                + "退 " + percent + "%；不足 " + formatMinutes(partial) + "不退费";
    }

    /** 分钟数转可读文案：390 → 「6 小时 30 分钟」，1440 → 「24 小时」，1500 → 「1 天 1 小时」 */
    public String formatMinutes(Integer minutes) {
        if (minutes == null) {
            return "-";
        }
        if (minutes <= 0) {
            return "0 分钟";
        }
        int days = minutes / (24 * 60);
        int rest = minutes % (24 * 60);
        int hours = rest / 60;
        int mins = rest % 60;
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

    /** 提前量可读文案：「1 天 6 小时」/「35 分钟」/「已过上课时间 2 小时 10 分钟」 */
    private String aheadText(long minutesAhead) {
        if (minutesAhead < 0) {
            return "已过上课时间 " + formatMinutes((int) Math.abs(minutesAhead));
        }
        return formatMinutes((int) minutesAhead);
    }

    private String scopeText(String scope) {
        if ("course".equals(scope)) {
            return "课程专属规则";
        }
        if ("tenant".equals(scope)) {
            return "租户默认规则";
        }
        return "系统内置默认";
    }

    private CourseRefundRule selectByCourseId(String courseId) {
        LambdaQueryWrapper<CourseRefundRule> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(CourseRefundRule::getCourseId, courseId);
        wrapper.last("LIMIT 1");
        return ruleMapper.selectOne(wrapper);
    }

    private boolean isEnabled(CourseRefundRule rule) {
        return rule.getEnabled() == null || rule.getEnabled() == 1;
    }

    /** 合成「不需要落库」的兜底规则（id 为 null，界面据此判断未配置） */
    private CourseRefundRule builtinRule() {
        CourseRefundRule rule = new CourseRefundRule();
        rule.setCourseId(TENANT_DEFAULT_COURSE_ID);
        rule.setEnabled(1);
        rule.setFreeBeforeMinutes(BUILTIN_FREE_MINUTES);
        rule.setFreeUnit(UNIT_HOUR);
        rule.setPartialBeforeMinutes(BUILTIN_PARTIAL_MINUTES);
        rule.setPartialUnit(UNIT_HOUR);
        rule.setPartialRefundPercent(BUILTIN_PARTIAL_PERCENT);
        return rule;
    }

    private int requireMinutes(Integer value, String fieldName) {
        if (value == null) {
            throw new BusinessException(fieldName + "不能为空");
        }
        if (value < 0) {
            throw new BusinessException(fieldName + "不能为负数");
        }
        if (value > MAX_MINUTES) {
            throw new BusinessException(fieldName + "不能超过 " + formatMinutes(MAX_MINUTES) + "（30 天）");
        }
        return value;
    }

    private String normalizeUnit(String unit) {
        return UNIT_MINUTE.equalsIgnoreCase(unit == null ? "" : unit.trim()) ? UNIT_MINUTE : UNIT_HOUR;
    }

    private LocalDateTime parseLessonTime(String lessonTime) {
        if (lessonTime == null || lessonTime.isBlank()) {
            return null;
        }
        String s = lessonTime.trim().replace('T', ' ');
        // 允许 'yyyy-MM-dd HH:mm'、'yyyy-MM-dd HH:mm:ss'、'yyyy-MM-dd'
        try {
            if (s.length() >= 16) {
                return LocalDateTime.parse(s.substring(0, 16), LESSON_TIME_FMT);
            }
            return LocalDateTime.parse(s + " 00:00", LESSON_TIME_FMT);
        } catch (Exception e) {
            log.warn("课次时间解析失败: {}", lessonTime);
            return null;
        }
    }

    private RefundRuleVO toVO(CourseRefundRule rule, String courseName) {
        RefundRuleVO vo = new RefundRuleVO();
        if (rule == null) {
            // 默认规则尚未配置：展示内置兜底值，id 为 null，前端据此提示「尚未保存」
            CourseRefundRule builtin = builtinRule();
            vo.setCourseId(TENANT_DEFAULT_COURSE_ID);
            vo.setCourseName("租户默认规则（尚未保存，以下为系统内置默认值）");
            vo.setScope("tenant");
            vo.setEnabled(builtin.getEnabled());
            vo.setFreeBeforeMinutes(builtin.getFreeBeforeMinutes());
            vo.setFreeUnit(builtin.getFreeUnit());
            vo.setPartialBeforeMinutes(builtin.getPartialBeforeMinutes());
            vo.setPartialUnit(builtin.getPartialUnit());
            vo.setPartialRefundPercent(builtin.getPartialRefundPercent());
            vo.setRuleText(buildRuleText(builtin));
            return vo;
        }
        boolean tenantDefault = rule.getCourseId() == null || rule.getCourseId().isEmpty();
        vo.setId(rule.getId());
        vo.setCourseId(rule.getCourseId());
        vo.setCourseName(tenantDefault
                ? "租户默认规则"
                : (courseName == null || courseName.isEmpty() ? rule.getCourseId() : courseName));
        vo.setScope(tenantDefault ? "tenant" : "course");
        vo.setEnabled(rule.getEnabled());
        vo.setFreeBeforeMinutes(rule.getFreeBeforeMinutes());
        vo.setFreeUnit(rule.getFreeUnit());
        vo.setPartialBeforeMinutes(rule.getPartialBeforeMinutes());
        vo.setPartialUnit(rule.getPartialUnit());
        vo.setPartialRefundPercent(rule.getPartialRefundPercent());
        vo.setRemark(rule.getRemark());
        vo.setUpdateTime(rule.getUpdateTime());
        vo.setRuleText(buildRuleText(rule));
        return vo;
    }

    private Map<String, String> single(String key, String value) {
        Map<String, String> m = new HashMap<>(2);
        m.put(key, value == null ? "" : value);
        return m;
    }

    /** 供管理端配置页下拉用：列出当前租户所有课程（含名称），前端据此渲染覆盖列表 */
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
}
