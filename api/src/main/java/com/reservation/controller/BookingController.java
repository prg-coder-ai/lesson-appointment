package com.reservation.controller;

import com.reservation.common.*;
import com.reservation.entity.Booking;
import com.reservation.dto.BookingQueryParaDTO;
import com.reservation.dto.BookingDTO;
import com.reservation.query.BookingQueryPage;
import com.reservation.service.BookingService;
import com.reservation.audit.Audit;
import com.reservation.audit.AuditAction;
import com.reservation.service.MessageNotifyService;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;

@RestController
@RequestMapping("/api/v1/course/booking")
@RequiredArgsConstructor
@Slf4j
public class BookingController { 
    private final BookingService bookingService;
    private final MessageNotifyService messageNotifyService;
//create/update/updateStatus：返回id
    @PostMapping("/create")
    @Audit(action = AuditAction.BOOKING_CREATE, resourceType = "booking")
    public Result<String> create(@RequestBody Booking booking) {
        try {
            String id = bookingService.create(booking);
            // 系统自动通知：学生预订课程 → 对应教师 + 本租户管理员
            // status='waiting' 为候补预订（排期名额已满时的候补申请），用候补文案单独通知
            if ("waiting".equalsIgnoreCase(booking.getStatus())) {
                messageNotifyService.notifyWaitlistCreated(id);
            } else {
                messageNotifyService.notifyBookingCreated(id);
            }
            return Result.success(id,"ok");
        } catch (IllegalArgumentException e) {
            return Result.fail(null,e.getMessage());
        }
    }

    @PostMapping("/update/{id}")
    public Result<String> update(@PathVariable String id, @RequestBody Booking booking) {
        try {
            return Result.success(bookingService.update(id, booking),"ok");
        } catch (RuntimeException e) {
            return Result.fail(null,e.getMessage());
        }
    }
//@PathVariable String id, 
    @PostMapping("/updateStatus")
    public Result<String> updateStatus(@RequestBody(required = true) BookingDTO dto) {
        try {
            String rs = bookingService.updateStatus(dto);
            // 系统自动通知：管理员确认预订 → 该学生（仅"确认"状态触发）
            // 注意：若本次是「候补 → booked」，Service 内部会转到递补逻辑（需校验名额并生成课次），
            //      此时同样给该学生发一条确认消息，保证两条入口的通知行为一致。
            if ("bookProved".equals(dto.getStatus()) || "booked".equals(dto.getStatus())) {
                messageNotifyService.notifyStudentConfirmed(dto.getId(), "课程预约");
            }
            return Result.success(rs,"ok");
        } catch (RuntimeException e) {
            return Result.fail(500, e.getMessage());
        }
    }

    /**
     * 查询某排期的候补队列，按申请时间升序——次序即递补次序（先来先得）。
     *
     * <p>课程排期页用它渲染「候补队列」；学生端「今日课程」提示条也用它计算排队位置。
     * 只返回 status='waiting' 的记录，不占席位。
     */
    @GetMapping("/waitlist/{scheduleId}")
    @ResponseBody
    public Result<List<Booking>> getWaitlistQueue(@PathVariable("scheduleId") String scheduleId) {
        try {
            return Result.success(bookingService.getWaitlistQueue(scheduleId), "ok");
        } catch (RuntimeException e) {
            return Result.fail(500, e.getMessage());
        }
    }

    /**
     * 递补：把一条候补（waiting）晋升为正式预订（booked），并生成该学生的课次时间列表。
     *
     * <p>服务端保证：名额校验（候补不占位，空位可能已被订走）、CAS 防并发重复递补、
     * 课次生成幂等。成功后自动发消息通知该学生。
     */
    @PostMapping("/waitlist/promote")
    @Audit(action = AuditAction.BOOKING_CONFIRM, resourceType = "booking")
    public Result<Map<String, Object>> promoteWaitlist(@RequestBody BookingDTO dto) {
        try {
            Map<String, Object> data = bookingService.promoteWaitlist(dto.getId());
            // 系统自动通知：递补成功 → 该学生（发送者=当前登录管理员）
            messageNotifyService.notifyWaitlistPromoted(dto.getId());
            return Result.success(data, "递补成功，已生成课次并通知学生");
        } catch (RuntimeException e) {
            return Result.fail(500, e.getMessage());
        }
    }

    /**
     * 查询指定排期(scheduleId)下的所有booking
     * @param scheduleId 排期ID
     * @return booking列表
     */
    @GetMapping("/ListByScheduleId/{scheduleId}")
    @ResponseBody
    public Result<List<Booking>> getBookingListBySchedule(@PathVariable("scheduleId") String scheduleId) {
      
        BookingQueryParaDTO dto= new BookingQueryParaDTO();
      dto.setScheduleId(scheduleId);

        try {
            List<Booking> bookings = bookingService.selectList(dto);
            return Result.success(bookings, "ok");
        } catch (RuntimeException e) {
            return Result.fail(null, e.getMessage());
        }
    }

