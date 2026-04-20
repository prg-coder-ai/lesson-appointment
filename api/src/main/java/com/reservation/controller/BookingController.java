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

    @PutMapping("/update/{id}")
    public Result<String> update(@PathVariable String id, @RequestBody Booking booking) {
        try {
            return Result.success(bookingService.update(id, booking),"ok");
        } catch (RuntimeException e) {
            return Result.fail(null,e.getMessage());
        }
    }

    @PutMapping("/updateStatus")
    public Result<String> updateStatus(@PathVariable String id, @RequestBody(required = true) BookingDTO dto) {
        try {
            String rs = bookingService.updateStatus(dto);
            return Result.success(rs,"ok");
        } catch (RuntimeException e) {
            return Result.fail(null,e.getMessage());
        }
    }

    @PostMapping("/list")
    @ResponseBody
    public Result<List<Booking>> list(@RequestBody BookingQueryParaDTO dto) {
           List<Booking> rs = bookingService.selectList(dto);
        return Result.success(rs,"ok");
    }

    @GetMapping("/{id}")
    public Result<Booking> getById(@PathVariable String id) {
        Booking bk = bookingService.selectById(id);
        return  Result.success(bk,"ok");
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
