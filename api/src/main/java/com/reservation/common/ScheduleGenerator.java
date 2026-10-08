package com.reservation.common;
import com.reservation.dto.ScheduleGenerateDTO;
import com.reservation.dto.ScheduleVO;
import java.time.*;
import java.util.ArrayList;
import java.util.List;
import lombok.extern.slf4j.Slf4j;

/* 排期测试
1、UTC时区编辑-》保存  每周1 早上8点
2、+8区读取、排期--》每周
  com.reservation.common.ScheduleGenerator
*/
  
@Slf4j
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
       // log.debug("interval:"+interval);
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
                    // log.debug("needAdd:"+current+" "+needAdd);
            if (needAdd) { 
                 LocalDateTime ldt = LocalDateTime.of(current, time);
                
                userSchedule.add(ldt); 
            }

            current = nextDate(current, type, interval,repeatDays);
             // log.debug("current:"+current);
        }
            List<ScheduleVO> convertedSchedule = new ArrayList<ScheduleVO>();
        // INSERT_YOUR_CODE
        boolean isSameZone = fromZone.equals(toZone);

        if(isSameZone) { 
           // log.debug("zonedFrom: " + fromZone);
                for (LocalDateTime ldt : userSchedule) {
                    ZonedDateTime zonedFrom = ldt.atZone(fromZone); 

                    String dateStr = zonedFrom.toLocalDate().toString(); // yyyy-MM-dd
                    String timeStr = String.format("%02d:%02d:00", zonedFrom.getHour(), zonedFrom.getMinute()); 
                ScheduleVO item = new ScheduleVO(); 
                item.setDate(dateStr);
                item.setTime(timeStr); 
                convertedSchedule.add(item); 
                }
        }else  {    // 把userSchedule的元素转为UserTimeZone对应的数据   
       //  log.debug("zonedFrom: " + fromZone +"-->"+toZone );
                for (LocalDateTime ldt : userSchedule) {
                    ZonedDateTime zonedFrom = ldt.atZone(fromZone);
                   // log.debug("zonedFrom: " + zonedFrom);

                    ZonedDateTime zonedTo = zonedFrom.withZoneSameInstant(toZone);
                  //  log.debug("zonedTo: " + zonedTo);

                    String dateStr = zonedTo.toLocalDate().toString(); // yyyy-MM-dd
                    String timeStr = String.format("%02d:%02d:00", zonedTo.getHour(), zonedTo.getMinute());
                // INSERT_YOUR_CODE
                
                ScheduleVO item = new ScheduleVO(); 
                item.setDate(dateStr);
                item.setTime(timeStr);
                // log.debug("item: " + item);
                convertedSchedule.add(item); 
                } 
             } 
         return convertedSchedule;
    }

    // 判断星期（按用户时区-wuguan ，绝对正确）
    private static boolean isMatchWeek(LocalDate date, List<Integer> target, ZoneId zoneId) {
      //  log.debug("date:"+date);
        int week = date.getDayOfWeek().getValue();// date.atStartOfDay(zoneId).getDayOfWeek().getValue();
       //   log.debug("week:"+week+" date:"+date+" target:"+target);
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
                for (int i = 1; i <7  ; i++) {
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
    // ⚠️ 时间口径铁律（2026-10-08 课次 UTC 化改造，见 doc-develop/课次时间UTC化改造方案.md）：
    //   排期层（course_schedule）存「排期本地墙钟时间」，必须结合 course_schedule.time_zone 解读；
    //   课次层（appointment）起一律存 UTC，是唯一真相源。
    //   转换只发生在「生成课次那一刻」，此后一切时间比较都在 UTC 空间做。
    //   写入库走 scheduleLocalToUtc，返回前端走 utcToUserZone，取"当前时刻"走 nowUtc。
    //   ——三者必须经由本类，禁止在业务代码里散落 ZoneId 运算。

    /** 解析时区，非法值降级为 UTC 并记 warn，不抛异常。
     *  <p>为什么必须容错：tzSwitch 是公开接口，前端可传任意字符串；
     *  `CST` / `GMT+8` 这类非 IANA 值会让 {@code ZoneId.of()} 抛 DateTimeException，
     *  应当让用户看到"时区格式无效"，而不是后端 500 堆栈。 */
    private static ZoneId safeZone(String zoneId) {
        if (zoneId == null || zoneId.trim().isEmpty()) {
            log.warn("时区为空，降级为 UTC");
            return ZoneId.of("UTC");
        }
        try {
            return ZoneId.of(zoneId.trim());
        } catch (Exception ex) {
            log.warn("非法时区「{}」，降级为 UTC：{}", zoneId, ex.getMessage());
            return ZoneId.of("UTC");
        }
    }

    /** 排期本地时间 + 排期时区 → UTC。<b>写入课次表的唯一入口。</b>
     *  <p>课程排期存的是本地墙钟时间（如 America/Edmonton 的 2026-09-07 09:00），
     *  换算成 UTC 瞬时值后才能落库，否则与服务器时区/比较口径全都对不上。 */
    public static LocalDateTime scheduleLocalToUtc(LocalDateTime scheduleLocal, String scheduleZone) {
        if (scheduleLocal == null) {
            return null;
        }
        return scheduleLocal.atZone(safeZone(scheduleZone))
                .withZoneSameInstant(ZoneId.of("UTC"))
                .toLocalDateTime();
    }

    /** UTC → 用户时区本地时间。<b>返回前端的唯一出口。</b>
     *  <p>课次时间是 UTC 瞬时值，展示必须转成用户能对上的墙上时间，
     *  否则国内用户会看到与本地差 6~7 小时的数字。 */
    public static LocalDateTime utcToUserZone(LocalDateTime utc, String userZone) {
        if (utc == null) {
            return null;
        }
        return utc.atZone(ZoneId.of("UTC"))
                .withZoneSameInstant(safeZone(userZone))
                .toLocalDateTime();
    }

    /** 取"当前时刻"的 UTC 表示，替换业务代码里裸的 {@code LocalDateTime.now()}。
     *  <p>为什么：服务器时区一变，{@code now()} 跟着变，而课次时间是 UTC 不变 ——
     *  两者不同源，提醒窗口与退改档位会整体错位。业务时间判定一律走本方法。
     *  <p><b>不适用</b>：审计日志、监控采样、token 过期等与业务时区无关的场合。 */
    public static LocalDateTime nowUtc() {
        return LocalDateTime.now(Clock.systemUTC());
    }

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
    // 把一个时区的时间转为另一个时区的时间
    public static LocalDateTime timeSwitchWithZone(LocalDateTime dateTime, String fromZoneId, String toZoneId) {
        ZoneId fromZone = ZoneId.of(fromZoneId);
        ZoneId toZone = ZoneId.of(toZoneId);

        // 将原始时间带上原时区
        ZonedDateTime zonedFrom = dateTime.atZone(fromZone);

        // 转换到目标时区
        ZonedDateTime zonedTo = zonedFrom.withZoneSameInstant(toZone);

        // 调试输出，可根据需求保留或删除
     //   log.debug("zonedFrom: " + zonedFrom);
       // log.debug("zonedTo: " + zonedTo);

        // 返回目标时区下的本地日期时间
        return zonedTo.toLocalDateTime();
    }
}