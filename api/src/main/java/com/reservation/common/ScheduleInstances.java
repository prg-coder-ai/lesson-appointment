package com.reservation.common;

import com.reservation.dto.ScheduleGenerateDTO;
import com.reservation.dto.ScheduleVO;
import com.reservation.entity.CourseSchedule;
import lombok.extern.slf4j.Slf4j;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * 排期 → 课次实例展开（2026-10-28，供「多课次事件推送」复用）。
 *
 * <h3>为什么需要独立一份</h3>
 * 把排期按重复规则展开成「第 1 次、第 2 次…」的逻辑本来是 {@code CourseScheduleService}
 * 里两个私有方法（{@code ObjectToCreateDto} + {@code CreateDtoToGenerateDto}）拼出来的，
 * 只有「某学生预约成功后生成课次」这一条路径用到。现在课堂侧也要按课次建课堂，
 * 同一份规则必须能被第二处调用——否则「课次时间」会出现两个真相源。
 *
 * <p><b>刻意不改造原私有方法</b>：它们嵌在 600 行的排期服务里、与建课次的事务强耦合，
 * 动它风险远大于收益。这里只做「同样的字段映射 + 同一个生成器」，
 * 并用单测钉住两边展开结果一致（见 {@code ScheduleInstancesTest}）。
 *
 * <p>返回的是**排期时区的本地墙钟时间**（{@link ScheduleVO#getDate()} + {@link ScheduleVO#getTime()}），
 * 与课次落库前的形态一致；落成 UTC 才需要 {@link ScheduleGenerator#scheduleLocalToUtc}。
 */
@Slf4j
public final class ScheduleInstances {

    private static final DateTimeFormatter DT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private ScheduleInstances() {
    }

    /**
     * 展开课次实例。
     *
     * @return 按时间升序的实例列表；排期字段不全/规则非法时返回空列表（调用方负责兜底，勿抛异常）
     */
    public static List<ScheduleVO> expand(CourseSchedule cs) {
        if (cs == null || cs.getStartTime() == null || cs.getStartTime().length() < 16) {
            return Collections.emptyList();
        }
        try {
            ScheduleGenerateDTO dto = new ScheduleGenerateDTO();
            // 起始日期 + 起始时刻：start_time 同时承载两者（格式 yyyy-MM-dd HH:mm:ss）
            dto.setStartDate(LocalDate.parse(cs.getStartTime().substring(0, 10)));
            dto.setStartTime(LocalTime.parse(cs.getStartTime().substring(11, Math.min(19, cs.getStartTime().length()))));
            // 结束日期 = 重复结束日期（end_time 同时承载「最后一次的日期」与时刻）
            if (cs.getEndTime() != null && cs.getEndTime().length() >= 10) {
                dto.setEndDate(LocalDate.parse(cs.getEndTime().substring(0, 10)));
            }
            dto.setRepeatType(repeatTypeText(cs.getRepeatType()));
            dto.setInterval(cs.getRepeatInterval() <= 0 ? 1 : cs.getRepeatInterval());
            dto.setRepeatDays(parseRepeatDays(cs.getRepeatDays()));
            String zone = (cs.getTimeZone() == null || cs.getTimeZone().trim().isEmpty())
                    ? "Asia/Shanghai" : cs.getTimeZone().trim();
            dto.setTimeZone(zone);
            // 排期时区即用户时区：展开结果要落在「排期所在时区的墙钟」上，
            // 与 CourseScheduleService 建课次时的口径一致（genDto.setUserTimeZone(timeZone)）
            dto.setUserTimeZone(zone);

            List<ScheduleVO> list = ScheduleGenerator.generateUserZoneSchedule(dto);
            return list == null ? Collections.emptyList() : list;
        } catch (Exception e) {
            // 一条排期的规则异常不该让整批推送失败，交由调用方回落到「单次课」处理
            log.warn("排期课次展开失败，按单次课兜底: scheduleId={}, err={}", cs.getScheduleId(), e.getMessage());
            return Collections.emptyList();
        }
    }

    /** 与 CourseScheduleService#CreateDtoToGenerateDto 的映射逐字一致（0/1/2/3 → none/day/week/month） */
    public static String repeatTypeText(int repeatType) {
        return switch (repeatType) {
            case 1 -> "day";
            case 2 -> "week";
            case 3 -> "month";
            default -> "none";
        };
    }

    /**
     * "1,3,5" → [1, 3, 5]。
     *
     * <p>非法片段直接跳过而不是整体失败：老数据里存在全角逗号、空格混排，
     * 一个坏片段不该让整条排期没有课次。
     */
    public static List<Integer> parseRepeatDays(String raw) {
        if (raw == null || raw.trim().isEmpty()) {
            return List.of();
        }
        List<Integer> days = new ArrayList<>();
        for (String part : raw.replace('，', ',').split(",")) {
            String s = part.trim();
            if (s.isEmpty()) continue;
            try {
                days.add(Integer.parseInt(s));
            } catch (NumberFormatException ignore) {
                // 跳过坏片段
            }
        }
        return days;
    }

    /** 课次时长（分钟）：优先 class_duration，缺失时按 start/end 当天的时刻差推算，最后回落 60 */
    public static int durationMinutes(CourseSchedule cs) {
        if (cs == null) return 60;
        Integer d = cs.getClassDuration();
        if (d != null && d > 0) return d;
        try {
            String s = cs.getStartTime();
            String e = cs.getEndTime();
            if (s != null && e != null && s.length() >= 19 && e.length() >= 19) {
                LocalTime st = LocalTime.parse(s.substring(11, 19));
                LocalTime et = LocalTime.parse(e.substring(11, 19));
                int minutes = (int) java.time.Duration.between(st, et).toMinutes();
                if (minutes > 0) return minutes;
            }
        } catch (Exception ignore) {
            // 落到 60
        }
        return 60;
    }

    /** 本地墙钟时间串（payload 用，classroom-service 侧按 LocalDateTime 接收） */
    public static String localText(ScheduleVO vo) {
        return localDateTime(vo).format(DT);
    }

    /** 实例 → 本地墙钟 LocalDateTime（date + time 拼接；time 只有 HH:mm 时补秒） */
    public static java.time.LocalDateTime localDateTime(ScheduleVO vo) {
        String date = vo.getDate() == null ? "" : vo.getDate().trim();
        String time = vo.getTime() == null ? "" : vo.getTime().trim();
        if (time.length() == 5) time = time + ":00";
        return java.time.LocalDateTime.parse(date + "T" + time);
    }
}
