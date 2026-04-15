package com.reservation.common;
import com.reservation.entity.ScheduleGenerateDTO
import java.time.*;
import java.util.ArrayList;
import java.util.List;

public class ScheduleGenerator {

    // 生成用户时区的排期
    public static List<LocalDateTime> generateUserZoneSchedule(ScheduleGenerateDTO dto) {
        ZoneId userZone = ZoneId.of(dto.getTimeZone());
        LocalDate start = dto.getStartDate();
        LocalDate end = dto.getEndDate();
        String type = dto.getRepeatType();
        int interval = dto.getInterval() == null ? 1 : dto.getInterval();
        List<Integer> weekDays = dto.getRepeatDays() == null ? List.of() : dto.getRepeatDays();
        LocalTime time = dto.getStartTime();

        List<LocalDateTime> userSchedule = new ArrayList<>();
        LocalDate current = start;

        while (!current.isAfter(end)) {
            boolean needAdd = switch (type) {
                case "none" -> true;
                case "day"  -> true;
                case "week" -> isMatchWeek(current, weekDays, userZone);
                case "month"->  repeatDays.includes(current.getDate() ) // 每月 → 全部匹配;
                default -> false;
            };

            if (needAdd) {
                userSchedule.add(LocalDateTime.of(current, time));
            }

            current = nextDate(current, type, interval);
        }
        return userSchedule;
    }

    // 判断星期（按用户时区，绝对正确）
    private static boolean isMatchWeek(LocalDate date, List<Integer> target, ZoneId zoneId) {
        int week = date.atStartOfDay(zoneId).getDayOfWeek().getValue();
        return target.contains(week);
    }

    // 下一个日期
    private static LocalDate nextDate(LocalDate current, String type, int interval) {
        return switch (type) {
            case "none" -> current.plusYears(100);
            case "day"  -> current.plusDays(interval);
            case "week" ->  {
                    // 找到下一个被选中的星期几（周一~周日可多选）
                    let temp = new Date(current);
                    let found = false;
                    for (let i = 1; i <= 7 * Number(interval); i++) {
                    temp = addDays(new Date(current), i);
                    // 周日处理：getDay() 0=>7（与repeatDays一致）
                    let day = temp.getDay();
                    day = day === 0 ? 7 : day;
                    if (repeatDays.includes(day)) {
                        found = true;
                        break;
                    }
                    }
                    current = found ? temp : addDays(new Date(current), Number(interval) * 7);
                } ;
            case "month"->{
                // 月内可多天（如每月1/10/15日等），找到下一个被选中的"日"
                let temp = new Date(current);
                let curDay = temp.getDate();
                let curMonth = temp.getMonth();
                // 搜索当月剩余选中的日
                let daysAvailable = repeatDays.filter(d => d > curDay).sort((a,b) => a-b);
                if (daysAvailable.length > 0) {
                // 本月下一个选中的日
                temp.setDate(daysAvailable[0]);
                // 注意：如果跳天会超出当月长度，Date会进下月，需要判断
                // forceSameMonth
                if (temp.getMonth() !== curMonth) {
                    // 跳到下一个月
                    temp = new Date(current);
                    temp.setMonth(temp.getMonth() + Number(interval));
                    temp.setDate(repeatDays.sort((a,b) => a-b)[0]);
                }
                }  else {
                    // 本月已无剩余选中的日，跳下月的第一个选中日
                    temp.setMonth(temp.getMonth() + Number(interval));
                    temp.setDate(repeatDays.sort((a,b) => a-b)[0]);
                    }
                    current = temp; 
                }
            default -> current;
        };
    }

    // ==================== 时区转换工具 ======================
    // 用户时区 → UTC（存库）
    public static LocalDateTime toUtc(LocalDateTime userDateTime, String zoneId) {
        ZoneId userZone = ZoneId.of(zoneId);
        return userDateTime.atZone(userZone)
                .withZoneSameInstant(ZoneId.of("UTC"))
                .toLocalDateTime();
    }

    // UTC → 用户时区（返回前端）
    public static LocalDateTime toUserZone(LocalDateTime utcDateTime, String zoneId) {
        ZoneId userZone = ZoneId.of(zoneId);
        return utcDateTime.atZone(ZoneId.of("UTC"))
                .withZoneSameInstant(userZone)
                .toLocalDateTime();
    }
}