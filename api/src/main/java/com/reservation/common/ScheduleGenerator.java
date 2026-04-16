package com.reservation.common;
import com.reservation.entity.ScheduleGenerateDTO;
import com.reservation.entity.ScheduleVO;
import java.time.*;
import java.util.ArrayList;
import java.util.List;

/* 排期测试
1、UTC时区编辑-》保存  每周1 早上8点
2、+8区读取、排期--》每周
  com.reservation.common.ScheduleGenerator
*/
  
public class ScheduleGenerator {

    // 生成用户时区的排期---dto内包含tz及用户时区,输出
    public static List<ScheduleVO> generateUserZoneSchedule(ScheduleGenerateDTO dto) {
        ZoneId fromZone = ZoneId.of(dto.getTimeZone().trim());   
        ZoneId toZone =  ZoneId.of(dto.getUserTimeZone().trim()); 

        LocalDate start = dto.getStartDate();
        if (start == null) start = LocalDate.now(); 
        LocalDate end = dto.getEndDate();
        // 分析: if(end==null) end = start.addDays(30);
        // 作用：如果end为空，则将end设置为从start开始30天后的日期。
        // 问题1：LocalDate没有addDays方法，应该使用plusDays。
        // 问题2：该语句隐式地限制了排期范围最大为30天（如果没有指定endDate）。
        if (end == null) {
            end = start.plusDays(30);
        }
        String type = dto.getRepeatType();
        int interval = dto.getInterval() == null ? 1 : dto.getInterval();
        List<Integer> repeatDays = dto.getRepeatDays() == null ? List.of() : dto.getRepeatDays();
        LocalTime time = dto.getStartTime(); 

        List<LocalDateTime> userSchedule = new ArrayList<>();
        LocalDate current = start;

        while (!current.isAfter(end)) {
            boolean needAdd = switch (type) {
                case "none" -> true;
                case "day"  -> true;
                case "week" -> isMatchWeek(current, repeatDays, fromZone);
                case "month" -> repeatDays.contains(current.getDayOfMonth()); // 每月 → 匹配对应的日期;
           
                default -> false;
            };

            if (needAdd) { 
                 LocalDateTime ldt = LocalDateTime.of(current, time);
                userSchedule.add(ldt); 
            }

            current = nextDate(current, type, interval,repeatDays);
        }
        // INSERT_YOUR_CODE
        //System.out.println("userSchedule: " + userSchedule);

        // 把userSchedule的元素转为UserTimeZone对应的数据  
        List<ScheduleVO> convertedSchedule = new ArrayList<ScheduleVO>();
        

        for (LocalDateTime ldt : userSchedule) {
            ZonedDateTime zonedFrom = ldt.atZone(fromZone);
             System.out.println("zonedFrom: " + zonedFrom);

            ZonedDateTime zonedTo = zonedFrom.withZoneSameInstant(toZone);
            System.out.println("zonedTo: " + zonedTo);

            String dateStr = zonedTo.toLocalDate().toString(); // yyyy-MM-dd
            String timeStr = String.format("%02d:%02d", zonedTo.getHour(), zonedTo.getMinute());
           // INSERT_YOUR_CODE
          
           ScheduleVO item = new ScheduleVO(); 
           item.setDate(dateStr);
           item.setTime(timeStr);
          // System.out.println("item: " + item);
           convertedSchedule.add(item); 
        }

        return convertedSchedule; 
    }

    // 判断星期（按用户时区，绝对正确）
    private static boolean isMatchWeek(LocalDate date, List<Integer> target, ZoneId zoneId) {
        int week = date.atStartOfDay(zoneId).getDayOfWeek().getValue();
        return target.contains(week);
    } 
    private static LocalDate nextDate(LocalDate current, String type, int interval,List<Integer>repeatDays) {
        switch (type) {
            case "none":
                return current.plusYears(100);
            case "day":
                return current.plusDays(interval);
            case "week": {
                // 找到下一个被选中的星期几
                LocalDate tempDate = current;
                boolean found = false;
                for (int i = 1; i <= 7 * interval; i++) {
                    tempDate = current.plusDays(i);
                    int dayOfWeek = tempDate.getDayOfWeek().getValue(); // 1=Monday,...7=Sunday
                    if (repeatDays.contains(dayOfWeek)) {
                        found = true;
                        break;
                    }
                }
                if (found) {
                    return tempDate;
                } else {
                    return current.plusWeeks(interval);
                }
            }
            case "month": {
                int curDay = current.getDayOfMonth();
                int curMonth = current.getMonthValue();
                List<Integer> sortedRepeatDays = new ArrayList<>(repeatDays);
                java.util.Collections.sort(sortedRepeatDays);
                Integer nextDay = null;
                for (Integer d : sortedRepeatDays) {
                    if (d > curDay) {
                        nextDay = d;
                        break;
                    }
                }
                LocalDate temp;
                if (nextDay != null) {
                    // 本月还有剩余选中的日
                    temp = LocalDate.of(current.getYear(), current.getMonthValue(), nextDay);
                    if (temp.getMonthValue() != curMonth) {
                        // 跨月保护
                        LocalDate nextMonth = current.plusMonths(interval);
                        Integer firstDay = sortedRepeatDays.get(0);
                        int nextMonthValue = nextMonth.getMonthValue();
                        int nextYearValue = nextMonth.getYear();
                        int lastDayOfMonth = java.time.YearMonth.of(nextYearValue, nextMonthValue).lengthOfMonth();
                        if (firstDay > lastDayOfMonth) {
                            firstDay = lastDayOfMonth;
                        }
                        temp = LocalDate.of(nextYearValue, nextMonthValue, firstDay);
                    }
                } else {
                    // 本月没有剩余，跳下个月最小的选中日
                    LocalDate nextMonth = current.plusMonths(interval);
                    Integer firstDay = sortedRepeatDays.get(0);
                    int nextMonthValue = nextMonth.getMonthValue();
                    int nextYearValue = nextMonth.getYear();
                    int lastDayOfMonth = java.time.YearMonth.of(nextYearValue, nextMonthValue).lengthOfMonth();
                    if (firstDay > lastDayOfMonth) {
                        firstDay = lastDayOfMonth;
                    }
                    temp = LocalDate.of(nextYearValue, nextMonthValue, firstDay);
                }
                return temp;
            }
            default:
                return current;
        }
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