     @GetMapping("/countByScheduleId/{scheduleId}")
    @ResponseBody
    public Result<Integer> getBookingCountBySchedule(@PathVariable("scheduleId") String scheduleId) {
      BookingQueryParaDTO dto= new BookingQueryParaDTO();
      dto.setScheduleId(scheduleId);

        try {
            Integer count = bookingService.getBookingCountByScheduleId(scheduleId);
            return Result.success(count, "ok");
        } catch (RuntimeException e) {
            return Result.fail(null, e.getMessage());
        }
    }

    @PostMapping("/list")
    @ResponseBody
    public Result<List<Booking>> filterList(@RequestBody BookingQueryParaDTO dto) {
        //  log.debug("booking list input dto: " + dto); 
         try {
           List<Booking> rs = bookingService.selectList(dto);
          
          //  log.debug("filterList 返回预约列表: " + rs); 
             return Result.success(rs,"ok");
            } catch (RuntimeException e) {
                 // log.debug("filterList fail: " + e.getMessage());
             return Result.fail(0,e.getMessage());
        } 
    }

    @PostMapping("/page")
    @ResponseBody
    public Result<PageResult<Booking>> filterListPage(@RequestBody BookingQueryPage dto) {
        //  log.debug("booking list input dto: " + dto); 
         try {
           PageResult <Booking> rs = bookingService.selectListPage(dto);
           
             return Result.success(rs,"ok");
            } catch (RuntimeException e) {
                 // log.debug("filterList fail: " + e.getMessage());
             return Result.fail(0,e.getMessage());
        } 
    }


    @GetMapping("/{id}")
    public Result<Booking> getById(@PathVariable String id) {
        Booking bk = bookingService.selectById(id);
        return  Result.success(bk,"ok");
    }


    /**
     * 统计某年月的预约（Booking）数量：月初（0点）和月末（23:59:59）
     * 前端调用: GET /booking/statistical/byMonth?year=2024&month=6
     * 返回: { "bookingMonthStart": 32, "bookingMonthEnd": 44 }
     */
    @GetMapping("/statistical/byMonth")
    @ResponseBody
    public Result<java.util.Map<String, Integer>> getBookingStatisticalByMonth(
            @RequestParam("year") int year,
            @RequestParam("month") int month
    ) {
        // 获取月初和月末的具体时间
        java.time.LocalDate monthStart = java.time.LocalDate.of(year, month, 1);
        java.time.LocalDate monthEnd = monthStart.with(java.time.temporal.TemporalAdjusters.lastDayOfMonth());

        // 月初：00:00:00
        java.time.LocalDateTime monthStartTime = monthStart.atStartOfDay();
        // 月末：23:59:59
        java.time.LocalDateTime monthEndTime = monthEnd.atTime(23, 59, 59);

        // 统计月初到月末预约数量 统计某年月的预约（Booking）数量 
        int bookingMonth  = bookingService.countBookingAtDate(java.sql.Timestamp.valueOf(monthStartTime),java.sql.Timestamp.valueOf(monthEndTime));

    // 计算上一月的起始和结束时间
        java.time.LocalDate prevMonth = monthStart.minusMonths(1);
        java.time.LocalDate prevMonthStart = prevMonth.withDayOfMonth(1);
        java.time.LocalDate prevMonthEnd = prevMonth.with(java.time.temporal.TemporalAdjusters.lastDayOfMonth());
        java.time.LocalDateTime prevMonthStartTime = prevMonthStart.atStartOfDay();
        java.time.LocalDateTime prevMonthEndTime = prevMonthEnd.atTime(23, 59, 59);

   // 上月统计月初到月末预约数量 统计某年月的预约（Booking）数量 
        int bookingMonthLast  = bookingService.countBookingAtDate(java.sql.Timestamp.valueOf(prevMonthStartTime),java.sql.Timestamp.valueOf(prevMonthEndTime));

       // log.debug(" /statistical/byMonth:"+year+","+month+","+monthStartTime+","+monthEndTime+","+prevMonthStartTime+","+prevMonthEndTime);
        java.util.Map<String, Integer> data = new java.util.HashMap<>();
        data.put("bookingMonth", bookingMonth);
        data.put("bookingMonthLast", bookingMonthLast);

        return Result.success(data, "查询成功");
    }
    
    // 经检查，当前 BookingController.java 文件不存在明显的语法错误。所有注解、方法和 Java 语法均正常。如果还需优化具体业务逻辑或风格，请明确说明需求。

    @DeleteMapping("/delete/{id}")
    @Audit(action = AuditAction.BOOKING_CANCEL, resourceType = "booking", resourceId = "id")
    public Result<Integer> delete(@PathVariable String id) {
        try {
           int rows= bookingService.delete(id);
            return Result.success(rows,"delete");
        } catch (RuntimeException e) {
            return Result.fail(0,e.getMessage());
        }
    }
    @DeleteMapping("/deleteByScheduleId/{id}")
    public Result<Integer> deleteByScheduleId(@PathVariable String id) {
        return Result.success(bookingService.deleteByScheduleId(id),"ok");
    }
}
