package com.lessonappointment.controller;

import com.lessonappointment.common.Result;
import com.lessonappointment.entity.Booking;
import com.lessonappointment.service.BookingService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/bookings")
@RequiredArgsConstructor
public class BookingController {

    private final BookingService bookingService;

    @GetMapping
    public Result<List<Booking>> list(
            @RequestParam(required = false) String studentId,
            @RequestParam(required = false) String scheduleId,
            @RequestParam(required = false) String status) {
        if (studentId != null) {
            return Result.success(bookingService.findByStudentId(studentId));
        }
        if (scheduleId != null) {
            return Result.success(bookingService.findByScheduleId(scheduleId));
        }
        if (status != null) {
            return Result.success(bookingService.findByStatus(status));
        }
        return Result.success(bookingService.findAll());
    }

    @GetMapping("/{id}")
    public Result<Booking> getById(@PathVariable String id) {
        return bookingService.findById(id)
                .map(Result::success)
                .orElse(Result.notFound("Booking not found: " + id));
    }

    @PostMapping
    public Result<Booking> create(@RequestBody Booking booking) {
        try {
            return Result.success(bookingService.create(booking));
        } catch (IllegalArgumentException e) {
            return Result.badRequest(e.getMessage());
        }
    }

    @PutMapping("/{id}")
    public Result<Booking> update(@PathVariable String id, @RequestBody Booking booking) {
        try {
            return Result.success(bookingService.update(id, booking));
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable String id) {
        try {
            bookingService.delete(id);
            return Result.success();
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        }
    }
}
