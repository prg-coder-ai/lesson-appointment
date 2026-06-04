package com.reservation.controller;

import com.reservation.common.Result;
import com.reservation.entity.Booking;
import com.reservation.entity.BookingQueryParaDTO;
import com.reservation.entity.BookingDTO;
import com.reservation.service.BookingService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/course/booking")
@RequiredArgsConstructor
public class BookingController { 
    private final BookingService bookingService;
//create/update/updateStatus：返回id
 @PostMapping
    public Result<String> create(@RequestBody Booking booking) {
        try {
            return Result.success(bookingService.create(booking),"ok");
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
            return Result.success(rs,"ok");
        } catch (RuntimeException e) {
            return Result.fail(null,e.getMessage());
        }
    }

    @PostMapping("/list")
    @ResponseBody
    public Result<List<Booking>> filterList(@RequestBody BookingQueryParaDTO dto) {
         try {
           List<Booking> rs = bookingService.selectList(dto);
          
          //  System.out.println("filterList 返回预约列表: " + rs); 
             return Result.success(rs,"ok");
            } catch (RuntimeException e) {
                  System.out.println("filterList fail: " + e.getMessage());
             return Result.fail(403,e.getMessage());
        } 
    }

    @GetMapping("/{id}")
    public Result<Booking> getById(@PathVariable String id) {
        Booking bk = bookingService.selectById(id);
        return  Result.success(bk,"ok");
    }

    // INSERT_YOUR_CODE

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

        System.out.println(" /statistical/byMonth:"+year+","+month+","+monthStartTime+","+monthEndTime+","+prevMonthStartTime+","+prevMonthEndTime);
        java.util.Map<String, Integer> data = new java.util.HashMap<>();
        data.put("bookingMonth", bookingMonth);
        data.put("bookingMonthLast", bookingMonthLast);

        return Result.success(data, "查询成功");
    }

    // 经检查，当前 BookingController.java 文件不存在明显的语法错误。所有注解、方法和 Java 语法均正常。如果还需优化具体业务逻辑或风格，请明确说明需求。

    /*@DeleteMapping("/delete/{id}")
    public Result<Void> delete(@PathVariable String id) {
        try {
            bookingService.delete(id);
            return Result.success();
        } catch (RuntimeException e) {
            return Result.fail(null,e.getMessage());
        }
    }*/
}
